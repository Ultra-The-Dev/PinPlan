// Translation system: the active language, t() / tn() for any code, useT() for components, and Intl formatting.
// Conventions, the Russian glossary and the rule that client-facing documents stay in English: docs/i18n.md.
import { useMemo } from "react";
import { create } from "zustand";
import { translate, translatePlural } from "./core";
import { dictionaryFor, hasDictionary, loadDictionary } from "./dictionaries";
import { SOURCE_LOCALE, STORAGE_KEY, intlTag, isLocale, localeFromLanguages } from "./locales";
import type { Locale, Vars } from "./types";

export type { Dictionary, Locale, PluralForms, Vars } from "./types";
export { msg } from "./msg";
export { LOCALES, SOURCE_LOCALE, STORAGE_KEY, intlTag, isLocale, localeFromLanguages } from "./locales";

/**
 * The active language. It starts as English everywhere, so server-rendered and prerendered HTML match the first client
 * render (zustand hands React the initial state for hydration); in the browser the device's choice is applied right
 * after module load, and components re-render in it.
 */
export const useLocaleStore = create<{ locale: Locale; loaded: number }>(() => ({ locale: SOURCE_LOCALE, loaded: 0 }));

/** Show `locale` once its translations are in memory (they're fetched on first use, except Russian). The last choice wins. */
let wanted: Locale = SOURCE_LOCALE;
function show(locale: Locale): void {
  wanted = locale;
  applyDocumentLang(locale);
  if (hasDictionary(locale)) {
    if (useLocaleStore.getState().locale !== locale) useLocaleStore.setState({ locale });
    return;
  }
  loadDictionary(locale).then(
    () => {
      if (wanted === locale) useLocaleStore.setState((st) => ({ locale, loaded: st.loaded + 1 }));
    },
    () => {
      // Offline before this language was ever loaded: stay in the current language.
      if (wanted === locale) applyDocumentLang(useLocaleStore.getState().locale);
    },
  );
}

/** This device's saved choice, or null when the person never picked one (or storage is blocked). */
export function storedLocale(): Locale | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return isLocale(v) ? v : null;
  } catch {
    return null;
  }
}

/** The language to start in: the saved choice, else the browser's languages (ru* → Russian), else English. */
export function detectLocale(): Locale {
  const saved = storedLocale();
  if (saved) return saved;
  if (typeof navigator === "undefined") return SOURCE_LOCALE;
  return localeFromLanguages(navigator.languages?.length ? navigator.languages : [navigator.language]);
}

function applyDocumentLang(locale: Locale) {
  if (typeof document !== "undefined") document.documentElement.lang = locale;
}

/**
 * Switch language. `remember` (default) saves it for this device; the account copy is saved by
 * `saveLocaleToAccount` (./account), which the switcher calls.
 */
export function setLocale(locale: Locale, opts: { remember?: boolean } = {}): void {
  if (!isLocale(locale)) return;
  if (opts.remember !== false) {
    try {
      localStorage.setItem(STORAGE_KEY, locale);
    } catch {
      // Private mode or blocked storage: the choice lasts until the page closes.
    }
  }
  show(locale);
}

/** Apply the device's language (browser only; called once below, and again by tests). */
export function initLocale(): void {
  if (typeof window === "undefined") return;
  show(detectLocale());
}
initLocale();

/** The active language (for non-React code). */
export function getLocale(): Locale {
  return useLocaleStore.getState().locale;
}

/** The active language, re-rendering on change. */
export function useLocale(): Locale {
  return useLocaleStore((s) => s.locale);
}

/** Translate English text in the active language: `t("New job")`, `t("Hi {name}", { name })`. Missing → English. */
export function t(key: string, vars?: Vars): string {
  const locale = getLocale();
  return translate(dictionaryFor(locale), locale, key, vars);
}

/** Plural: `tn("{n} device", "{n} devices", count)`. `{n}` is filled in; extra vars are allowed. */
export function tn(one: string, other: string, n: number, vars?: Vars): string {
  const locale = getLocale();
  return translatePlural(dictionaryFor(locale), locale, one, other, n, vars);
}

/** t() bound to one language, with tn and the locale attached. */
export type BoundT = ((key: string, vars?: Vars) => string) & {
  tn: (one: string, other: string, n: number, vars?: Vars) => string;
  locale: Locale;
};

export function makeT(locale: Locale): BoundT {
  const dict = dictionaryFor(locale);
  const bound = ((key: string, vars?: Vars) => translate(dict, locale, key, vars)) as BoundT;
  bound.tn = (one, other, n, vars) => translatePlural(dict, locale, one, other, n, vars);
  bound.locale = locale;
  return bound;
}

/** In components: `const t = useT(); t("Settings"); t.tn("{n} job", "{n} jobs", n)`. Re-renders on language change. */
export function useT(): BoundT {
  const locale = useLocale();
  return useMemo(() => makeT(locale), [locale]);
}

// ---- Formatting (app screens only: client-facing documents stay in English, see docs/i18n.md) ----

type DateIn = Date | string | number;
const toDate = (d: DateIn) => (d instanceof Date ? d : new Date(d));

/** A date in the active language, e.g. "Nov 20, 2026" / "20 нояб. 2026 г.". Invalid input → "". */
export function fmtDate(d: DateIn, opts: Intl.DateTimeFormatOptions = { year: "numeric", month: "short", day: "numeric" }, locale = getLocale()): string {
  const date = toDate(d);
  return Number.isNaN(date.getTime()) ? "" : new Intl.DateTimeFormat(intlTag(locale), opts).format(date);
}

/** A time of day, e.g. "3:05 PM" / "15:05". */
export function fmtTime(d: DateIn, opts: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit" }, locale = getLocale()): string {
  return fmtDate(d, opts, locale);
}

/** A number with the language's separators, e.g. "1,234.5" / "1 234,5". */
export function fmtNumber(n: number, opts?: Intl.NumberFormatOptions, locale = getLocale()): string {
  return new Intl.NumberFormat(intlTag(locale), opts).format(n);
}

/** Money in the company's currency (never converted; only the separators and symbol position follow the language). */
export function fmtCurrency(n: number, currency: string, opts?: Intl.NumberFormatOptions, locale = getLocale()): string {
  try {
    return new Intl.NumberFormat(intlTag(locale), { style: "currency", currency, ...opts }).format(n);
  } catch {
    // Unknown currency code: plain number and the code.
    return `${fmtNumber(n, { minimumFractionDigits: 2, maximumFractionDigits: 2 }, locale)} ${currency}`;
  }
}
