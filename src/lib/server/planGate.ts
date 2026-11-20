// Paid-plan gate for server routes (server-only).
//
// A team whose trial ended (or whose subscription lapsed) is read-only: the database refuses job edits
// (team_can_write → plan_allows_work, supabase/migrations/20261121000000_billing.sql). Server routes that do work on
// the company's behalf (sending to Billdu, creating Billdu products, connecting Billdu) ask the same question here,
// with the service role, so a locked team can't keep using them.
//
// Who passes: solo users (not on a team), teams on a live trial, active / past-due / comped teams, and every caller on
// a server without accounts or without SUPABASE_SERVICE_ROLE_KEY (no billing can exist there). If the check itself
// fails, the route answers 503 rather than letting the work through.
import { bearer, serviceConfigured, serviceFetch, supabaseUrl, anonKey } from "./supabaseAdmin";

export const PLAN_REQUIRED_MESSAGE = "Your trial has ended. Choose a plan in Settings → Billing.";

const json = (body: Record<string, unknown>, status: number) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

/** The signed-in user behind the request's bearer token, or null. */
async function userIdFromToken(request: Request): Promise<string | null> {
  const token = bearer(request);
  if (!token || !supabaseUrl() || !anonKey()) return null;
  const r = await fetch(`${supabaseUrl()}/auth/v1/user`, { headers: { Authorization: `Bearer ${token}`, apikey: anonKey()! }, cache: "no-store" });
  if (!r.ok) return null;
  return ((await r.json()) as { id?: string }).id ?? null;
}

/**
 * Null when the caller may do paid work; otherwise the response to send (402 when the plan doesn't allow it).
 * Pass `userId` when the route already knows it (saves a round trip); without it the bearer token is checked.
 * A null user (access code / single-company callers) passes: there is no team to bill.
 */
export async function requirePaidOrTrial(request: Request, userId?: string | null): Promise<Response | null> {
  if (!serviceConfigured()) return null;
  let uid = userId;
  try {
    if (uid === undefined) uid = await userIdFromToken(request);
    if (!uid) return null;
    // team_can_write(owner): true for solo users, else plan_allows_work(plan_status, trial_ends_at) of their team.
    const r = await serviceFetch("/rest/v1/rpc/team_can_write", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ owner: uid }),
    });
    // Billing isn't set up in this database (migration not run): nothing to enforce.
    if (r.status === 404) return null;
    if (!r.ok) throw new Error(`team_can_write ${r.status}`);
    if ((await r.json()) === false) return json({ error: PLAN_REQUIRED_MESSAGE, code: "plan_required" }, 402);
    return null;
  } catch (e) {
    console.error("[plan gate]", e);
    return json({ error: "Couldn't check your plan. Try again in a minute.", code: "plan_check_failed" }, 503);
  }
}
