#!/usr/bin/env node
// Translation checker (docs/i18n.md). Reads every t("…"), tn("…", "…"), msg("…") and <T>…</T> literal in src/,
// compares them with the Russian dictionaries (src/lib/i18n/ru/<area>.ts) and reports:
//   errors (exit 1): a translation whose {placeholders} differ from the English text; tn() forms with different
//                    placeholders; a plural entry without one / few / many; the same key translated differently in
//                    two areas.
//   warnings:        English text with no Russian yet (falls back to English), listed per file.
//   info:            Russian keys not found as literals (often fine: dynamic keys such as t(ROLE_INFO[r].name)).
// Usage: npm run check:i18n [-- --all] [-- --unused]
// The dictionary files are loaded with Node's type stripping, so they may import types only.
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RU_DIR = path.join(ROOT, "src/lib/i18n/ru");
/** Every translated language and its folder under src/lib/i18n (English is the source). */
export const LANGS = ["ru", "es", "pt", "uk", "pl", "zh", "vi"];
/** The i18n system itself: its doc comments show example keys, not real ones. */
const I18N_DIR = path.join(ROOT, "src/lib/i18n");
/** CLDR categories Russian needs for whole numbers. */
export const RU_PLURAL_FORMS = ["one", "few", "many"];
/** CLDR categories each language needs for whole numbers (Intl.PluralRules; "many" for 1,000,000 in es/pt falls back to "other"). */
export const PLURAL_FORMS = { ru: RU_PLURAL_FORMS, uk: ["one", "few", "many"], pl: ["one", "few", "many"], es: ["one", "other"], pt: ["one", "other"], zh: ["other"], vi: ["other"] };

const STR = String.raw`"((?:[^"\\\n]|\\.)*)"|'((?:[^'\\\n]|\\.)*)'`;
const lit = (m, i) => unescape(m[i] !== undefined ? m[i] : m[i + 1]);

function unescape(s) {
  return s.replace(/\\(u\{[0-9a-fA-F]+\}|u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|.)/g, (_, e) => {
    if (e[0] === "u") return String.fromCodePoint(parseInt(e[1] === "{" ? e.slice(2, -1) : e.slice(1), 16));
    if (e[0] === "x") return String.fromCharCode(parseInt(e.slice(1), 16));
    return { n: "\n", t: "\t", r: "\r" }[e] ?? e;
  });
}

const ENTITIES = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&apos;": "'", "&#39;": "'", "&nbsp;": " " };
const decodeJsx = (s) => s.replace(/&(amp|lt|gt|quot|apos|#39|nbsp);/g, (m) => ENTITIES[m]);
const normalize = (s) => s.replace(/\s+/g, " ").trim();
const lineOf = (src, index) => src.slice(0, index).split("\n").length;

/** The `{name}` placeholders in a text, sorted and de-duplicated (same as src/lib/i18n/core.ts). */
export function placeholders(text) {
  return [...new Set([...String(text).matchAll(/\{(\w+)\}/g)].map((m) => m[1]))].sort();
}

/** Translation keys used in one source file: [{ key, other?, kind: "t"|"tn"|"msg"|"T", line }]. */
export function extractKeys(src) {
  const out = [];
  for (const m of src.matchAll(new RegExp(String.raw`(?<![\w$.])(t|msg)\(\s*(?:${STR})`, "g"))) {
    out.push({ key: lit(m, 2), kind: m[1], line: lineOf(src, m.index) });
  }
  for (const m of src.matchAll(new RegExp(String.raw`(?<![\w$])tn\(\s*(?:${STR})\s*,\s*(?:${STR})`, "g"))) {
    out.push({ key: lit(m, 1), other: lit(m, 3), kind: "tn", line: lineOf(src, m.index) });
  }
  for (const m of src.matchAll(/<T(?:\s[^>]*)?>([^<{}]*)<\/T>/g)) {
    const key = normalize(decodeJsx(m[1]));
    if (key) out.push({ key, kind: "T", line: lineOf(src, m.index) });
  }
  for (const m of src.matchAll(new RegExp(String.raw`<T(?:\s[^>]*)?>\s*\{\s*(?:${STR})\s*\}\s*</T>`, "g"))) {
    out.push({ key: normalize(lit(m, 1)), kind: "T", line: lineOf(src, m.index) });
  }
  return out;
}

const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
const fmt = (vars) => (vars.length ? vars.map((v) => `{${v}}`).join(" ") : "none");

/**
 * Compare the dictionaries with the keys used.
 * @param {Record<string, Record<string, string | Record<string, string>>>} areas  area → { englishKey: text | plural forms }
 * @param {Map<string, { files: Set<string>, plural?: string }>} [used]  plural = the English plural form from tn()
 */
export function checkDictionaries(areas, used = new Map(), lang = "ru") {
  const forms = PLURAL_FORMS[lang] ?? RU_PLURAL_FORMS;
  const errors = [];
  const missing = [];
  const unused = [];
  const seen = new Map(); // key → { area, value }
  for (const [area, dict] of Object.entries(areas)) {
    for (const [key, value] of Object.entries(dict)) {
      const where = `${lang}/${area}.ts "${key}"`;
      const prev = seen.get(key);
      if (prev && JSON.stringify(prev.value) !== JSON.stringify(value)) {
        errors.push(`${where}: also in ${lang}/${prev.area}.ts with a different translation; keep one.`);
      }
      seen.set(key, { area, value });
      const enVars = placeholders(key);
      const plural = used.get(key)?.plural;
      if (plural !== undefined && !same(placeholders(plural), enVars)) {
        errors.push(`${where}: the English plural "${plural}" has ${fmt(placeholders(plural))}, the singular ${fmt(enVars)}.`);
      }
      if (typeof value === "string") {
        if (!value.trim()) errors.push(`${where}: empty translation (delete the entry to fall back to English).`);
        if (!same(placeholders(value), enVars)) errors.push(`${where}: placeholders ${fmt(placeholders(value))} in the translation, ${fmt(enVars)} in English.`);
      } else if (value && typeof value === "object") {
        for (const cat of forms) if (!value[cat]) errors.push(`${where}: plural entry needs "${cat}" (${forms.join(" / ")}).`);
        for (const [cat, form] of Object.entries(value)) {
          if (typeof form !== "string" || !form.trim()) errors.push(`${where}: "${cat}" form is empty.`);
          else if (!same(placeholders(form), enVars)) errors.push(`${where}: "${cat}" form has ${fmt(placeholders(form))}, English ${fmt(enVars)}.`);
        }
      } else {
        errors.push(`${where}: value must be a string or plural forms.`);
      }
      if (used.size && !used.has(key)) unused.push(`${lang}/${area}.ts "${key}"`);
    }
  }
  for (const [key, u] of used) {
    if (u.plural !== undefined && !seen.has(key) && !same(placeholders(u.plural), placeholders(key))) {
      errors.push(`tn("${key}", "${u.plural}") in ${[...u.files][0]}: the two English forms have different placeholders.`);
    }
    if (!seen.has(key)) missing.push({ key, files: [...u.files] });
  }
  return { errors, missing, unused };
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) {
      if (p !== I18N_DIR && name !== "node_modules") walk(p, out);
    } else if (/\.(ts|tsx)$/.test(name) && !name.endsWith(".d.ts")) out.push(p);
  }
  return out;
}

/** Every key used under `srcDir`: Map<key, { files: Set<"path:line">, plural? }>. */
export function scanSources(srcDir = path.join(ROOT, "src")) {
  const used = new Map();
  for (const file of walk(srcDir)) {
    const rel = path.relative(ROOT, file);
    for (const k of extractKeys(readFileSync(file, "utf8"))) {
      const u = used.get(k.key) ?? { files: new Set() };
      u.files.add(`${rel}:${k.line}`);
      if (k.other !== undefined) u.plural = k.other;
      used.set(k.key, u);
    }
  }
  return used;
}

/** The Russian area dictionaries, loaded from their .ts files (Node type stripping). */
export async function loadRuAreas() {
  return loadAreas("ru");
}

/** One language's area dictionaries, loaded from src/lib/i18n/<lang>/*.ts (Node type stripping). */
export async function loadAreas(lang) {
  const dir = path.join(ROOT, "src/lib/i18n", lang);
  const areas = {};
  for (const name of readdirSync(dir).sort()) {
    if (!name.endsWith(".ts") || name === "index.ts") continue;
    const mod = await import(pathToFileURL(path.join(dir, name)).href);
    areas[name.replace(/\.ts$/, "")] = mod.default;
  }
  return areas;
}

async function main() {
  const args = new Set(process.argv.slice(2));
  // --lang=es checks (and lists missing keys for) one language; default: every language, missing keys listed for Russian.
  const only = [...args].find((a) => a.startsWith("--lang="))?.slice(7);
  const langs = only ? [only] : LANGS;
  const used = scanSources();
  const total = used.size;
  let failed = 0;
  for (const lang of langs) {
    let areas;
    try {
      areas = await loadAreas(lang);
    } catch (e) {
      console.error(`check-i18n: could not load src/lib/i18n/${lang}/*.ts (${e.message}).\nRun with Node 22.18+ or: node --experimental-strip-types scripts/check-i18n.mjs`);
      process.exit(2);
    }
    const { errors, missing, unused } = checkDictionaries(areas, used, lang);
    const translated = total - missing.length;
    console.log(`i18n ${lang}: ${total} keys in src, ${translated} translated (${total ? Math.round((translated / total) * 100) : 100}%).`);
    if (missing.length && (lang === "ru" || only)) {
      console.warn(`\nwarning: ${missing.length} keys have no ${lang} translation yet (shown in English):`);
      const list = args.has("--all") ? missing : missing.slice(0, 40);
      for (const m of list) console.warn(`  ${m.files[0]}  "${m.key}"`);
      if (list.length < missing.length) console.warn(`  … and ${missing.length - list.length} more (--all to list them)`);
    }
    if (unused.length && (lang === "ru" || only)) {
      console.log(`\ninfo: ${unused.length} ${lang} keys not found as literals (fine for dynamic keys)${args.has("--unused") ? ":" : "; --unused to list."}`);
      if (args.has("--unused")) for (const u of unused) console.log(`  ${u}`);
    }
    if (errors.length) {
      failed += errors.length;
      console.error(`\n${errors.length} error(s) in ${lang}:`);
      for (const e of errors) console.error(`  ${e}`);
    }
  }
  if (failed) process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await main();
