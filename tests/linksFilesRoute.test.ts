// POST /api/links/files: a withdrawn link's images are deleted with the service role, whoever published it, but only
// for the publisher or the office of the job, and only once the link is withdrawn. fetch is mocked: no network.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const SB = "https://sb.example.co";
const TOKEN = "tok_abcdefghijklmnopqrstu";
type Call = { url: string; method: string; headers: Record<string, string>; body: unknown };
let calls: Call[];
let routes: Record<string, (url: string, init: RequestInit) => Response | Promise<Response>>;
let role: string | null;
let row: Record<string, unknown> | null;
let files: { name: string; id: string | null }[];

beforeEach(() => {
  vi.resetModules();
  calls = [];
  routes = {};
  role = "admin";
  row = { id: TOKEN, owner_id: "publisher", project_id: "p1", status: "revoked", revoked: true };
  files = [{ name: "s1.jpg", id: "f1" }, { name: "s2.jpg", id: "f2" }];
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", SB);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-key");
  vi.stubEnv("PINPLAN_ACCESS_CODE", "");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request, init: RequestInit = {}) => {
      const url = String(input instanceof Request ? input.url : input);
      const raw = init.body ? String(init.body) : "";
      calls.push({ url, method: init.method ?? "GET", headers: Object.fromEntries(new Headers(init.headers).entries()), body: raw ? JSON.parse(raw) : undefined });
      for (const [prefix, h] of Object.entries(routes)) if (url.startsWith(prefix)) return h(url, init);
      return new Response("not found", { status: 404 });
    }),
  );
  routes[`${SB}/auth/v1/user`] = () => Response.json({ id: "caller" });
  routes[`${SB}/rest/v1/team_members`] = () => Response.json(role ? [{ role }] : []);
  routes[`${SB}/rest/v1/proposals`] = () => Response.json(row ? [row] : []);
  routes[`${SB}/rest/v1/photo_reports`] = () => Response.json(row ? [row] : []);
  routes[`${SB}/storage/v1/object/list/proposals`] = () => Response.json(files);
  routes[`${SB}/storage/v1/object/proposals`] = () => Response.json([]);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const post = (body: unknown, auth = "Bearer user-token") =>
  new Request("https://app.example.com/api/links/files", { method: "POST", headers: { "Content-Type": "application/json", ...(auth ? { Authorization: auth } : {}) }, body: JSON.stringify(body) });
const load = async () => (await import("@/app/api/links/files/route")).POST;
const deletes = () => calls.filter((c) => c.method === "DELETE");
const listed = () => calls.filter((c) => c.url.includes("/storage/v1/object/list/")).map((c) => (c.body as { prefix: string }).prefix);

describe("POST /api/links/files", () => {
  it("an office admin removes a colleague's withdrawn proposal images with the service key", async () => {
    const r = await (await load())(post({ kind: "proposal", token: TOKEN }));
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ ok: true, removed: 2 });
    // The link row was read with the caller's own token (row-level security), not the service key.
    const read = calls.find((c) => c.url.startsWith(`${SB}/rest/v1/proposals`))!;
    expect(read.headers.authorization).toBe("Bearer user-token");
    expect(listed()).toEqual([`publisher/${TOKEN}`]);
    expect(deletes()).toHaveLength(1);
    expect(deletes()[0].headers.authorization).toBe("Bearer service-key");
    expect(deletes()[0].body).toEqual({ prefixes: [`publisher/${TOKEN}/s1.jpg`, `publisher/${TOKEN}/s2.jpg`] });
  });

  it("photo reports use the reports folder", async () => {
    const r = await (await load())(post({ kind: "photoReport", token: TOKEN }));
    expect(r.status).toBe(200);
    expect(listed()).toEqual([`publisher/reports/${TOKEN}`]);
  });

  it("the publisher may clean up their own link even as a technician", async () => {
    role = "tech";
    row = { ...row!, owner_id: "caller" };
    const r = await (await load())(post({ kind: "proposal", token: TOKEN }));
    expect(r.status).toBe(200);
    expect(listed()).toEqual([`caller/${TOKEN}`]);
  });

  it("a technician cannot remove someone else's link files", async () => {
    role = "tech";
    const r = await (await load())(post({ kind: "proposal", token: TOKEN }));
    expect(r.status).toBe(403);
    expect(deletes()).toHaveLength(0);
  });

  it("a link the caller can't see (another company's) is not found", async () => {
    row = null;
    const r = await (await load())(post({ kind: "proposal", token: TOKEN }));
    expect(r.status).toBe(404);
    expect(deletes()).toHaveLength(0);
    expect(calls.some((c) => c.url.includes("/storage/"))).toBe(false);
  });

  it("a live link's images are never touched", async () => {
    row = { ...row!, status: "viewed", revoked: false };
    for (const kind of ["proposal", "photoReport"]) {
      const r = await (await load())(post({ kind, token: TOKEN }));
      expect(r.status).toBe(409);
    }
    expect(calls.some((c) => c.url.includes("/storage/"))).toBe(false);
  });

  it("needs a signed-in caller and a well-formed request", async () => {
    expect((await (await load())(post({ kind: "proposal", token: TOKEN }, ""))).status).toBe(401);
    expect((await (await load())(post({ kind: "other", token: TOKEN }))).status).toBe(400);
    expect((await (await load())(post({ kind: "proposal", token: "../../x" }))).status).toBe(400);
    expect(deletes()).toHaveLength(0);
  });

  it("says so when storage fails, so the app can fall back", async () => {
    routes[`${SB}/storage/v1/object/proposals`] = () => new Response("boom", { status: 500 });
    const r = await (await load())(post({ kind: "proposal", token: TOKEN }));
    expect(r.status).toBe(502);
  });

  it("is unavailable without the service key", async () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    const r = await (await load())(post({ kind: "proposal", token: TOKEN }));
    expect(r.status).toBe(501);
  });
});

describe("expired proposals on the client page", () => {
  it("long-expired proposals (no snapshot) become a clear error naming the business", async () => {
    vi.doMock("@/lib/renderSheet", () => ({ renderSheet: vi.fn() }));
    vi.doMock("@/lib/supabase", () => ({ getSupabase: () => null }));
    const { publicProposalOf } = await import("@/lib/proposalCloud");
    expect(() => publicProposalOf({ status: "expired", expired: true, business: { name: "Sample Electric" } })).toThrow(/expired.*Sample Electric/);
    expect(publicProposalOf(null)).toBeNull();
    const full = { snapshot: { lines: [] }, status: "viewed", expired: false };
    expect(publicProposalOf(full)).toBe(full);
  });
});
