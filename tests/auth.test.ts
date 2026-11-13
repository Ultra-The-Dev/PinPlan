import { afterEach, describe, expect, it, vi } from "vitest";
import { authMode, requireUser } from "@/lib/server/auth";

const req = (headers: Record<string, string> = {}) => new Request("http://x/api/billdu/send", { method: "POST", headers });

describe("API route auth", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("is open when neither Supabase nor an access code is configured", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("PINPLAN_ACCESS_CODE", "");
    expect(authMode()).toBe("open");
    expect((await requireUser(req())).ok).toBe(true);
  });

  it("requires the access code when PINPLAN_ACCESS_CODE is set", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("PINPLAN_ACCESS_CODE", "s3cret");
    expect(authMode()).toBe("access_code");
    const denied = await requireUser(req());
    expect(denied.ok).toBe(false);
    if (!denied.ok) expect(denied.response.status).toBe(401);
    expect((await requireUser(req({ "x-pinplan-access": "wrong" }))).ok).toBe(false);
    expect((await requireUser(req({ "x-pinplan-access": "s3cret" }))).ok).toBe(true);
  });

  it("requires a Supabase session when Supabase is configured", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");
    expect(authMode()).toBe("supabase");
    expect((await requireUser(req())).ok).toBe(false);
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: "user-1" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const r = await requireUser(req({ authorization: "Bearer tok" }));
    expect(r.ok && r.userId).toBe("user-1");
    vi.unstubAllGlobals();
  });

  it("also accepts the team access code when Supabase is configured (native app)", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");
    vi.stubEnv("PINPLAN_ACCESS_CODE", "s3cret");
    expect((await requireUser(req({ "x-pinplan-access": "s3cret" }))).ok).toBe(true);
    expect((await requireUser(req({ "x-pinplan-access": "nope" }))).ok).toBe(false);
  });
});

describe("health endpoint", () => {
  afterEach(() => vi.unstubAllEnvs());
  const get = (headers: Record<string, string> = {}) => new Request("http://x/api/health", { headers });

  it("tells strangers only the sign-in mode, and authorised callers which features are set (as yes/no)", async () => {
    const { GET } = await import("@/app/api/health/route");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("PINPLAN_ACCESS_CODE", "s3cret");
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-test");
    vi.stubEnv("BILLDU_API_KEY", "k");
    vi.stubEnv("BILLDU_API_SECRET", "s");
    const anon = await (await GET(get())).json();
    expect(anon).toEqual({ ok: true, app: "pinplan", authMode: "access_code", authorized: false });
    const me = await (await GET(get({ "x-pinplan-access": "s3cret" }))).json();
    expect(me).toMatchObject({ authorized: true, ai: true, billdu: true });
    expect(JSON.stringify(me)).not.toContain("sk-ant-test");
  });
});
