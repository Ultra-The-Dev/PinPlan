import { resolveBillduCaller } from "@/lib/server/billduCreds";
import { requirePaidOrTrial } from "@/lib/server/planGate";
import { clientIpKey, durableRateLimit, tooManyRequests, waitText } from "@/lib/server/rateLimit";
import { type BillduClient, type BillduClientRecord } from "@/lib/billdu/client";
import { clientMatches, clientPayload, documentPayload, documentUpdate, itemsTotal, linesToItems, type SendLine } from "@/lib/billdu/mapping";
import { getClientOrError, handleError, jsonError } from "@/lib/billdu/route-helpers";
import { claimDone, definitelyRefused, releaseClaim, takeClaim, type ClaimKey } from "@/lib/server/billduClaims";
import type { Project } from "@/lib/types";

interface SendBody {
  project: Pick<Project, "id" | "clientName" | "clientEmail" | "clientPhone" | "address" | "billduClientId">;
  docType: "estimate" | "order" | "invoice";
  lines: SendLine[];
  taxPct?: number;
  currency?: string;
  depositPct?: number | null;
  existingDocId?: number | null;
  /** Public link to the marked-up plans PDF (put in the document note). */
  plansUrl?: string | null;
}

/** Most estimate lines one document may carry. */
const MAX_LINES = 500;
/** Per user (or IP, for access-code callers). Sending is a person clicking "Send to Billdu", not a loop. */
const SEND_LIMIT = { limit: 30, windowMs: 10 * 60_000 };

async function findOrCreateClient(client: BillduClient, p: SendBody["project"]): Promise<number> {
  if (p.billduClientId) {
    try {
      const c = await client.getClient(p.billduClientId);
      if (c?.id) return Number(c.id);
    } catch {
      /* deleted in Billdu: fall through to search/create */
    }
  }
  const limit = 50;
  for (let page = 1; page <= 20; page++) {
    let list: BillduClientRecord[];
    try {
      list = await client.listClients(page, limit);
    } catch {
      break; // listing not available — create instead
    }
    const hit = list.find((c) => clientMatches(c, p));
    if (hit) return Number(hit.id);
    if (list.length < limit) break;
  }
  const created = await client.createClient(clientPayload(p));
  return Number(created.id);
}

export async function POST(req: Request) {
  const auth = await resolveBillduCaller(req);
  if (!auth.ok) return auth.response;
  const limited = await durableRateLimit(`billdu-send:${auth.caller.userId ? `u:${auth.caller.userId}` : `ip:${clientIpKey(req)}`}`, SEND_LIMIT);
  if (!limited.ok) return tooManyRequests(limited, `Too many sends to Billdu. Try again in ${waitText(limited.retryAfter)}.`);
  const gate = await requirePaidOrTrial(req, auth.caller.userId);
  if (gate) return gate;
  let body: SendBody;
  try {
    body = await req.json();
  } catch {
    return jsonError("Invalid JSON body", 400);
  }
  if (!body?.project?.clientName) return jsonError("The project needs a client name before sending to Billdu.", 400);
  if (!["estimate", "order", "invoice"].includes(body.docType)) return jsonError("docType must be estimate, order or invoice", 400);
  if (!Array.isArray(body.lines)) return jsonError("lines must be an array", 400);
  if (body.lines.length > MAX_LINES) return jsonError(`A document can have at most ${MAX_LINES} lines.`, 413, { code: "too_many_items" });
  const deposit = body.depositPct ?? null;
  if (deposit != null && (deposit <= 0 || deposit > 100)) return jsonError("Deposit % must be between 0 and 100", 400);
  // These go into the path of the request to Billdu (/documents/<id>, /clients/<id>): whole numbers only.
  const billduId = (v: unknown) => v == null || (typeof v === "number" && Number.isSafeInteger(v) && v >= 0);
  if (!billduId(body.existingDocId) || !billduId(body.project.billduClientId)) return jsonError("existingDocId and billduClientId must be whole numbers", 400);

  const items = linesToItems(body.lines, body.taxPct ?? 0, { depositPct: deposit, address: body.project.address });
  if (!items.length) return jsonError("There are no included estimate lines to send.", 400);

  const client = await getClientOrError(auth.caller);
  if (client instanceof Response) return client;

  // One send of this job's document at a time; a resend updates the document an earlier send made (billduClaims.ts).
  const partial = deposit != null && deposit < 100;
  const projectId = typeof body.project.id === "string" && body.project.id.length >= 1 && body.project.id.length <= 200 ? body.project.id : null;
  const key: ClaimKey | null =
    projectId && auth.caller.mode !== "single_company" ? { owner: auth.caller.owner.id, projectId, docType: partial ? `${body.docType}_deposit` : body.docType } : null;
  const taken = await takeClaim(key);
  if (!taken.ok) return taken.response;
  const claim = taken.claim;
  const existingDocId = body.existingDocId ?? (partial ? null : (claim?.billduDocId ?? null));

  let documentCalled = false;
  try {
    const clientId = await findOrCreateClient(client, body.project);
    const plansUrl = typeof body.plansUrl === "string" && body.plansUrl.length < 1000 ? body.plansUrl : null;
    const payload = documentPayload({ type: body.docType, clientId, items, currency: body.currency || "USD", address: body.project.address, plansUrl });
    // Update the document already sent for this job (same number, new items). If it was deleted in Billdu, make a new one.
    let updated = false;
    let doc: Awaited<ReturnType<typeof client.createDocument>> | null = null;
    documentCalled = true;
    if (existingDocId) {
      try {
        doc = await client.updateDocument(existingDocId, documentUpdate(payload));
        updated = true;
      } catch (e) {
        const status = (e as { status?: number }).status;
        if (status !== 404 && status !== 410) throw e;
      }
    }
    if (!updated) doc = await client.createDocument(payload);
    const docId = updated ? Number(existingDocId) : Number(doc?.id);
    if (Number.isSafeInteger(docId) && docId > 0) await claimDone(claim, docId);
    const amount = itemsTotal(items);
    return Response.json({
      clientId,
      doc: {
        id: docId,
        type: body.docType,
        serial: (doc?.serial_number as string | undefined) ?? null,
        amount,
        percent: deposit && deposit < 100 ? deposit : null,
        updated,
      },
    });
  } catch (e) {
    // Billdu refused, or the send failed before the document call: a retry may start at once. Otherwise (a timeout,
    // Billdu down) the document may exist: the claim stays until it is 2 minutes old.
    if (!documentCalled || definitelyRefused(e)) await releaseClaim(claim);
    return handleError(e, auth.caller);
  }
}
