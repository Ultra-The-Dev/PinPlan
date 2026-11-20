process.env.AI_ENABLED = "1"; // these tests exercise the AI routes, which are off unless enabled
import { afterEach, describe, expect, it, vi } from "vitest";
import { accessCodeAccepted, authMode, isProduction, openModeRefused, requireOffice, requireUser, tokenIssuedAt } from "@/lib/server/auth";

describe("office-only routes (Billdu)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });
  const withRole = (role: string | null, status = 200) => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("/auth/v1/user")) return Response.json({ id: "user-1" });
      if (url.includes("/rest/v1/team_members")) return Response.json(role ? [{ role }] : [], { status });
      return new Response("", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  };

  it("refuses technicians with 403, checking the role with the caller's own token", async () => {
    const f = withRole("tech");
    const r = await requireOffice(req({ authorization: "Bearer tok" }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.response.status).toBe(403);
    const [url, init] = f.mock.calls[1] as unknown as [string, RequestInit];
    expect(url).toBe("https://example.supabase.co/rest/v1/team_members?select=role&user_id=eq.user-1");
    expect(new Headers(init.headers).get("authorization")).toBe("Bearer tok");
  });

  it("lets owners, admins and solo users through", async () => {
    for (const role of ["owner", "admin", null]) {
      withRole(role);
      expect((await requireOffice(req({ authorization: "Bearer tok" }))).ok).toBe(true);
    }
    // Team tables not created yet: nobody is a technician.
    withRole(null, 404);
    expect((await requireOffice(req({ authorization: "Bearer tok" }))).ok).toBe(true);
  });

  it("fails closed when the role can't be checked", async () => {
    withRole("admin", 500);
    const r = await requireOffice(req({ authorization: "Bearer tok" }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.response.status).toBe(503);
  });
});

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

  it("ignores the team access code when Supabase is configured, unless the server opts in", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");
    vi.stubEnv("PINPLAN_ACCESS_CODE", "s3cret");
    vi.stubEnv("PINPLAN_ALLOW_ACCESS_CODE", "");
    const fetchMock = vi.fn(async () => new Response("{}", { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);
    expect(accessCodeAccepted()).toBe(false);
    const r = await requireUser(req({ "x-pinplan-access": "s3cret" }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect((await r.response.json()).code).toBe("sign_in_required");
    // No token, so Supabase isn't even asked.
    expect(fetchMock).not.toHaveBeenCalled();

    vi.stubEnv("PINPLAN_ALLOW_ACCESS_CODE", "1");
    expect(accessCodeAccepted()).toBe(true);
    expect((await requireUser(req({ "x-pinplan-access": "s3cret" }))).ok).toBe(true);
    expect((await requireUser(req({ "x-pinplan-access": "nope" }))).ok).toBe(false);
    vi.unstubAllGlobals();
  });
});

describe("fail-closed in production", () => {
  afterEach(() => vi.unstubAllEnvs());
  const noAccounts = () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
    vi.stubEnv("PINPLAN_ACCESS_CODE", "");
    vi.stubEnv("PINPLAN_ALLOW_OPEN", "");
  };

  it("an open server answers 503 'Server not configured' on Vercel production", async () => {
    noAccounts();
    vi.stubEnv("VERCEL_ENV", "production");
    expect(isProduction()).toBe(true);
    expect(openModeRefused()).toBe(true);
    const r = await requireUser(req());
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.response.status).toBe(503);
      expect(await r.response.json()).toEqual({ error: "Server not configured", code: "server_not_configured" });
    }
    // Office-only routes go through requireUser too.
    const o = await requireOffice(req());
    expect(o.ok).toBe(false);
  });

  it("…and on a production Node build outside Vercel", async () => {
    noAccounts();
    vi.stubEnv("VERCEL_ENV", "");
    vi.stubEnv("NODE_ENV", "production");
    expect((await requireUser(req())).ok).toBe(false);
  });

  it("stays open on previews, in development and when PINPLAN_ALLOW_OPEN=1", async () => {
    noAccounts();
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("NODE_ENV", "production");
    expect((await requireUser(req())).ok).toBe(true);
    vi.stubEnv("VERCEL_ENV", "");
    vi.stubEnv("NODE_ENV", "development");
    expect((await requireUser(req())).ok).toBe(true);
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("PINPLAN_ALLOW_OPEN", "1");
    expect((await requireUser(req())).ok).toBe(true);
  });

  it("an access-code server keeps working in production (it isn't open)", async () => {
    noAccounts();
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("PINPLAN_ACCESS_CODE", "s3cret");
    expect((await requireUser(req({ "x-pinplan-access": "s3cret" }))).ok).toBe(true);
    expect((await requireUser(req())).ok).toBe(false);
  });

  it("/api/auth tells the browser the mode, whether the code works and whether the server is configured", async () => {
    vi.doMock("next/server", () => ({ connection: async () => undefined }));
    const { GET } = await import("@/app/api/auth/route");
    noAccounts();
    vi.stubEnv("VERCEL_ENV", "production");
    expect(await (await GET()).json()).toEqual({ mode: "open", accessCode: false, configured: false });
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");
    vi.stubEnv("PINPLAN_ACCESS_CODE", "s3cret");
    expect(await (await GET()).json()).toEqual({ mode: "supabase", accessCode: false, configured: true });
    vi.doUnmock("next/server");
  });
});

describe("tokenIssuedAt", () => {
  const jwt = (claims: Record<string, unknown>) => `h.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.sig`;
  it("reads iat from a JWT payload, and null otherwise", () => {
    expect(tokenIssuedAt(jwt({ iat: 1_700_000_000, sub: "u" }))).toBe(1_700_000_000);
    expect(tokenIssuedAt(jwt({ sub: "u" }))).toBeNull();
    expect(tokenIssuedAt("not-a-jwt")).toBeNull();
    expect(tokenIssuedAt("a.%%%.c")).toBeNull();
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

  it("reports config presence as booleans only, and database reachability (503 when down)", async () => {
    const { GET } = await import("@/app/api/health/route");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://db.example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
    vi.stubEnv("PINPLAN_ACCESS_CODE", "s3cret");
    vi.stubEnv("PINPLAN_ALLOW_ACCESS_CODE", "1");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-secret-value");
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_value");
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_value");
    vi.stubEnv("STRIPE_PRICE_BASE", "price_base");
    vi.stubEnv("STRIPE_PRICE_SEAT", "price_seat");
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("[]", { status: 200 })));
    const stranger = await GET(get());
    expect(stranger.status).toBe(200);
    expect(await stranger.json()).toEqual({ ok: true, app: "pinplan", authMode: "supabase", authorized: false, database: "ok" });
    const me = await (await GET(get({ "x-pinplan-access": "s3cret" }))).json();
    expect(me.config).toMatchObject({ supabase: true, serviceRoleKey: true, stripe: true, resend: false });
    expect(JSON.stringify(me)).not.toMatch(/service-secret-value|sk_test_value|anon-key/);
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("down"); }));
    const down = await GET(get());
    expect(down.status).toBe(503);
    expect(await down.json()).toMatchObject({ ok: false, database: "unreachable" });
    vi.unstubAllGlobals();
  });
});
