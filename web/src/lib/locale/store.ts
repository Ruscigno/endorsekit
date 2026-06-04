// Locale store + Svelte context for the endorsekit gear.
//
// Implements implementation_plan.md §9.1 steps 4-7: the gear app reads
// the initial locale from <aviation-cortex-shell locale="…">, subscribes
// to `cortex:locale-changed`, and exposes a getContext()-able store so
// child components consume the active locale without re-parsing the URL.

import { isLocale, type Locale, DEFAULT_LOCALE } from "./resolve";

export const LOCALE_CONTEXT_KEY = Symbol("cortex.locale");
export const CORTEX_LOCALE_EVENT = "cortex:locale-changed";

export interface LocaleStore {
  subscribe: (run: (value: Locale) => void) => () => void;
  set: (value: Locale) => void;
  get: () => Locale;
}

export function createLocaleStore(
  initial: Locale = DEFAULT_LOCALE,
): LocaleStore {
  let current: Locale = initial;
  const subscribers = new Set<(value: Locale) => void>();
  return {
    subscribe(run) {
      subscribers.add(run);
      run(current);
      return () => subscribers.delete(run);
    },
    set(value) {
      if (value === current) return;
      current = value;
      for (const run of subscribers) run(current);
    },
    get() {
      return current;
    },
  };
}

export function bindLocaleEvent(
  store: LocaleStore,
  target: EventTarget = document,
): () => void {
  const handler = (event: Event) => {
    const detail = (event as CustomEvent<{ locale?: unknown }>).detail;
    if (detail && isLocale(detail.locale)) {
      store.set(detail.locale);
    }
  };
  target.addEventListener(CORTEX_LOCALE_EVENT, handler);
  return () => target.removeEventListener(CORTEX_LOCALE_EVENT, handler);
}
