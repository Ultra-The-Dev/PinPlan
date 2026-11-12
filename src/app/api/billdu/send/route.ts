import { requireUser } from "@/lib/server/auth";
import { type BillduClient, type BillduClientRecord } from "@/lib/billdu/client";
import { clientMatches, clientPayload, documentPayload, itemsTotal, linesToItems, type SendLine } from "@/lib/billdu/mapping";
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
  const auth = await requireUser(req);
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

  const client = await getClientOrError();
  if (client instanceof Response) return client;
  try {
    const clientId = await findOrCreateClient(client, body.project);
    const payload = documentPayload({ type: body.docType, clientId, items, currency: body.currency || "USD", address: body.project.address });
    const doc = body.existingDocId ? await client.updateDocument(body.existingDocId, payload) : await client.createDocument(payload);
    const amount = itemsTotal(items);
    return Response.json({
      clientId,
      doc: {
        id: Number(doc?.id ?? body.existingDocId),
        type: body.docType,
        serial: (doc?.serial_number as string | undefined) ?? null,
        amount,
        percent: deposit && deposit < 100 ? deposit : null,
        updated: !!body.existingDocId,
      },
    });
  } catch (e) {
    return handleError(e);
  }
}
