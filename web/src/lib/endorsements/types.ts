// Domain types for the endorsement expiry engine. Mirrors the two-table
// shape in product-research §3.3 / §4.1: a `template` declares an
// endorsement KIND and its validity rule (the AC 61-65 catalog), and an
// `IssuedEndorsement` is one immutable registry row the CFI actually
// issued to a student. The engine never touches a database — these are
// plain values passed in and out.

import type { IsoDate } from "./dates";

/**
 * The validity rule a template carries. Each maps to a documented FAR; the
 * engine dispatches on this discriminant. EndorseKit models only validity
 * windows that are well-established in the regulations — it does not invent
 * endorsement rules (see CLAUDE.md "Working with the spec").
 */
export type ValidityRule =
  // 14 CFR 61.87(n) — student-pilot solo: the endorsement must have been
  // given by an authorized instructor "within the 90 days preceding the
  // date of the flight" for the specific make and model. Lapses 90 days
  // after issuance.
  | "far_61_87_n_solo_90day"
  // 14 CFR 61.87(p) — the additional 90-day solo endorsement for the make
  // and model, renewed every 90 days. Same 90-day day-window math.
  | "far_61_87_p_solo_addl_90day"
  // 14 CFR 61.93(c)(2) — the (repeated) solo cross-country authorization,
  // which rides on the same pre-solo 90-day currency. (The per-flight
  // 61.93(c)(3) review endorsement is a single-flight artifact and is not
  // modeled as a recurring registry item here.)
  | "far_61_93_solo_xc_90day"
  // Flight-review-style item — 24 calendar months (cf. 14 CFR 61.56, the
  // flight review). Validity runs to the end of the month 24 months out.
  | "far_61_56_flight_review_24mo"
  // 14 CFR 61.35 / 61.87(b) — the pre-solo aeronautical-knowledge / written
  // (knowledge) test endorsement. The instructor's record that the student
  // passed/was prepared does not itself "expire" in the 90-day solo sense;
  // it is a one-time registry record. (The FAA's own written-test *result*
  // has a separate 24-calendar-month validity for the practical test — that
  // is the FAA's clock, not this endorsement's. See the comment in
  // engine.ts.) Modeled as a no-expiry record.
  | "far_61_35_knowledge_test_no_expiry";

/** The closed set of validity rules the engine knows how to dispatch on. */
export const VALIDITY_RULES = [
  "far_61_87_n_solo_90day",
  "far_61_87_p_solo_addl_90day",
  "far_61_93_solo_xc_90day",
  "far_61_56_flight_review_24mo",
  "far_61_35_knowledge_test_no_expiry",
] as const satisfies readonly ValidityRule[];

/**
 * Runtime guard for a DB-sourced `rule` string. The `rule` column is plain
 * `text` in Postgres, so a typo / future migration / corruption could yield a
 * value outside the closed `ValidityRule` set. Validating here (at the trust
 * boundary) keeps an unknown rule from reaching the engine as a bare cast and
 * crashing the route for every user with that row.
 */
export function isValidityRule(value: string): value is ValidityRule {
  return (VALIDITY_RULES as readonly string[]).includes(value);
}

/** A registry-issued endorsement: one immutable row per issuance. */
export interface IssuedEndorsement {
  id: string;
  /** The student this endorsement was issued to (the per-student rollup key). */
  studentId: string;
  /** Which validity rule governs this endorsement. */
  rule: ValidityRule;
  /** Human label for the endorsement KIND (from the template catalog). */
  label: string;
  /** The make/model or other scope text, e.g. "Cessna 172S". Display-only. */
  scope?: string;
  /** The date the CFI issued (signed) the endorsement. */
  issuedOn: IsoDate;
}

/** A student on the CFI's roster — the per-student rollup target. */
export interface Student {
  id: string;
  name: string;
}

/** Traffic-light status band of a single endorsement. */
export type EndorsementHealth =
  | "active"
  | "expiring_soon"
  | "expired"
  | "no_expiry";

/** The engine's verdict for one issued endorsement. */
export interface EndorsementStatus {
  id: string;
  studentId: string;
  rule: ValidityRule;
  label: string;
  scope?: string;
  issuedOn: IsoDate;
  health: EndorsementHealth;
  /** Date the endorsement lapses; null for a no-expiry record. */
  expiresOn: IsoDate | null;
  /** Whole days from `asOf` to `expiresOn`; negative when expired, null when no-expiry. */
  daysRemaining: number | null;
  /** Plain-language, FAR-cited explanation for the registry surface. */
  detail: string;
}

/** A student's endorsements plus a worst-case rollup band, for the registry view. */
export interface StudentEndorsements {
  student: Student;
  endorsements: EndorsementStatus[];
  /**
   * The student's worst active band: "expired" if any endorsement is
   * expired, else "expiring_soon" if any is expiring soon, else "active"
   * if the student has any expiring endorsements, else "no_expiry".
   */
  rollup: EndorsementHealth;
}

/** An endorsement expiring within this many days is flagged amber, not green. */
export const EXPIRING_SOON_DAYS = 14;
