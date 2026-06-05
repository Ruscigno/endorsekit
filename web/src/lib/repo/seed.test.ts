import { describe, expect, it } from "vitest";
import { computeStatuses } from "$lib/endorsements/engine";
import type { EndorsementHealth } from "$lib/endorsements/types";
import { seedRepository } from "./seed";

// A fixed mid-month anchor and a fixed month-END anchor: the seed must show
// every status band deterministically at BOTH (the month-end case is the one
// the old `addDays(today, -700)` flight-review anchor could slip into amber).
const MID_MONTH = new Date(Date.UTC(2026, 5, 15)); // 2026-06-15
const MONTH_END = new Date(Date.UTC(2026, 1, 28)); // 2026-02-28 (shortest month)

async function roster(today: Date) {
  const repo = seedRepository(today);
  const [students, endorsements] = await Promise.all([
    repo.listStudents(),
    repo.listEndorsements(),
  ]);
  return computeStatuses(endorsements, students, today);
}

describe("seedRepository", () => {
  it("returns the demo roster and its issued endorsements", async () => {
    const repo = seedRepository(MID_MONTH);
    const students = await repo.listStudents();
    const endorsements = await repo.listEndorsements();
    expect(students.map((s) => s.name)).toEqual([
      "Amelia Park",
      "Ben Ortiz",
      "Chen Wei",
    ]);
    // Every seeded endorsement points at a seeded student.
    const ids = new Set(students.map((s) => s.id));
    expect(endorsements.every((e) => ids.has(e.studentId))).toBe(true);
  });

  it.each([
    ["mid-month", MID_MONTH],
    ["month-end", MONTH_END],
  ])("shows all four status bands at %s", async (_label, today) => {
    const rows = await roster(today);
    const bands = new Set<EndorsementHealth>();
    for (const r of rows) for (const e of r.endorsements) bands.add(e.health);
    expect(bands).toEqual(
      new Set<EndorsementHealth>([
        "active",
        "expiring_soon",
        "expired",
        "no_expiry",
      ]),
    );
  });

  it.each([
    ["mid-month", MID_MONTH],
    ["month-end", MONTH_END],
  ])(
    "keeps Chen's 24-calendar-month flight review active at %s (deterministic, never amber)",
    async (_label, today) => {
      const rows = await roster(today);
      const chen = rows.find((r) => r.student.id === "stu-chen")!;
      const review = chen.endorsements.find(
        (e) => e.rule === "far_61_56_flight_review_24mo",
      )!;
      expect(review.health).toBe("active");
    },
  );
});
