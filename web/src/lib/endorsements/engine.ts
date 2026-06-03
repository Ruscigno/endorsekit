// The endorsement expiry engine — a pure function, the heart of the slice.
//
//   computeStatuses(endorsements, students, asOf) → StudentEndorsements[]
//
// Load-bearing decision (CLAUDE.md / product-research §3.3): no clock, no
// DB, no I/O. `asOf` is an argument — the registry screen passes "today",
// tests pass fixed dates. Every FAR rule is its own small function carrying
// its 14 CFR citation, so the regulatory audit trail lives in the code. The
// web tier never re-implements these rules elsewhere; a future expiry-
// reminder path would call the very same functions.
//
// IMPORTANT: this engine computes when an endorsement's *validity window*
// lapses for surfacing in the CFI's registry. It does NOT decide whether a
// student is legal to fly — the CFI remains solely responsible for that
// (the disclaimer rides on every verdict surface). EndorseKit ships only
// well-established validity windows and cites the FAR for each; it does not
// invent endorsement rules.

import {
  addDays,
  daysBetween,
  endOfMonthAfter,
  parseIso,
  toIso,
  type IsoDate,
} from "./dates";
import {
  EXPIRING_SOON_DAYS,
  type EndorsementHealth,
  type EndorsementStatus,
  type IssuedEndorsement,
  type Student,
  type StudentEndorsements,
} from "./types";

/** Internal: the lapse date + a FAR-cited detail string, before the band is derived. */
interface RuleOutcome {
  /** Date the endorsement lapses; null means it does not expire. */
  expiresOn: IsoDate | null;
  /** True when the rule has no validity window (a one-time record). */
  noExpiry: boolean;
  detail: string;
}

const SOLO_DAY_WINDOW = 90;

/**
 * Day-window validity (14 CFR 61.87(n)/(p) solo, 61.93 solo cross-country).
 *
 * A solo endorsement is given by an authorized instructor "within the 90
 * days preceding the date of the flight" for the specific make and model,
 * so the authorization lapses exactly `windowDays` calendar days after the
 * issue date. Renewal is a NEW endorsement (a new issued row), never a
 * mutation of this one — the registry is append-only (ADR-0002).
 */
function dayWindowOutcome(
  issuedOn: IsoDate,
  windowDays: number,
  citation: string,
): RuleOutcome {
  const expires = addDays(parseIso(issuedOn), windowDays);
  return {
    expiresOn: toIso(expires),
    noExpiry: false,
    detail: `${citation}: valid for ${windowDays} days from issuance; lapses ${toIso(expires)} unless re-endorsed.`,
  };
}

/**
 * Calendar-month validity (flight-review-style item, cf. 14 CFR 61.56,
 * 24 calendar months). Validity runs to the LAST day of the month `months`
 * after the issue date, regardless of the issue day-of-month.
 */
function calendarMonthOutcome(
  issuedOn: IsoDate,
  months: number,
  citation: string,
): RuleOutcome {
  const expires = endOfMonthAfter(parseIso(issuedOn), months);
  return {
    expiresOn: toIso(expires),
    noExpiry: false,
    detail: `${citation}: valid through the end of the month ${months} calendar months after issuance (${toIso(expires)}).`,
  };
}

/**
 * A one-time record with no validity window — the pre-solo aeronautical-
 * knowledge / written-test endorsement (14 CFR 61.35 / 61.87(b)).
 *
 * The instructor's endorsement that the student passed the pre-solo
 * knowledge test (or is prepared for the written) is a permanent record; it
 * does not lapse on a 90-day or calendar-month clock the way a solo
 * authorization does. (Separately, an FAA *knowledge-test report* used for a
 * practical test is valid for 24 calendar months under 14 CFR 61.39 — but
 * that is the FAA's clock on the test result, not this endorsement record,
 * and is out of scope for this first slice.)
 */
function noExpiryOutcome(citation: string): RuleOutcome {
  return {
    expiresOn: null,
    noExpiry: true,
    detail: `${citation}: a one-time knowledge-test endorsement record — does not expire on a recurring window.`,
  };
}

/** Resolve a single endorsement to a lapse date + detail, dispatching on its rule. */
function outcomeFor(e: IssuedEndorsement): RuleOutcome {
  switch (e.rule) {
    case "far_61_87_n_solo_90day":
      return dayWindowOutcome(e.issuedOn, SOLO_DAY_WINDOW, "14 CFR 61.87(n)");
    case "far_61_87_p_solo_addl_90day":
      return dayWindowOutcome(e.issuedOn, SOLO_DAY_WINDOW, "14 CFR 61.87(p)");
    case "far_61_93_solo_xc_90day":
      return dayWindowOutcome(e.issuedOn, SOLO_DAY_WINDOW, "14 CFR 61.93(c)");
    case "far_61_56_flight_review_24mo":
      return calendarMonthOutcome(e.issuedOn, 24, "14 CFR 61.56");
    case "far_61_35_knowledge_test_no_expiry":
      return noExpiryOutcome("14 CFR 61.35 / 61.87(b)");
  }
}

/** Derive the status band from a lapse date relative to `asOf`. */
function healthFor(o: RuleOutcome, asOf: Date): EndorsementHealth {
  if (o.noExpiry || o.expiresOn === null) return "no_expiry";
  const remaining = daysBetween(asOf, parseIso(o.expiresOn));
  if (remaining < 0) return "expired";
  if (remaining <= EXPIRING_SOON_DAYS) return "expiring_soon";
  return "active";
}

/** The status of one issued endorsement as of `asOf`. */
export function statusFor(e: IssuedEndorsement, asOf: Date): EndorsementStatus {
  const o = outcomeFor(e);
  const daysRemaining =
    o.expiresOn === null ? null : daysBetween(asOf, parseIso(o.expiresOn));
  return {
    id: e.id,
    studentId: e.studentId,
    rule: e.rule,
    label: e.label,
    scope: e.scope,
    issuedOn: e.issuedOn,
    health: healthFor(o, asOf),
    expiresOn: o.expiresOn,
    daysRemaining,
    detail: o.detail,
  };
}

/** Severity order for the per-student rollup; higher = surfaced first. */
const SEVERITY: Record<EndorsementHealth, number> = {
  expired: 3,
  expiring_soon: 2,
  active: 1,
  no_expiry: 0,
};

/**
 * The worst band among a student's endorsements — the per-student rollup
 * shown next to the student's name. An empty list rolls up to "no_expiry"
 * (nothing demands attention).
 */
function rollupBand(statuses: EndorsementStatus[]): EndorsementHealth {
  let worst: EndorsementHealth = "no_expiry";
  for (const s of statuses) {
    if (SEVERITY[s.health] > SEVERITY[worst]) worst = s.health;
  }
  return worst;
}

/**
 * Compute every issued endorsement's status and roll up per student.
 *
 * Pure: depends only on its arguments. `asOf` is a `Date` (date-only,
 * interpreted in UTC). Students with no issued endorsements still appear
 * (with an empty list) so the registry shows the full roster. Within each
 * student, endorsements are ordered worst-band-first so the items needing
 * attention surface at the top.
 */
export function computeStatuses(
  endorsements: IssuedEndorsement[],
  students: Student[],
  asOf: Date,
): StudentEndorsements[] {
  const byStudent = new Map<string, EndorsementStatus[]>();
  for (const e of endorsements) {
    const status = statusFor(e, asOf);
    const bucket = byStudent.get(e.studentId);
    if (bucket) bucket.push(status);
    else byStudent.set(e.studentId, [status]);
  }

  return students.map((student) => {
    const statuses = (byStudent.get(student.id) ?? [])
      .slice()
      .sort((a, b) => SEVERITY[b.health] - SEVERITY[a.health]);
    return {
      student,
      endorsements: statuses,
      rollup: rollupBand(statuses),
    };
  });
}
