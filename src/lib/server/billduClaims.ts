// One "Send to Billdu" at a time per job and document type, and the Billdu document it made (server-only).
// Table public.billdu_send_claims (supabase/migrations/20261126001000_audit_hardening.sql), service role only.
//
// A send takes the claim before it calls Billdu. While another send of the same document is under way (a claim younger
// than 2 minutes without a document id) the route answers 409. Once Billdu returns the document its id is stored, so a
// double click, a retry after a lost answer or a second device updates that document instead of making another. When
// Billdu definitely refused (or the send failed before the document call) the claim is let go so a retry can start at
// once; after a timeout it stays, since the document may exist, until it is 2 minutes old.
// Deposit documents are new each time: their claim only keeps two sends apart and is let go when the send is done.
// No claims on a server without the service key, for callers without a company (access code), or for a request without
// a job id; a database without the table (migration not run) sends as before.
import { BillduError } from "@/lib/billdu/client";
import { serviceConfigured, serviceFetch } from "./supabaseAdmin";

export type ClaimDocType = "estimate" | "order" | "invoice" | "estimate_deposit" | "order_deposit" | "invoice_deposit";

export interface ClaimKey {
  owner: string;
  projectId: string;
  docType: ClaimDocType;
}

export interface Claim {
  key: ClaimKey;
  /** The Billdu document an earlier send of this job and type made (never for deposits). */
  billduDocId: number | null;
  startedAt: string | null;
}

export const ALREADY_SENDING = "This is already being sent to Billdu. Wait a minute, then check Billdu before sending again.";
export const CLAIM_FAILED = "Couldn't start sending to Billdu. Try again in a minute.";

const json = (body: Record<string, unknown>, status: number) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

const filter = (k: ClaimKey) =>
  `owner_id=eq.${encodeURIComponent(k.owner)}&project_id=eq.${encodeURIComponent(k.projectId)}&doc_type=eq.${encodeURIComponent(k.docType)}`;

export const isDeposit = (k: ClaimKey) => k.docType.endsWith("_deposit");

/** The claim (null: not tracked here), or the response to send (409 while another send runs, 503 when it can't tell). */
export async function takeClaim(key: ClaimKey | null): Promise<{ ok: true; claim: Claim | null } | { ok: false; response: Response }> {
  if (!key || !serviceConfigured()) return { ok: true, claim: null };
  try {
    const r = await serviceFetch("/rest/v1/rpc/billdu_send_claim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ p_owner: key.owner, p_project: key.projectId, p_doc_type: key.docType }),
    });
    // The migration hasn't run on this database: send as before.
    if (r.status === 404) return { ok: true, claim: null };
    if (!r.ok) throw new Error(`billdu_send_claim ${r.status}`);
    const j = (await r.json()) as { ok?: boolean; billdu_doc_id?: number | string | null; started_at?: string | null };
    if (!j?.ok) return { ok: false, response: json({ error: ALREADY_SENDING, code: "already_sending" }, 409) };
    const id = j.billdu_doc_id == null ? null : Number(j.billdu_doc_id);
    return {
      ok: true,
      claim: { key, billduDocId: !isDeposit(key) && id != null && Number.isSafeInteger(id) && id > 0 ? id : null, startedAt: j.started_at ?? null },
    };
  } catch (e) {
    console.error("[billdu] send claim", (e as Error)?.message ?? e);
    return { ok: false, response: json({ error: CLAIM_FAILED, code: "claim_failed" }, 503) };
  }
}

/** The send made (or updated) this document: remember it. A deposit's claim is let go instead. Never throws. */
export async function claimDone(claim: Claim | null, docId: number): Promise<void> {
  if (!claim) return;
  if (isDeposit(claim.key)) return releaseClaim(claim);
  try {
    const r = await serviceFetch(`/rest/v1/billdu_send_claims?${filter(claim.key)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({ billdu_doc_id: docId }),
    });
    if (!r.ok) console.error(`[billdu] send claim: saving the document id failed (${r.status})`);
  } catch (e) {
    console.error("[billdu] send claim: saving the document id failed", (e as Error)?.message ?? e);
  }
}

/** Let go of this send's own claim (only one without a document id, and only the one this send took). Never throws. */
export async function releaseClaim(claim: Claim | null): Promise<void> {
  if (!claim) return;
  try {
    const own = claim.startedAt ? `&started_at=eq.${encodeURIComponent(claim.startedAt)}` : "";
    const r = await serviceFetch(`/rest/v1/billdu_send_claims?${filter(claim.key)}&billdu_doc_id=is.null${own}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
    if (!r.ok) console.error(`[billdu] send claim: release failed (${r.status})`);
  } catch (e) {
    console.error("[billdu] send claim: release failed", (e as Error)?.message ?? e);
  }
}

/**
 * Did Billdu definitely not make the document? A 4xx answer (other than a timeout) is a refusal. A 5xx, a timeout or a
 * lost connection may have made it, so the claim is kept.
 */
export function definitelyRefused(e: unknown): boolean {
  return e instanceof BillduError && e.status >= 400 && e.status < 500 && e.status !== 408;
}
