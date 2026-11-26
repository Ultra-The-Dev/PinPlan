// docActions with cloud sync: a link or "sent" only once the cloud has the document issued and numbered, and the
// office's invoices worked out again after a pull. IndexedDB is fake-indexeddb; Supabase, sync and the team are mocked.
import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DocPayment, SalesDoc } from "@/lib/types";

const cloud = vi.hoisted(() => ({
  row: null as { id: string; status: string; number: string | null } | null,
  syncError: null as string | null,
  syncs: 0,
  links: [] as Record<string, unknown>[],
  role: "owner" as string | null,
}));

vi.mock("@/lib/supabase", () => {
  const from = (table: string) => ({
    select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: table === "sales_documents" ? cloud.row : null, error: null }) }) }),
    insert: async (row: Record<string, unknown>) => {
      cloud.links.push(row);
      return { error: null };
    },
    update: () => ({ eq: async () => ({ error: null }) }),
  });
  return { supabaseConfigured: true, getSupabase: () => ({ from }) };
});
vi.mock("@/lib/sync", () => ({
  SYNCED_EVENT: "pinplan:synced",
  useSyncStatus: { getState: () => ({ error: cloud.syncError, syncNow: async () => void cloud.syncs++ }) },
}));
vi.mock("@/lib/team", () => ({ useTeam: { getState: () => ({ role: cloud.role }) } }));

// The listener is installed when docActions loads: give it a window to listen on.
vi.stubGlobal("window", new EventTarget());

const { db, put } = await import("@/lib/db");
const { DEFAULT_DOC_SETTINGS, newDocument, withTotals } = await import("@/lib/documents");
const docActions = await import("@/lib/docActions");

const NOW = "2026-11-19T10:00:00.000Z";
const project = { id: "p1", clientName: "Sample", clientEmail: "", clientPhone: "", address: "1 Example St", status: "approved" as const, billduDocs: [], createdAt: NOW, updatedAt: NOW };
const settings = DEFAULT_DOC_SETTINGS;
const business = {} as Parameters<typeof docActions.publishLink>[1]["business"];

function invoice(over: Partial<SalesDoc> = {}): SalesDoc {
  return withTotals({
    ...newDocument({ id: "inv-1", kind: "invoice", project, settings, now: NOW, day: "2026-11-19" }),
    status: "sent",
    lines: [{ id: "l1", kind: "item", description: "Camera", qty: 1, unitPrice: 1000, taxable: false }],
    taxes: [],
    ...over,
  });
}

beforeEach(async () => {
  await db().delete();
  await db().open();
  Object.assign(cloud, { row: null, syncError: null, syncs: 0, links: [], role: "owner" });
});

describe("publishing a link and marking sent need the cloud's issued copy", () => {
  it("publishLink refuses when the cloud doesn't have it, still has a draft, or has no number; and names the sync error", async () => {
    const doc = await put("salesDocs", invoice());
    await expect(docActions.publishLink(doc, { settings, business, origin: "https://app.test" })).rejects.toThrow(docActions.NOT_IN_CLOUD);
    cloud.row = { id: doc.id, status: "draft", number: null };
    cloud.syncError = "Northpin subscription inactive";
    await expect(docActions.publishLink(doc, { settings, business, origin: "https://app.test" })).rejects.toThrow(/hasn't reached the cloud yet.*\(Northpin subscription inactive\)/);
    cloud.row = { id: doc.id, status: "sent", number: null };
    await expect(docActions.publishLink(doc, { settings, business, origin: "https://app.test" })).rejects.toThrow(docActions.NOT_IN_CLOUD);
    expect(cloud.links).toHaveLength(0);
    expect((await db().salesDocs.get(doc.id))?.shareToken).toBeFalsy();
    expect(cloud.syncs).toBeGreaterThan(0);
  });

  it("publishLink works once the cloud has it issued and numbered, and takes the cloud's number", async () => {
    const doc = await put("salesDocs", invoice());
    cloud.row = { id: doc.id, status: "sent", number: "INV-2026-0007" };
    const out = await docActions.publishLink(doc, { settings, business, origin: "https://app.test" });
    expect(cloud.links).toHaveLength(1);
    expect(out.doc.number).toBe("INV-2026-0007");
    expect(out.doc.sentAt).toBeTruthy();
    expect(out.url).toContain("https://app.test");
  });

  it("markSent refuses until the cloud has it numbered, then records it", async () => {
    const doc = await put("salesDocs", invoice());
    cloud.row = { id: doc.id, status: "draft", number: null };
    await expect(docActions.markSent(doc, settings)).rejects.toThrow(docActions.NOT_IN_CLOUD);
    expect((await db().salesDocs.get(doc.id))?.sentAt).toBeFalsy();
    cloud.row = { id: doc.id, status: "sent", number: "INV-2026-0008" };
    const sent = await docActions.markSent(doc, settings);
    expect(sent.sentAt).toBeTruthy();
    expect(sent.number).toBe("INV-2026-0008");
  });
});

describe("after a pull", () => {
  const payment = (over: Partial<DocPayment> = {}): DocPayment => ({ id: "pay-1", projectId: "p1", documentId: "inv-1", amount: 400, date: "2026-11-20", method: "check", createdAt: NOW, updatedAt: NOW, ...over });
  const pulled = (tables: string[]) => window.dispatchEvent(new CustomEvent("pinplan:synced", { detail: { tables, projectIds: ["p1"] } }));
  const settle = () => new Promise((r) => setTimeout(r, 50));

  it("the office works the job's invoices out again when payments or documents came in", async () => {
    await put("salesDocs", invoice());
    // Another device's payment arrives by sync (written straight to the table, as a pull does).
    await db().salesPayments.put(payment());
    pulled(["salesPayments"]);
    await settle();
    const inv = await db().salesDocs.get("inv-1");
    expect(inv).toMatchObject({ amountPaid: 400, balanceDue: 600, status: "partially_paid" });
  });

  it("does nothing for other tables, or for a technician", async () => {
    await put("salesDocs", invoice());
    await db().salesPayments.put(payment());
    pulled(["markers"]);
    await settle();
    expect((await db().salesDocs.get("inv-1"))?.balanceDue).toBe(1000);
    cloud.role = "tech";
    pulled(["salesPayments"]);
    await settle();
    expect((await db().salesDocs.get("inv-1"))?.balanceDue).toBe(1000);
  });
});

describe("numbers without cloud sync", () => {
  it("never hands out a number a document on this device already has (lost or unreadable counter)", () => {
    const used = new Set(["INV-2026-0001", "INV-2026-0002", "INV-2026-0004"]);
    expect(docActions.freeLocalNumber("INV-{YYYY}-{0000}", 1, "2026-03-01", used)).toEqual({ n: 3, number: "INV-2026-0003" });
    expect(docActions.freeLocalNumber("INV-{YYYY}-{0000}", 4, "2026-03-01", used)).toEqual({ n: 5, number: "INV-2026-0005" });
    expect(docActions.freeLocalNumber("Q-{0000}", 7, "2026-03-01", used)).toEqual({ n: 7, number: "Q-0007" });
  });
});
