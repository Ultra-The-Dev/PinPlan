import { createHmac } from "node:crypto";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BillduClient, extractList } from "@/lib/billdu/client";
import { billduDate, billduUnit, clientMatches, clientPayload, documentPayload, itemsTotal, linesToItems, splitAddress, type SendLine } from "@/lib/billdu/mapping";
import { createSignature, ksort } from "@/lib/billdu/signature";

describe("Billdu signature", () => {
  it("matches the official client's algorithm (ksort + JSON + HMAC-SHA512 base64)", () => {
    const body = { type: "invoice", client: 8, items: [{ label: "x", price: 1 }] };
    const expected = createHmac("sha512", "s3cret")
      .update(JSON.stringify({ apiKey: "KEY", client: 8, items: [{ label: "x", price: 1 }], timestamp: 1443620910, type: "invoice" }))
      .digest("base64");
    expect(createSignature(body, "KEY", "s3cret", 1443620910)).toBe(expected);
    // Deterministic, and independent of input key order.
    expect(createSignature({ items: body.items, client: 8, type: "invoice" }, "KEY", "s3cret", 1443620910)).toBe(expected);
  });

  it("signs GET requests over just apiKey + timestamp", () => {
    const expected = createHmac("sha512", "sec").update('{"apiKey":"k","timestamp":5}').digest("base64");
    expect(createSignature(undefined, "k", "sec", 5)).toBe(expected);
    expect(Object.keys(ksort({ b: 1, a: 2 }))).toEqual(["a", "b"]);
  });

  it("puts apiKey, timestamp and signature in the query and sends the body unchanged", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: 7, serial_number: "INV1" }), { status: 201 }));
    const c = new BillduClient({ apiKey: "k", apiSecret: "s" }, "https://api.billdu.com", fetchMock as unknown as typeof fetch);
    const doc = await c.createDocument({ type: "invoice", client: 1 });
    expect(doc.id).toBe(7);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.pathname).toBe("/documents/");
    expect(url.searchParams.get("apiKey")).toBe("k");
    const ts = Number(url.searchParams.get("timestamp"));
    expect(url.searchParams.get("signature")).toBe(createSignature({ type: "invoice", client: 1 }, "k", "s", ts));
    expect(init.body).toBe('{"type":"invoice","client":1}');
  });

  it("raises a readable error on failure", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ message: "Invalid signature" }), { status: 403 }));
    const c = new BillduClient({ apiKey: "k", apiSecret: "s" }, "https://api.billdu.com", fetchMock as unknown as typeof fetch);
    await expect(c.listClients()).rejects.toThrow(/403.*Invalid signature/);
  });

  it("extracts lists from bare and wrapped responses", () => {
    expect(extractList([{ id: 1 }])).toHaveLength(1);
    expect(extractList({ _embedded: { clients: [{ id: 1 }, { id: 2 }] } })).toHaveLength(2);
    expect(extractList({ items: [{ id: 1 }] })).toHaveLength(1);
    expect(extractList(null)).toEqual([]);
  });
});

describe("Billdu mapping", () => {
  const lines: SendLine[] = [
    { key: "dev:cam-indoor", description: "Indoor camera — installed", qty: 13, unit: "each", unitPrice: 320, total: 4160, included: true },
    { key: "dev:led-ceiling", description: "LED strip — ceiling moulding", qty: 873, unit: "LF", unitPrice: 11, total: 9603, included: true },
    { key: "opt:speaker", description: "In-ceiling speaker (optional)", qty: 2, unit: "each", unitPrice: 165, total: 330, included: false },
    { key: "custom:x", description: "Programming", qty: 8, unit: "hr", unitPrice: 125, total: 1000, included: true },
  ];

  it("maps included lines to items with Billdu units", () => {
    const items = linesToItems(lines, 8.875);
    expect(items).toHaveLength(3);
    expect(items[0]).toMatchObject({ label: "Indoor camera — installed", price: 320, count: 13, unit: "pc", tax: 8.875, stockNumber: "cam-indoor" });
    expect(items[1]).toMatchObject({ unit: "ft", count: 873 });
    expect(items[2]).toMatchObject({ unit: "hr", stockNumber: "" });
    expect(itemsTotal(items)).toBe(4160 + 9603 + 1000);
    expect(billduUnit("each")).toBe("pc");
  });

  it("collapses a deposit into one percentage line", () => {
    const items = linesToItems(lines, 0, { depositPct: 50, address: "20 Hilltop Dr E" });
    expect(items).toEqual([{ label: "Deposit 50% of estimate — 20 Hilltop Dr E", price: 7381.5, tax: 0, stockNumber: "", count: 1, unit: "pc", discount: 0 }]);
  });

  it("builds client and document payloads", () => {
    expect(splitAddress("20 Hilltop Dr E, Roslyn, NY 11576")).toEqual({ street: "20 Hilltop Dr E", city: "Roslyn", province: "NY", zip: "11576" });
    const c = clientPayload({ clientName: "Jane Doe", clientEmail: "j@x.com", address: "20 Hilltop Dr E, Roslyn, NY 11576" });
    expect(c).toMatchObject({ fullname: "Jane Doe", email: "j@x.com", street: "20 Hilltop Dr E", city: "Roslyn", zip: "11576" });
    const d = documentPayload({ type: "estimate", clientId: 5, items: [], currency: "USD", address: "20 Hilltop Dr E", now: new Date(2026, 10, 11, 9, 5, 3) });
    expect(d).toMatchObject({ type: "estimate", client: 5, payment: "transfer", currency: "USD", note: "Project: 20 Hilltop Dr E" });
    expect(d.issue).toMatch(/^2026-11-11T09:05:03[+-]\d{4}$/);
    expect(billduDate(new Date())).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{4}$/);
  });

  it("matches existing clients by email or name", () => {
    expect(clientMatches({ email: "J@X.com" }, { clientName: "Other", clientEmail: "j@x.com" })).toBe(true);
    expect(clientMatches({ fullname: " jane doe " }, { clientName: "Jane Doe" })).toBe(true);
    expect(clientMatches({ name: "Jane", surname: "Doe" }, { clientName: "Jane Doe" })).toBe(true);
    expect(clientMatches({ fullname: "Bob" }, { clientName: "Jane Doe" })).toBe(false);
  });
});

describe("server secret store", () => {
  const env = { ...process.env };
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), "pinplan-"));
    process.env.PINPLAN_DATA_DIR = dir;
    process.env.PINPLAN_ENCRYPTION_KEY = "test-key-please-change";
    delete process.env.BILLDU_API_KEY;
    delete process.env.BILLDU_API_SECRET;
  });
  afterEach(() => {
    process.env = { ...env };
  });

  it("round-trips encrypted credentials and never writes the secret in clear text", async () => {
    const s = await import("@/lib/server/secrets");
    expect((await s.loadBillduCreds()).creds).toBeNull();
    await s.saveBillduCreds({ apiKey: "abcdef123456", apiSecret: "TOP-SECRET-VALUE" });
    const raw = readFileSync(path.join(dir, "billdu.json"), "utf8");
    expect(raw).not.toContain("TOP-SECRET-VALUE");
    expect(raw).not.toContain("abcdef123456");
    const loaded = await s.loadBillduCreds();
    expect(loaded).toEqual({ creds: { apiKey: "abcdef123456", apiSecret: "TOP-SECRET-VALUE" }, source: "file" });
    expect(s.keyHint("abcdef123456")).toBe("ab…3456");
    // Wrong key can't decrypt.
    process.env.PINPLAN_ENCRYPTION_KEY = "another";
    expect((await s.loadBillduCreds()).creds).toBeNull();
    await s.deleteBillduCreds();
    process.env.PINPLAN_ENCRYPTION_KEY = "test-key-please-change";
    expect((await s.loadBillduCreds()).creds).toBeNull();
  });

  it("prefers env credentials", async () => {
    const s = await import("@/lib/server/secrets");
    process.env.BILLDU_API_KEY = "envkey";
    process.env.BILLDU_API_SECRET = "envsecret";
    expect(await s.loadBillduCreds()).toEqual({ creds: { apiKey: "envkey", apiSecret: "envsecret" }, source: "env" });
  });
});
