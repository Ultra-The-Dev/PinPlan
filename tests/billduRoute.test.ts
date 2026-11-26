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
const project = { id: "p1", clientName: "Demo Client", clientEmail: "c@example.com", address: "12 Maple Ridge Rd", billduClientId: null };
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
        if (url.pathname === "/documents/404" && method === "PATCH") return new Response('{"error":"not found"}', { status: 404 });
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
    expect((await res.json()).doc).toMatchObject({ id: 55, updated: true });
    // Only the items, currency and note change — the document keeps its number and dates.
    const patch = log.find((l) => l.method === "PATCH")!;
    expect(Object.keys(patch.body).sort()).toEqual(["client", "currency", "items", "note"]);
    // The stored client is only re-checked (GET /clients/7), never re-created.
    expect(log.some((l) => l.path.startsWith("/clients") && l.method !== "GET")).toBe(false);
  });

  it("makes a new document when the old one was deleted in Billdu", async () => {
    const res = await send({ project: { ...project, billduClientId: 7 }, docType: "estimate", lines, taxPct: 0, currency: "USD", existingDocId: 404 });
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.doc.updated).toBe(false);
    expect(log.map((l) => `${l.method} ${l.path}`)).toEqual(expect.arrayContaining(["PATCH /documents/404", expect.stringMatching(/^POST \/documents\/?$/)]));
  });

  it("Billdu ids from the request must be whole numbers: a path can't be smuggled into the request to Billdu", async () => {
    const bad = await send({ project, docType: "estimate", lines, taxPct: 0, currency: "USD", existingDocId: "../clients/5" });
    expect(bad.status).toBe(400);
    const badClient = await send({ project: { ...project, billduClientId: "../products/3" }, docType: "estimate", lines, taxPct: 0, currency: "USD" });
    expect(badClient.status).toBe(400);
    expect(log).toEqual([]);
  });

  it("puts the marked-up plans link in the document note", async () => {
    await send({ project, docType: "estimate", lines, taxPct: 0, currency: "USD", plansUrl: "https://x.supabase.co/storage/v1/object/public/proposals/u/billdu/p1/marked-up-plans.pdf" });
    const doc = log.find((l) => l.path.startsWith("/documents"))!;
    expect(doc.body.note).toBe("Project: 12 Maple Ridge Rd\nMarked-up plans (PDF): https://x.supabase.co/storage/v1/object/public/proposals/u/billdu/p1/marked-up-plans.pdf");
  });

  it("explains when Billdu rejects the credentials", async () => {
    vi.stubEnv("BILLDU_API_SECRET", "wrong");
    const res = await send({ project, docType: "estimate", lines, taxPct: 0, currency: "USD" });
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBeTruthy();
  });
});

// ---------- Billdu routes on a server with accounts: roles, plan gate, size caps, shared limits, error text ----------

describe("Billdu routes with accounts", () => {
  const SB = "http://sb.test";
  // user id → { role, team, can the team work? }
  const PEOPLE: Record<string, { role: string; team: string; canWork: boolean }> = {
    owner: { role: "owner", team: "t-1", canWork: true },
    tech: { role: "tech", team: "t-1", canWork: true },
    lapsed: { role: "owner", team: "t-2", canWork: false },
  };
  let rpc: { name: string; body: Record<string, unknown> }[];
  let billdu: { status: number; body: unknown };

  beforeEach(() => {
    rpc = [];
    billdu = { status: 200, body: { items: [] } };
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", SB);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "svc");
    vi.stubEnv("PINPLAN_ENCRYPTION_KEY", "test-encryption-key");
    vi.stubEnv("PINPLAN_FOUNDER_TEAM_ID", "t-1");
    vi.stubEnv("BILLDU_API_KEY", KEY);
    vi.stubEnv("BILLDU_API_SECRET", SECRET);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = new URL(String(input instanceof Request ? input.url : input));
        const auth = new Headers(init?.headers).get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
        const body = init?.body ? JSON.parse(String(init.body)) : {};
        if (url.origin !== SB) return Response.json(billdu.body, { status: billdu.status });
        if (url.pathname === "/auth/v1/user") {
          const who = auth.replace(/^tok-/, "");
          return PEOPLE[who] ? Response.json({ id: who }) : Response.json({}, { status: 401 });
        }
        if (url.pathname === "/rest/v1/team_members") {
          const who = (url.searchParams.get("user_id") ?? "").replace(/^eq\./, "");
          const p = PEOPLE[who];
          return Response.json(p ? [{ role: p.role, team_id: p.team, teams: { name: "Co" } }] : []);
        }
        const fn = url.pathname.match(/^\/rest\/v1\/rpc\/(\w+)$/)?.[1];
        if (fn) {
          // Only the service role may call these.
          if (auth !== "svc") return Response.json({ message: "permission denied" }, { status: 401 });
          rpc.push({ name: fn, body });
          if (fn === "team_can_write") return Response.json(PEOPLE[String(body.owner)]?.canWork ?? true);
          if (fn === "rate_limit_hit") {
            const n = rpc.filter((c) => c.name === fn && c.body.p_key === body.p_key).length;
            return Response.json({ ok: n <= Number(body.p_max), remaining: Math.max(0, Number(body.p_max) - n), retry_after: n <= Number(body.p_max) ? 0 : 60 });
          }
        }
        if (url.pathname.startsWith("/rest/v1/team_secrets")) return Response.json([]);
        return Response.json({ message: "not found" }, { status: 404 });
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.resetModules();
  });

  const post = async (route: "send" | "products" | "test", user: string, body: unknown = {}) => {
    const { POST } = await import(`@/app/api/billdu/${route}/route`);
    return (POST as (r: Request) => Promise<Response>)(
      new Request(`http://localhost/api/billdu/${route}`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer tok-${user}` }, body: JSON.stringify(body) }),
    );
  };
  const product = (i: number) => ({ id: `d${i}`, name: `Device ${i}`, unit: "each", unitPrice: 10 });

  it("billdu/products refuses technicians with 403", async () => {
    const r = await post("products", "tech", { deviceTypes: [product(1)] });
    expect(r.status).toBe(403);
    expect((await r.json()).code).toBe("office_only");
  });

  it("refuses a team whose trial ended with 402, before calling Billdu", async () => {
    for (const route of ["send", "products", "test"] as const) {
      const r = await post(route, "lapsed", { deviceTypes: [product(1)], project, docType: "estimate", lines });
      expect(r.status, route).toBe(402);
      expect(await r.json()).toEqual({ error: "Your trial has ended. Choose a plan in Settings → Billing.", code: "plan_required" });
    }
    expect(rpc.filter((c) => c.name === "team_can_write").map((c) => c.body)).toEqual([{ owner: "lapsed" }, { owner: "lapsed" }, { owner: "lapsed" }]);
  });

  it("caps deviceTypes and lines at 500", async () => {
    const many = Array.from({ length: 501 }, (_, i) => product(i));
    const p = await post("products", "owner", { deviceTypes: many });
    expect(p.status).toBe(413);
    expect((await p.json()).code).toBe("too_many_items");
    const manyLines = Array.from({ length: 501 }, (_, i) => line(`dev:${i}`, `Line ${i}`, 1, "each", 1));
    const s = await post("send", "owner", { project, docType: "estimate", lines: manyLines });
    expect(s.status).toBe(413);
  });

  it("counts sends per user in the shared store", async () => {
    billdu = { status: 500, body: { error: "boom" } };
    for (let i = 0; i < 30; i++) await post("send", "owner", { project, docType: "estimate", lines });
    const r = await post("send", "owner", { project, docType: "estimate", lines });
    expect(r.status).toBe(429);
    expect(r.headers.get("Retry-After")).toBe("60");
    expect(rpc.find((c) => c.name === "rate_limit_hit")!.body).toMatchObject({ p_key: "billdu-send:u:owner", p_max: 30 });
  });

  it("doesn't pass Billdu's or the database's own text to a company's users", async () => {
    billdu = { status: 500, body: { error: "stack trace: SQLSTATE 42P01 at /srv/billdu/internal.php:42" } };
    const r = await post("send", "owner", { project, docType: "estimate", lines });
    expect(r.status).toBe(502);
    const j = await r.json();
    expect(j).toMatchObject({ code: "billdu_error", billduStatus: 500 });
    expect(JSON.stringify(j)).not.toMatch(/SQLSTATE|internal\.php|details/);
  });

  it("says where to connect Billdu, without migration hints", async () => {
    vi.stubEnv("PINPLAN_FOUNDER_TEAM_ID", "");
    const r = await post("send", "owner", { project, docType: "estimate", lines });
    expect(r.status).toBe(412);
    const j = await r.json();
    expect(j.code).toBe("not_configured");
    expect(j.error).toContain("Settings → Connected apps → Billdu");
    expect(j.error).not.toMatch(/migration|\.sql/i);
  });
});

describe("Billdu error details", () => {
  afterEach(() => vi.unstubAllEnvs());
  const accessCodeCaller = { mode: "single_company", userId: null, via: "access_code" } as const;

  it("shows details on a single-company server, never to an access-code caller on a server with accounts", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
    vi.stubEnv("PINPLAN_ACCESS_CODE", "code");
    const { showDetails } = await import("@/lib/billdu/route-helpers");
    expect(showDetails(accessCodeCaller)).toBe(true);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://sb.example.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
    expect(showDetails(accessCodeCaller)).toBe(false);
  });
});

describe("secret encryption with key ids and rotation", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("writes k1-prefixed values, still reads old unprefixed ones, and opens values sealed with the previous key", async () => {
    vi.stubEnv("PINPLAN_ENCRYPTION_KEY", "old-key");
    const { encrypt, decrypt, decryptDetailed, needsReencrypt } = await import("@/lib/server/secrets");
    const oldValue = encrypt("hello", "aad");
    expect(oldValue.startsWith("k1.")).toBe(true);
    // A value from before key ids: the same thing without the prefix.
    const legacy = oldValue.slice(3);
    expect(decryptDetailed(legacy, "aad")).toEqual({ plain: "hello", stale: true });
    expect(decryptDetailed(oldValue, "aad")).toEqual({ plain: "hello", stale: false });

    // Rotate: new key, old one kept as the previous key.
    vi.stubEnv("PINPLAN_ENCRYPTION_KEY", "new-key");
    vi.stubEnv("PINPLAN_ENCRYPTION_KEY_PREVIOUS", "old-key");
    expect(decryptDetailed(oldValue, "aad")).toEqual({ plain: "hello", stale: true });
    expect(needsReencrypt(oldValue, "aad")).toBe(true);
    const fresh = encrypt("hello", "aad");
    expect(needsReencrypt(fresh, "aad")).toBe(false);
    // The aad still binds the value to its owner, with either key.
    expect(() => decrypt(oldValue, "other")).toThrow();

    // Without the previous key, old values no longer open.
    vi.stubEnv("PINPLAN_ENCRYPTION_KEY_PREVIOUS", "");
    expect(() => decrypt(oldValue, "aad")).toThrow();
    expect(decrypt(fresh, "aad")).toBe("hello");
    expect(() => decrypt("garbage", "aad")).toThrow();
  });
});
