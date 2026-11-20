// Production configuration and database-schema checks (server-only, pure apart from reading process.env).
// Used by /api/health (503 when something is missing) and by instrumentation.ts (one loud log line at start-up).
// Only variable NAMES are ever reported or logged, never values.

/**
 * The newest migration the deployed code needs. /api/health compares it with public.schema_version() and answers 503
 * when the database is behind. Bump it (and redefine schema_version() in that migration) when code starts depending on
 * a newer migration.
 */
export const REQUIRED_SCHEMA_VERSION = "20261125001000_access_guards";

/** What a paid production deployment can't run without. */
export const REQUIRED_PRODUCTION_VARS = [
  // accounts, sync and the service-role jobs (account deletion, billing webhook, admin)
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  // per-company Billdu credentials are encrypted with it
  "PINPLAN_ENCRYPTION_KEY",
  // subscriptions
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "STRIPE_PRICE_BASE",
  "STRIPE_PRICE_SEAT",
  // invites, documents and receipts by email
  "RESEND_API_KEY",
  "EMAIL_FROM",
  // links in emails (must be an https:// address)
  "PINPLAN_APP_URL",
  // bot check on /api/team/join (account creation with an invite code)
  "TURNSTILE_SECRET_KEY",
] as const;

type Env = Record<string, string | undefined>;

/**
 * The production deployment (preview and development deployments are allowed to be incomplete): Vercel production, or
 * PINPLAN_ENV=production on any other host (set in wrangler.jsonc for Cloudflare Workers).
 */
export function isProduction(env: Env = process.env): boolean {
  if (env.PINPLAN_ENV) return env.PINPLAN_ENV === "production";
  return env.VERCEL_ENV === "production";
}

const present = (v: string | undefined) => !!v && v.trim() !== "";

/** Names of required production variables that are missing or unusable. Values are never returned. */
export function missingProductionConfig(env: Env = process.env): string[] {
  const missing: string[] = REQUIRED_PRODUCTION_VARS.filter((n) => !present(env[n]));
  if (present(env.PINPLAN_APP_URL) && !/^https:\/\/[^\s/]+/i.test(env.PINPLAN_APP_URL!.trim())) missing.push("PINPLAN_APP_URL (must start with https://)");
  return missing;
}

/** The single start-up log line, or null when nothing is missing (or this isn't production). */
export function configWarning(env: Env = process.env): string | null {
  if (!isProduction(env)) return null;
  const missing = missingProductionConfig(env);
  if (!missing.length) return null;
  return `[Northpin] PRODUCTION CONFIG INCOMPLETE — missing: ${missing.join(", ")}. /api/health answers 503 until these are set. See SETUP.md.`;
}

/**
 * How the database's schema_version() compares with what the code needs.
 * - "ok": the same or newer; "behind": older, or the function doesn't exist yet (the migration wasn't run);
 * - "unknown": no usable answer (network trouble, an odd reply) — not treated as a failure.
 */
export function schemaStatus(reported: unknown, required = REQUIRED_SCHEMA_VERSION): "ok" | "behind" | "unknown" {
  if (reported === null) return "behind";
  if (typeof reported !== "string" || !/^\d{14}/.test(reported)) return "unknown";
  return reported.slice(0, 14) >= required.slice(0, 14) ? "ok" : "behind";
}
