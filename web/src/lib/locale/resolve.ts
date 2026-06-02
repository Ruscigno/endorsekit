// Locale resolver for the endorsekit gear app.
//
// Mirrors aviation-cortex/shell/src/lib/locale/resolve.ts verbatim — the
// gear must agree with the platform on the URL/cookie/header order so
// the shell's `<aviation-cortex-shell locale="…">` attribute matches
// what the gear's hooks.server.ts resolved.
//
// When `@aviation/cortex-platform` ships as a workspace package, drop
// this copy and import from there.

export const SUPPORTED_LOCALES = ["en", "es", "pt"] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";
export const LOCALE_COOKIE = "cortex_locale";

const LOCALE_SET: ReadonlySet<string> = new Set(SUPPORTED_LOCALES);

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && LOCALE_SET.has(value);
}

export function splitLocalePrefix(pathname: string): {
  locale: Locale | null;
  rest: string;
} {
  const match = /^\/([a-z]{2})(?=\/|$)/.exec(pathname);
  if (!match) return { locale: null, rest: pathname };
  const candidate = match[1];
  if (!isLocale(candidate)) return { locale: null, rest: pathname };
  const rest = pathname.slice(match[0].length) || "/";
  return { locale: candidate, rest };
}

export function pickFromAcceptLanguage(header: string | null): Locale | null {
  if (!header) return null;
  const tags = header
    .split(",")
    .map((entry, index) => {
      const [tag, ...params] = entry.trim().split(";").map((s) => s.trim());
      const qParam = params.find((p) => p.startsWith("q="));
      const q = qParam ? Number(qParam.slice(2)) : 1;
      return { tag, q: Number.isFinite(q) ? q : 0, index };
    })
    .filter((t) => t.tag.length > 0)
    .sort((a, b) => b.q - a.q || a.index - b.index);

  for (const { tag } of tags) {
    const primary = tag.toLowerCase().split("-")[0];
    if (isLocale(primary)) return primary;
  }
  return null;
}

export interface ResolveInputs {
  pathname: string;
  cookie: string | null;
  acceptLanguage: string | null;
}

export function resolveLocale({
  pathname,
  cookie,
  acceptLanguage,
}: ResolveInputs): { locale: Locale; source: string } {
  const fromUrl = splitLocalePrefix(pathname);
  if (fromUrl.locale) return { locale: fromUrl.locale, source: "url" };
  if (isLocale(cookie)) return { locale: cookie, source: "cookie" };
  const fromHeader = pickFromAcceptLanguage(acceptLanguage);
  if (fromHeader) return { locale: fromHeader, source: "accept-language" };
  return { locale: DEFAULT_LOCALE, source: "default" };
}
