import type { PageServerLoad } from "./$types";
import { env } from "$env/dynamic/private";
import { utcToday } from "$lib/endorsements/dates";
import { buildRegistryView } from "$lib/endorsements/registry-view";
import { repositoryFor } from "$lib/repo/factory";

// Thin impure seam: read the clock, select the repository (Postgres when
// DATABASE_URL is set, else seed — branch in $lib/repo/factory.ts), and delegate
// the I/O + shaping (incl. error handling) to the tested `buildRegistryView`.
export const load: PageServerLoad = async ({ parent }) => {
  const { me } = await parent();
  const today = utcToday();
  // Each repository instance is already owner-scoped at construction.
  const repo = repositoryFor(env.DATABASE_URL, me.id, today);
  return buildRegistryView(repo, today, me.id);
};
