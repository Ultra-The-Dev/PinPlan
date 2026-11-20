// The cloud copy of a document for the accounting push (server-only). Read with the caller's own token, so row-level
// security decides what they may send (office of that job only), and what goes out is what the database holds: the
// number it gave, the balance its triggers worked out and every payment, not whatever a browser sends.
import { documentTotals } from "@/lib/documents";
import { toLocal } from "@/lib/syncMap";
import type { DocPayment, SalesDoc } from "@/lib/types";
import { userFetch } from "../supabaseAdmin";
import { IntegrationError } from "./types";

const enc = encodeURIComponent;

async function rows(token: string, path: string, what: string): Promise<Record<string, unknown>[]> {
  const r = await userFetch(token, path);
  if (!r.ok) throw new IntegrationError(`Couldn't read the ${what} from the cloud (${r.status}).`, 502, "server_error");
  return (await r.json()) as Record<string, unknown>[];
}

/** The caller's billing owner (their team's owner, or themselves), as the database works it out. */
async function callerBillingOwner(token: string): Promise<string | null> {
  const r = await userFetch(token, `/rest/v1/rpc/my_billing_owner`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
  if (!r.ok) throw new IntegrationError(`Couldn't check whose document this is (${r.status}).`, 502, "server_error");
  const v = (await r.json()) as unknown;
  return typeof v === "string" ? v : null;
}

/** The document and its payments as the database has them, or null when the caller can't see it (or it isn't there). */
export async function loadServerDocument(token: string, id: string): Promise<{ doc: SalesDoc; payments: DocPayment[] } | null> {
  const found = await rows(token, `/rest/v1/sales_documents?id=eq.${enc(id)}&select=*`, "document");
  if (!found[0]) return null;
  // A job shared with someone from another company is visible to them, but its documents are that company's: they
  // never go into the caller's books (owner_id is the job's billing owner; my_billing_owner() is the caller's).
  const docOwner = found[0].owner_id;
  if (typeof docOwner === "string" && docOwner && docOwner !== (await callerBillingOwner(token))) return null;
  const doc = toLocal("salesDocs", found[0]) as unknown as SalesDoc;
  // Money fields follow the lines (as everywhere else); the balance and status are the database's.
  const t = documentTotals(doc);
  const payments =
    doc.kind === "invoice"
      ? (await rows(token, `/rest/v1/sales_document_payments?document_id=eq.${enc(id)}&select=*`, "payments")).map((r) => toLocal("salesPayments", r) as unknown as DocPayment)
      : [];
  return { doc: { ...doc, subtotal: t.subtotal, discountTotal: t.discountTotal, taxTotal: t.taxTotal, total: t.total }, payments };
}
