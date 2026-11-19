import { authMode, requireUser } from "@/lib/server/auth";
import { loadBillduCreds } from "@/lib/server/secrets";

/**
 * Connection check for the apps and for uptime monitors.
 * - Anyone: that this is a PinPlan server, how it signs callers in and, when Supabase is configured, whether the
 *   database answers ("database": "ok" | "unreachable"; the response is 503 when it doesn't).
 * - An authorised caller (access code / session) also learns which features are configured — as yes/no, never values.
 */
export async function GET(request: Request) {
  const [auth, db] = await Promise.all([requireUser(request), databaseStatus()]);
  const base = { ok: db.status !== "unreachable", app: "pinplan", authMode: authMode(), authorized: auth.ok, ...(db.status ? { database: db.status } : {}) };
  const init = { status: base.ok ? 200 : 503, headers: { "Cache-Control": "no-store" } };
  if (!auth.ok) return Response.json(base, init);
  let billdu = false;
  try {
    billdu = !!(await loadBillduCreds()).creds;
  } catch {
    billdu = false;
  }
  const has = (...names: string[]) => names.every((n) => !!process.env[n]);
  const config = {
    supabase: has("NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    serviceRoleKey: has("SUPABASE_SERVICE_ROLE_KEY"),
    stripe: has("STRIPE_SECRET_KEY"),
    stripeWebhook: has("STRIPE_WEBHOOK_SECRET"),
    resend: has("RESEND_API_KEY"),
    ai: has("ANTHROPIC_API_KEY"),
    billdu,
    encryptionKey: has("PINPLAN_ENCRYPTION_KEY"),
    platformAdmins: has("PLATFORM_ADMIN_EMAILS"),
  };
  return Response.json(
    { ...base, ai: config.ai, billdu, encryptionKey: config.encryptionKey, config, ...(db.latencyMs != null ? { databaseLatencyMs: db.latencyMs } : {}) },
    init,
  );
}

/** One cheap PostgREST read with the public anon key (RLS returns nothing). Any non-5xx answer means the database is up. */
async function databaseStatus(): Promise<{ status: "ok" | "unreachable" | null; latencyMs?: number }> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return { status: null };
  const started = Date.now();
  try {
    const r = await fetch(`${url}/rest/v1/teams?select=id&limit=1`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      cache: "no-store",
      signal: AbortSignal.timeout(4000),
    });
    return { status: r.status < 500 ? "ok" : "unreachable", latencyMs: Date.now() - started };
  } catch {
    return { status: "unreachable", latencyMs: Date.now() - started };
  }
}
