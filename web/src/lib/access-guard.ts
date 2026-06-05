// Cortex access guard — implementation_plan.md §8.3.
//
// Reads `cortex.users.access_until` via the platform's `GET /me`
// endpoint and redirects unauthenticated / non-paid users. Mirrors
// aviation-cortex/shell/src/lib/access-guard.ts so platform behavior
// stays consistent across gears.

import { redirect } from "@sveltejs/kit";
import type { RequestEvent } from "@sveltejs/kit";
import { env as privateEnv } from "$env/dynamic/private";

export interface CortexMe {
  id: string;
  email: string;
  trial_started_at: string;
  access_until: string;
  has_active_access: boolean;
}

// Cortex hub URLs. Same-origin once Cloudflared serves both gear + hub
// from aviationcortex.com; cross-origin only during local dev.
const CORTEX_HUB_BASE =
  privateEnv.CORTEX_HUB_URL || "https://aviationcortex.com";
const CORTEX_API_BASE = privateEnv.CORTEX_API_URL || "http://localhost:8011";

export const SIGNIN_PATH = `${CORTEX_HUB_BASE}/signin`;
export const BILLING_UPGRADE_PATH = `${CORTEX_HUB_BASE}/billing?upgrade=1`;

function signinTarget(via: string): string {
  return `${SIGNIN_PATH}?next=${encodeURIComponent(via)}`;
}

export async function requireActiveAccess(
  event: RequestEvent,
): Promise<CortexMe> {
  const session = event.locals.session;
  if (!session) {
    throw redirect(303, signinTarget(event.url.pathname));
  }

  const res = await event.fetch(`${CORTEX_API_BASE}/me`, {
    headers: { Authorization: `Bearer ${session.access_token}` },
  });
  if (!res.ok) {
    throw redirect(303, BILLING_UPGRADE_PATH);
  }

  const me = (await res.json()) as CortexMe;
  if (!me.has_active_access) {
    throw redirect(303, BILLING_UPGRADE_PATH);
  }
  return me;
}
