#!/usr/bin/env node
// Checks supabase/migrations/ before it can reach the live database:
//   - every file is named <14-digit UTC timestamp>_<snake_case name>.sql with a real date and time
//   - timestamps are unique (two files with the same version break `supabase db push`)
//   - with --base <git ref> (CI on a pull request): every migration added since that ref is newer than the newest
//     one already there, so it can't be skipped or applied out of order on a database that is already migrated.
// Usage: node scripts/check-migrations.mjs [--base origin/main] [--dir supabase/migrations]
//        node scripts/check-migrations.mjs --self-test
import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const NAME = /^(\d{14})_([a-z0-9_]+)\.sql$/;

/** A 14-digit YYYYMMDDHHMMSS that is a real calendar date and time. */
export function validStamp(s) {
  const [y, mo, d, h, mi, se] = [s.slice(0, 4), s.slice(4, 6), s.slice(6, 8), s.slice(8, 10), s.slice(10, 12), s.slice(12, 14)].map(Number);
  const t = new Date(Date.UTC(y, mo - 1, d, h, mi, se));
  return y >= 2000 && t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === d && t.getUTCHours() === h && t.getUTCMinutes() === mi && t.getUTCSeconds() === se;
}

/**
 * Problems with a list of migration file names (empty = fine).
 * `baseFiles`: the names on the base branch, when known; files not in it are "new" and must sort after all of them.
 */
export function migrationProblems(files, baseFiles = null) {
  const problems = [];
  const sql = files.filter((f) => f.endsWith(".sql")).sort();
  const seen = new Map();
  for (const f of sql) {
    const m = NAME.exec(f);
    if (!m) {
      problems.push(`${f}: name must be <YYYYMMDDHHMMSS>_<lower_snake_name>.sql`);
      continue;
    }
    if (!validStamp(m[1])) problems.push(`${f}: ${m[1]} is not a real date and time`);
    if (seen.has(m[1])) problems.push(`${f}: same timestamp as ${seen.get(m[1])}`);
    else seen.set(m[1], f);
  }
  if (baseFiles) {
    const base = new Set(baseFiles);
    const baseMax = baseFiles.map((f) => NAME.exec(f)?.[1]).filter(Boolean).sort().pop();
    for (const f of sql) {
      const stamp = NAME.exec(f)?.[1];
      if (!stamp || base.has(f) || !baseMax) continue;
      if (stamp <= baseMax) problems.push(`${f}: new migration is older than the newest one already on the base branch (${baseMax}); rename it with a later timestamp`);
    }
    for (const f of baseFiles) if (f.endsWith(".sql") && !sql.includes(f)) problems.push(`${f}: migration on the base branch was renamed or deleted; applied migrations must never change`);
  }
  return problems;
}

function selfTest() {
  const eq = (a, b, what) => {
    if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${what}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
  };
  const ok = ["20261112000000_init.sql", "20261112010000_app_secrets.sql"];
  eq(migrationProblems(ok), [], "valid list");
  eq(migrationProblems([...ok, "README.md"]), [], "non-sql files are ignored");
  eq(migrationProblems(["20261112000000_init.sql", "20261112000000_other.sql"]).length, 1, "duplicate timestamp");
  eq(migrationProblems(["2026111200000_short.sql"]).length, 1, "13-digit stamp");
  eq(migrationProblems(["20261112000000-Init.sql"]).length, 1, "bad name");
  eq(migrationProblems(["20261332000000_bad_month.sql"]).length, 1, "month 13");
  eq(migrationProblems(["20260230000000_feb_30.sql"]).length, 1, "Feb 30");
  eq(migrationProblems(["20261112246000_bad_time.sql"]).length, 1, "hour 24");
  eq(migrationProblems([...ok, "20261113000000_new.sql"], ok), [], "new and newer than base");
  eq(migrationProblems([...ok, "20261112005000_sneaky.sql"], ok).length, 1, "new but older than base");
  eq(migrationProblems([ok[0]], ok).length, 1, "base migration deleted");
  eq(migrationProblems(ok, []), [], "empty base");
  console.log("check-migrations self-test passed");
}

function filesAt(ref, dir) {
  try {
    const out = execFileSync("git", ["ls-tree", "--name-only", `${ref}:${dir}`], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    return out.split("\n").filter(Boolean);
  } catch (e) {
    throw new Error(`Couldn't list ${dir} at ${ref} (fetch it first, e.g. git fetch origin main): ${e.stderr || e.message}`);
  }
}

function main(argv) {
  if (argv.includes("--self-test")) return selfTest();
  const arg = (k) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : undefined);
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const dir = arg("--dir") ?? "supabase/migrations";
  const files = readdirSync(path.join(root, dir));
  const base = arg("--base");
  const problems = migrationProblems(files, base ? filesAt(base, dir) : null);
  const n = files.filter((f) => f.endsWith(".sql")).length;
  if (problems.length) {
    for (const p of problems) console.error(`::error file=${dir}/${p.split(":")[0]}::${p}`);
    console.error(`${problems.length} migration problem${problems.length === 1 ? "" : "s"} in ${dir}`);
    process.exit(1);
  }
  console.log(`${n} migrations OK in ${dir}${base ? ` (new ones are newer than ${base})` : ""}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2));
