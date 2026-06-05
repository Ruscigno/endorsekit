// Calendar math for the endorsement expiry engine — pure, UTC-only, no clock.
//
// Endorsement validity mixes two incompatible window kinds, and confusing
// them is the easiest way to mis-state when a student's solo authorization
// lapses:
//
//   * DAY windows — 14 CFR 61.87(n)/(p), 61.93: a solo (and solo
//     cross-country) endorsement is given "within the 90 days preceding"
//     a flight, so it lapses exactly 90 calendar days after the issue date.
//   * CALENDAR-MONTH windows — flight-review-style items (cf. 14 CFR 61.56,
//     24 calendar months): validity runs to the LAST day of the month N
//     calendar months after the issue date, not issue-date + N*30 days.
//
// Every function here is total and deterministic: same inputs -> same
// output, no `Date.now()`, no timezone. Dates are ISO `YYYY-MM-DD` strings
// at the boundary and UTC `Date`s internally.

/** An ISO calendar date with no time component, e.g. "2026-03-15". */
export type IsoDate = string;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Parse an ISO `YYYY-MM-DD` date to a UTC `Date` at midnight. Throws on malformed input. */
export function parseIso(date: IsoDate): Date {
  if (!ISO_DATE.test(date)) {
    throw new RangeError(`not an ISO YYYY-MM-DD date: ${JSON.stringify(date)}`);
  }
  const [y, m, d] = date.split("-").map(Number);
  const parsed = new Date(Date.UTC(y, m - 1, d));
  // Reject impossible dates that JS would otherwise roll over (2026-02-31).
  if (
    parsed.getUTCFullYear() !== y ||
    parsed.getUTCMonth() !== m - 1 ||
    parsed.getUTCDate() !== d
  ) {
    throw new RangeError(`not a real calendar date: ${date}`);
  }
  return parsed;
}

/** Format a UTC `Date` back to an ISO `YYYY-MM-DD` string. */
export function toIso(date: Date): IsoDate {
  return date.toISOString().slice(0, 10);
}

/** Whole UTC days from `a` to `b` (b − a); negative if `b` precedes `a`. */
export function daysBetween(a: Date, b: Date): number {
  const MS_PER_DAY = 86_400_000;
  return Math.round((b.getTime() - a.getTime()) / MS_PER_DAY);
}

/** A new date `n` calendar days after `from` (n may be negative). */
export function addDays(from: Date, n: number): Date {
  const out = new Date(from.getTime());
  out.setUTCDate(out.getUTCDate() + n);
  return out;
}

/**
 * The last calendar day of the month that falls `months` after `from`.
 *
 * A validity that runs in "calendar months" expires at the END of the
 * target month regardless of the issue day-of-month: a flight review on
 * 2024-03-02 and one on 2024-03-30 both expire 2026-03-31 (cf. 14 CFR
 * 61.56, 24 calendar months).
 */
export function endOfMonthAfter(from: Date, months: number): Date {
  const y = from.getUTCFullYear();
  const m = from.getUTCMonth();
  // Day 0 of (target month + 1) === last day of the target month.
  return new Date(Date.UTC(y, m + months + 1, 0));
}

/**
 * "Today" as a date-only UTC `Date` (midnight) — the single clock read for
 * the registry, kept here at the boundary so the engine stays pure. The
 * injectable `now` makes the truncation itself testable without mocking the
 * global clock; production callers use the default.
 */
export function utcToday(now: Date = new Date()): Date {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}
