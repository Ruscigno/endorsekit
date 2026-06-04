import type { PageServerLoad } from "./$types";
import { env } from "$env/dynamic/private";
import { computeStatuses } from "$lib/endorsements/engine";
import type { EndorsementRepository } from "$lib/repo/repository";
import { seedRepository } from "$lib/repo/seed";
import { postgresRepository } from "$lib/repo/postgres";

// "Today" as a UTC date — the only impurity (reading the clock) lives here
// at the boundary; `computeStatuses` itself stays a pure function of
// (endorsements, students, asOf).
function utcToday(): Date {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

// Real Postgres persistence when DATABASE_URL is configured (the shared
// Cortex Postgres with the gear's `endorsekit_app` role, reading the
// `endorsekit` schema); otherwise the deterministic in-memory seed so local
// dev and the DB-less CI `web` lane still render. Same EndorsementRepository
// contract either way.
function repositoryFor(ownerCfiId: string, today: Date): EndorsementRepository {
  return env.DATABASE_URL
    ? postgresRepository(ownerCfiId)
    : seedRepository(today);
}

export const load: PageServerLoad = async ({ parent }) => {
  const { me } = await parent();

  const today = utcToday();
  const repo = repositoryFor(me.id, today);
  const [students, endorsements] = await Promise.all([
    repo.listStudents(me.id),
    repo.listEndorsements(me.id),
  ]);

  const roster = computeStatuses(endorsements, students, today);
  const needAttention = roster.filter(
    (r) => r.rollup === "expired" || r.rollup === "expiring_soon",
  ).length;

  return {
    roster,
    needAttention,
    asOf: today.toISOString().slice(0, 10),
    persistence: env.DATABASE_URL ? "postgres" : "seed",
  };
};
