import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { configWarning, isProduction, missingProductionConfig, REQUIRED_PRODUCTION_VARS, REQUIRED_SCHEMA_VERSION, schemaStatus } from "@/lib/server/envCheck";

const full = Object.fromEntries(REQUIRED_PRODUCTION_VARS.map((n) => [n, n === "PINPLAN_APP_URL" ? "https://app.example.com" : `value-of-${n}`]));

describe("production config check", () => {
  it("lists missing required variables by name only", () => {
    expect(missingProductionConfig(full)).toEqual([]);
    const env = { ...full, STRIPE_WEBHOOK_SECRET: "", RESEND_API_KEY: "  ", SUPABASE_SERVICE_ROLE_KEY: undefined };
    expect(missingProductionConfig(env)).toEqual(["SUPABASE_SERVICE_ROLE_KEY", "STRIPE_WEBHOOK_SECRET", "RESEND_API_KEY"]);
  });

  it("wants an https app address", () => {
    expect(missingProductionConfig({ ...full, PINPLAN_APP_URL: "app.example.com" })).toEqual(["PINPLAN_APP_URL (must start with https://)"]);
    expect(missingProductionConfig({ ...full, PINPLAN_APP_URL: "http://app.example.com" })).toHaveLength(1);
  });

  it("logs one line in production only, naming variables but never values", () => {
    expect(isProduction({ VERCEL_ENV: "preview" })).toBe(false);
    expect(configWarning({ ...full, STRIPE_SECRET_KEY: "" })).toBeNull(); // not production
    expect(configWarning({ ...full, VERCEL_ENV: "production" })).toBeNull();
    const line = configWarning({ ...full, VERCEL_ENV: "production", STRIPE_SECRET_KEY: "", EMAIL_FROM: "" })!;
    expect(line).toContain("STRIPE_SECRET_KEY, EMAIL_FROM");
    expect(line.split("\n")).toHaveLength(1);
    expect(line).not.toMatch(/value-of-/);
  });
});

describe("schema version", () => {
  it("compares the database's newest migration with what the code needs", () => {
    expect(schemaStatus(REQUIRED_SCHEMA_VERSION)).toBe("ok");
    expect(schemaStatus("29991231000000_future")).toBe("ok");
    expect(schemaStatus("20261121020000_ops")).toBe("behind");
    expect(schemaStatus(null)).toBe("behind"); // function missing: migration not run
    expect(schemaStatus(undefined)).toBe("unknown");
    expect(schemaStatus([])).toBe("unknown");
    expect(schemaStatus("garbage")).toBe("unknown");
  });

  it("names a migration that exists, and the newest schema_version() reports its own migration", () => {
    const dir = join(__dirname, "..", "supabase", "migrations");
    const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
    expect(files).toContain(`${REQUIRED_SCHEMA_VERSION}.sql`);
    const definers = files.filter((f) => /function public\.schema_version\(\)/.test(readFileSync(join(dir, f), "utf8")));
    const latest = definers[definers.length - 1];
    expect(latest).toBeDefined();
    const name = latest.replace(/\.sql$/, "");
    expect(readFileSync(join(dir, latest), "utf8")).toContain(`'${name}'`);
    expect(name >= REQUIRED_SCHEMA_VERSION).toBe(true);
  });
});
