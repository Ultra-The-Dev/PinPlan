import { aiEnabledOnServer } from "@/lib/features";
import { adminEmails, requirePlatformAdmin } from "@/lib/server/admin";
import { accessCodeAccepted, authMode, requireUser } from "@/lib/server/auth";
import { billingConfig } from "@/lib/server/billing";
import { emailConfigured } from "@/lib/server/email";
import { featureStatus, isProduction, missingProductionConfig, REQUIRED_SCHEMA_VERSION, schemaStatus } from "@/lib/server/envCheck";
import { loadBillduCreds } from "@/lib/server/secrets";

/**
 * Connection check for the apps and for uptime monitors.
 * - Anyone, including every ordinary signed-in customer: only that this is a Northpin server ("app"), whether it is
 *   healthy ("ok"), whether the database answers ("database": "ok" | "unreachable") and whether the caller's own
 *   sign-in or access code was accepted ("authorized", for the apps' connection check). Nothing about how the server
 *   is set up: missing settings and a schema behind the code are written to the server log instead. The response is
 *   503 when the database is down, the schema is behind, or (on the production deployment) a required setting is
 *   missing, so an uptime monitor still catches misconfiguration.
 * - Whoever runs the server, i.e. a Northpin platform admin (signed in, confirmed email in PLATFORM_ADMIN_EMAILS) or a
 *   caller holding the access code where the server accepts it: also the details (names of missing settings, schema
 *   state, which features are configured as yes/no, never values, and whether the server-wide Billdu account is set).
 *   A customer's own company's Billdu connection is in Settings › Billdu.
 */
export async function GET(request: Request) {
  const mode = authMode();
  const prod = isProduction();
  const [auth, db] = await Promise.all([requireUser(request), databaseStatus()]);
  const missingConfig = prod ? missingProductionConfig() : [];
  const schema = db.status === "ok" ? schemaStatus(db.schema) : null;
  if (missingConfig.length) console.warn(`[health] missing production settings: ${missingConfig.join(", ")}`);
  if (schema === "behind") console.warn(`[health] database schema is behind the code (needs ${REQUIRED_SCHEMA_VERSION})`);
  // An open (unprotected) production server accepts nobody.
  const authorized = auth.ok && !(prod && mode === "open");
  // The access code, where this server accepts it: requireUser then answers ok without a user id.
  const codeCaller = authorized && !auth.userId && !!request.headers.get("x-pinplan-access") && accessCodeAccepted();
  const admin = !codeCaller && authorized && !!auth.userId && adminEmails().length > 0 && (await requirePlatformAdmin(request)).ok;
  const ok = db.status !== "unreachable" && schema !== "behind" && missingConfig.length === 0;
  const base = { ok, app: "pinplan", authorized, ...(db.status ? { database: db.status } : {}) };
  const init = { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } };
  if (!codeCaller && !admin) return Response.json(base, init);

  // Server-wide Billdu credentials: only single-company callers (the access code) may use them. The platform admin
  // sees the switch too; a signed-in customer never does.
  let billdu: boolean | undefined;
  if (codeCaller || admin) {
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
    // Online invoice payments (Stripe Connect): optional, "off" until STRIPE_CONNECT_WEBHOOK_SECRET is set.
    onlinePayments: featureStatus("onlinePayments").status,
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
      ...(mode !== "open" ? { authMode: mode } : {}),
      ...(schema === "behind" ? { schema, schemaRequired: REQUIRED_SCHEMA_VERSION } : {}),
      ...(missingConfig.length ? { missingConfig } : {}),
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
