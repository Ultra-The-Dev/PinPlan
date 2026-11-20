import type { Locale } from "./types";

/** Every language, in switcher order. To add one: extend `Locale` (types.ts), add it here, add
 *  `src/lib/i18n/<code>/` and register its dictionary in `dictionaries.ts`. */
export const LOCALES: readonly { code: Locale; label: string; intl: string }[] = [
  // `label` is the language's own name, so people find it whatever language the page is in now.
  { code: "en", label: "English", intl: "en-US" },
  { code: "ru", label: "Русский", intl: "ru-RU" },
];

export const SOURCE_LOCALE: Locale = "en";

/** localStorage key for this device's choice. */
export const STORAGE_KEY = "pinplan.lang";

export function isLocale(v: unknown): v is Locale {
  return typeof v === "string" && LOCALES.some((l) => l.code === v);
}

/** BCP 47 tag for Intl (dates, numbers, plurals). */
export function intlTag(locale: Locale): string {
  return LOCALES.find((l) => l.code === locale)?.intl ?? "en-US";
}

/** The first supported language in the browser's list (`ru-RU`, `ru` → ru), else English. */
export function localeFromLanguages(langs: readonly string[] | undefined | null): Locale {
  for (const raw of langs ?? []) {
    const base = String(raw).toLowerCase().split(/[-_]/)[0];
    if (isLocale(base)) return base;
  }
  return SOURCE_LOCALE;
}
