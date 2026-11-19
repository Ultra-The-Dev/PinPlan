"use client";
// Browser side of the email routes: is email switched on, emailing a team invite, and the client page's
// "tell the installer" ping after a proposal is answered.
import { apiFetch } from "./api";

let status: Promise<boolean> | null = null;

/** Whether this server sends email (asked once per page load; false when offline or not set up). */
export function emailEnabled(): Promise<boolean> {
  status ??= fetch("/api/email/status", { cache: "no-store" })
    .then((r): Promise<{ configured?: boolean }> | { configured?: boolean } => (r.ok ? r.json() : {}))
    .then((d) => d.configured === true)
    .catch(() => {
      status = null;
      return false;
    });
  return status;
}

/** Emails an invite code. Throws with a message to show when it fails. */
export async function emailInvite(code: string, email: string, name?: string): Promise<void> {
  const r = await apiFetch("/api/team/invite-email", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code, email, name }) });
  if (r.ok) return;
  const d = (await r.json().catch(() => ({}))) as { error?: string };
  throw new Error(d.error || `Couldn't send the email (${r.status}).`);
}

/** Fire and forget: lets the server email the installer that the client answered. Never throws. */
export function notifyProposalResponse(token: string): void {
  try {
    void fetch("/api/notify/proposal-response", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }), keepalive: true }).catch(() => undefined);
  } catch {
    /* offline or old browser: the installer still sees the answer in the app */
  }
}
