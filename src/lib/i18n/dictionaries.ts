import type { Dictionary, Locale } from "./types";
import ru from "./ru";

/** Translations per language. English is the source text itself, so its dictionary is empty. */
export const DICTIONARIES: Record<Locale, Dictionary> = { en: {}, ru };
