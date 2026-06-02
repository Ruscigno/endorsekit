import type { LayoutServerLoad } from "./$types";
import { requireActiveAccess } from "$lib/access-guard";

// Every request to endorsekit routes goes through the access guard
// (implementation_plan.md §8.3). The guard either returns the
// CortexMe payload or throws a redirect to /signin or /billing.
export const load: LayoutServerLoad = async (event) => {
  const me = await requireActiveAccess(event);
  return { me, locale: event.locals.locale };
};
