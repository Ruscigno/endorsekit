// Registry-view shaping — the impure wiring between the repository and the
// route's returned `data`, kept in $lib (not +page.server.ts, where SvelteKit
// forbids non-reserved exports) so the I/O error handling is unit-testable
// without a live database.
//
// A registry of legal endorsements must NEVER return an opaque 500 when the DB
// is momentarily unavailable (down, timeout, pool exhausted) or when one row is
// corrupt (a `rule` the mapper rejects, fail-loud, would otherwise drop the
// whole roster): the CFI needs to verify endorsement status before a solo. So
// the data I/O is wrapped and re-raised as a friendly 503 error page.

import { error } from "@sveltejs/kit";
import { computeStatuses, countNeedAttention } from "./engine";
import type { EndorsementRepository } from "$lib/repo/repository";
import type { StudentEndorsements } from "./types";

export interface RegistryView {
  roster: StudentEndorsements[];
  needAttention: number;
  asOf: string;
}

export async function buildRegistryView(
  repo: EndorsementRepository,
  today: Date,
  ownerCfiId: string,
): Promise<RegistryView> {
  let students, endorsements;
  try {
    [students, endorsements] = await Promise.all([
      repo.listStudents(),
      repo.listEndorsements(),
    ]);
  } catch (e) {
    console.error(
      `[endorsekit] registry load failed for ${ownerCfiId}:`,
      e instanceof Error ? e.message : e,
    );
    throw error(503, "Registry temporarily unavailable. Please try again.");
  }

  const roster = computeStatuses(endorsements, students, today);
  return {
    roster,
    needAttention: countNeedAttention(roster),
    asOf: today.toISOString().slice(0, 10),
  };
}
