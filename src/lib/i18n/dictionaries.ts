import type { Dictionary, Locale } from "./types";
import ru from "./ru";

/**
 * Translations per language that are loaded. English is the source text itself, so its dictionary is empty. Russian
 * ships with the app; the other languages are fetched the first time someone picks them (`loadDictionary`), so
 * nobody downloads eight languages to read one. Until a language arrives its text shows in English.
 */
export const DICTIONARIES: Partial<Record<Locale, Dictionary>> & { en: Dictionary; ru: Dictionary } = { en: {}, ru };

const LOADERS: Partial<Record<Locale, () => Promise<{ default: Dictionary }>>> = {
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
