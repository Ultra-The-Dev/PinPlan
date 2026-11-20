#!/usr/bin/env node
// Launch gate for the legal pages: lists every "[placeholder]" still left in src/lib/legal.ts, in the public legal and
// support pages, and in public/.well-known/security.txt, and checks that security.txt hasn't expired.
//
// Runs before every build (`prebuild` in package.json). It only FAILS the build when LEGAL_CHECK=strict (set it in
// Vercel's production environment on launch day, once the values are filled in); otherwise it warns, so deployments keep
// working before launch.
// tests/legalPlaceholders.test.ts uses the same functions.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Where placeholders may hide. legal.ts is the one place they belong; the rest must stay free of them. */
export const LEGAL_SOURCE = "src/lib/legal.ts";
export const PAGE_DIRS = ["src/app/terms", "src/app/privacy", "src/app/support", "src/app/accessibility", "src/app/legal", "src/components/legal"];
export const SECURITY_TXT = "public/.well-known/security.txt";

/** A whole string literal in square brackets: "[Company legal name]". Class names like "[&_h2]:mt-4" don't match. */
const LITERAL = /(["'`])\[[^"'`\]\n]+\]\1/g;
/** Bracketed JSX text: <Ph>[35]</Ph>, >[time zone]<. */
const JSX_TEXT = />\s*\[[^\]<>{}\n]+\]\s*</g;
/** Any bracketed value in a plain-text file. */
const PLAIN = /\[[^\]\n]+\]/g;

const isComment = (line, kind) => (kind === "code" ? /^\s*(\/\/|\/\*|\*)/ : /^\s*#/).test(line);

/**
 * @param {string} file
 * @param {string} text
 * @param {"code" | "plain"} [kind]
 * @returns {{ file: string; line: number; text: string }[]}
 */
export function scanText(file, text, kind = "code") {
  /** @type {{ file: string; line: number; text: string }[]} */
  const hits = [];
  text.split("\n").forEach((line, i) => {
    if (isComment(line, kind)) return;
    const patterns = kind === "code" ? [LITERAL, JSX_TEXT] : [PLAIN];
    for (const re of patterns) for (const m of line.matchAll(re)) hits.push({ file, line: i + 1, text: m[0].replace(/^[>\s]+|[<\s]+$/g, "") });
  });
  return hits;
}

/** @param {string} dir @returns {string[]} */
function walk(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const p = path.join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : /\.(tsx?|mdx?)$/.test(name) ? [p] : [];
  });
}

/** Placeholders still in legal.ts (expected until the owner fills them in). @param {string} root */
export function sourcePlaceholders(root) {
  return scanText(LEGAL_SOURCE, readFileSync(path.join(root, LEGAL_SOURCE), "utf8"));
}

/** Bracketed placeholders typed straight into a page (never allowed: put the value in legal.ts instead). @param {string} root */
export function pagePlaceholders(root) {
  return PAGE_DIRS.flatMap((d) => walk(path.join(root, d))).flatMap((f) => scanText(path.relative(root, f), readFileSync(f, "utf8")));
}

/** Placeholders and expiry problems in security.txt. @param {string} root @param {Date} [now] */
export function securityTxtProblems(root, now = new Date()) {
  const file = path.join(root, SECURITY_TXT);
  if (!existsSync(file)) return [{ file: SECURITY_TXT, line: 0, text: "missing" }];
  const text = readFileSync(file, "utf8");
  const hits = scanText(SECURITY_TXT, text, "plain");
  const expires = text.match(/^Expires:\s*(.+)$/m)?.[1]?.trim();
  const t = expires ? Date.parse(expires) : NaN;
  if (!Number.isFinite(t)) hits.push({ file: SECURITY_TXT, line: 0, text: "no valid Expires: field" });
  else if (t <= now.getTime()) hits.push({ file: SECURITY_TXT, line: 0, text: `Expires ${expires} is in the past: set a date under a year ahead` });
  return hits;
}

/** Everything still to fix before launch. @param {string} root @param {Date} [now] */
export function checkLegal(root, now = new Date()) {
  return [...sourcePlaceholders(root), ...pagePlaceholders(root), ...securityTxtProblems(root, now)];
}

/** Production builds fail on problems; everything else only warns. @param {Record<string, string | undefined>} [env] */
export function strictMode(env = process.env) {
  return env.LEGAL_CHECK === "strict";
}

const isMain = !!process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const problems = checkLegal(root);
  if (problems.length === 0) {
    console.log("check-legal: no placeholders left in the legal pages.");
  } else {
    const strict = strictMode();
    const say = strict ? console.error : console.warn;
    say(`check-legal: ${problems.length} placeholder(s) to fill before launch${strict ? "" : " (warning only; set LEGAL_CHECK=strict to block builds)"}:`);
    for (const p of problems) say(`  ${p.file}${p.line ? `:${p.line}` : ""}  ${p.text}`);
    if (strict) {
      say("Fill them in (docs/production-checklist.md, section 1) and build again.");
      process.exit(1);
    }
  }
}
