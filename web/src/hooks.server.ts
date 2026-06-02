// endorsekit gear — server hook chain.
//
// 1. Resolve locale from URL/cookie/Accept-Language so the
//    `<aviation-cortex-shell locale="…">` attribute matches what hub +
//    every other gear emit.
// 2. Decode the GoTrue HS256 session cookie (when present) and put the
//    user id + raw token on event.locals. Verification is delegated to
//    the backend's `GET /me` round-trip in the access guard; this hook
//    only extracts. Replace with full HS256 verification when the gear
//    ships a Go backend (implementation_plan.md §5.2).

import { type Handle } from "@sveltejs/kit";
import { sequence } from "@sveltejs/kit/hooks";
import { LOCALE_COOKIE, resolveLocale } from "$lib/locale/resolve";

const CORTEX_SESSION_COOKIE = "cortex_session";

const localeHandle: Handle = async ({ event, resolve }) => {
  const { locale } = resolveLocale({
    pathname: event.url.pathname,
    cookie: event.cookies.get(LOCALE_COOKIE) ?? null,
    acceptLanguage: event.request.headers.get("accept-language"),
  });
  event.locals.locale = locale;
  return resolve(event, {
    transformPageChunk: ({ html }) =>
      html.replaceAll("%cortex.locale%", locale),
  });
};

const sessionHandle: Handle = async ({ event, resolve }) => {
  const raw = event.cookies.get(CORTEX_SESSION_COOKIE);
  if (!raw) {
    event.locals.session = null;
    return resolve(event);
  }
  // V1 trust-the-cookie path: forward the token to the backend, which
  // verifies HS256 + audience. Once the gear ships its own Go backend,
  // swap this for in-process JWT verification (§5.2) so we don't pay a
  // round-trip per request.
  try {
    const claims = JSON.parse(
      Buffer.from(raw.split(".")[1] ?? "", "base64url").toString("utf8"),
    ) as { sub?: string };
    if (claims.sub) {
      event.locals.session = { access_token: raw, user_id: claims.sub };
    } else {
      event.locals.session = null;
    }
  } catch {
    event.locals.session = null;
  }
  return resolve(event);
};

export const handle = sequence(localeHandle, sessionHandle);
