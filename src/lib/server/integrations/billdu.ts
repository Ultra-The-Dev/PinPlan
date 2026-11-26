// Billdu through the integrations framework: a thin adapter over the existing Billdu helpers (src/lib/billdu/*,
// src/lib/server/billduCreds.ts), which stay as they are. The API key and secret are still entered in Settings → Billdu.
import { BillduClient, BillduError, type BillduClientRecord } from "@/lib/billdu/client";
import { billduUnit, clientMatches, clientPayload, documentPayload, documentUpdate, itemsTotal, type BillduItem } from "@/lib/billdu/mapping";
import { effectiveCreds } from "../billduCreds";
import { remoteLines } from "./payload";
import type { SalesDoc } from "@/lib/types";
import { IntegrationError, type Provider, type ProviderContext } from "./types";

/** Billdu takes issued invoices only, and can't void one from here. */
function refuses(doc: SalesDoc): IntegrationError | null {
  if (doc.kind !== "invoice") return new IntegrationError("Billdu takes invoices only. Record credit notes in Billdu.", 400, "unsupported");
  if (doc.status === "void") return new IntegrationError("Void it in Billdu too: Northpin can't void Billdu documents.", 400, "unsupported");
  return null;
}

async function billduClient(ctx: ProviderContext): Promise<BillduClient> {
  const loaded = await effectiveCreds(ctx.caller);
  if (!loaded.creds) throw new IntegrationError("Billdu is not connected for your company. Add your Billdu API key and secret in Settings → Billdu.", 412, "not_connected");
  return new BillduClient(loaded.creds);
}

const wrap = async <T>(fn: () => Promise<T>): Promise<T> => {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof BillduError) throw new IntegrationError(e.message, e.status === 401 || e.status === 403 ? 401 : 502, "provider_error", false, e.body);
    throw e;
  }
};

export const billdu: Provider = {
  id: "billdu",
  label: "Billdu",
  auth: "api_key",
  beta: false,
  requiredEnv: [],
  enabled: () => true,
  settingsFields: [],
  connect: () => "/settings#billdu",
  callback: async () => {
    throw new IntegrationError("Billdu connects with an API key in Settings → Billdu.", 400, "not_oauth");
  },
  refresh: async (tokens) => tokens,
  // The key and secret are removed in Settings → Billdu (that screen owns them).
  disconnect: async () => undefined,

  async test(ctx) {
    const c = await billduClient(ctx);
    await wrap(() => c.listClients(1, 1));
    return { ok: true, message: "Connected. Reading data back from Billdu works." };
  },

  async pushCustomer(ctx, client, link) {
    if (link?.remoteId) return { remoteId: link.remoteId };
    const c = await billduClient(ctx);
    const p = { clientName: client.company?.trim() || client.name, clientEmail: client.email ?? "", clientPhone: client.phone ?? "", address: client.billingAddress ?? client.siteAddress ?? "" };
    return wrap(async () => {
      for (let page = 1; page <= 20; page++) {
        let list: BillduClientRecord[];
        try {
          list = await c.listClients(page, 50);
        } catch {
          break; // listing not available: create instead
        }
        const hit = list.find((r) => clientMatches(r, p));
        if (hit) return { remoteId: String(hit.id) };
        if (list.length < 50) break;
      }
      const created = await c.createClient(clientPayload(p));
      return { remoteId: String(created.id) };
    });
  },

  refuses,

  async pushInvoice(ctx, { doc, customerId, link }) {
    const refusal = refuses(doc);
    if (refusal) throw refusal;
    const c = await billduClient(ctx);
    // Tax, discounts and deductions are their own items (tax 0 on every line), so Billdu's total matches ours.
    const items: BillduItem[] = remoteLines(doc).map((l) => ({
      label: l.description,
      price: l.kind === "item" ? l.unitPrice : l.remoteAmount,
      tax: 0,
      stockNumber: (l.sku ?? "").slice(0, 64),
      count: l.kind === "item" ? Math.abs(l.qty) : 1,
      unit: billduUnit("each"),
      discount: 0,
    }));
    const payload = documentPayload({ type: "invoice", clientId: Number(customerId), items, currency: doc.currency || "USD", address: doc.client?.siteAddress ?? "" });
    return wrap(async () => {
      if (link?.remoteId) {
        try {
          await c.updateDocument(Number(link.remoteId), documentUpdate(payload));
          return { remoteId: link.remoteId, remoteNumber: link.remoteNumber, remoteTotal: itemsTotal(items), remoteStatus: "open" };
        } catch (e) {
          const status = (e as { status?: number }).status;
          if (status !== 404 && status !== 410) throw e;
        }
      }
      const d = await c.createDocument(payload);
      return { remoteId: String(d.id), remoteNumber: (d.serial_number as string | undefined) ?? null, remoteTotal: typeof d.total_price === "number" ? d.total_price : itemsTotal(items), remoteStatus: "open" };
    });
  },

  // Billdu's API has no payments endpoint we use: record payments in Billdu.
  pushPayment: async () => null,
};
