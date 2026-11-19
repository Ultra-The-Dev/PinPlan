import { resolveBillduCaller } from "@/lib/server/billduCreds";
import { type BillduClient, type BillduClientRecord } from "@/lib/billdu/client";
import { clientMatches, clientPayload, documentPayload, documentUpdate, itemsTotal, linesToItems, type SendLine } from "@/lib/billdu/mapping";
import { getClientOrError, handleError, jsonError } from "@/lib/billdu/route-helpers";
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
  let body: SendBody;
  try {
    body = await req.json();
  } catch {
    return jsonError("Invalid JSON body", 400);
  }
  if (!body?.project?.clientName) return jsonError("The project needs a client name before sending to Billdu.", 400);
  if (!["estimate", "order", "invoice"].includes(body.docType)) return jsonError("docType must be estimate, order or invoice", 400);
  if (!Array.isArray(body.lines)) return jsonError("lines must be an array", 400);
  const deposit = body.depositPct ?? null;
  if (deposit != null && (deposit <= 0 || deposit > 100)) return jsonError("Deposit % must be between 0 and 100", 400);

  const items = linesToItems(body.lines, body.taxPct ?? 0, { depositPct: deposit, address: body.project.address });
  if (!items.length) return jsonError("There are no included estimate lines to send.", 400);

  const client = await getClientOrError(auth.caller);
  if (client instanceof Response) return client;
  try {
    const clientId = await findOrCreateClient(client, body.project);
    const plansUrl = typeof body.plansUrl === "string" && body.plansUrl.length < 1000 ? body.plansUrl : null;
    const payload = documentPayload({ type: body.docType, clientId, items, currency: body.currency || "USD", address: body.project.address, plansUrl });
    // Update the document already sent for this job (same number, new items). If it was deleted in Billdu, make a new one.
    let updated = false;
    let doc: Awaited<ReturnType<typeof client.createDocument>> | null = null;
    if (body.existingDocId) {
      try {
        doc = await client.updateDocument(body.existingDocId, documentUpdate(payload));
        updated = true;
      } catch (e) {
        const status = (e as { status?: number }).status;
        if (status !== 404 && status !== 410) throw e;
      }
    }
    if (!updated) doc = await client.createDocument(payload);
    const amount = itemsTotal(items);
    return Response.json({
      clientId,
      doc: {
        id: updated ? Number(body.existingDocId) : Number(doc?.id),
        type: body.docType,
        serial: (doc?.serial_number as string | undefined) ?? null,
        amount,
        percent: deposit && deposit < 100 ? deposit : null,
        updated,
      },
    });
  } catch (e) {
    return handleError(e);
  }
}
