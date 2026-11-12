// End-to-end test of POST /api/billdu/send against a fake Billdu API that verifies request signatures.
import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const KEY = "k123";
const SECRET = "s456";

function verify(url: URL, body: Record<string, unknown>) {
  const toSign: Record<string, unknown> = { ...body, apiKey: url.searchParams.get("apiKey"), timestamp: Number(url.searchParams.get("timestamp")) };
  const sorted = Object.fromEntries(Object.keys(toSign).sort().map((k) => [k, toSign[k]]));
  return createHmac("sha512", SECRET).update(JSON.stringify(sorted)).digest("base64") === url.searchParams.get("signature");
}

const line = (key: string, description: string, qty: number, unit: string, unitPrice: number) => ({
  key, description, qty, unit, unitPrice, total: qty * unitPrice, optional: false, included: true, group: "devices", overridden: false,
});
const project = { id: "p1", clientName: "Demo Client", clientEmail: "c@example.com", address: "20 Hilltop Dr E", billduClientId: null };
const lines = [line("dev:cam-indoor", "Indoor camera — installed", 13, "each", 320), line("dev:led-ceiling", "LED strip", 873, "LF", 11)];

describe("POST /api/billdu/send", () => {
  let log: { method: string; path: string; body: Record<string, unknown>; signed: boolean }[];
  let clients: Record<string, unknown>[];

  beforeEach(() => {
    log = [];
    clients = [];
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("PINPLAN_ACCESS_CODE", "");
    vi.stubEnv("BILLDU_API_KEY", KEY);
    vi.stubEnv("BILLDU_API_SECRET", SECRET);
    let nextId = 100;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = new URL(String(input instanceof Request ? input.url : input));
        const body = init?.body ? JSON.parse(String(init.body)) : {};
        const method = (init?.method ?? "GET").toUpperCase();
        const signed = verify(url, body);
        log.push({ method, path: url.pathname, body, signed });
        if (!signed) return new Response('{"error":"bad signature"}', { status: 401 });
        const one = url.pathname.match(/^\/clients\/(\d+)$/);
        if (one && method === "GET") return Response.json({ id: Number(one[1]), fullname: "Demo Client" });
        if (url.pathname.startsWith("/clients") && method === "GET") return Response.json({ items: clients });
        if (url.pathname.startsWith("/clients") && method === "POST") {
          const c = { id: nextId++, ...body };
          clients.push(c);
          return Response.json(c, { status: 201 });
        }
        if (url.pathname.startsWith("/documents")) {
          const items = (body.items ?? []) as { price: number; count: number }[];
          const total = items.reduce((s, i) => s + i.price * i.count, 0);
          return Response.json({ id: nextId++, serial_number: "EST0001", price: total, total_price: total }, { status: 201 });
        }
        return new Response("{}", { status: 404 });
      }),
    );
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  async function send(body: Record<string, unknown>) {
    const { POST } = await import("@/app/api/billdu/send/route");
    return POST(new Request("http://localhost/api/billdu/send", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));
  }

  it("creates the client, then an estimate with the same lines, all requests signed", async () => {
    const res = await send({ project, docType: "estimate", lines, taxPct: 8, currency: "USD" });
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.doc).toMatchObject({ type: "estimate", serial: "EST0001", amount: 13 * 320 + 873 * 11 });
    expect(log.every((l) => l.signed)).toBe(true);
    const doc = log.find((l) => l.path.startsWith("/documents"))!;
    expect(doc.body).toMatchObject({ type: "estimate", client: j.clientId, currency: "USD" });
    expect(doc.body.items).toEqual([
      expect.objectContaining({ label: "Indoor camera — installed", price: 320, count: 13, unit: "pc", tax: 8 }),
      expect.objectContaining({ label: "LED strip", price: 11, count: 873, unit: "ft", tax: 8 }),
    ]);
  });

  it("reuses an existing Billdu client and sends a 50% deposit invoice as one line", async () => {
    await send({ project, docType: "estimate", lines, taxPct: 0, currency: "USD" });
    log = [];
    const res = await send({ project, docType: "invoice", lines, taxPct: 0, currency: "USD", depositPct: 50 });
    const j = await res.json();
    expect(log.some((l) => l.path.startsWith("/clients") && l.method === "POST")).toBe(false);
    const doc = log.find((l) => l.path.startsWith("/documents"))!;
    expect(doc.body.items).toHaveLength(1);
    expect(j.doc).toMatchObject({ type: "invoice", percent: 50, amount: (13 * 320 + 873 * 11) / 2 });
  });

  it("updates an existing document instead of duplicating it", async () => {
    const res = await send({ project: { ...project, billduClientId: 7 }, docType: "estimate", lines, taxPct: 0, currency: "USD", existingDocId: 55 });
    expect(res.status).toBe(200);
    expect(log.map((l) => `${l.method} ${l.path}`)).toContain("PATCH /documents/55");
    // The stored client is only re-checked (GET /clients/7), never re-created.
    expect(log.some((l) => l.path.startsWith("/clients") && l.method !== "GET")).toBe(false);
  });

  it("explains when Billdu rejects the credentials", async () => {
    vi.stubEnv("BILLDU_API_SECRET", "wrong");
    const res = await send({ project, docType: "estimate", lines, taxPct: 0, currency: "USD" });
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBeTruthy();
  });
});
