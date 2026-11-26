// Who is calling an /api/integrations route (server-only): office staff only, and (for anything that sends data or
// starts a connection) a team whose subscription allows work.
import { resolveBillduCaller, type BillduCaller } from "../billduCreds";
import { serviceConfigured, serviceFetch } from "../supabaseAdmin";
import type { Owner } from "./types";

export interface IntegrationCaller {
  caller: BillduCaller;
  /** Null on single-company servers (no accounts): only Billdu and the file exports work there. */
  owner: Owner | null;
  userId: string | null;
}

export type IntegrationCallerResult = { ok: true; value: IntegrationCaller } | { ok: false; response: Response };

export const jsonError = (error: string, code: string, status: number, extra: Record<string, unknown> = {}) => Response.json({ error, code, ...extra }, { status });

/**
 * 402 when the caller's company may not work: its trial ended or its subscription lapsed. Asked of the database
 * (team_can_write, the same rule as its write lock), so it follows billing_settings.enforce (nothing locks before
 * launch) and covers people working alone (their own trial) as well as teams. Callers without an account (the access
 * code) and servers without the service key pass: there is no billing there.
 */
export async function planGate(c: IntegrationCaller): Promise<Response | null> {
  if (c.caller.mode === "single_company" || !c.userId || !serviceConfigured()) return null;
  let r: Response;
  try {
    r = await serviceFetch("/rest/v1/rpc/team_can_write", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ owner: c.userId }),
    });
  } catch {
    return jsonError("Could not check your subscription. Try again.", "plan_check_failed", 503);
  }
  if (r.status === 404) return null; // billing not migrated yet: nothing to enforce
  if (!r.ok) return jsonError(`Could not check your subscription (${r.status}).`, "plan_check_failed", 503);
  if ((await r.json().catch(() => null)) !== false) return null;
  return jsonError("Your Northpin subscription is inactive. Renew it in Settings → Billing to send to your accounting app.", "subscription_inactive", 402);
}

/** Office caller (techs get 403) and, with `requirePlan`, an active subscription (else 402). */
export async function resolveIntegrationCaller(request: Request, opts: { requirePlan?: boolean } = {}): Promise<IntegrationCallerResult> {
  const auth = await resolveBillduCaller(request);
  if (!auth.ok) {
    if (auth.response.status === 403)
      return { ok: false, response: jsonError("Accounting connections are handled by the office. Ask an admin on your team.", "office_only", 403) };
    return auth;
  }
  const caller = auth.caller;
  const value: IntegrationCaller = { caller, owner: caller.mode === "single_company" ? null : caller.owner, userId: caller.userId };
  if (opts.requirePlan) {
    const blocked = await planGate(value);
    if (blocked) return { ok: false, response: blocked };
  }
  return { ok: true, value };
}
