import type { PageServerLoad } from "./$types";
import { env } from "$env/dynamic/private";
import { utcToday } from "$lib/endorsements/dates";
import { computeStatuses, countNeedAttention } from "$lib/endorsements/engine";
import { repositoryFor } from "$lib/repo/factory";

export const load: PageServerLoad = async ({ parent }) => {
  const { me } = await parent();

  // The only impurity (reading the clock) lives at this boundary;
  // `computeStatuses` stays a pure function of (endorsements, students, asOf).
  const today = utcToday();
  // Each repository instance is already owner-scoped at construction, so the
  // list methods take no argument.
  const repo = repositoryFor(env.DATABASE_URL, me.id, today);
  const [students, endorsements] = await Promise.all([
    repo.listStudents(),
    repo.listEndorsements(),
  ]);

  const roster = computeStatuses(endorsements, students, today);

  return {
    roster,
    needAttention: countNeedAttention(roster),
    asOf: today.toISOString().slice(0, 10),
  };
};
