import { describe, expect, it } from "vitest";
import { mapEndorsementRow, mapStudentRow } from "./postgres";

describe("mapStudentRow", () => {
  it("maps a student row to the domain Student", () => {
    expect(
      mapStudentRow({
        id: "11111111-1111-1111-1111-111111111111",
        name: "Amelia Park",
      }),
    ).toEqual({
      id: "11111111-1111-1111-1111-111111111111",
      name: "Amelia Park",
    });
  });
});

describe("mapEndorsementRow", () => {
  it("carries scope when the make/model column is present", () => {
    const e = mapEndorsementRow({
      id: "end-1",
      student_id: "stu-amelia",
      rule: "far_61_87_n_solo_90day",
      label: "Pre-solo flight (make & model)",
      scope: "Cessna 172S",
      issued_on: "2026-05-25",
    });
    expect(e).toEqual({
      id: "end-1",
      studentId: "stu-amelia",
      rule: "far_61_87_n_solo_90day",
      label: "Pre-solo flight (make & model)",
      scope: "Cessna 172S",
      issuedOn: "2026-05-25",
    });
  });

  it("omits scope when the column is null", () => {
    const e = mapEndorsementRow({
      id: "end-2",
      student_id: "stu-amelia",
      rule: "far_61_35_knowledge_test_no_expiry",
      label: "Pre-solo aeronautical knowledge test",
      scope: null,
      issued_on: "2026-05-15",
    });
    expect(e).toEqual({
      id: "end-2",
      studentId: "stu-amelia",
      rule: "far_61_35_knowledge_test_no_expiry",
      label: "Pre-solo aeronautical knowledge test",
      issuedOn: "2026-05-15",
    });
    expect("scope" in e).toBe(false);
  });

  it("keeps issued_on as the ISO date text it is selected as", () => {
    const e = mapEndorsementRow({
      id: "end-3",
      student_id: "stu-ben",
      rule: "far_61_56_flight_review_24mo",
      label: "Flight review",
      scope: null,
      issued_on: "2024-07-01",
    });
    expect(e.issuedOn).toBe("2024-07-01");
  });

  it("rejects an unknown `rule` value at the persistence boundary", () => {
    // The `rule` column is plain `text`; a typo / future migration / corruption
    // could carry a value outside the closed ValidityRule set. The mapper must
    // throw here rather than passing a bare cast on to the engine.
    expect(() =>
      mapEndorsementRow({
        id: "end-bad",
        student_id: "stu-amelia",
        rule: "far_99_made_up",
        label: "Mystery endorsement",
        scope: null,
        issued_on: "2026-01-01",
      }),
    ).toThrow(/unknown validity rule/);
  });
});
