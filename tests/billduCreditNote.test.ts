// A credit note pushed to Billdu (which takes invoices only) is refused before anything is sent: no client is made in
// Billdu for a document that never goes there.
import { describe, expect, it, vi } from "vitest";
import { newDocument, normalizeDocSettings, withTotals } from "@/lib/documents";
import type { Project, SalesDoc } from "@/lib/types";

const events: unknown[] = [];
vi.mock("@/lib/server/integrations/store", () => ({
  readLink: vi.fn(async () => null),
  saveLink: vi.fn(async () => undefined),
  addEvent: vi.fn(async (_o: unknown, _p: unknown, e: unknown) => void events.push(e)),
  readConnection: vi.fn(async () => null),
  setConnectionStatus: vi.fn(async () => undefined),
  swapTokens: vi.fn(async () => null),
}));

const NOW = "2026-11-19T15:00:00.000Z";
const project: Project = { id: "p1", clientName: "Demo Client", clientEmail: "client@example.com", clientPhone: "", address: "1 Example St", status: "approved", billduDocs: [], createdAt: NOW, updatedAt: NOW };
const doc = (over: Partial<SalesDoc>): SalesDoc =>
  withTotals({
    ...newDocument({ id: "cn-1", kind: "credit_note", project, settings: normalizeDocSettings({}), now: NOW, day: "2026-11-19" }),
    status: "sent",
    number: "CN-1",
    lines: [{ id: "l1", kind: "item", description: "Camera", qty: 1, unitPrice: 100, taxable: false }],
    ...over,
  });

describe("Billdu push of a document it doesn't take", () => {
  it("refuses a credit note before creating the client, and records the refusal", async () => {
    const { billdu } = await import("@/lib/server/integrations/billdu");
    const { pushDocument } = await import("@/lib/server/integrations/service");
    const pushCustomer = vi.fn(async () => ({ remoteId: "77" }));
    const pushInvoice = vi.fn(billdu.pushInvoice);
    const provider = { ...billdu, pushCustomer, pushInvoice };
    const ic = { caller: { mode: "solo", userId: "u1", token: "t", owner: { kind: "user", id: "u1" } }, owner: { kind: "user", id: "u1" }, userId: "u1" } as const;
    const ctx = { caller: ic.caller, settings: {} } as unknown as Parameters<typeof pushDocument>[2];
    await expect(pushDocument(provider, ic as never, ctx, doc({}), [])).rejects.toMatchObject({ code: "unsupported", message: "Billdu takes invoices only. Record credit notes in Billdu." });
    expect(pushCustomer).not.toHaveBeenCalled();
    expect(pushInvoice).not.toHaveBeenCalled();
    expect(events).toEqual([expect.objectContaining({ kind: "error", ok: false })]);
  });
});
