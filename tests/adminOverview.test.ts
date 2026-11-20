import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildOverview, loadRaw, mergeErrors, requirePlatformAdmin, type RawError } from "@/lib/server/admin";

const req = (token?: string) => new Request("http://x/api/admin/overview", { headers: token ? { authorization: `Bearer ${token}` } : {} });

describe("platform admin access", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://db.example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service");
    vi.stubEnv("PLATFORM_ADMIN_EMAILS", " Boss@NorthPin.app , ops@northpin.app");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });
  const userIs = (body: object, status = 200) => vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body), { status })));

  it("is 501 until the service key and admin list are configured", async () => {
    vi.stubEnv("PLATFORM_ADMIN_EMAILS", "");
    const r = await requirePlatformAdmin(req("t"));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.response.status).toBe(501);
  });

  it("needs a session", async () => {
    const r = await requirePlatformAdmin(req());
    if (!r.ok) expect(r.response.status).toBe(401);
    userIs({ msg: "bad jwt" }, 401);
    const r2 = await requirePlatformAdmin(req("expired"));
    if (!r2.ok) expect(r2.response.status).toBe(401);
  });

  it("refuses emails not on the list, and unconfirmed emails", async () => {
    userIs({ email: "someone@else.com", email_confirmed_at: "2026-01-01" });
    const r = await requirePlatformAdmin(req("t"));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.response.status).toBe(403);
    userIs({ email: "boss@northpin.app", email_confirmed_at: null });
    const r2 = await requirePlatformAdmin(req("t"));
    if (!r2.ok) expect(r2.response.status).toBe(403);
  });

  it("lets listed admins in (case-insensitive)", async () => {
    userIs({ email: "boss@northpin.app", email_confirmed_at: "2026-01-01" });
    expect(await requirePlatformAdmin(req("t"))).toEqual({ ok: true, email: "boss@northpin.app" });
  });
});

describe("buildOverview", () => {
  const now = new Date("2026-11-19T12:00:00Z");
  const users = [
    { id: "u1", email: "owner@acme.com", created_at: "2026-11-18T00:00:00Z", last_sign_in_at: "2026-11-19T08:00:00Z" },
    { id: "u2", email: "tech@acme.com", created_at: "2026-10-01T00:00:00Z", last_sign_in_at: "2026-11-19T10:00:00Z" },
    { id: "u3", email: "solo@x.com", created_at: "2026-09-01T00:00:00Z" },
  ];
  const members = [
    { team_id: "t1", user_id: "u1", role: "owner" },
    { team_id: "t1", user_id: "u2", role: "tech" },
  ];
  const usage = [
    { user_id: "u1", projects: 3, photos: 10, storage_bytes: 1000 },
    { user_id: "u2", projects: 1, photos: 5, storage_bytes: 500 },
    { user_id: "u3", projects: 2, photos: 0, storage_bytes: 0 },
  ];

  it("works before the billing columns exist", () => {
    const o = buildOverview({ users, teams: [{ id: "t1", name: "Acme", owner_id: "u1", created_at: "2026-11-18T00:00:00Z" }], members, usage, errors: [] }, now);
    expect(o.companies[0]).toMatchObject({ name: "Acme", ownerEmail: "owner@acme.com", members: 2, jobs: 4, photos: 15, storageBytes: 1500, planStatus: null, seatLimit: null, lastSignInAt: "2026-11-19T10:00:00Z" });
    expect(o.totals).toMatchObject({ users: 3, companies: 1, soloUsers: 1, jobs: 6, signups7d: 1 });
  });

  it("includes billing columns once they exist, and flags missing tables", () => {
    const o = buildOverview(
      { users, teams: [{ id: "t1", name: "Acme", owner_id: "u1", plan_status: "trialing", trial_ends_at: "2026-12-01T00:00:00Z", seat_limit: 5 }], members, usage: null, errors: null },
      now,
    );
    expect(o.companies[0]).toMatchObject({ planStatus: "trialing", trialEndsAt: "2026-12-01T00:00:00Z", seatLimit: 5, jobs: 0 });
    expect(o.missing.join(" ")).toMatch(/admin_usage.*app_errors/);
  });

  it("counts each error once, and takes the database's exact 24 h count when there is one", () => {
    const e = (id: string, created_at: string): RawError => ({ id, created_at, user_id: null, message: id, stack: null, url: null, user_agent: null, app_version: null, platform: "web", context: null });
    const errors = mergeErrors([e("a", "2026-11-19T11:00:00Z"), e("b", "2026-11-17T00:00:00Z")], [e("a", "2026-11-19T11:00:00Z"), e("s", "2026-11-19T10:00:00Z")]);
    expect(errors!.map((x) => x.id)).toEqual(["a", "s", "b"]);
    expect(buildOverview({ users, teams: [], members, usage, errors }, now).totals.errors24h).toBe(2);
    expect(buildOverview({ users, teams: [], members, usage, errors, errors24h: 812 }, now).totals.errors24h).toBe(812);
    expect(mergeErrors(null, null)).toBeNull();
  });
});

describe("loadRaw", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://db.example.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("reads the newest server errors on their own, so a client crash loop can't push them off the page", async () => {
    const report = (id: string, platform: string, minute: number) => ({ id, platform, created_at: `2026-11-19T11:${String(minute).padStart(2, "0")}:00Z`, message: id });
    // A crashing browser filed the 50 newest reports; the server's two are older.
    const flood = Array.from({ length: 50 }, (_, i) => report(`c${i}`, "web", 59 - (i % 50)));
    const server = [report("s1", "server", 5), report("s2", "server", 1)];
    const seen: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string, init?: RequestInit) => {
        const u = String(input);
        seen.push(u);
        if (u.includes("/auth/v1/admin/users")) return Response.json({ users: [] });
        if (u.includes("/app_errors") && new Headers(init?.headers).get("Prefer") === "count=exact")
          return new Response("[]", { status: 206, headers: { "Content-Range": "0-0/1234" } });
        if (u.includes("/app_errors") && u.includes("platform=eq.server")) return Response.json(server);
        if (u.includes("/app_errors")) return Response.json(flood);
        return Response.json([]);
      }),
    );
    const raw = await loadRaw(new Date("2026-11-19T12:00:00Z"));
    expect(seen.some((u) => u.includes("platform=eq.server") && u.includes("limit=50"))).toBe(true);
    expect(raw.errors).toHaveLength(52);
    expect(raw.errors!.slice(-2).map((e) => e.id)).toEqual(["s1", "s2"]);
    expect(raw.errors24h).toBe(1234);
    expect(seen.find((u) => u.includes("count") || u.includes("created_at=gt."))).toContain("created_at=gt.2026-11-18T12%3A00%3A00.000Z");
  });

  it("still loads when the count isn't available", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string, init?: RequestInit) => {
        const u = String(input);
        if (u.includes("/auth/v1/admin/users")) return Response.json({ users: [] });
        if (new Headers(init?.headers).get("Prefer") === "count=exact") return new Response("oops", { status: 500 });
        return Response.json([]);
      }),
    );
    const raw = await loadRaw();
    expect(raw.errors24h).toBeNull();
    expect(buildOverview(raw).totals.errors24h).toBe(0);
  });
});
