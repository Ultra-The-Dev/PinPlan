// Types for the translation system (docs/i18n.md). Kept free of imports so the dictionary files, which import only
// these types, can be loaded by scripts/check-i18n.mjs with Node's type stripping.

/** A language the app can show. "en" is the source language: its text is the key, so it has no dictionary. */
export type Locale = "en" | "ru";

/** Plural forms of one entry, by CLDR category (Intl.PluralRules). Russian needs one / few / many. */
export type PluralForms = Partial<Record<"zero" | "one" | "two" | "few" | "many" | "other", string>>;

/**
 * Translations for one area, keyed by the exact English source text, e.g. `"New job": "Новый объект"`.
 * A plural entry (for tn()) is keyed by the English singular and lists the forms:
 * `"{n} device": { one: "{n} устройство", few: "{n} устройства", many: "{n} устройств" }`.
 */
export type Dictionary = Record<string, string | PluralForms>;

/** Values for `{name}` placeholders. */
export type Vars = Record<string, string | number>;
