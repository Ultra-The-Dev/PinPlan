// Per-company Billdu credentials: who gets which credentials, encryption bound to the owner, and the routes
// (save / test / delete / move) against a fake Supabase + fake Billdu. The secret must never come back in a response.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const SB = "http://sb.test";
const GLOBAL_KEY = "GLOBALKEY-0001";
const GLOBAL_SECRET = "global-secret-do-not-leak";
const TEAM_KEY = "TEAMKEY-2222";
const TEAM_SECRET = "team-secret-do-not-leak";

type Member = { role: "owner" | "admin" | "tech"; team_id: string; plan_status: string; name: string };
// user id → membership. "solo" has none.
const MEMBERS: Record<string, Member> = {
  founder: { role: "owner", team_id: "t-founder", plan_status: "comped", name: "Founder" },
  acme: { role: "owner", team_id: "t-acme", plan_status: "trialing", name: "Acme Owner" },
  acmeadmin: { role: "admin", team_id: "t-acme", plan_status: "active", name: "Acme Admin" },
  acmetech: { role: "tech", team_id: "t-acme", plan_status: "active", name: "Acme Tech" },
  // Comped, but not the founder's company: no server-wide fallback.
  friend: { role: "owner", team_id: "t-friend", plan_status: "comped", name: "Friend" },
};

let store: Map<string, Record<string, unknown>>;
let billduKeys: string[];
let serviceCalls: number;

function fakeFetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  const url = new URL(String(input instanceof Request ? input.url : input));
  const method = (init?.method ?? "GET").toUpperCase();
  const headers = new Headers(init?.headers);
  const json = (b: unknown, status = 200) => Promise.resolve(Response.json(b, { status }));
  if (url.origin === "https://api.billdu.com") {
    const key = url.searchParams.get("apiKey") ?? "";
    billduKeys.push(key);
    if (key.startsWith("BAD")) return json({ error: "Invalid API key" }, 401);
    return json({ items: [{ id: 1 }] });
  }
  if (url.origin !== SB) return json({}, 404);
  const auth = headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (url.pathname === "/auth/v1/user") {
    const m = auth.match(/^tok-(\w+)$/);
    return m ? json({ id: m[1] }) : json({ msg: "bad jwt" }, 401);
  }
  if (url.pathname === "/rest/v1/team_members") {
    const uid = (url.searchParams.get("user_id") ?? "").replace(/^eq\./, "");
    // RLS: the caller must be signed in (their own token).
    if (!auth.startsWith("tok-")) return json([]);
    const m = MEMBERS[uid];
    if (!m) return json([]);
    if (url.searchParams.get("select")?.startsWith("role"))
      return json([{ role: m.role, team_id: m.team_id, teams: { id: m.team_id, name: `${m.team_id} co`, plan_status: m.plan_status } }]);
    return json([{ name: m.name, email: `${uid}@example.com` }]);
  }
  const t = url.pathname.match(/^\/rest\/v1\/(team_secrets|user_secrets)$/);
  if (t) {
    serviceCalls++;
    if (auth !== "svc" || headers.get("apikey") !== "svc") return json({ message: "permission denied" }, 401);
    const col = t[1] === "team_secrets" ? "team_id" : "user_id";
    const id = (url.searchParams.get(col) ?? "").replace(/^eq\./, "");
    if (method === "GET") {
      const row = store.get(`${t[1]}:${id}`);
      return json(row ? [row] : []);
    }
    if (method === "POST") {
      const body = JSON.parse(String(init!.body));
      store.set(`${t[1]}:${body[col]}`, body);
      return Promise.resolve(new Response(null, { status: 201 }));
    }
    if (method === "PATCH") {
      const row = store.get(`${t[1]}:${id}`);
      if (row) Object.assign(row, JSON.parse(String(init!.body)));
      return Promise.resolve(new Response(null, { status: 204 }));
    }
    if (method === "DELETE") {
      store.delete(`${t[1]}:${id}`);
      return Promise.resolve(new Response(null, { status: 204 }));
    }
  }
  return json({ message: "not found" }, 404);
}

function req(path: string, opts: { user?: string; code?: string; method?: string; body?: unknown } = {}) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (opts.user) headers.authorization = `Bearer tok-${opts.user}`;
  if (opts.code) headers["x-pinplan-access"] = opts.code;
  return new Request(`http://localhost${path}`, { method: opts.method ?? "POST", headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) });
}

const routes = {
  creds: () => import("@/app/api/billdu/credentials/route"),
  test: () => import("@/app/api/billdu/test/route"),
  send: () => import("@/app/api/billdu/send/route"),
};

async function testAs(opts: { user?: string; code?: string }) {
  const { POST } = await routes.test();
  return POST(req("/api/billdu/test", opts));
}
async function saveAs(user: string, body: unknown) {
  const { POST } = await routes.creds();
  return POST(req("/api/billdu/credentials", { user, body }));
}
async function statusAs(opts: { user?: string; code?: string }) {
  const { GET } = await routes.creds();
  return GET(req("/api/billdu/credentials", { ...opts, method: "GET" }));
}

beforeEach(() => {
  store = new Map();
  billduKeys = [];
  serviceCalls = 0;
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", SB);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "svc");
  vi.stubEnv("PINPLAN_ENCRYPTION_KEY", "test-encryption-key");
  vi.stubEnv("PINPLAN_ACCESS_CODE", "the-team-code");
  vi.stubEnv("PINPLAN_ALLOW_ACCESS_CODE", "1");
  vi.stubEnv("PINPLAN_FOUNDER_TEAM_ID", "t-founder");
  vi.stubEnv("BILLDU_API_KEY", GLOBAL_KEY);
  vi.stubEnv("BILLDU_API_SECRET", GLOBAL_SECRET);
  vi.stubGlobal("fetch", vi.fn(fakeFetch));
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("encryption", () => {
  it("round-trips, and a payload bound to one team doesn't decrypt for another", async () => {
    const { encrypt, decrypt } = await import("@/lib/server/secrets");
    const { secretAad } = await import("@/lib/server/billduCreds");
    const a = secretAad({ kind: "team", id: "t-a" });
    const p = encrypt("hello", a);
    expect(p).not.toContain("hello");
    expect(decrypt(p, a)).toBe("hello");
    expect(() => decrypt(p, secretAad({ kind: "team", id: "t-b" }))).toThrow();
    expect(() => decrypt(p)).toThrow();
    expect(() => decrypt(p, secretAad({ kind: "user", id: "t-a" }))).toThrow();
    // The old, unbound format keeps working for the server-wide credentials.
    expect(decrypt(encrypt("plain"))).toBe("plain");
  });

  it("a row copied from one team to another is reported as unreadable, not used", async () => {
    expect((await saveAs("acme", { apiKey: TEAM_KEY, apiSecret: TEAM_SECRET })).status).toBe(200);
    // Copy Acme's encrypted row onto the founder's team.
    store.set("team_secrets:t-founder", { ...store.get("team_secrets:t-acme")!, team_id: "t-founder" });
    const s = await (await statusAs({ user: "founder" })).json();
    expect(s.configured).toBe(false);
    expect(s.own.error).toMatch(/can't be read any more/);
    expect(s.own.error).not.toMatch(/PINPLAN_ENCRYPTION_KEY/);
    const r = await testAs({ user: "founder" });
    expect(r.status).toBe(500);
    expect(billduKeys).toEqual([]);
  });
});

describe("whose credentials a caller uses", () => {
  it("a comped team that isn't the founder's (PINPLAN_FOUNDER_TEAM_ID) gets no server-wide fallback", async () => {
    const r = await testAs({ user: "friend" });
    expect(r.status).toBe(412);
    expect((await r.json()).error).toMatch(/Settings → Connected apps → Billdu/);
    const s = await (await statusAs({ user: "friend" })).json();
    expect(s).toMatchObject({ configured: false, server: null, canMoveServer: false, canChangeServer: false });
    expect(billduKeys).toEqual([]);
    // Without PINPLAN_FOUNDER_TEAM_ID nobody gets the fallback, the founder included.
    vi.stubEnv("PINPLAN_FOUNDER_TEAM_ID", "");
    expect((await testAs({ user: "founder" })).status).toBe(412);
  });

  it("founder (PINPLAN_FOUNDER_TEAM_ID) without its own row falls back to the server-wide credentials", async () => {
    const r = await testAs({ user: "founder" });
    expect(r.status).toBe(200);
    expect((await r.json()).source).toBe("env");
    expect(billduKeys).toEqual([GLOBAL_KEY]);
    const s = await (await statusAs({ user: "founder" })).json();
    expect(s).toMatchObject({ mode: "team", configured: true, source: "env", canMoveServer: true, server: { configured: true, keyHint: "GL…0001" } });
  });

  it("any other team never gets the server-wide credentials", async () => {
    for (const user of ["acme", "acmeadmin"]) {
      const r = await testAs({ user });
      expect(r.status).toBe(412);
      expect((await r.json()).code).toBe("not_configured");
      const res = await statusAs({ user });
      const text = await res.text();
      expect(JSON.parse(text)).toMatchObject({ mode: "team", configured: false, source: null, server: null, canMoveServer: false, keyHint: null });
      expect(text).not.toContain("0001");
      expect(text).not.toContain("GL");
    }
    const { POST } = await routes.send();
    const send = await POST(req("/api/billdu/send", { user: "acme", body: { project: { id: "p", clientName: "C" }, docType: "estimate", lines: [{ key: "dev:x", description: "X", qty: 1, unit: "each", unitPrice: 5, total: 5, included: true }] } }));
    expect(send.status).toBe(412);
    expect(billduKeys).toEqual([]);
  });

  it("a team with its own credentials uses them (owner saves, admin sends)", async () => {
    expect((await saveAs("acme", { apiKey: TEAM_KEY, apiSecret: TEAM_SECRET })).status).toBe(200);
    expect((await testAs({ user: "acmeadmin" })).status).toBe(200);
    expect(billduKeys).toEqual([TEAM_KEY]);
  });

  it("the founder's own row wins over the server-wide one", async () => {
    await saveAs("founder", { apiKey: TEAM_KEY, apiSecret: TEAM_SECRET });
    await testAs({ user: "founder" });
    expect(billduKeys).toEqual([TEAM_KEY]);
  });

  it("access code without a session (older iPad app) keeps the server-wide credentials when the server allows codes", async () => {
    const r = await testAs({ code: "the-team-code" });
    expect(r.status).toBe(200);
    expect(billduKeys).toEqual([GLOBAL_KEY]);
    expect(serviceCalls).toBe(0);
    expect((await testAs({ code: "wrong" })).status).toBe(401);
    expect((await testAs({})).status).toBe(401);
  });

  it("with accounts on, the access code is ignored unless PINPLAN_ALLOW_ACCESS_CODE=1", async () => {
    vi.stubEnv("PINPLAN_ALLOW_ACCESS_CODE", "");
    const r = await testAs({ code: "the-team-code" });
    expect(r.status).toBe(401);
    expect((await statusAs({ code: "the-team-code" })).status).toBe(401);
    expect(billduKeys).toEqual([]);
  });

  it("an access-code caller on a server with accounts can't save or remove the server-wide credentials", async () => {
    const { POST, DELETE } = await routes.creds();
    const save = await POST(req("/api/billdu/credentials", { code: "the-team-code", body: { apiKey: "NEWKEY-1", apiSecret: "s" } }));
    expect(save.status).toBe(403);
    const del = await DELETE(req("/api/billdu/credentials?target=server", { code: "the-team-code", method: "DELETE" }));
    expect(del.status).toBe(403);
    const del2 = await DELETE(req("/api/billdu/credentials", { code: "the-team-code", method: "DELETE" }));
    expect(del2.status).toBe(403);
    const s = await (await statusAs({ code: "the-team-code" })).json();
    expect(s).toMatchObject({ mode: "single_company", canChangeServer: false });
  });

  it("a session token wins over an access code sent with it", async () => {
    const r = await testAs({ user: "acme", code: "the-team-code" });
    expect(r.status).toBe(412);
    expect(billduKeys).toEqual([]);
  });

  it("technicians are refused", async () => {
    for (const call of [() => testAs({ user: "acmetech" }), () => statusAs({ user: "acmetech" }), () => saveAs("acmetech", { apiKey: "k", apiSecret: "s" })]) {
      const r = await call();
      expect(r.status).toBe(403);
      expect((await r.json()).code).toBe("office_only");
    }
    expect(store.size).toBe(0);
  });

  it("an expired session is refused", async () => {
    const { GET } = await routes.creds();
    const r = await GET(new Request("http://localhost/api/billdu/credentials", { headers: { authorization: "Bearer nope" } }));
    expect(r.status).toBe(401);
  });

  it("solo users (no team) get their own row and no server-wide fallback", async () => {
    expect((await testAs({ user: "solo" })).status).toBe(412);
    const s0 = await (await statusAs({ user: "solo" })).json();
    expect(s0).toMatchObject({ mode: "solo", configured: false, server: null });
    await saveAs("solo", { apiKey: TEAM_KEY, apiSecret: TEAM_SECRET });
    expect(store.has("user_secrets:solo")).toBe(true);
    expect((await testAs({ user: "solo" })).status).toBe(200);
    expect(billduKeys).toEqual([TEAM_KEY]);
  });

  it("single-company servers (no Supabase) keep the server-wide credentials", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    expect((await testAs({ code: "the-team-code" })).status).toBe(200);
    expect((await testAs({ code: "nope" })).status).toBe(401);
    const s = await (await statusAs({ code: "the-team-code" })).json();
    expect(s).toMatchObject({ mode: "single_company", configured: true, source: "env" });
    expect(billduKeys).toEqual([GLOBAL_KEY]);
  });

  it("a non-founder team without the service-role key can't store credentials and still gets no fallback", async () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    const s = await (await statusAs({ user: "acme" })).json();
    expect(s).toMatchObject({ configured: false, storageReady: false, storageCode: "missing_service_key" });
    // Users get a plain message; the setting's name is only in the code, for whoever runs the server.
    expect(s.storageMessage).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY/);
    const r = await saveAs("acme", { apiKey: TEAM_KEY, apiSecret: TEAM_SECRET });
    expect(r.status).toBe(500);
    expect(await r.json()).toMatchObject({ code: "storage_unavailable" });
    expect((await testAs({ user: "acme" })).status).toBe(412);
  });
});

describe("credential routes", () => {
  it("save → status → test → delete, never returning or storing the secret in the clear", async () => {
    const saved = await saveAs("acme", { apiKey: ` ${TEAM_KEY} `, apiSecret: TEAM_SECRET });
    const savedText = await saved.text();
    expect(saved.status).toBe(200);
    expect(savedText).not.toContain(TEAM_SECRET);
    expect(savedText).not.toContain(TEAM_KEY);
    expect(JSON.parse(savedText)).toMatchObject({ configured: true, source: "team", keyHint: "TE…2222", own: { updatedBy: "you", lastTest: null } });
    const row = store.get("team_secrets:t-acme")!;
    expect(JSON.stringify(row)).not.toContain(TEAM_SECRET);
    expect(row).toMatchObject({ team_id: "t-acme", name: "billdu", key_hint: "TE…2222", updated_by: "acme" });

    // Another office member sees who saved it.
    const s = await (await statusAs({ user: "acmeadmin" })).json();
    expect(s.own.updatedBy).toBe("Acme Owner");

    expect((await testAs({ user: "acmeadmin" })).status).toBe(200);
    expect(store.get("team_secrets:t-acme")).toMatchObject({ last_test_ok: true });
    const afterTest = await statusAs({ user: "acme" });
    const afterText = await afterTest.text();
    expect(JSON.parse(afterText).own.lastTest).toMatchObject({ ok: true });
    expect(afterText).not.toContain(TEAM_SECRET);

    const { DELETE } = await routes.creds();
    const del = await DELETE(req("/api/billdu/credentials", { user: "acmeadmin", method: "DELETE" }));
    expect(await del.json()).toMatchObject({ configured: false, own: null });
    expect(store.has("team_secrets:t-acme")).toBe(false);
  });

  it("records a failed test with Billdu's message", async () => {
    await saveAs("acme", { apiKey: "BADKEY-9999", apiSecret: TEAM_SECRET });
    const r = await testAs({ user: "acme" });
    expect(r.status).toBe(401);
    expect(await r.text()).not.toContain(TEAM_SECRET);
    expect(store.get("team_secrets:t-acme")).toMatchObject({ last_test_ok: false });
    expect(String(store.get("team_secrets:t-acme")!.last_test_message)).toMatch(/Invalid API key/);
  });

  it("validates the body", async () => {
    expect((await saveAs("acme", { apiKey: "k" })).status).toBe(400);
    expect((await saveAs("acme", { apiKey: "k".repeat(600), apiSecret: "s" })).status).toBe(400);
    expect((await saveAs("acme", { apiKey: 1, apiSecret: 2 })).status).toBe(400);
    expect(store.size).toBe(0);
  });

  it("the founder can move the server-wide credentials into the company; nobody else can", async () => {
    const no = await saveAs("acme", { action: "move_server_credentials" });
    expect(no.status).toBe(403);
    expect(store.size).toBe(0);
    const ok = await saveAs("founder", { action: "move_server_credentials" });
    const text = await ok.text();
    expect(ok.status).toBe(200);
    expect(text).not.toContain(GLOBAL_SECRET);
    expect(JSON.parse(text)).toMatchObject({ source: "team", canMoveServer: false, server: { configured: true, removable: false } });
    await testAs({ user: "founder" });
    expect(billduKeys).toEqual([GLOBAL_KEY]);
    expect(store.get("team_secrets:t-founder")).toMatchObject({ key_hint: "GL…0001" });
  });

  it("only the founder (or a single-company server) may remove the server-wide credentials", async () => {
    const { DELETE } = await routes.creds();
    const r = await DELETE(req("/api/billdu/credentials?target=server", { user: "acme", method: "DELETE" }));
    expect(r.status).toBe(403);
    const ok = await DELETE(req("/api/billdu/credentials?target=server", { user: "founder", method: "DELETE" }));
    // Env-var credentials can't be deleted from the app; the call succeeds and they stay.
    expect(ok.status).toBe(200);
  });

  it("rate-limits the connection test", async () => {
    await saveAs("acme", { apiKey: TEAM_KEY, apiSecret: TEAM_SECRET });
    for (let i = 0; i < 10; i++) expect((await testAs({ user: "acme" })).status).toBe(200);
    const r = await testAs({ user: "acme" });
    expect(r.status).toBe(429);
    expect(r.headers.get("Retry-After")).toBeTruthy();
    expect(billduKeys).toHaveLength(10);
  });
});
