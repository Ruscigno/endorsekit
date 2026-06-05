import { describe, expect, it } from "vitest";
import {
  addDays,
  daysBetween,
  endOfMonthAfter,
  parseIso,
  toIso,
  utcToday,
} from "./dates";

describe("parseIso / toIso", () => {
  it("round-trips an ISO date through UTC", () => {
    expect(toIso(parseIso("2026-03-15"))).toBe("2026-03-15");
  });

  it.each([
    ["not-a-date"],
    ["2026-3-5"],
    ["2026/03/05"],
    ["2026-02-31"], // impossible calendar date — must not roll over
    ["2026-13-01"],
  ])("rejects malformed/impossible input %s", (bad) => {
    expect(() => parseIso(bad)).toThrow(RangeError);
  });

  it("parses at UTC midnight regardless of host timezone", () => {
    const d = parseIso("2026-01-01");
    expect(d.getUTCHours()).toBe(0);
    expect(d.getUTCFullYear()).toBe(2026);
  });
});

describe("daysBetween / addDays", () => {
  it("counts whole days forward and backward", () => {
    expect(daysBetween(parseIso("2026-01-01"), parseIso("2026-01-31"))).toBe(
      30,
    );
    expect(daysBetween(parseIso("2026-01-31"), parseIso("2026-01-01"))).toBe(
      -30,
    );
    expect(daysBetween(parseIso("2026-01-01"), parseIso("2026-01-01"))).toBe(0);
  });

  it("addDays(issue, 90) lands exactly 90 days later (the solo window)", () => {
    expect(toIso(addDays(parseIso("2026-01-01"), 90))).toBe("2026-04-01");
  });

  it("addDays handles month/year boundaries", () => {
    expect(toIso(addDays(parseIso("2026-12-31"), 1))).toBe("2027-01-01");
  });
});

describe("endOfMonthAfter — calendar-month windows", () => {
  // 14 CFR 61.56-style: two issue dates in the same month expire on the
  // SAME last-day-of-month 24 months out, regardless of day-of-month.
  it.each([
    ["2024-03-02", 24, "2026-03-31"],
    ["2024-03-30", 24, "2026-03-31"],
    ["2024-02-29", 24, "2026-02-28"], // leap-day issue, non-leap target
    ["2026-01-15", 24, "2028-01-31"],
    // December issue (month index 11): m + 24 + 1 = 36 crosses TWO year
    // boundaries — the only branch where the target month overflows past a
    // second December. Dec 15 2025 + 24 calendar months -> 2027-12-31.
    ["2025-12-15", 24, "2027-12-31"],
  ])("issue %s + %i mo -> end of %s", (issue, months, expected) => {
    expect(toIso(endOfMonthAfter(parseIso(issue), months))).toBe(expected);
  });
});

describe("utcToday", () => {
  it("truncates an injected instant to UTC midnight (date-only)", () => {
    const t = utcToday(new Date("2026-06-04T23:45:12.345Z"));
    expect(toIso(t)).toBe("2026-06-04");
    expect(t.getUTCHours()).toBe(0);
    expect(t.getUTCMinutes()).toBe(0);
    expect(t.getUTCMilliseconds()).toBe(0);
  });

  it("uses UTC calendar fields, not the host-local date", () => {
    // Just before UTC midnight: the UTC date is still the 4th even where the
    // host's local clock has rolled to the 5th.
    const t = utcToday(new Date("2026-06-04T23:59:59.999Z"));
    expect(toIso(t)).toBe("2026-06-04");
  });
});
