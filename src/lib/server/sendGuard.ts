// Abuse limits for email Northpin sends on a company's behalf (server-only). Before a quote, invoice, reminder,
// receipt or team invite goes to Resend, reserveSend() asks the database (email_send_reserve, service role) whether
// this person may send it:
//   - their own account email is confirmed (a throwaway sign-up can't send),
//   - their company's subscription lets it work (plan_allows_work),
//   - the company is under its daily cap (a trial gets a small allowance) and hasn't mailed this address too often,
//   - Northpin as a whole is under its daily allowance, and free trials together under their share of it
//     (email_settings, 20261125000600_email_signup_abuse.sql).
// The reservation is the log row: finishSend() records Resend's id, or removes the row when the send failed.
// Notifications to the company itself (a client answered a link) are only logged (logNotification).
//
// Supabase not set up (local use) or the migration not run yet: outside production the routes fall back to their
// in-memory limits; in production nothing is sent until it is (fails closed). Never logs addresses or content.
import { createHash } from "node:crypto";
import { getAuthUser, serviceConfigured, serviceFetch } from "./supabaseAdmin";
import { validEmail } from "./email";

export type GuardedKind = "document" | "reminder" | "receipt" | "invite";

export type Reservation =
  | { ok: true; id: number | null; trial: boolean; durable: boolean }
  | { ok: false; response: Response; reason: string };

const isProduction = () => process.env.NODE_ENV === "production";

/**
 * One mailbox, however it is written: lower case, the "+tag" dropped, and for Gmail the dots dropped too (googlemail.com
 * read as gmail.com). Must match public.email_normalize() (supabase/migrations/20261125000600_email_signup_abuse.sql).
 */
export function normalizeEmail(email: string): string {
  const e = email.trim().toLowerCase();
  const at = e.lastIndexOf("@");
  if (at < 0) return e;
  let local = e.slice(0, at);
  let domain = e.slice(at + 1);
  const plus = local.indexOf("+");
  if (plus > 0) local = local.slice(0, plus);
  if (domain === "gmail.com" || domain === "googlemail.com") {
    local = local.replace(/\./g, "");
    domain = "gmail.com";
  }
  return `${local}@${domain}`;
}

/** sha256 of the normalised address: lets the database count repeats without storing who. Same as public.email_hash(). */
export function recipientHash(email: string): string {
  return createHash("sha256").update(normalizeEmail(email)).digest("hex");
}

/** A short hash for keys (IP addresses, link tokens) stored by the durable answer limits. */
export function keyHash(prefix: string, value: string): string {
  return `${prefix}:${createHash("sha256").update(value).digest("hex").slice(0, 40)}`;
}

const refuse = (status: number, code: string, error: string, reason = code): Reservation => ({
  ok: false,
  reason,
  response: Response.json({ error, code }, { status, headers: { "Cache-Control": "no-store" } }),
});

/** Friendly, fixed messages for each refusal (shown to the person sending). */
export function refusal(reason: string, info: { trial?: boolean; cap?: number; kind?: GuardedKind } = {}): Reservation {
  const invites = info.kind === "invite";
  switch (reason) {
    case "unconfirmed":
      return refuse(403, "email_unconfirmed", "Confirm your email address first: open the link we sent you when you signed up, then try again.", reason);
    case "plan_inactive":
      return refuse(402, "plan_inactive", "Your Northpin subscription isn't active, so sending email is paused. The owner can restart it in Settings → Billing.", reason);
    case "daily_cap":
      if (info.trial)
        return refuse(
          429,
          "daily_email_limit",
          invites
            ? `During the free trial you can email ${info.cap ?? 10} invites a day. Share the invite with Copy link or Text it instead, or start your subscription in Settings → Billing.`
            : `During the free trial you can send ${info.cap ?? 20} emails to clients a day. Copy the client link and send it yourself, or start your subscription in Settings → Billing.`,
          reason,
        );
      return refuse(
        429,
        "daily_email_limit",
        invites
          ? "You've sent a lot of invites today. Share the invite with Copy link or Text it instead, or try again tomorrow."
          : "You've reached today's email limit for your company. Copy the client link and send it yourself, or try again tomorrow.",
        reason,
      );
    case "platform_cap":
      // Northpin's own sending allowance for the day (all companies, or all free trials together) is used up.
      return refuse(
        429,
        "platform_email_limit",
        info.trial
          ? invites
            ? "Invites by email are paused for free trials for the rest of the day. Share the invite with Copy link or Text it instead, or start your subscription in Settings → Billing."
            : "Email from free trials is paused for the rest of the day. Copy the client link and send it yourself, or start your subscription in Settings → Billing."
          : invites
            ? "Northpin can't send more email today. Share the invite with Copy link or Text it instead."
            : "Northpin can't send more email today. Copy the client link and send it yourself, or try again tomorrow.",
        reason,
      );
    case "recipient_cap":
      return refuse(429, "recipient_limit", "That address has had several emails from your company today. Try again tomorrow, or contact them directly.", reason);
    default:
      return refuse(403, "email_refused", "This email can't be sent from your account. Contact support if this keeps happening.", reason);
  }
}

/** Outside production without the database pieces: let the route's own in-memory limits do the work. */
function fallback(why: string): Reservation {
  if (isProduction()) {
    console.warn(`[email] send guard unavailable (${why}): refusing to send`);
    return refuse(503, "email_guard_unavailable", "Email can't be sent right now. Try again in a few minutes, or copy the link and send it yourself.", "unavailable");
  }
  // Unknown plan: treat as a trial (the stricter rules).
  return { ok: true, id: null, trial: true, durable: false };
}

/** Reserve one send for `userId` (the signed-in person) to `to`. On ok:false, return `response` as is. */
export async function reserveSend(userId: string, kind: GuardedKind, to: string): Promise<Reservation> {
  if (!serviceConfigured()) return fallback("no service key");
  let r: Response;
  try {
    r = await serviceFetch("/rest/v1/rpc/email_send_reserve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ p_user: userId, p_kind: kind, p_recipient_hash: recipientHash(to) }),
    });
  } catch {
    console.warn("[email] send guard: database unreachable");
    return refuse(503, "email_guard_unavailable", "Couldn't reach the cloud database. Try again in a minute.", "unavailable");
  }
  // 404: the function doesn't exist (supabase/migrations/20261124100500_email_guard.sql not run yet).
  if (r.status === 404) return fallback("migration not run");
  if (!r.ok) {
    console.warn(`[email] send guard failed: ${r.status}`);
    return refuse(503, "email_guard_unavailable", "Couldn't check your email allowance. Try again in a minute.", "unavailable");
  }
  const out = (await r.json().catch(() => null)) as { ok?: boolean; reason?: string; id?: number; trial?: boolean; cap?: number; platform_alert?: boolean } | null;
  if (!out || typeof out !== "object") return refuse(503, "email_guard_unavailable", "Couldn't check your email allowance. Try again in a minute.", "unavailable");
  if (!out.ok) {
    if (out.reason === "platform_cap") console.warn(`[email] platform email cap reached (${out.trial ? "trial share" : "all senders"}): refusing sends`);
    else if (out.reason !== "daily_cap" && out.reason !== "recipient_cap") console.warn(`[email] send refused: ${String(out.reason).replace(/[^a-z_]/g, "")}`);
    return refusal(out.reason ?? "", { trial: !!out.trial, cap: typeof out.cap === "number" ? out.cap : undefined, kind });
  }
  // Once a day, when Northpin as a whole passes 80 % of its daily email allowance (email_settings).
  if (out.platform_alert === true) console.warn("[email] platform email use passed the alert level of today's cap (email_settings)");
  return { ok: true, id: typeof out.id === "number" ? out.id : null, trial: out.trial !== false, durable: true };
}

/** After Resend answered: keep the row with Resend's id, or remove it when the send failed (it doesn't count). */
export async function finishSend(res: Reservation, sent: { ok: true; id: string | null } | { ok: false }): Promise<void> {
  if (!res.ok || !res.durable || res.id == null) return;
  try {
    const path = `/rest/v1/email_sends?id=eq.${encodeURIComponent(String(res.id))}`;
    const r = sent.ok
      ? await serviceFetch(path, { method: "PATCH", headers: { "Content-Type": "application/json", Prefer: "return=minimal" }, body: JSON.stringify({ resend_id: sent.id?.slice(0, 128) ?? null }) })
      : await serviceFetch(path, { method: "DELETE", headers: { Prefer: "return=minimal" } });
    if (!r.ok) console.warn(`[email] send log update failed: ${r.status}`);
  } catch {
    console.warn("[email] send log update failed: network");
  }
}

/** Log an email to the company itself (a client answered, or its welcome). Best effort: never fails the caller. */
export async function logNotification(ownerId: string, to: string, resendId: string | null, kind: "notify" | "welcome" = "notify"): Promise<void> {
  if (!serviceConfigured()) return;
  try {
    const r = await serviceFetch("/rest/v1/rpc/email_send_log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ p_owner: ownerId, p_kind: kind, p_recipient_hash: recipientHash(to), p_resend_id: resendId }),
    });
    if (!r.ok && r.status !== 404) console.warn(`[email] notification log failed: ${r.status}`);
  } catch {
    console.warn("[email] notification log failed: network");
  }
}

/**
 * Durable limit shared by every server instance (answer_rate_hit, service role): true when `key` is over `max` hits
 * in `windowMs`. Null when the database can't answer (not set up, migration not run, network): use the in-memory
 * limiter instead.
 */
export async function durableLimited(key: string, windowMs: number, max: number): Promise<boolean | null> {
  if (!serviceConfigured()) return null;
  try {
    const r = await serviceFetch("/rest/v1/rpc/answer_rate_hit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ p_key: key, p_window_seconds: Math.max(1, Math.round(windowMs / 1000)), p_max: max }),
    });
    if (!r.ok) {
      if (r.status !== 404) console.warn(`[email] answer limit check failed: ${r.status}`);
      return null;
    }
    const allowed = await r.json().catch(() => null);
    return typeof allowed === "boolean" ? !allowed : null;
  } catch {
    return null;
  }
}

/**
 * Who hears that a client answered a change order or RFI on a job: the person who made it when `createdBy` is the
 * email of someone on the job owner's company (office only when `officeOnly`), otherwise the job's owner. Never an
 * address that isn't on the company, so the row's text can't redirect the email.
 */
export async function answerRecipient(
  projectId: string,
  createdBy: string | null | undefined,
  officeOnly: boolean,
): Promise<{ to: string; ownerId: string; jobName: string } | null> {
  const p = await serviceFetch(`/rest/v1/projects?id=eq.${encodeURIComponent(projectId)}&select=owner_id,address,client_name&limit=1`);
  if (!p.ok) throw new Error(`project lookup failed (${p.status})`);
  const project = ((await p.json()) as { owner_id?: string; address?: string | null; client_name?: string | null }[])[0];
  const ownerId = project?.owner_id;
  if (!ownerId) return null;
  const jobName = project.address?.trim() || project.client_name?.trim() || "Your job";
  const by = (createdBy ?? "").trim().toLowerCase();
  if (by && validEmail(by)) {
    const t = await serviceFetch(`/rest/v1/team_members?user_id=eq.${encodeURIComponent(ownerId)}&select=team_id&limit=1`);
    const teamId = t.ok ? ((await t.json()) as { team_id?: string }[])[0]?.team_id : undefined;
    if (teamId) {
      const roles = officeOnly ? "&role=in.(owner,admin)" : "";
      const m = await serviceFetch(`/rest/v1/team_members?team_id=eq.${encodeURIComponent(teamId)}${roles}&select=email`);
      const hit = m.ok ? ((await m.json()) as { email?: string | null }[]).find((x) => (x.email ?? "").trim().toLowerCase() === by) : undefined;
      if (hit) return { to: by, ownerId, jobName };
    }
  }
  const owner = await getAuthUser(ownerId);
  return owner?.email && validEmail(owner.email) ? { to: owner.email, ownerId, jobName } : null;
}
