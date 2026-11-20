"use client";
// Saving quotes / invoices / credit notes and payments on this device (they sync like the rest of the job), issuing
// them (the cloud gives the number), publishing client links, and the live lists the screens read.
import { useCallback, useEffect, useState } from "react";
import { db, getAllDocs, getProjectDocs, newId, nowIso, put, remove } from "./db";
import { buildDocSnapshot, documentUrl, formatDocNumber, snapshotHash, today, withTotals, type DocSnapshot } from "./documents";
import { msg, t } from "./i18n";
import { newToken } from "./proposal";
import type { PayOnlineState } from "./onlinePay";
import { getSupabase, supabaseConfigured } from "./supabase";
import { SYNCED_EVENT, useSyncStatus } from "./sync";
import { useTeam } from "./team";
import { can } from "./teamLogic";
import type { BusinessSettings, DocKind, DocPayment, DocumentSettings, SalesDoc } from "./types";

export const DOCS_EVENT = "pinplan:docs";
const changed = () => {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(DOCS_EVENT));
};

/** Credit notes issued against an invoice. */
async function creditsFor(invoiceId: string): Promise<SalesDoc[]> {
  return db().salesDocs.filter((d) => d.kind === "credit_note" && d.convertedFrom === invoiceId && !d.deleted).toArray();
}

async function paymentsFor(docId: string): Promise<DocPayment[]> {
  return (await db().salesPayments.where("documentId").equals(docId).toArray()).filter((p) => !p.deleted);
}

/** Save a document with its totals, paid amount and status worked out again. Returns what was saved. */
export async function saveDoc(doc: SalesDoc): Promise<SalesDoc> {
  const next = doc.kind === "invoice" ? withTotals(doc, await paymentsFor(doc.id), await creditsFor(doc.id)) : withTotals(doc);
  const saved = await put("salesDocs", next);
  // A credit note changes what its invoice still owes.
  if (doc.kind === "credit_note" && doc.convertedFrom) await refreshInvoice(doc.convertedFrom);
  changed();
  return saved;
}

/** Recompute an invoice after its payments or credit notes changed (only writes when something moved). */
export async function refreshInvoice(id: string): Promise<SalesDoc | null> {
  const inv = await db().salesDocs.get(id);
  if (!inv || inv.deleted || inv.kind !== "invoice") return null;
  const next = withTotals(inv, await paymentsFor(id), await creditsFor(id));
  if (next.amountPaid === inv.amountPaid && next.balanceDue === inv.balanceDue && next.status === inv.status && next.total === inv.total && next.paidAt === inv.paidAt) return inv;
  const saved = await put("salesDocs", next);
  changed();
  return saved;
}

/** Work out a job's invoices again (only the ones whose sums moved are written). */
export async function refreshJobInvoices(projectIds: Iterable<string>): Promise<void> {
  for (const pid of new Set(projectIds)) {
    const invoices = (await db().salesDocs.where("projectId").equals(pid).toArray()).filter((d) => d.kind === "invoice" && !d.deleted);
    for (const inv of invoices) await refreshInvoice(inv.id);
  }
}

let watchingPulls = false;

/**
 * After a pull that brought payments or documents (another device recorded a payment or issued a credit note), the
 * office works those jobs' invoices out again here, so this device shows the same balance as the database (which
 * recomputes them itself: 20261125000400_money_integrity.sql). Installed once; technicians never hold money rows.
 */
export function watchPulledMoney() {
  if (watchingPulls || typeof window === "undefined") return;
  watchingPulls = true;
  window.addEventListener(SYNCED_EVENT, (e) => {
    const d = (e as CustomEvent<{ tables?: string[]; projectIds?: string[] }>).detail;
    if (!d?.tables?.some((tb) => tb === "salesPayments" || tb === "salesDocs") || !d.projectIds?.length) return;
    if (!can(useTeam.getState().role, "prices")) return;
    void refreshJobInvoices(d.projectIds).catch(() => undefined);
  });
}
watchPulledMoney();

export async function recordPayment(doc: SalesDoc, p: Omit<DocPayment, "id" | "projectId" | "documentId" | "createdAt" | "updatedAt">): Promise<DocPayment> {
  const now = nowIso();
  const row = await put("salesPayments", { ...p, id: newId(), projectId: doc.projectId, documentId: doc.id, createdAt: now, updatedAt: now } as DocPayment);
  await refreshInvoice(doc.id);
  return row;
}

export async function voidPayment(p: DocPayment, voided = true) {
  await put("salesPayments", { ...p, voided });
  await refreshInvoice(p.documentId);
}

/** Drafts can be deleted; issued documents are voided instead (their number stays used). */
export async function deleteDraft(doc: SalesDoc) {
  if (doc.status !== "draft") throw new Error(t("Only drafts can be deleted. Void it instead."));
  await remove("salesDocs", doc.id);
  if (doc.kind === "credit_note" && doc.convertedFrom) await refreshInvoice(doc.convertedFrom);
  changed();
}

export async function voidDoc(doc: SalesDoc) {
  const saved = await saveDoc({ ...doc, status: "void", voidedAt: nowIso() });
  if (doc.shareToken) await revokeLink(doc.shareToken).catch(() => undefined);
  return saved;
}

// ---------------------------------------------------------------- issuing and numbering

const localKey = (kind: DocKind, period: number) => `pinplan.docnum.${kind}.${period}`;

/** Without cloud sync (a single device), numbers come from a counter on this device. */
function takeLocalNumber(kind: DocKind, s: DocumentSettings, day: string): string {
  const k = s.kinds[kind];
  const period = k.yearlyReset ? Number(day.slice(0, 4)) : 0;
  let n = 1;
  try {
    n = Math.max(1, Number(localStorage.getItem(localKey(kind, period))) || 1);
    localStorage.setItem(localKey(kind, period), String(n + 1));
  } catch {
    /* storage unavailable */
  }
  return formatDocNumber(k.format, n, day);
}

/** Next number on this device (local-only mode), for Settings. */
export function localNextNumber(kind: DocKind, s: DocumentSettings, day = today()): number {
  try {
    return Math.max(1, Number(localStorage.getItem(localKey(kind, s.kinds[kind].yearlyReset ? Number(day.slice(0, 4)) : 0))) || 1);
  } catch {
    return 1;
  }
}

export function setLocalNextNumber(kind: DocKind, s: DocumentSettings, next: number, day = today()) {
  try {
    localStorage.setItem(localKey(kind, s.kinds[kind].yearlyReset ? Number(day.slice(0, 4)) : 0), String(Math.max(1, Math.round(next))));
  } catch {
    /* storage unavailable */
  }
}

/**
 * Finalize a draft: it gets a number and its prices lock (stored status "sent", shown as "Ready to send" until it is
 * shared, emailed or marked sent: see wasSent). Issue date today unless one was set. With cloud sync the number comes
 * from the server on the next sync (straight away when online); offline it shows "number pending" until then. Without
 * cloud sync the device numbers it.
 */
export async function issueDoc(doc: SalesDoc, s: DocumentSettings): Promise<SalesDoc> {
  if (doc.status !== "draft") return doc;
  const day = doc.issueDate || today();
  const next: SalesDoc = { ...doc, status: "sent", issueDate: day };
  if (!supabaseConfigured && !next.number) next.number = takeLocalNumber(doc.kind, s, day);
  const saved = await saveDoc(next);
  if (supabaseConfigured) await syncAndReload();
  return (await db().salesDocs.get(saved.id)) ?? saved;
}

/**
 * Finalize first when it's a draft, then record that the client has it (handed over, emailed or a link shared). With
 * cloud sync the cloud must have it issued and numbered first (else it throws): what the client holds has a number.
 */
export async function markSent(doc: SalesDoc, s: DocumentSettings): Promise<SalesDoc> {
  let cur = doc.status === "draft" ? await issueDoc(doc, s) : doc;
  if (supabaseConfigured && getSupabase()) {
    if (doc.status !== "draft") await syncAndReload();
    const server = await confirmIssuedInCloud(cur.id);
    cur = (await db().salesDocs.get(cur.id)) ?? cur;
    if (!cur.number) cur = { ...cur, number: server.number };
  }
  if (cur.sentAt) return cur;
  return saveDoc({ ...cur, sentAt: nowIso() });
}

/** Push now and pull what the server changed (numbers, client answers). Resolves even when offline. */
export async function syncAndReload(): Promise<void> {
  try {
    await useSyncStatus.getState().syncNow();
  } catch {
    /* offline: it goes on the next sync */
  }
  changed();
}

export const NOT_IN_CLOUD = msg("This document hasn't reached the cloud yet. Check your connection and try again.");

/**
 * Read the document's status and number back from the cloud (after a sync): it must be issued (not a draft) and
 * numbered there, or the client would get something the database doesn't know as sent. Throws with the sync's own
 * error when there is one.
 */
export async function confirmIssuedInCloud(id: string): Promise<{ status: SalesDoc["status"]; number: string }> {
  const sb = cloud();
  const { data, error } = await sb.from("sales_documents").select("id, status, number").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  const row = data as { status?: SalesDoc["status"]; number?: string | null } | null;
  if (!row || !row.status || row.status === "draft" || !row.number) {
    const syncError = useSyncStatus.getState().error;
    throw new Error(syncError ? `${t(NOT_IN_CLOUD)} (${syncError})` : t(NOT_IN_CLOUD));
  }
  return { status: row.status, number: row.number };
}

// ---------------------------------------------------------------- client links

export interface DocLinkRow {
  id: string;
  document_id: string;
  status: "active" | "revoked";
  viewed_at: string | null;
  view_count: number;
  responded_at: string | null;
  created_at: string;
  snapshot: DocSnapshot;
}

function cloud() {
  const sb = getSupabase();
  if (!sb) throw new Error(t("Client links need cloud sync — see Settings → Account."));
  return sb;
}

export async function listLinks(documentId: string): Promise<DocLinkRow[]> {
  const { data, error } = await cloud().from("document_links").select("id, document_id, status, viewed_at, view_count, responded_at, created_at, snapshot").eq("document_id", documentId).order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as DocLinkRow[];
}

export async function revokeLink(token: string) {
  const { error } = await cloud().from("document_links").update({ status: "revoked", updated_at: nowIso() }).eq("id", token);
  if (error) throw new Error(error.message);
}

/**
 * Publish (or republish) the client link: finalize the document if it's a draft, make sure the cloud has it, freeze what the
 * client sees and save it under a new token. The previous link is withdrawn only after the new one is saved.
 */
export async function publishLink(doc: SalesDoc, input: { settings: DocumentSettings; business: BusinessSettings; origin: string }): Promise<{ doc: SalesDoc; url: string }> {
  const sb = cloud();
  let cur = doc.status === "draft" ? await issueDoc(doc, input.settings) : doc;
  // The link reads the document from the cloud: push it first.
  await syncAndReload();
  cur = (await db().salesDocs.get(cur.id)) ?? cur;
  // Issued and numbered in the cloud, or no link: the client page reads the cloud's copy.
  const server = await confirmIssuedInCloud(cur.id);
  if (!cur.number) cur = { ...cur, number: server.number };
  const snapshot = buildDocSnapshot(cur, { settings: input.settings, business: input.business, origin: input.origin, now: nowIso() });
  const token = newToken();
  const { error } = await sb.from("document_links").insert({ id: token, document_id: cur.id, project_id: cur.projectId, snapshot });
  if (error) throw new Error(error.message);
  const old = cur.shareToken;
  // The link is being copied or emailed to the client: from here on it counts as sent.
  const saved = await put("salesDocs", { ...cur, shareToken: token, shareHash: snapshotHash(snapshot), sentAt: cur.sentAt ?? nowIso() });
  if (old && old !== token) await revokeLink(old).catch(() => undefined);
  changed();
  void syncAndReload();
  return { doc: saved, url: documentUrl(input.origin, token) };
}

/** True when the document has changed since its link was published (the client sees an older version). */
export function linkIsStale(doc: SalesDoc, settings: DocumentSettings, business: BusinessSettings, origin: string): boolean {
  if (!doc.shareToken || !doc.shareHash) return false;
  return snapshotHash(buildDocSnapshot(doc, { settings, business, origin, now: "" })) !== doc.shareHash;
}

// ---------------------------------------------------------------- public side (client page)

export interface PublicDoc {
  snapshot: DocSnapshot;
  kind: DocKind;
  status: SalesDoc["status"];
  number: string | null;
  total: number;
  amountPaid: number;
  balanceDue: number;
  dueDate: string | null;
  validUntil: string | null;
  respondedAt: string | null;
  signerName: string | null;
  clientNote: string | null;
  paidAt: string | null;
  expired: boolean;
  overdue: boolean;
  /** Invoices: paying online by card (docs/payments.md). Missing before 20261125002100_online_payments. */
  payOnline?: PayOnlineState | null;
}

export async function fetchPublicDoc(token: string): Promise<PublicDoc | null> {
  const { data, error } = await cloud().rpc("get_document", { p_token: token });
  if (error) throw new Error(error.message);
  return (data as PublicDoc | null) ?? null;
}

/**
 * Client page: a Stripe Checkout page for the invoice's balance (the server checks everything again). Returns its URL,
 * or throws with the server's message (English: the client page is never translated).
 */
export async function startOnlinePayment(token: string): Promise<string> {
  let r: Response;
  try {
    r = await fetch("/api/payments/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) });
  } catch {
    throw new Error("You seem to be offline. Check your connection and try again.");
  }
  const j = (await r.json().catch(() => ({}))) as { url?: string; error?: string };
  if (!r.ok || !j.url) throw new Error(j.error || "Online payment isn't available right now. Please try again in a few minutes.");
  return j.url;
}

/** Client page, back from Stripe: ask the server to apply the payment now (the webhook does it too). Never throws. */
export async function confirmOnlinePayment(token: string, session: string): Promise<void> {
  try {
    await fetch("/api/payments/confirm", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, session }) });
  } catch {
    /* the webhook records it anyway */
  }
}

export async function respondToDoc(token: string, r: { accept: boolean; name: string; signature: string | null; note: string }): Promise<PublicDoc> {
  const { data, error } = await cloud().rpc("respond_document", { p_token: token, p_accept: r.accept, p_name: r.name, p_signature: r.signature, p_note: r.note });
  if (error) throw new Error(error.message);
  return data as PublicDoc;
}

// ---------------------------------------------------------------- live lists for the screens

function useDocsQuery(projectId: string | undefined, all: boolean) {
  const [state, setState] = useState<{ docs: SalesDoc[]; payments: DocPayment[] } | null>(null);
  const reload = useCallback(
    () =>
      (all ? getAllDocs() : projectId ? getProjectDocs(projectId) : Promise.resolve({ docs: [], payments: [] }))
        .then(setState)
        .catch(() => setState({ docs: [], payments: [] })),
    [projectId, all],
  );
  useEffect(() => {
    // Read after mount (IndexedDB), then again whenever this device or a sync changes documents.
    const first = window.setTimeout(() => void reload(), 0);
    const on = () => void reload();
    window.addEventListener(DOCS_EVENT, on);
    window.addEventListener(SYNCED_EVENT, on);
    return () => {
      window.clearTimeout(first);
      window.removeEventListener(DOCS_EVENT, on);
      window.removeEventListener(SYNCED_EVENT, on);
    };
  }, [reload]);
  return { docs: state?.docs ?? null, payments: state?.payments ?? [], reload };
}

/** A job's documents and payments, kept current (edits here, and whatever sync brings in). */
export function useJobDocs(projectId: string | undefined) {
  return useDocsQuery(projectId, false);
}

/** Every document on this device. */
export function useAllDocs() {
  return useDocsQuery(undefined, true);
}
