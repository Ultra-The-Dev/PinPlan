import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildOverview, requirePlatformAdmin } from "@/lib/server/admin";

const req = (token?: string) => new Request("http://x/api/admin/overview", { headers: token ? { authorization: `Bearer ${token}` } : {} });

describe("platform admin access", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://db.example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service");
    vi.stubEnv("PLATFORM_ADMIN_EMAILS", " Boss@PinPlan.app , ops@pinplan.app");
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
    userIs({ email: "boss@pinplan.app", email_confirmed_at: null });
    const r2 = await requirePlatformAdmin(req("t"));
    if (!r2.ok) expect(r2.response.status).toBe(403);
  });

  it("lets listed admins in (case-insensitive)", async () => {
    userIs({ email: "boss@pinplan.app", email_confirmed_at: "2026-01-01" });
    expect(await requirePlatformAdmin(req("t"))).toEqual({ ok: true, email: "boss@pinplan.app" });
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
});
