// In-memory seed adapter — the V1 data source behind EndorsementRepository.
//
// Deterministic demo data so the registry screen renders a working slice
// while the append-only Postgres registry (product-research §4.2) is still
// in flight. Dates are expressed relative to a fixed anchor so the seeded
// roster always shows one of each status band (active / expiring-soon /
// expired / no-expiry) regardless of when the page loads; `asOf` is still
// supplied by the caller, keeping the engine pure.

import { addDays, toIso } from "$lib/endorsements/dates";
import type { IssuedEndorsement, Student } from "$lib/endorsements/types";
import type { EndorsementRepository } from "./repository";

const STUDENTS: Student[] = [
  { id: "stu-amelia", name: "Amelia Park" },
  { id: "stu-ben", name: "Ben Ortiz" },
  { id: "stu-chen", name: "Chen Wei" },
];

/**
 * Endorsements anchored to `today` so the demo always shows each status
 * band. Passing the anchor keeps this a pure data builder.
 */
function seedEndorsements(today: Date): IssuedEndorsement[] {
  return [
    // Amelia — active solo (issued 10 days ago ⇒ ~80 days of runway) plus a
    // never-expiring knowledge-test record.
    {
      id: "end-1",
      studentId: "stu-amelia",
      rule: "far_61_87_n_solo_90day",
      label: "Pre-solo flight (make & model)",
      scope: "Cessna 172S",
      issuedOn: toIso(addDays(today, -10)),
    },
    {
      id: "end-2",
      studentId: "stu-amelia",
      rule: "far_61_35_knowledge_test_no_expiry",
      label: "Pre-solo aeronautical knowledge test",
      issuedOn: toIso(addDays(today, -20)),
    },
    // Ben — solo cross-country issued 80 days ago ⇒ lapses in ~10 days
    // (expiring soon), and an additional 90-day solo already expired
    // (issued 100 days ago).
    {
      id: "end-3",
      studentId: "stu-ben",
      rule: "far_61_93_solo_xc_90day",
      label: "Solo cross-country authorization",
      scope: "Piper PA-28",
      issuedOn: toIso(addDays(today, -80)),
    },
    {
      id: "end-4",
      studentId: "stu-ben",
      rule: "far_61_87_p_solo_addl_90day",
      label: "Additional 90-day solo (make & model)",
      scope: "Piper PA-28",
      issuedOn: toIso(addDays(today, -100)),
    },
    // Chen — a flight-review-style 24-calendar-month item issued 23 months
    // ago (~30 days of runway, still active under the 14-day amber band) and
    // an active fresh solo endorsement.
    {
      id: "end-5",
      studentId: "stu-chen",
      rule: "far_61_56_flight_review_24mo",
      label: "Flight review",
      issuedOn: toIso(addDays(today, -700)),
    },
    {
      id: "end-6",
      studentId: "stu-chen",
      rule: "far_61_87_n_solo_90day",
      label: "Pre-solo flight (make & model)",
      scope: "Cirrus SR20",
      issuedOn: toIso(addDays(today, -3)),
    },
  ];
}

/** An EndorsementRepository backed by deterministic in-memory demo data. */
export function seedRepository(today: Date): EndorsementRepository {
  const endorsements = seedEndorsements(today);
  return {
    listStudents: async () => STUDENTS,
    listEndorsements: async () => endorsements,
  };
}
