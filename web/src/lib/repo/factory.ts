// Repository selection — the one place that decides between the real
// Postgres adapter and the in-memory seed, kept out of `+page.server.ts` so
// the branch is unit-testable without SvelteKit's `$env` or a live database.

import type { EndorsementRepository } from "./repository";
import { postgresRepository } from "./postgres";
import { seedRepository } from "./seed";

/**
 * Pick the data source: real Postgres when `databaseUrl` is set (the shared
 * Cortex Postgres with the gear's `endorsekit_app` role), else the
 * deterministic seed so local dev + the DB-less CI `web` lane still render.
 *
 * The adapter factories and the `warn` sink are injectable so both branches
 * are testable without a database. In seed mode it warns once-per-call on the
 * server so an accidental deploy without `DATABASE_URL` is visible in the logs
 * rather than silently serving demo data to a real CFI's registry.
 */
export function repositoryFor(
  databaseUrl: string | undefined,
  ownerCfiId: string,
  today: Date,
  makePostgres: (id: string) => EndorsementRepository = postgresRepository,
  makeSeed: (today: Date) => EndorsementRepository = seedRepository,
  warn: (msg: string) => void = (m) => console.warn(m),
): EndorsementRepository {
  if (databaseUrl) return makePostgres(ownerCfiId);
  warn(
    "[endorsekit] DATABASE_URL is not set — serving in-memory SEED data (demo only).",
  );
  return makeSeed(today);
}
