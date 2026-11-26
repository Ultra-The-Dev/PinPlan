// /api/integrations/* against an in-memory Supabase (PostgREST subset) and fake QuickBooks / Xero APIs. No network.
import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { newDocument, normalizeDocSettings, withTotals } from "@/lib/documents";
import { toRemote } from "@/lib/syncMap";
import type { DocLine, DocPayment, Project, SalesDoc } from "@/lib/types";

// ---------------------------------------------------------------- fake Supabase

type Row = Record<string, unknown>;
const KEYS: Record<string, string[]> = {
  integration_connections: ["owner_kind", "owner_id", "provider"],
  integration_links: ["owner_kind", "owner_id", "provider", "local_type", "local_id"],
  integration_oauth_states: ["nonce"],
  integration_events: ["id"],
};

/** Tables read with the caller's own token: only the office (tok-owner here) sees them, like the RLS policies. */
const USER_TABLES = new Set(["sales_documents", "sales_document_payments"]);

function fakeDb() {
  const tables: Record<string, Row[]> = { integration_connections: [], integration_links: [], integration_events: [], integration_oauth_states: [], sales_documents: [], sales_document_payments: [] };
  const users: Record<string, string> = {
    "tok-owner": "u-owner",
    "tok-tech": "u-tech",
    "tok-lapsed": "u-lapsed",
    "tok-solo": "u-solo",
    "tok-solo-lapsed": "u-solo-lapsed",
    "tok-prelaunch": "u-prelaunch",
  };
  /** public.team_can_write(owner) as the database answers it (its own rules: billing_enforced, solo trials). */
  const canWrite: Record<string, boolean> = { "u-lapsed": false, "u-solo-lapsed": false, "u-prelaunch": true };
  const members: Row[] = [
    { user_id: "u-owner", role: "owner", team_id: "00000000-0000-0000-0000-0000000000a1" },
    { user_id: "u-tech", role: "tech", team_id: "00000000-0000-0000-0000-0000000000a1" },
    { user_id: "u-lapsed", role: "owner", team_id: "00000000-0000-0000-0000-0000000000a2" },
    { user_id: "u-prelaunch", role: "owner", team_id: "00000000-0000-0000-0000-0000000000a3" },
  ];
  const teams: Row[] = [
    { id: "00000000-0000-0000-0000-0000000000a1", name: "Test Co", plan_status: "trialing", trial_ends_at: new Date(Date.now() + 5 * 86400_000).toISOString() },
    { id: "00000000-0000-0000-0000-0000000000a2", name: "Lapsed Co", plan_status: "canceled", trial_ends_at: null },
    // Its trial date has passed, but billing isn't enforced yet: the database still lets it work.
    { id: "00000000-0000-0000-0000-0000000000a3", name: "Early Co", plan_status: "trialing", trial_ends_at: new Date(Date.now() - 2 * 86400_000).toISOString() },
  ];
  let seq = 1;
  const match = (row: Row, q: URLSearchParams) => {
    for (const [k, v] of q) {
      if (["select", "order", "limit", "on_conflict"].includes(k)) continue;
      const [op, ...rest] = v.split(".");
      const val = rest.join(".");
      const cell = row[k];
      if (op === "eq" && String(cell) !== val) return false;
      if (op === "gt" && !(String(cell) > val)) return false;
      if (op === "in" && !val.replace(/^\(|\)$/g, "").split(",").map((s) => s.replace(/^"|"$/g, "")).includes(String(cell))) return false;
    }
    return true;
  };
  async function handle(url: URL, init: RequestInit): Promise<Response> {
    const method = (init.method ?? "GET").toUpperCase();
    const headers = new Headers(init.headers);
    if (url.pathname === "/auth/v1/user") {
      const id = users[(headers.get("authorization") ?? "").replace(/^Bearer /, "")];
      return id ? Response.json({ id }) : new Response("{}", { status: 401 });
    }
    const name = url.pathname.replace("/rest/v1/", "");
    const q = url.searchParams;
    if (name === "rpc/prune_integration_rows") return new Response(null, { status: 204 });
    if (name === "rpc/team_can_write") {
      const owner = String((init.body ? JSON.parse(String(init.body)) : {}).owner);
      return Response.json(canWrite[owner] ?? true);
    }
    if (name === "rpc/my_billing_owner") {
      const id = users[(headers.get("authorization") ?? "").replace(/^Bearer /, "")];
      return id ? Response.json(`owner-of-${id}`) : new Response("{}", { status: 401 });
    }
    if (name === "team_members") {
      const rows = members.filter((m) => match(m, q)).map((m) => ({ ...m, teams: teams.find((t) => t.id === m.team_id) }));
      return Response.json(rows);
    }
    if (name === "teams") return Response.json(teams.filter((t) => match(t, q)));
    if (USER_TABLES.has(name)) {
      const token = (headers.get("authorization") ?? "").replace(/^Bearer /, "");
      const rows = token === "tok-owner" ? tables[name].filter((r) => match(r, q)) : [];
      return Response.json(rows.map((r) => ({ ...r })));
    }
    const table = tables[name];
    if (!table) return new Response('{"code":"PGRST205"}', { status: 404 });
    const body = init.body ? JSON.parse(String(init.body)) : null;
    const prefer = headers.get("prefer") ?? "";
    const ret = (rows: Row[]) => (prefer.includes("return=representation") || method === "GET" ? Response.json(rows) : new Response(null, { status: 201 }));
    if (method === "GET") {
      let rows = table.filter((r) => match(r, q));
      if (q.get("order")?.startsWith("created_at.desc")) rows = [...rows].reverse();
      if (q.get("limit")) rows = rows.slice(0, Number(q.get("limit")));
      return Response.json(rows.map((r) => ({ ...r })));
    }
    if (method === "POST") {
      const items = Array.isArray(body) ? body : [body];
      for (const item of items) {
        const keys = KEYS[name];
        const existing = q.get("on_conflict") && prefer.includes("merge-duplicates") ? table.find((r) => keys.every((k) => r[k] === item[k])) : undefined;
        if (existing) Object.assign(existing, item);
        else {
          if (!q.get("on_conflict") && name !== "integration_events" && table.some((r) => KEYS[name].every((k) => r[k] === item[k]))) return new Response('{"code":"23505"}', { status: 409 });
          table.push({ version: 1, status: "connected", meta: {}, settings: {}, created_at: new Date(Date.now() + seq).toISOString(), id: seq++, expires_at: item.expires_at, ...item });
        }
      }
      return ret(items);
    }
    if (method === "PATCH") {
      const rows = table.filter((r) => match(r, q));
      for (const r of rows) Object.assign(r, body);
      return ret(rows);
    }
    if (method === "DELETE") {
      const rows = table.filter((r) => match(r, q));
      tables[name] = table.filter((r) => !rows.includes(r));
      return ret(rows);
    }
    return new Response("{}", { status: 405 });
  }
  return { tables, teams, members, handle };
}

// ---------------------------------------------------------------- fake QuickBooks and Xero

interface Call {
  method: string;
  url: URL;
  body: unknown;
  headers: Headers;
}

function fakeQbo() {
  const calls: Call[] = [];
  const store: Record<string, Row> = {};
  let id = 100;
  let totalSkew = 0;
  let accessOk = new Set(["qbo-access-1"]);
  let refreshCount = 0;
  const handle = async (url: URL, init: RequestInit): Promise<Response> => {
    const method = (init.method ?? "GET").toUpperCase();
    const headers = new Headers(init.headers);
    const raw = init.body ? String(init.body) : "";
    const body = raw && headers.get("content-type")?.includes("json") ? JSON.parse(raw) : raw;
    calls.push({ method, url, body, headers });
    if (url.hostname === "oauth.platform.intuit.com") {
      const form = new URLSearchParams(raw);
      if (form.get("grant_type") === "authorization_code") return Response.json({ access_token: "qbo-access-1", refresh_token: "qbo-refresh-1", expires_in: 3600, x_refresh_token_expires_in: 8640000 });
      if (form.get("refresh_token") === "dead") return Response.json({ error: "invalid_grant" }, { status: 400 });
      refreshCount++;
      const t = `qbo-access-r${refreshCount}`;
      accessOk = new Set([t]);
      return Response.json({ access_token: t, refresh_token: `qbo-refresh-r${refreshCount}`, expires_in: 3600, x_refresh_token_expires_in: 8640000 });
    }
    if (url.hostname === "developer.api.intuit.com") return new Response(null, { status: 200 });
    if (!accessOk.has((headers.get("authorization") ?? "").replace("Bearer ", ""))) return new Response('{"fault":"auth"}', { status: 401 });
    const path = url.pathname.replace(/^\/v3\/company\/\d+\//, "");
    if (path.startsWith("companyinfo")) return Response.json({ CompanyInfo: { CompanyName: "Sandbox Co" } });
    if (path === "query") return Response.json({ QueryResponse: {} });
    if (path === "customer") return Response.json({ Customer: { Id: String(id++) } });
    const m = path.match(/^(invoice|creditmemo|payment)(?:\/(\d+))?$/);
    if (m) {
      const key = m[1] === "invoice" ? "Invoice" : m[1] === "creditmemo" ? "CreditMemo" : "Payment";
      if (m[2]) return store[m[2]] ? Response.json({ [key]: store[m[2]] }) : Response.json({ Fault: { Error: [{ Message: "Object Not Found" }] } }, { status: 400 });
      const b = body as Row;
      if (url.searchParams.get("operation")) {
        store[String(b.Id)] = { ...store[String(b.Id)], status: url.searchParams.get("operation") };
        return Response.json({ [key]: store[String(b.Id)] });
      }
      const lines = (b.Line as { Amount: number; DetailType: string; SalesItemLineDetail?: { ItemRef: { value: string } } }[]) ?? [];
      if (lines.some((l) => l.SalesItemLineDetail?.ItemRef.value === "bad")) return Response.json({ Fault: { Error: [{ Message: "Invalid Reference Id" }] } }, { status: 400 });
      const total = Math.round(lines.reduce((s, l) => s + (l.DetailType === "DiscountLineDetail" ? -l.Amount : l.Amount), 0) * 100) / 100;
      const rid = b.Id ? String(b.Id) : String(id++);
      const prev = store[rid];
      store[rid] = { Id: rid, SyncToken: prev ? String(Number(prev.SyncToken) + 1) : "0", DocNumber: b.DocNumber, TotalAmt: m[1] === "payment" ? b.TotalAmt : total + totalSkew };
      return Response.json({ [key]: store[rid] });
    }
    return new Response("{}", { status: 404 });
  };
  return {
    calls,
    store,
    handle,
    skew: (n: number) => (totalSkew = n),
    expireAccess: () => (accessOk = new Set()),
  };
}

function fakeXero() {
  const calls: Call[] = [];
  let id = 1;
  const handle = async (url: URL, init: RequestInit): Promise<Response> => {
    const method = (init.method ?? "GET").toUpperCase();
    const headers = new Headers(init.headers);
    const raw = init.body ? String(init.body) : "";
    const body = raw && headers.get("content-type")?.includes("json") ? JSON.parse(raw) : raw;
    calls.push({ method, url, body, headers });
    if (url.hostname === "identity.xero.com") {
      if (url.pathname.endsWith("/revocation")) return new Response(null, { status: 200 });
      return Response.json({ access_token: "xero-access", refresh_token: "xero-refresh", expires_in: 1800 });
    }
    if (url.pathname === "/connections") return Response.json([{ id: "conn-1", tenantId: "tenant-1", tenantName: "Demo Org", tenantType: "ORGANISATION", updatedDateUtc: "2026-11-19T00:00:00" }]);
    if (url.pathname.startsWith("/connections/")) return new Response(null, { status: 204 });
    const path = url.pathname.replace("/api.xro/2.0/", "");
    if (path === "Organisation") return Response.json({ Organisations: [{ Name: "Demo Org" }] });
    if (path.startsWith("Contacts")) return method === "GET" ? Response.json({ Contacts: [] }) : Response.json({ Contacts: [{ ContactID: "contact-1" }] });
    for (const [p, idf, nf] of [["Invoices", "InvoiceID", "InvoiceNumber"], ["CreditNotes", "CreditNoteID", "CreditNoteNumber"]] as const) {
      if (path.startsWith(p)) {
        const doc = (body as Record<string, Row[]>)[p][0];
        const items = (doc.LineItems as { LineAmount: number }[] | undefined) ?? [];
        return Response.json({ [p]: [{ [idf]: doc[idf] ?? `x-${id++}`, [nf]: doc[nf], Status: doc.Status ?? "AUTHORISED", Total: Math.round(items.reduce((s, l) => s + l.LineAmount, 0) * 100) / 100 }] });
      }
    }
    if (path === "Payments") return Response.json({ Payments: [{ PaymentID: `pay-${id++}`, Amount: (body as { Payments: { Amount: number }[] }).Payments[0].Amount, Status: "AUTHORISED" }] });
    return new Response("{}", { status: 404 });
  };
  return { calls, handle };
}

// ---------------------------------------------------------------- documents

const NOW = "2026-11-19T15:00:00.000Z";
const DAY = "2026-11-19";
const S = normalizeDocSettings({ taxes: [{ id: "st", name: "State Tax", rate: 4, default: true }, { id: "ct", name: "City Tax", rate: 4.5, default: true }] });
const project: Project = { id: "p1", clientName: "Demo Client", clientEmail: "client@example.com", clientPhone: "", address: "1 Example St", status: "approved", billduDocs: [], createdAt: NOW, updatedAt: NOW };
let n = 0;
const item = (p: Partial<DocLine> & { qty: number; unitPrice: number }): DocLine => ({ id: `l${++n}`, kind: "item", description: "Item", taxable: true, ...p });
const invoice = (over: Partial<SalesDoc> = {}): SalesDoc =>
  withTotals({
    ...newDocument({ id: `inv-${++n}`, kind: "invoice", project, settings: S, now: NOW, day: DAY }),
    status: "sent",
    number: `INV-${n}`,
    issueDate: DAY,
    dueDate: "2026-12-19",
    lines: [item({ description: "Camera", qty: 3, unitPrice: 199.99, discount: { type: "pct", value: 10 } }), item({ description: "Labor", qty: 4, unitPrice: 85, taxable: false })],
    discount: { type: "fixed", value: 25 },
    fees: [{ id: "f", label: "Permit", amount: 60, taxable: true }],
    ...over,
  });

// ---------------------------------------------------------------- harness

let db: ReturnType<typeof fakeDb>;
let qbo: ReturnType<typeof fakeQbo>;
let xero: ReturnType<typeof fakeXero>;

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://sb.test");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service");
  vi.stubEnv("PINPLAN_ENCRYPTION_KEY", "test-encryption-key");
  vi.stubEnv("PINPLAN_APP_URL", "https://app.test");
  vi.stubEnv("PINPLAN_ACCESS_CODE", "");
  vi.stubEnv("QBO_CLIENT_ID", "qbo-id");
  vi.stubEnv("QBO_CLIENT_SECRET", "qbo-secret");
  vi.stubEnv("QBO_ENVIRONMENT", "sandbox");
  vi.stubEnv("XERO_CLIENT_ID", "xero-id");
  vi.stubEnv("XERO_CLIENT_SECRET", "xero-secret");
  vi.stubEnv("BILLDU_API_KEY", "");
  vi.stubEnv("BILLDU_API_SECRET", "");
  db = fakeDb();
  qbo = fakeQbo();
  xero = fakeXero();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request, init: RequestInit = {}) => {
      const url = new URL(String(input instanceof Request ? input.url : input));
      if (url.hostname === "sb.test") return db.handle(url, init);
      if (/intuit\.com$/.test(url.hostname)) return qbo.handle(url, init);
      if (/xero\.com$/.test(url.hostname)) return xero.handle(url, init);
      throw new Error(`Unexpected network call: ${url}`);
    }),
  );
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

const ctx = (provider: string) => ({ params: Promise.resolve({ provider }) });
const req = (path: string, token: string | null, init: RequestInit = {}) =>
  new Request(`https://app.test${path}`, { ...init, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), "content-type": "application/json", ...(init.headers as Record<string, string>) } });

async function routes() {
  return {
    list: (await import("@/app/api/integrations/route")).GET,
    status: (await import("@/app/api/integrations/[provider]/status/route")).GET,
    connect: (await import("@/app/api/integrations/[provider]/connect/route")).POST,
    connectGo: (await import("@/app/api/integrations/[provider]/connect/route")).GET,
    callback: (await import("@/app/api/integrations/[provider]/callback/route")).GET,
    test: (await import("@/app/api/integrations/[provider]/test/route")).POST,
    push: (await import("@/app/api/integrations/[provider]/push/route")).POST,
    disconnect: (await import("@/app/api/integrations/[provider]/disconnect/route")).POST,
    settings: (await import("@/app/api/integrations/[provider]/settings/route")).POST,
    links: (await import("@/app/api/integrations/[provider]/links/route")).GET,
  };
}

/** The value of a cookie a response sets ("" when it clears it, null when it doesn't mention it). */
function setCookie(res: Response, name: string): { value: string; attrs: string } | null {
  const c = res.headers.getSetCookie().find((x) => x.startsWith(`${name}=`));
  if (!c) return null;
  const [pair, ...attrs] = c.split(";");
  return { value: pair.slice(name.length + 1), attrs: attrs.map((a) => a.trim()).join("; ") };
}
const withCookie = (cookie: string) => ({ headers: { cookie } });

/** POST connect (signed in) → GET connect in the same browser → the provider's sign-in URL and the callback cookie. */
async function startConnect(provider: "quickbooks" | "xero", token = "tok-owner") {
  const r = await routes();
  const res = await r.connect(req(`/api/integrations/${provider}/connect`, token, { method: "POST" }), ctx(provider));
  expect(res.status).toBe(200);
  const { url: ticketUrl } = (await res.json()) as { url: string };
  const start = setCookie(res, "pp_oauth_start")!;
  const t = new URL(ticketUrl);
  const go = await r.connectGo(req(t.pathname + t.search, null, withCookie(`pp_oauth_start=${start.value}`)), ctx(provider));
  expect(go.status).toBe(303);
  const cookie = setCookie(go, "pp_oauth")!;
  return { ticketUrl, start, go, url: go.headers.get("location")!, cookie: cookie?.value, cookieAttrs: cookie?.attrs };
}

const callbackUrl = (provider: string, state: string) =>
  `/api/integrations/${provider}/callback?code=auth-code&state=${encodeURIComponent(state)}${provider === "quickbooks" ? "&realmId=4620816365" : ""}`;

/** Run the whole OAuth dance for the owner; returns the callback response. */
async function connect(provider: "quickbooks" | "xero", token = "tok-owner") {
  const r = await routes();
  const s = await startConnect(provider, token);
  const back = callbackUrl(provider, new URL(s.url).searchParams.get("state")!);
  return { ...s, back, res: await r.callback(req(back, null, withCookie(`pp_oauth=${s.cookie}`)), ctx(provider)) };
}

/** Put the document (and its payments) in the cloud as sync would, and send { docId }. */
function pushBody(doc: SalesDoc, payments: DocPayment[] = []) {
  const put = (table: string, row: Row) => {
    const rows = db.tables[table];
    const i = rows.findIndex((x) => x.id === row.id);
    if (i >= 0) rows[i] = row;
    else rows.push(row);
  };
  put("sales_documents", toRemote("salesDocs", doc as unknown as Record<string, unknown>));
  for (const p of payments) put("sales_document_payments", toRemote("salesPayments", p as unknown as Record<string, unknown>));
  return { method: "POST", body: JSON.stringify({ docId: doc.id }) };
}

// ---------------------------------------------------------------- tests

describe("access", () => {
  it("technicians are refused", async () => {
    const r = await routes();
    const res = await r.status(req("/api/integrations/quickbooks/status", "tok-tech"), ctx("quickbooks"));
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("office_only");
  });

  it("signed-out callers are refused", async () => {
    const r = await routes();
    expect((await r.list(req("/api/integrations", null))).status).toBe(401);
  });

  it("a lapsed subscription gets 402 for connect, test and push, but can still disconnect", async () => {
    const r = await routes();
    for (const [fn, path] of [[r.connect, "connect"], [r.test, "test"], [r.push, "push"]] as const) {
      const res = await fn(req(`/api/integrations/quickbooks/${path}`, "tok-lapsed", pushBody(invoice())), ctx("quickbooks"));
      expect(res.status).toBe(402);
      expect((await res.json()).code).toBe("subscription_inactive");
    }
    expect((await r.disconnect(req("/api/integrations/quickbooks/disconnect", "tok-lapsed", { method: "POST" }), ctx("quickbooks"))).status).toBe(200);
  });

  it("the subscription check is the database's own (team_can_write): a lapsed solo account is refused too", async () => {
    const r = await routes();
    for (const [fn, path] of [[r.connect, "connect"], [r.test, "test"], [r.push, "push"]] as const) {
      const res = await fn(req(`/api/integrations/quickbooks/${path}`, "tok-solo-lapsed", pushBody(invoice())), ctx("quickbooks"));
      expect(res.status, path).toBe(402);
      expect((await res.json()).code).toBe("subscription_inactive");
    }
  });

  it("before billing is enforced, a team whose trial date passed can still connect (as the database allows)", async () => {
    const r = await routes();
    const res = await r.connect(req("/api/integrations/quickbooks/connect", "tok-prelaunch", { method: "POST" }), ctx("quickbooks"));
    expect(res.status).toBe(200);
  });

  it("providers without keys are off (501, names the missing settings) and unknown ones are 404", async () => {
    vi.stubEnv("QBO_CLIENT_ID", "");
    const r = await routes();
    const res = await r.connect(req("/api/integrations/quickbooks/connect", "tok-owner", { method: "POST" }), ctx("quickbooks"));
    expect(res.status).toBe(501);
    expect((await res.json()).missing).toEqual(["QBO_CLIENT_ID"]);
    expect((await r.status(req("/api/integrations/sage/status", "tok-owner"), ctx("sage"))).status).toBe(404);
    const list = await (await r.list(req("/api/integrations", "tok-owner"))).json();
    expect(list.providers.map((p: { id: string; enabled: boolean; beta: boolean }) => [p.id, p.enabled, p.beta])).toEqual([["quickbooks", false, true], ["xero", true, true], ["billdu", true, false]]);
    expect(JSON.stringify(list)).not.toContain("qbo-secret");
  });
});

describe("QuickBooks Online", () => {
  it("connects, stores the tokens encrypted and lands back on Settings", async () => {
    const { url, res } = await connect("quickbooks");
    expect(url.startsWith("https://appcenter.intuit.com/connect/oauth2?")).toBe(true);
    expect(new URL(url).searchParams.get("redirect_uri")).toBe("https://app.test/api/integrations/quickbooks/callback");
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("https://app.test/settings?integration=quickbooks&result=connected#integrations");
    const row = db.tables.integration_connections[0];
    expect(row).toMatchObject({ owner_kind: "team", provider: "quickbooks", status: "connected", meta: { realmId: "4620816365", companyName: "Sandbox Co", environment: "sandbox" } });
    expect(String(row.token_payload)).not.toContain("qbo-access-1");
    expect(String(row.token_payload)).not.toContain("qbo-refresh-1");
    const r = await routes();
    const status = await (await r.status(req("/api/integrations/quickbooks/status", "tok-owner"), ctx("quickbooks"))).json();
    expect(status.connection).toMatchObject({ status: "connected", companyName: "Sandbox Co" });
    expect(status.events[0]).toMatchObject({ kind: "connect", ok: true });
    expect(JSON.stringify(status)).not.toContain("qbo-access");
  });

  it("pushes an issued invoice once, with a requestid, lines adding up to the total; then updates and voids", async () => {
    await connect("quickbooks");
    const r = await routes();
    const doc = invoice();
    const res = await r.push(req("/api/integrations/quickbooks/push", "tok-owner", pushBody(doc)), ctx("quickbooks"));
    const report = await res.json();
    expect(res.status).toBe(200);
    expect(report).toMatchObject({ status: "sent", warnings: [] });
    const sent = qbo.calls.filter((c) => c.method === "POST" && c.url.pathname.endsWith("/invoice"));
    expect(sent.length).toBe(1);
    const requestId = sent[0].url.searchParams.get("requestid");
    expect(requestId).toMatch(/^[0-9a-f-]{36}$/);
    const body = sent[0].body as { DocNumber: string; Line: { Amount: number; DetailType: string; SalesItemLineDetail?: { TaxCodeRef: { value: string } } }[]; CustomerRef: { value: string } };
    expect(body.DocNumber).toBe(doc.number);
    const sum = body.Line.reduce((s, l) => s + (l.DetailType === "DiscountLineDetail" ? -l.Amount : l.Amount), 0);
    expect(Math.round(sum * 100) / 100).toBe(doc.total);
    expect(body.Line.filter((l) => l.SalesItemLineDetail).every((l) => l.SalesItemLineDetail!.TaxCodeRef.value === "NON")).toBe(true);
    expect(qbo.calls.some((c) => c.url.pathname.endsWith("/customer"))).toBe(true);

    // Same content again: nothing is sent.
    const again = await (await r.push(req("/api/integrations/quickbooks/push", "tok-owner", pushBody(doc)), ctx("quickbooks"))).json();
    expect(again.status).toBe("unchanged");
    expect(qbo.calls.filter((c) => c.method === "POST" && c.url.pathname.endsWith("/invoice")).length).toBe(1);

    // Changed: an update with the current SyncToken (sparse), and a new requestid.
    const changed = withTotals({ ...doc, lines: [...doc.lines, item({ qty: 1, unitPrice: 10 })] });
    const upd = await (await r.push(req("/api/integrations/quickbooks/push", "tok-owner", pushBody(changed)), ctx("quickbooks"))).json();
    expect(upd.status).toBe("sent");
    const update = qbo.calls.filter((c) => c.method === "POST" && c.url.pathname.endsWith("/invoice")).at(-1)!;
    expect(update.body).toMatchObject({ Id: report.remoteId, SyncToken: "0", sparse: true });
    expect(update.url.searchParams.get("requestid")).not.toBe(requestId);

    // Void here → void there.
    const voided = await (await r.push(req("/api/integrations/quickbooks/push", "tok-owner", pushBody({ ...changed, status: "void" })), ctx("quickbooks"))).json();
    expect(voided.status).toBe("voided");
    expect(qbo.calls.at(-1)!.url.searchParams.get("operation")).toBe("void");
    expect(qbo.store[report.remoteId].status).toBe("void");

    const links = await (await r.links(req(`/api/integrations/quickbooks/links?ids=${doc.id}`, "tok-owner"), ctx("quickbooks"))).json();
    expect(links.links[0]).toMatchObject({ localId: doc.id, remoteStatus: "void", lastError: null });
  });

  it("a retry after fixing the mapping goes out with a new requestid (not QuickBooks' saved failure)", async () => {
    await connect("quickbooks");
    const r = await routes();
    const save = (itemId: string) => r.settings(req("/api/integrations/quickbooks/settings", "tok-owner", { method: "POST", body: JSON.stringify({ settings: { itemId } }) }), ctx("quickbooks"));
    await save("bad");
    const doc = invoice();
    const failed = await r.push(req("/api/integrations/quickbooks/push", "tok-owner", pushBody(doc)), ctx("quickbooks"));
    expect(failed.status).toBe(502);
    const first = qbo.calls.filter((c) => c.method === "POST" && c.url.pathname.endsWith("/invoice")).at(-1)!.url.searchParams.get("requestid");
    await save("7");
    const ok = await (await r.push(req("/api/integrations/quickbooks/push", "tok-owner", pushBody(doc)), ctx("quickbooks"))).json();
    expect(ok.status).toBe("sent");
    const second = qbo.calls.filter((c) => c.method === "POST" && c.url.pathname.endsWith("/invoice")).at(-1)!.url.searchParams.get("requestid");
    expect(second).not.toBe(first);
  });

  it("never sends drafts or quotes", async () => {
    await connect("quickbooks");
    const r = await routes();
    const draft = await r.push(req("/api/integrations/quickbooks/push", "tok-owner", pushBody(invoice({ status: "draft" }))), ctx("quickbooks"));
    expect(draft.status).toBe(400);
    expect((await draft.json()).code).toBe("draft");
    const quote = await r.push(req("/api/integrations/quickbooks/push", "tok-owner", pushBody(invoice({ kind: "quote" }))), ctx("quickbooks"));
    expect((await quote.json()).code).toBe("wrong_kind");
    expect(qbo.calls.some((c) => c.url.pathname.endsWith("/invoice"))).toBe(false);
  });

  it("pushes the cloud copy, not what the browser sends", async () => {
    await connect("quickbooks");
    const r = await routes();
    const doc = invoice();
    const pay: DocPayment = { id: "pay-cloud", projectId: "p1", documentId: doc.id, amount: 25, date: "2026-11-20", method: "cash", createdAt: NOW, updatedAt: NOW };
    pushBody(doc, [pay]);
    // A tampered body: other lines, a made-up payment. Only docId is read.
    const forgedDoc = withTotals({ ...doc, number: "INV-FAKE", lines: [item({ qty: 1, unitPrice: 1 })] });
    const fake: DocPayment = { ...pay, id: "pay-fake", amount: 9999 };
    const out = await (await r.push(req("/api/integrations/quickbooks/push", "tok-owner", { method: "POST", body: JSON.stringify({ docId: doc.id, doc: forgedDoc, payments: [fake] }) }), ctx("quickbooks"))).json();
    expect(out.status).toBe("sent");
    const sent = qbo.calls.find((c) => c.method === "POST" && c.url.pathname.endsWith("/invoice"))!.body as { DocNumber: string };
    expect(sent.DocNumber).toBe(doc.number);
    expect(out.payments).toEqual([{ id: "pay-cloud", status: "sent" }]);
    expect(qbo.calls.find((c) => c.url.pathname.endsWith("/payment"))!.body).toMatchObject({ TotalAmt: 25 });
  });

  it("refuses documents that aren't in the cloud, deleted ones, drafts and void ones that never went out", async () => {
    await connect("quickbooks");
    const r = await routes();
    const send = async (init: { body: string }) => {
      const res = await r.push(req("/api/integrations/quickbooks/push", "tok-owner", { method: "POST", body: init.body }), ctx("quickbooks"));
      return [res.status, (await res.json()).code];
    };
    expect(await send({ body: JSON.stringify({ docId: "nope" }) })).toEqual([404, "not_found"]);
    expect(await send(pushBody(invoice({ deleted: true })))).toEqual([400, "deleted"]);
    expect(await send(pushBody(invoice({ status: "draft" })))).toEqual([400, "draft"]);
    expect(await send(pushBody(invoice({ status: "void" })))).toEqual([400, "void"]);
    expect(await send({ body: JSON.stringify({ doc: invoice() }) })).toEqual([400, "bad_request"]);
    // A job shared from another company: its invoice is visible, but it isn't this company's to send.
    const foreign = invoice();
    pushBody(foreign);
    db.tables.sales_documents.find((x) => x.id === foreign.id)!.owner_id = "owner-of-someone-else";
    expect(await send({ body: JSON.stringify({ docId: foreign.id }) })).toEqual([404, "not_found"]);
    db.tables.sales_documents.find((x) => x.id === foreign.id)!.owner_id = "owner-of-u-owner";
    const own = await r.push(req("/api/integrations/quickbooks/push", "tok-owner", { method: "POST", body: JSON.stringify({ docId: foreign.id }) }), ctx("quickbooks"));
    expect(own.status).toBe(200);
    qbo.calls.length = 0;
    expect(qbo.calls.some((c) => c.url.pathname.endsWith("/invoice"))).toBe(false);
    // Request problems never mark the connection as failing.
    expect(db.tables.integration_connections[0].last_error ?? null).toBeNull();
  });

  it("sends payments against the invoice and credit notes as credit memos", async () => {
    await connect("quickbooks");
    const r = await routes();
    const doc = invoice();
    const pay: DocPayment = { id: "pay-1", projectId: "p1", documentId: doc.id, amount: 100, date: "2026-11-20", method: "check", reference: "1043", createdAt: NOW, updatedAt: NOW };
    const out = await (await r.push(req("/api/integrations/quickbooks/push", "tok-owner", pushBody(doc, [pay])), ctx("quickbooks"))).json();
    expect(out.payments).toEqual([{ id: "pay-1", status: "sent" }]);
    const p = qbo.calls.find((c) => c.url.pathname.endsWith("/payment"))!;
    expect(p.body).toMatchObject({ TotalAmt: 100, TxnDate: "2026-11-20", PaymentRefNum: "1043", Line: [{ Amount: 100, LinkedTxn: [{ TxnId: out.remoteId, TxnType: "Invoice" }] }] });
    expect(p.url.searchParams.get("requestid")).toBeTruthy();

    const cn = withTotals({ ...invoice(), id: "cn-1", kind: "credit_note", number: "CN-1", dueDate: null });
    const c = await (await r.push(req("/api/integrations/quickbooks/push", "tok-owner", pushBody(cn)), ctx("quickbooks"))).json();
    expect(c.status).toBe("sent");
    const memo = qbo.calls.find((x) => x.url.pathname.endsWith("/creditmemo"))!;
    const lines = (memo.body as { Line: { Amount: number; DetailType: string }[] }).Line;
    expect(Math.round(lines.reduce((s, l) => s + (l.DetailType === "DiscountLineDetail" ? -l.Amount : l.Amount), 0) * 100) / 100).toBe(cn.total);
  });

  it("warns when QuickBooks' total differs", async () => {
    await connect("quickbooks");
    qbo.skew(0.5);
    const r = await routes();
    const out = await (await r.push(req("/api/integrations/quickbooks/push", "tok-owner", pushBody(invoice())), ctx("quickbooks"))).json();
    expect(out.warnings[0]).toMatch(/QuickBooks Online shows .* Northpin shows/);
  });

  it("refreshes after a 401 and retries the request", async () => {
    await connect("quickbooks");
    qbo.expireAccess();
    const r = await routes();
    const res = await r.push(req("/api/integrations/quickbooks/push", "tok-owner", pushBody(invoice())), ctx("quickbooks"));
    expect(res.status).toBe(200);
    expect(qbo.calls.filter((c) => c.url.hostname === "oauth.platform.intuit.com").length).toBe(2); // code + one refresh
    const tries = qbo.calls.filter((c) => c.url.pathname.endsWith("/query"));
    expect(tries.map((c) => c.headers.get("authorization"))).toEqual(["Bearer qbo-access-1", "Bearer qbo-access-r1"]); // 401, then OK
    const inv = qbo.calls.filter((c) => c.url.pathname.endsWith("/invoice"));
    expect(inv.length).toBe(1);
    expect(db.tables.integration_connections[0].version).toBe(2);
  });

  it("disconnect revokes and forgets the tokens but keeps the mapping", async () => {
    await connect("quickbooks");
    const r = await routes();
    await r.settings(req("/api/integrations/quickbooks/settings", "tok-owner", { method: "POST", body: JSON.stringify({ settings: { itemId: "7", bogus: "x" } }) }), ctx("quickbooks"));
    const res = await r.disconnect(req("/api/integrations/quickbooks/disconnect", "tok-owner", { method: "POST" }), ctx("quickbooks"));
    expect(res.status).toBe(200);
    expect(qbo.calls.some((c) => c.url.hostname === "developer.api.intuit.com")).toBe(true);
    const row = db.tables.integration_connections[0];
    expect(row).toMatchObject({ status: "disconnected", token_payload: null, settings: { itemId: "7" } });
    const push = await r.push(req("/api/integrations/quickbooks/push", "tok-owner", pushBody(invoice())), ctx("quickbooks"));
    expect(push.status).toBe(412);
  });
});

describe("OAuth callback", () => {
  it("works once: replaying the callback URL is refused", async () => {
    const { back, res, cookie } = await connect("quickbooks");
    expect(res.headers.get("location")).toContain("result=connected");
    expect(setCookie(res, "pp_oauth")).toMatchObject({ value: "", attrs: expect.stringContaining("Max-Age=0") });
    const r = await routes();
    const again = await r.callback(req(back, null, withCookie(`pp_oauth=${cookie}`)), ctx("quickbooks"));
    expect(again.headers.get("location")).toContain("result=expired");
    expect(qbo.calls.filter((c) => c.url.hostname === "oauth.platform.intuit.com").length).toBe(1);
  });

  it("sets the sign-in cookies HttpOnly, Secure, SameSite=Lax, scoped to their path, for ten minutes", async () => {
    const s = await startConnect("xero");
    expect(s.start.attrs).toBe("HttpOnly; Secure; SameSite=Lax; Path=/api/integrations/xero/connect; Max-Age=600");
    expect(s.cookieAttrs).toBe("HttpOnly; Secure; SameSite=Lax; Path=/api/integrations/xero/callback; Max-Age=600");
    expect(setCookie(s.go, "pp_oauth_start")?.value).toBe("");
    // Only the hash is stored, never the cookie itself.
    const row = db.tables.integration_oauth_states[0];
    expect(row.cookie_hash).toBe(createHash("sha256").update(s.cookie!).digest("hex"));
    expect(JSON.stringify(row)).not.toContain(s.cookie!);
    expect(new URL(s.ticketUrl).pathname).toBe("/api/integrations/xero/connect");
    expect(s.url.startsWith("https://login.xero.com/")).toBe(true);
  });

  it("login CSRF: a victim's browser can't finish a sign-in someone else started (no cookie, wrong cookie)", async () => {
    // The attacker starts a sign-in for their own company and lures the victim to the provider with that state.
    const r = await routes();
    const s = await startConnect("quickbooks");
    const back = callbackUrl("quickbooks", new URL(s.url).searchParams.get("state")!);
    for (const headers of [{}, withCookie("pp_oauth=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA").headers, withCookie(`other=${s.cookie}`).headers]) {
      const out = await r.callback(req(back, null, { headers }), ctx("quickbooks"));
      expect(out.headers.get("location")).toContain("result=expired");
    }
    expect(qbo.calls.some((c) => c.url.hostname === "oauth.platform.intuit.com")).toBe(false);
    expect(db.tables.integration_connections.length).toBe(0);
    // ...and the attempts didn't burn the sign-in: the browser that started it can still finish.
    const ok = await r.callback(req(back, null, withCookie(`pp_oauth=${s.cookie}`)), ctx("quickbooks"));
    expect(ok.headers.get("location")).toContain("result=connected");
  });

  it("the GET connect link only works in the browser that asked for it, once", async () => {
    const r = await routes();
    const res = await r.connect(req("/api/integrations/xero/connect", "tok-owner", { method: "POST" }), ctx("xero"));
    const { url } = (await res.json()) as { url: string };
    const start = setCookie(res, "pp_oauth_start")!.value;
    const t = new URL(url);
    const path = t.pathname + t.search;
    // Sent to someone else: no start cookie, or another one.
    for (const headers of [{}, withCookie("pp_oauth_start=BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB").headers]) {
      const out = await r.connectGo(req(path, null, { headers }), ctx("xero"));
      expect(out.headers.get("location")).toContain("result=expired");
    }
    // A forged or foreign ticket.
    const forged = await r.connectGo(req("/api/integrations/xero/connect?ticket=abc.def", null, withCookie(`pp_oauth_start=${start}`)), ctx("xero"));
    expect(forged.headers.get("location")).toContain("result=expired");
    const cross = await r.connectGo(req(`/api/integrations/quickbooks/connect${t.search}`, null, withCookie(`pp_oauth_start=${start}`)), ctx("quickbooks"));
    expect(cross.headers.get("location")).toContain("result=expired");
    // The right browser goes on to Xero; a second use of the same link is refused.
    const go = await r.connectGo(req(path, null, withCookie(`pp_oauth_start=${start}`)), ctx("xero"));
    expect(go.headers.get("location")).toMatch(/^https:\/\/login\.xero\.com\//);
    const twice = await r.connectGo(req(path, null, withCookie(`pp_oauth_start=${start}`)), ctx("xero"));
    expect(twice.headers.get("location")).toContain("result=expired");
  });

  it("refuses when whoever started the sign-in is no longer the owner or an admin", async () => {
    const r = await routes();
    const s = await startConnect("quickbooks");
    db.members.find((m) => m.user_id === "u-owner")!.role = "tech";
    const out = await r.callback(req(callbackUrl("quickbooks", new URL(s.url).searchParams.get("state")!), null, withCookie(`pp_oauth=${s.cookie}`)), ctx("quickbooks"));
    expect(out.headers.get("location")).toContain("result=error");
    expect(db.tables.integration_connections.length).toBe(0);
    expect(qbo.calls.some((c) => c.url.hostname === "oauth.platform.intuit.com")).toBe(false);
    expect(db.tables.integration_events.at(-1)).toMatchObject({ kind: "connect", ok: false });
  });

  it("connect is rate-limited per user", async () => {
    const r = await routes();
    let last: Response | null = null;
    for (let i = 0; i < 11; i++) last = await r.connect(req("/api/integrations/xero/connect", "tok-owner", { method: "POST" }), ctx("xero"));
    expect(last!.status).toBe(429);
    expect(last!.headers.get("retry-after")).toBeTruthy();
  });

  it("refuses a tampered or foreign state", async () => {
    const r = await routes();
    const s = await startConnect("quickbooks");
    const state = new URL(s.url).searchParams.get("state")!;
    const [body, sig] = state.split(".");
    const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(body, "base64url").toString()), i: "00000000-0000-0000-0000-0000000000a2" })).toString("base64url");
    for (const bad of [`${forged}.${sig}`, `${body}.${sig}x`, "garbage"]) {
      const out = await r.callback(req(`/api/integrations/quickbooks/callback?code=c&realmId=1&state=${encodeURIComponent(bad)}`, null, withCookie(`pp_oauth=${s.cookie}`)), ctx("quickbooks"));
      expect(out.headers.get("location")).toContain("result=expired");
    }
    // A QuickBooks state is no good for Xero.
    const cross = await r.callback(req(`/api/integrations/xero/callback?code=c&state=${encodeURIComponent(state)}`, null, withCookie(`pp_oauth=${s.cookie}`)), ctx("xero"));
    expect(cross.headers.get("location")).toContain("result=expired");
    expect(db.tables.integration_connections.length).toBe(0);
  });

  it("records a cancelled sign-in", async () => {
    const r = await routes();
    const s = await startConnect("xero");
    const state = new URL(s.url).searchParams.get("state")!;
    const out = await r.callback(req(`/api/integrations/xero/callback?error=access_denied&state=${encodeURIComponent(state)}`, null, withCookie(`pp_oauth=${s.cookie}`)), ctx("xero"));
    expect(out.headers.get("location")).toContain("result=cancelled");
    expect(db.tables.integration_events.at(-1)).toMatchObject({ kind: "connect", ok: false });
  });

  it("a dead refresh token marks the connection needs_reconnect", async () => {
    await connect("quickbooks");
    const { encrypt } = await import("@/lib/server/secrets");
    const row = db.tables.integration_connections[0];
    row.token_payload = encrypt(JSON.stringify({ accessToken: "old", refreshToken: "dead", expiresAt: "2020-01-01T00:00:00Z", refreshExpiresAt: null }), `pinplan:integration:team:${row.owner_id}:quickbooks`);
    const r = await routes();
    const res = await r.push(req("/api/integrations/quickbooks/push", "tok-owner", pushBody(invoice())), ctx("quickbooks"));
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("needs_reconnect");
    expect(row.status).toBe("needs_reconnect");
    const status = await (await r.status(req("/api/integrations/quickbooks/status", "tok-owner"), ctx("quickbooks"))).json();
    expect(status.connection.status).toBe("needs_reconnect");
  });
});

describe("Xero", () => {
  it("connects with PKCE and pushes invoices and credit notes with an Idempotency-Key", async () => {
    const { url, res } = await connect("xero");
    const u = new URL(url);
    expect(u.origin + u.pathname).toBe("https://login.xero.com/identity/connect/authorize");
    expect(u.searchParams.get("code_challenge_method")).toBe("S256");
    expect(u.searchParams.get("code_challenge")).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(res.headers.get("location")).toContain("result=connected");
    const tokenCall = xero.calls.find((c) => c.url.hostname === "identity.xero.com")!;
    expect(new URLSearchParams(String(tokenCall.body)).get("code_verifier")).toMatch(/^[A-Za-z0-9_-]{64}$/);

    const r = await routes();
    await r.settings(req("/api/integrations/xero/settings", "tok-owner", { method: "POST", body: JSON.stringify({ settings: { accountCode: "200", taxAccountCode: "820", paymentAccountCode: "090" } }) }), ctx("xero"));
    const doc = invoice();
    const pay: DocPayment = { id: "xp-1", projectId: "p1", documentId: doc.id, amount: 50, date: "2026-11-21", method: "card", createdAt: NOW, updatedAt: NOW };
    const out = await (await r.push(req("/api/integrations/xero/push", "tok-owner", pushBody(doc, [pay])), ctx("xero"))).json();
    expect(out).toMatchObject({ status: "sent", warnings: [], payments: [{ id: "xp-1", status: "sent" }] });
    const inv = xero.calls.find((c) => c.url.pathname.endsWith("/Invoices"))!;
    expect(inv.headers.get("Idempotency-Key")).toMatch(/^[0-9a-f-]{36}$/);
    expect(inv.headers.get("Xero-tenant-id")).toBe("tenant-1");
    const body = (inv.body as { Invoices: { Type: string; LineAmountTypes: string; LineItems: { AccountCode: string; Description: string }[] }[] }).Invoices[0];
    expect(body).toMatchObject({ Type: "ACCREC", LineAmountTypes: "NoTax" });
    expect(body.LineItems.filter((l) => l.Description.includes("Tax")).every((l) => l.AccountCode === "820")).toBe(true);
    const payCall = xero.calls.find((c) => c.url.pathname.endsWith("/Payments"))!;
    expect(payCall.method).toBe("PUT");
    expect(payCall.body).toMatchObject({ Payments: [{ Invoice: { InvoiceID: out.remoteId }, Account: { Code: "090" }, Amount: 50 }] });

    const cn = withTotals({ ...invoice(), id: "xcn-1", kind: "credit_note", number: "CN-9", dueDate: null });
    await r.push(req("/api/integrations/xero/push", "tok-owner", pushBody(cn)), ctx("xero"));
    const credit = xero.calls.find((c) => c.url.pathname.endsWith("/CreditNotes"))!;
    expect((credit.body as { CreditNotes: Row[] }).CreditNotes[0]).toMatchObject({ Type: "ACCRECCREDIT", CreditNoteNumber: "CN-9" });
  });

  it("test reports the organisation", async () => {
    await connect("xero");
    const r = await routes();
    const out = await (await r.test(req("/api/integrations/xero/test", "tok-owner", { method: "POST" }), ctx("xero"))).json();
    expect(out).toMatchObject({ ok: true, message: "Connected to Demo Org." });
  });
});

describe("accountant export settings", () => {
  it("saves account names per company", async () => {
    const r = await routes();
    const res = await r.settings(req("/api/integrations/export/settings", "tok-owner", { method: "POST", body: JSON.stringify({ settings: { arAccount: "A/R", taxItem: "Tax", nonsense: "x" } }) }), ctx("export"));
    expect(res.status).toBe(200);
    const list = await (await r.list(req("/api/integrations", "tok-owner"))).json();
    expect(list.exportAccounts).toMatchObject({ arAccount: "A/R", taxItem: "Tax", incomeAccount: "Sales" });
    expect(list.exportAccounts.nonsense).toBeUndefined();
  });
});
