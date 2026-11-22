import type { Dictionary, Locale } from "./types";

/**
 * Translations per language that are loaded. English is the source text itself, so its dictionary is empty. Every other
 * language, Russian included, is fetched the first time it is needed (`loadDictionary`), so nobody downloads eight
 * languages to read one and the public pages carry none. The service worker precaches every chunk, so this works
 * offline. Until a language arrives its text shows in English, and the page stays hidden for a moment (bootScript in
 * ./boot.ts) so it doesn't jump from English to the visitor's language.
 */
export const DICTIONARIES: Partial<Record<Locale, Dictionary>> & { en: Dictionary } = { en: {} };

const LOADERS: Partial<Record<Locale, () => Promise<{ default: Dictionary }>>> = {
  ru: () => import("./ru"),
  es: () => import("./es"),
  pt: () => import("./pt"),
  uk: () => import("./uk"),
  pl: () => import("./pl"),
  zh: () => import("./zh"),
  vi: () => import("./vi"),
};

const pending = new Map<Locale, Promise<Dictionary>>();

/** True when `locale`'s translations are in memory. */
export function hasDictionary(locale: Locale): boolean {
  return !!DICTIONARIES[locale];
}

/** Load a language's translations (once). Resolves with the dictionary; a failed fetch leaves English and retries next time. */
export function loadDictionary(locale: Locale): Promise<Dictionary> {
  const have = DICTIONARIES[locale];
  if (have) return Promise.resolve(have);
  const load = LOADERS[locale];
  if (!load) return Promise.resolve({});
  let p = pending.get(locale);
  if (!p) {
    p = load().then(
      (m) => (DICTIONARIES[locale] = m.default),
      (e) => {
        pending.delete(locale);
        throw e;
      },
    );
    pending.set(locale, p);
  }
  return p;
}

/** The loaded dictionary for `locale`, or an empty one (English) while it loads. */
export function dictionaryFor(locale: Locale): Dictionary {
  return DICTIONARIES[locale] ?? {};
}
