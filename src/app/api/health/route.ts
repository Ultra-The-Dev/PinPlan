import { aiEnabledOnServer } from "@/lib/features";
import { authMode, requireUser } from "@/lib/server/auth";
import { billingConfig } from "@/lib/server/billing";
import { emailConfigured } from "@/lib/server/email";
import { isProduction, missingProductionConfig, REQUIRED_SCHEMA_VERSION, schemaStatus } from "@/lib/server/envCheck";
import { loadBillduCreds } from "@/lib/server/secrets";
import { bearer } from "@/lib/server/supabaseAdmin";

/**
 * Connection check for the apps and for uptime monitors.
 * - Anyone: that this is a PinPlan server, how it signs callers in (never "open": an unprotected server doesn't say
 *   so), whether the database answers ("database": "ok" | "unreachable") and, only when something is wrong, which
 *   required production settings are missing (names only) and whether the database schema is behind the code.
 *   The response is 503 when the database is down, the schema is behind, or (on the production deployment) a
 *   required setting is missing — so an uptime monitor catches misconfiguration too.
 * - An authorised caller (access code / session) also learns which features are configured — as yes/no, never values.
 *   Whether the server-wide Billdu account is set is only told to single-company callers (the access code), never to a
 *   signed-in customer: their own company's Billdu connection is in Settings › Billdu.
 */
export async function GET(request: Request) {
  const mode = authMode();
  const prod = isProduction();
  const [auth, db] = await Promise.all([requireUser(request), databaseStatus()]);
  const missingConfig = prod ? missingProductionConfig() : [];
  const schema = db.status === "ok" ? schemaStatus(db.schema) : null;
  // An open (unprotected) production server must not hand its configuration to everyone.
  const authorized = auth.ok && !(prod && mode === "open");
  const ok = db.status !== "unreachable" && schema !== "behind" && missingConfig.length === 0;
  const base = {
    ok,
    app: "pinplan",
    ...(mode !== "open" ? { authMode: mode } : {}),
    authorized,
    ...(db.status ? { database: db.status } : {}),
    ...(schema === "behind" ? { schema, schemaRequired: REQUIRED_SCHEMA_VERSION } : {}),
    ...(missingConfig.length ? { missingConfig } : {}),
  };
  const init = { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } };
  if (!authorized) return Response.json(base, init);

  // Server-wide Billdu credentials: only single-company callers (no session token) may use them, so only they hear about them.
  const singleCompany = mode !== "supabase" || !bearer(request);
  let billdu: boolean | undefined;
  if (singleCompany) {
    try {
      billdu = !!(await loadBillduCreds()).creds;
    } catch {
      billdu = false;
    }
  }
  const has = (...names: string[]) => names.every((n) => !!process.env[n]?.trim());
  const billing = billingConfig();
  const appUrl = process.env.PINPLAN_APP_URL?.trim() ?? "";
  const config = {
    supabase: has("NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    serviceRoleKey: has("SUPABASE_SERVICE_ROLE_KEY"),
    stripe: billing.ok,
    ...(!billing.ok ? { stripeMissing: billing.missing } : {}),
    stripeWebhook: has("STRIPE_WEBHOOK_SECRET"),
    email: emailConfigured(),
    resend: has("RESEND_API_KEY"),
    appUrl: /^https?:\/\/\S+/i.test(appUrl),
    ai: aiEnabledOnServer() && has("ANTHROPIC_API_KEY"),
    ...(billdu !== undefined ? { billdu } : {}),
    encryptionKey: has("PINPLAN_ENCRYPTION_KEY"),
    platformAdmins: has("PLATFORM_ADMIN_EMAILS"),
    ...(schema ? { schema, schemaRequired: REQUIRED_SCHEMA_VERSION } : {}),
  };
  return Response.json(
    {
      ...base,
      ai: config.ai,
      ...(billdu !== undefined ? { billdu } : {}),
      encryptionKey: config.encryptionKey,
      config,
      ...(db.latencyMs != null ? { databaseLatencyMs: db.latencyMs } : {}),
    },
    init,
  );
}

/**
 * One cheap PostgREST read with the public anon key (RLS returns nothing): any non-5xx answer means the database is up.
 * Then public.schema_version() (anon may call it): its value, null when the function doesn't exist yet (404), or
 * undefined when the answer isn't usable.
 */
async function databaseStatus(): Promise<{ status: "ok" | "unreachable" | null; latencyMs?: number; schema?: unknown }> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/, "");
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return { status: null };
  const headers = { apikey: key, Authorization: `Bearer ${key}` };
  const started = Date.now();
  const schemaRead = fetch(`${url}/rest/v1/rpc/schema_version`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json", Accept: "application/json" },
    body: "{}",
    cache: "no-store",
    signal: AbortSignal.timeout(4000),
  })
    .then(async (r) => (r.status === 404 ? null : r.ok ? await r.json().catch(() => undefined) : undefined))
    .catch(() => undefined);
  try {
    const r = await fetch(`${url}/rest/v1/teams?select=id&limit=1`, { headers, cache: "no-store", signal: AbortSignal.timeout(4000) });
    const latencyMs = Date.now() - started;
    if (r.status >= 500) return { status: "unreachable", latencyMs };
    return { status: "ok", latencyMs, schema: await schemaRead };
  } catch {
    return { status: "unreachable", latencyMs: Date.now() - started };
  }
}
