// DELETE /api/account: identifies the caller by their token, applies the team rules, removes their storage files
// and deletes the login with the service key.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/server", () => ({ connection: async () => undefined }));

const URL_ = "https://sb.example.co";
type Call = { method: string; url: string; headers: Record<string, string>; body: unknown };

const req = (token: string | null = "user-token") => new Request("http://localhost/api/account", { method: "DELETE", headers: token ? { Authorization: `Bearer ${token}` } : {} });

describe("DELETE /api/account", () => {
  let calls: Call[];
  let membership: { team_id: string; role: string }[];
  let members: { user_id: string }[];
  let projects: { id: string }[];
  let storage: Record<string, { name: string; id: string | null }[]>;

  beforeEach(() => {
    vi.resetModules();
    calls = [];
    membership = [];
    members = [];
    projects = [{ id: "p1" }];
    storage = {
      "plans:p1": [
        { name: "img1", id: "o1" },
        { name: "img2", id: "o2" },
      ],
      "proposals:u1": [{ name: "tok", id: null }],
      "proposals:u1/tok": [{ name: "s1.jpg", id: "o3" }],
    };
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", URL_);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-key");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input instanceof Request ? input.url : input);
        const method = init?.method ?? "GET";
        const body = init?.body ? JSON.parse(String(init.body)) : null;
        calls.push({ method, url, headers: Object.fromEntries(new Headers(init?.headers).entries()), body });
        const path = url.slice(URL_.length);
        if (path === "/auth/v1/user") return new Headers(init?.headers).get("authorization") === "Bearer user-token" ? Response.json({ id: "u1" }) : new Response("bad jwt", { status: 401 });
        if (path.startsWith("/rest/v1/team_members?user_id=")) return Response.json(membership);
        if (path.startsWith("/rest/v1/team_members?team_id=")) return Response.json(members);
        if (path.startsWith("/rest/v1/teams?id=") && method === "GET") return Response.json([{ owner_id: "boss" }]);
        if (path.startsWith("/rest/v1/projects?owner_id=") && method === "GET") return Response.json(projects);
        if (path.startsWith("/rest/v1/")) return new Response(null, { status: 204 });
        if (path.startsWith("/storage/v1/object/list/")) {
          const bucket = path.split("/").pop();
          return Response.json(storage[`${bucket}:${body.prefix}`] ?? []);
        }
        if (path.startsWith("/storage/v1/object/")) return Response.json([]);
        if (path === "/auth/v1/admin/users/u1") return Response.json({});
        return new Response("not found", { status: 404 });
      }),
    );
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("answers 501 without the service key", async () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    const { DELETE } = await import("@/app/api/account/route");
    const r = await DELETE(req());
    expect(r.status).toBe(501);
    expect((await r.json()).error).toMatch(/SUPABASE_SERVICE_ROLE_KEY/);
    expect(calls).toHaveLength(0);
  });

  it("needs a valid sign-in", async () => {
    const { DELETE } = await import("@/app/api/account/route");
    expect((await DELETE(req(null))).status).toBe(401);
    expect((await DELETE(req("someone-else"))).status).toBe(401);
    expect(calls.some((c) => c.url.includes("/admin/"))).toBe(false);
  });

  it("deletes a solo user's files and login", async () => {
    const { DELETE } = await import("@/app/api/account/route");
    const r = await DELETE(req());
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ ok: true, deletedTeam: false, deletedJobs: 1 });
    expect(calls[0].headers.apikey).toBe("anon-key");
    const removes = calls.filter((c) => c.method === "DELETE" && c.url.includes("/storage/v1/object/"));
    expect(removes.map((c) => c.body)).toEqual([{ prefixes: ["p1/img1", "p1/img2"] }, { prefixes: ["u1/tok/s1.jpg"] }]);
    const last = calls[calls.length - 1];
    expect(last).toMatchObject({ method: "DELETE", url: `${URL_}/auth/v1/admin/users/u1` });
    expect(last.headers.authorization).toBe("Bearer service-key");
  });

  it("refuses a team owner with other members, and deletes nothing", async () => {
    membership = [{ team_id: "t1", role: "owner" }];
    members = [{ user_id: "u1" }, { user_id: "u2" }];
    const { DELETE } = await import("@/app/api/account/route");
    const r = await DELETE(req());
    expect(r.status).toBe(409);
    expect((await r.json()).code).toBe("team_has_members");
    expect(calls.some((c) => c.method === "DELETE" || c.method === "PATCH")).toBe(false);
  });

  it("deletes the team of an owner who is on it alone", async () => {
    membership = [{ team_id: "t1", role: "owner" }];
    members = [{ user_id: "u1" }];
    const { DELETE } = await import("@/app/api/account/route");
    const r = await DELETE(req());
    expect(r.status).toBe(200);
    expect((await r.json()).deletedTeam).toBe(true);
    expect(calls.some((c) => c.method === "DELETE" && c.url === `${URL_}/rest/v1/teams?id=eq.t1`)).toBe(true);
  });

  it("moves a member's jobs to the team owner instead of deleting them", async () => {
    membership = [{ team_id: "t1", role: "tech" }];
    members = [{ user_id: "boss" }, { user_id: "u1" }];
    projects = []; // after the move they own none
    const { DELETE } = await import("@/app/api/account/route");
    const r = await DELETE(req());
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ keptJobsWithTeam: true, deletedJobs: 0 });
    const patches = calls.filter((c) => c.method === "PATCH");
    expect(patches.map((c) => c.url.split("?")[0].split("/").pop())).toEqual(["projects", "proposals", "photo_reports"]);
    expect(patches[0].body).toEqual({ owner_id: "boss" });
    // Their proposal renders belong to the moved proposals now: kept.
    expect(calls.some((c) => c.url.includes("/storage/v1/object/list/proposals"))).toBe(false);
  });

  it("doesn't delete the login when cleaning up fails", async () => {
    const original = vi.mocked(fetch).getMockImplementation()!;
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      if (String(input).includes("/storage/v1/object/list/plans")) return new Response("boom", { status: 500 });
      return original(input, init);
    });
    const { DELETE } = await import("@/app/api/account/route");
    const r = await DELETE(req());
    expect(r.status).toBe(502);
    expect(calls.some((c) => c.url.includes("/auth/v1/admin/users"))).toBe(false);
  });
});
