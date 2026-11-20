// .env.example must list every environment variable the app reads, so the owner's launch checklist
// (docs/launch-checklist.md) and the example file can't drift from the code. Values must stay empty: the repo is public.
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Set by Node / Next.js / Vercel, never by the owner. */
const PLATFORM_VARS = new Set(["NODE_ENV", "NEXT_RUNTIME", "VERCEL_ENV", "VERCEL_REGION", "VERCEL_URL", "VERCEL_PROJECT_PRODUCTION_URL", "NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA"]);

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = path.join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx|js|mjs|cjs)$/.test(name) ? [p] : [];
  });
}

/** Variable names read as process.env.NAME, env.NAME (env = process.env passed in) or process.env["NAME"]. */
function envNamesIn(text: string): string[] {
  const names = new Set<string>();
  for (const m of text.matchAll(/\b(?:process\.env|env)\.([A-Z][A-Z0-9_]+)/g)) names.add(m[1]);
  for (const m of text.matchAll(/process\.env\[\s*["'`]([A-Z][A-Z0-9_]+)["'`]\s*\]/g)) names.add(m[1]);
  return [...names];
}

function exampleEntries(): Map<string, string> {
  const entries = new Map<string, string>();
  for (const line of readFileSync(path.join(root, ".env.example"), "utf8").split("\n")) {
    const m = /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(line);
    if (m) entries.set(m[1], m[2]);
  }
  return entries;
}

describe(".env.example", () => {
  it("finds names in each way the code reads them", () => {
    expect(envNamesIn('process.env.A_B; env.CC; process.env["DD"]; someenv.EE; process.env.lower').sort()).toEqual(["A_B", "CC", "DD"]);
  });

  it("lists every variable the app reads", () => {
    const files = [...walk(path.join(root, "src")), path.join(root, "next.config.ts")];
    const used = new Set(files.flatMap((f) => envNamesIn(readFileSync(f, "utf8"))));
    const listed = exampleEntries();
    const missing = [...used].filter((n) => !PLATFORM_VARS.has(n) && !listed.has(n)).sort();
    expect(missing).toEqual([]);
  });

  it("keeps every value empty, with no variable listed twice", () => {
    const text = readFileSync(path.join(root, ".env.example"), "utf8");
    const lines = text.split("\n").filter((l) => /^[A-Z][A-Z0-9_]*=/.test(l));
    expect(lines.filter((l) => !l.endsWith("="))).toEqual([]);
    const names = lines.map((l) => l.split("=")[0]);
    expect(names.length).toBe(new Set(names).size);
  });
});
