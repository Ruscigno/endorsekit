import { describe, expect, it } from "vitest";
import { parseIso } from "./dates";
import { computeStatuses, countNeedAttention, statusFor } from "./engine";
import type {
  EndorsementHealth,
  IssuedEndorsement,
  Student,
  ValidityRule,
} from "./types";

// A fixed evaluation date keeps every assertion deterministic.
const ASOF = parseIso("2026-06-01");

function endorsement(
  rule: ValidityRule,
  issuedOn: string,
  over: Partial<IssuedEndorsement> = {},
): IssuedEndorsement {
  return {
    id: over.id ?? "e",
    studentId: over.studentId ?? "stu",
    rule,
    label: over.label ?? "test",
    scope: over.scope,
    issuedOn,
  };
}

describe("validity rule -> expiry date (one cited case per rule)", () => {
  it.each<[ValidityRule, string, string | null]>([
    // 14 CFR 61.87(n) — solo, 90 days from issuance.
    ["far_61_87_n_solo_90day", "2026-05-01", "2026-07-30"],
    // 14 CFR 61.87(p) — additional 90-day solo, same window math.
    ["far_61_87_p_solo_addl_90day", "2026-05-01", "2026-07-30"],
    // 14 CFR 61.93(c) — solo cross-country, rides the same 90-day window.
    ["far_61_93_solo_xc_90day", "2026-05-01", "2026-07-30"],
    // 14 CFR 61.56-style — 24 calendar months, end of target month.
    ["far_61_56_flight_review_24mo", "2024-06-15", "2026-06-30"],
    // 14 CFR 61.35 / 61.87(b) — knowledge test, no expiry.
    ["far_61_35_knowledge_test_no_expiry", "2025-01-01", null],
  ])("%s issued %s expires %s", (rule, issuedOn, expiresOn) => {
    const s = statusFor(endorsement(rule, issuedOn), ASOF);
    expect(s.expiresOn).toBe(expiresOn);
  });

  it("the 90-day window is a day-count, not 3 months", () => {
    // Issue 2026-01-31 + 90 days = 2026-05-01 (not 2026-04-30).
    const s = statusFor(
      endorsement("far_61_87_n_solo_90day", "2026-01-31"),
      ASOF,
    );
    expect(s.expiresOn).toBe("2026-05-01");
  });

  it("every rule's detail carries its FAR citation", () => {
    const rules: ValidityRule[] = [
      "far_61_87_n_solo_90day",
      "far_61_87_p_solo_addl_90day",
      "far_61_93_solo_xc_90day",
      "far_61_56_flight_review_24mo",
      "far_61_35_knowledge_test_no_expiry",
    ];
    for (const rule of rules) {
      const s = statusFor(endorsement(rule, "2026-01-01"), ASOF);
      expect(s.detail).toMatch(/14 CFR 61\./);
    }
  });
});

describe("status band derivation (each band)", () => {
  // Use the 90-day solo rule and vary issue date relative to ASOF.
  // amber band is 14 days (EXPIRING_SOON_DAYS).
  it.each<[string, string, EndorsementHealth]>([
    // issued 10 days ago -> expires in 80 days -> active
    ["active (fresh)", "2026-05-22", "active"],
    // issued 80 days ago -> expires in 10 days -> expiring_soon
    ["expiring_soon (10 days left)", "2026-03-13", "expiring_soon"],
    // issued exactly 90 days ago -> expires today -> remaining 0 -> expiring_soon
    ["expiring_soon (expires today)", "2026-03-03", "expiring_soon"],
    // issued 100 days ago -> expired
    ["expired", "2026-02-21", "expired"],
  ])("%s", (_label, issuedOn, expected) => {
    const s = statusFor(endorsement("far_61_87_n_solo_90day", issuedOn), ASOF);
    expect(s.health).toBe(expected);
  });

  it("expiry-day boundary: expires tomorrow is expiring_soon, expired yesterday is expired", () => {
    // 89 days ago -> expires in 1 day -> expiring_soon
    expect(
      statusFor(endorsement("far_61_87_n_solo_90day", "2026-03-04"), ASOF)
        .health,
    ).toBe("expiring_soon");
    // 91 days ago -> expired yesterday -> expired
    expect(
      statusFor(endorsement("far_61_87_n_solo_90day", "2026-03-02"), ASOF)
        .health,
    ).toBe("expired");
  });

  it("the 14-day amber boundary: 15 days left is active, 14 days left is expiring_soon", () => {
    // 75 days ago -> 15 days left -> active
    expect(
      statusFor(endorsement("far_61_87_n_solo_90day", "2026-03-18"), ASOF)
        .health,
    ).toBe("active");
    // 76 days ago -> 14 days left -> expiring_soon
    expect(
      statusFor(endorsement("far_61_87_n_solo_90day", "2026-03-17"), ASOF)
        .health,
    ).toBe("expiring_soon");
  });

  it("a no-expiry endorsement is never active/expired", () => {
    const s = statusFor(
      endorsement("far_61_35_knowledge_test_no_expiry", "2020-01-01"),
      ASOF,
    );
    expect(s.health).toBe("no_expiry");
    expect(s.expiresOn).toBeNull();
    expect(s.daysRemaining).toBeNull();
  });

  it("daysRemaining is negative when expired, positive when active", () => {
    const active = statusFor(
      endorsement("far_61_87_n_solo_90day", "2026-05-22"),
      ASOF,
    );
    const expired = statusFor(
      endorsement("far_61_87_n_solo_90day", "2026-02-21"),
      ASOF,
    );
    expect(active.daysRemaining).toBeGreaterThan(0);
    expect(expired.daysRemaining).toBeLessThan(0);
  });
});

describe("computeStatuses — per-student rollup", () => {
  const students: Student[] = [
    { id: "a", name: "Active Only" },
    { id: "b", name: "Has Expired" },
    { id: "c", name: "Knowledge Only" },
    { id: "d", name: "No Endorsements" },
  ];

  const endorsements: IssuedEndorsement[] = [
    // a: one active solo
    endorsement("far_61_87_n_solo_90day", "2026-05-22", {
      id: "a1",
      studentId: "a",
    }),
    // b: one active + one expired -> rollup expired
    endorsement("far_61_87_n_solo_90day", "2026-05-22", {
      id: "b1",
      studentId: "b",
    }),
    endorsement("far_61_87_p_solo_addl_90day", "2026-02-21", {
      id: "b2",
      studentId: "b",
    }),
    // c: only a no-expiry record
    endorsement("far_61_35_knowledge_test_no_expiry", "2025-01-01", {
      id: "c1",
      studentId: "c",
    }),
    // d: nothing
  ];

  it("groups endorsements under the right student and keeps the full roster", () => {
    const rows = computeStatuses(endorsements, students, ASOF);
    expect(rows.map((r) => r.student.id)).toEqual(["a", "b", "c", "d"]);
    expect(rows.find((r) => r.student.id === "b")!.endorsements).toHaveLength(
      2,
    );
    expect(rows.find((r) => r.student.id === "d")!.endorsements).toHaveLength(
      0,
    );
  });

  it.each<[string, EndorsementHealth]>([
    ["a", "active"],
    ["b", "expired"],
    ["c", "no_expiry"],
    ["d", "no_expiry"],
  ])("student %s rolls up to %s", (studentId, expected) => {
    const rows = computeStatuses(endorsements, students, ASOF);
    expect(rows.find((r) => r.student.id === studentId)!.rollup).toBe(expected);
  });

  it("orders a student's endorsements worst-band-first", () => {
    const rows = computeStatuses(endorsements, students, ASOF);
    const b = rows.find((r) => r.student.id === "b")!;
    // expired (b2) should sort ahead of active (b1)
    expect(b.endorsements[0].health).toBe("expired");
    expect(b.endorsements[1].health).toBe("active");
  });

  it("is pure: same inputs produce identical output", () => {
    const first = computeStatuses(endorsements, students, ASOF);
    const second = computeStatuses(endorsements, students, ASOF);
    expect(first).toEqual(second);
  });

  it("countNeedAttention counts only expired + expiring-soon rollups", () => {
    const rows = computeStatuses(endorsements, students, ASOF);
    // a -> active, b -> expired, c -> no_expiry, d -> no_expiry => 1.
    expect(countNeedAttention(rows)).toBe(1);
    expect(countNeedAttention([])).toBe(0);
  });
});

describe("unknown validity rule (runtime guard)", () => {
  it("throws rather than returning undefined when a row carries an unmodeled rule", () => {
    // Simulates a DB row whose `text` rule slipped past the adapter guard
    // (typo / future migration / corruption). The engine must fail loud, not
    // crash opaquely in healthFor.
    const bogus = endorsement(
      "totally_made_up_rule" as ValidityRule,
      "2026-01-01",
    );
    expect(() => statusFor(bogus, ASOF)).toThrow(/unknown validity rule/);
  });
});
