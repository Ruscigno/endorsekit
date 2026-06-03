import type { PageServerLoad } from "./$types";
import { computeStatuses } from "$lib/endorsements/engine";
import { seedRepository } from "$lib/repo/seed";

// "Today" as a UTC date — the only impurity (reading the clock) lives here
// at the boundary; `computeStatuses` itself stays a pure function of
// (endorsements, students, asOf).
function utcToday(): Date {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

export const load: PageServerLoad = async ({ parent }) => {
  const { me } = await parent();

  const today = utcToday();
  const repo = seedRepository(today);
  const [students, endorsements] = await Promise.all([
    repo.listStudents(me.id),
    repo.listEndorsements(me.id),
  ]);

  const roster = computeStatuses(endorsements, students, today);
  const needAttention = roster.filter(
    (r) => r.rollup === "expired" || r.rollup === "expiring_soon",
  ).length;

  return { roster, needAttention, asOf: today.toISOString().slice(0, 10) };
};
