// Pure translation functions (no state, no React): index.ts binds them to the active language.
import { intlTag } from "./locales";
import type { Dictionary, Locale, PluralForms, Vars } from "./types";

/** Replace `{name}` with vars.name. Unknown placeholders are left as they are, so a missing value shows up. */
export function interpolate(text: string, vars?: Vars): string {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (m, k: string) => (Object.prototype.hasOwnProperty.call(vars, k) ? String(vars[k]) : m));
}

/** The `{name}` placeholders in a text, sorted and de-duplicated. */
export function placeholders(text: string): string[] {
  return [...new Set([...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]))].sort();
}

const rulesCache = new Map<Locale, Intl.PluralRules>();
/** The CLDR plural category of `n` in `locale` (en: one/other; ru: one/few/many, other for fractions). */
export function pluralCategory(locale: Locale, n: number): Intl.LDMLPluralRule {
  let r = rulesCache.get(locale);
  if (!r) {
    r = new Intl.PluralRules(intlTag(locale));
    rulesCache.set(locale, r);
  }
  return r.select(n);
}

function pickForm(forms: PluralForms, locale: Locale, n: number): string | undefined {
  return forms[pluralCategory(locale, n)] ?? forms.other ?? forms.many;
}

/** Translate `key` (the English text). Falls back to the English text when the language has no entry. */
export function translate(dict: Dictionary, locale: Locale, key: string, vars?: Vars): string {
  const entry = Object.prototype.hasOwnProperty.call(dict, key) ? dict[key] : undefined;
  let text: string | undefined;
  if (typeof entry === "string") text = entry;
  else if (entry && typeof vars?.n === "number") text = pickForm(entry, locale, vars.n);
  else if (entry) text = entry.other ?? entry.many;
  return interpolate(text || key, vars);
}

/** Pick the plural form for `n` and fill `{n}` (and any other vars). The entry is keyed by the English singular. */
export function translatePlural(dict: Dictionary, locale: Locale, one: string, other: string, n: number, vars?: Vars): string {
  const all: Vars = { n, ...vars };
  const entry = Object.prototype.hasOwnProperty.call(dict, one) ? dict[one] : undefined;
  if (entry && typeof entry === "object") {
    const text = pickForm(entry, locale, n);
    if (text) return interpolate(text, all);
  }
  // No translation: English rules (one / other) on the English forms.
  return interpolate(pluralCategory("en", n) === "one" ? one : other, all);
}

/** `<T>` keys: the children text with runs of whitespace (JSX line breaks) collapsed, as scripts/check-i18n.mjs reads them. */
export function normalizeKey(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}
