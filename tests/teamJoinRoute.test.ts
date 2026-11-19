// POST /api/team/join: creates one account per live invite code, only with the service key set, with shared rate
// limits, an optional Turnstile check, and the invite's email (when it has one) as the only address allowed.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/server", () => ({ connection: async () => undefined }));

const URL_ = "https://sb.example.co";
type Call = { method: string; url: string; headers: Record<string, string>; body: Record<string, unknown> };

function req(body: unknown, ip = "1.2.3.4") {
  return new Request("http://localhost/api/team/join", { method: "POST", headers: { "Content-Type": "application/json", "x-forwarded-for": ip }, body: JSON.stringify(body) });
}
const good = { code: "k7qm-xr4t-pa", email: "Sam@Acme.com ", password: "longenough", name: "Sam" };

describe("POST /api/team/join", () => {
  let calls: Call[];
  let liveCode: boolean;
  let adminStatus: number;
  let adminBody: Record<string, unknown>;
  let invite: { code: string; email: string | null; created_user_id: string | null; signup_claimed_at: string | null } | null;
  let counts: Map<string, number>;
  let turnstile: boolean;

  beforeEach(() => {
    vi.resetModules();
    calls = [];
    liveCode = true;
    adminStatus = 200;
    adminBody = { id: "u1" };
    invite = { code: "K7QMXR4TPA", email: null, created_user_id: null, signup_claimed_at: null };
    counts = new Map();
    turnstile = true;
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", URL_);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-key");
    vi.stubEnv("TURNSTILE_SECRET_KEY", "");
    vi.stubEnv("PINPLAN_APP_URL", "https://app.example.com");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input instanceof Request ? input.url : input);
        const method = init?.method ?? "GET";
        const raw = init?.body;
        const body = raw instanceof URLSearchParams ? Object.fromEntries(raw) : raw ? JSON.parse(String(raw)) : {};
        calls.push({ method, url, headers: Object.fromEntries(new Headers(init?.headers).entries()), body });
        if (url.endsWith("/rest/v1/rpc/rate_limit_hit")) {
          const n = (counts.get(body.p_key) ?? 0) + 1;
          counts.set(body.p_key, n);
          return Response.json({ ok: n <= body.p_max, hits: n, remaining: Math.max(0, body.p_max - n), retry_after: n <= body.p_max ? 0 : 600 });
        }
        if (url.startsWith("https://challenges.cloudflare.com/")) return Response.json({ success: turnstile && body.response === "good-token" });
        if (url.endsWith("/rest/v1/rpc/team_invite_info")) return Response.json(liveCode ? { team: "Acme", role: "tech", name: "", expires_at: "2099-01-01" } : null);
        if (url.startsWith(`${URL_}/rest/v1/team_invites?`)) {
          if (method === "GET") return Response.json(invite ? [invite] : []);
          if (method === "PATCH" && invite) {
            const u = new URL(url);
            // The claim only matches while no account was made and nobody holds the claim.
            if (u.searchParams.get("created_user_id") === "is.null" && invite.created_user_id) return Response.json([]);
            if (u.searchParams.get("or") && invite.signup_claimed_at) return Response.json([]);
            Object.assign(invite, body);
            return Response.json([invite]);
          }
        }
        if (url.endsWith("/auth/v1/admin/users")) return Response.json(adminBody, { status: adminStatus });
        if (url.includes("/auth/v1/resend")) return Response.json({});
        return new Response("not found", { status: 404 });
      }),
    );
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });
  const created = () => calls.filter((c) => c.url.endsWith("/auth/v1/admin/users"));

  it("answers 501 without the service key, so the page falls back to a normal sign-up", async () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    const { POST, GET } = await import("@/app/api/team/join/route");
    const r = await POST(req(good));
    expect(r.status).toBe(501);
    expect(calls).toHaveLength(0);
    expect(await (await GET()).json()).toMatchObject({ available: false, captcha: false });
  });

  it("creates an unconfirmed account and has Supabase email the confirmation when the invite has no email", async () => {
    const { POST } = await import("@/app/api/team/join/route");
    const r = await POST(req(good));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true, confirmEmail: true });
    const info = calls.find((c) => c.url.endsWith("/rpc/team_invite_info"))!;
    expect(info.headers.apikey).toBe("anon-key");
    expect(info.body).toEqual({ p_code: "K7QMXR4TPA" });
    const [user] = created();
    expect(user.headers.authorization).toBe("Bearer service-key");
    expect(user.body).toMatchObject({ email: "sam@acme.com", password: "longenough", email_confirm: false, user_metadata: { name: "Sam" } });
    // The code now remembers the account it made.
    expect(invite!.created_user_id).toBe("u1");
    const resend = calls.find((c) => c.url.includes("/auth/v1/resend"))!;
    expect(resend.body).toEqual({ type: "signup", email: "sam@acme.com" });
    expect(decodeURIComponent(new URL(resend.url).searchParams.get("redirect_to")!)).toBe("https://app.example.com/join?code=K7QMXR4TPA");
    // The key never comes back to the browser.
    expect(JSON.stringify(calls.filter((c) => c.headers.apikey === "anon-key").map((c) => c.headers))).not.toContain("service-key");
  });

  it("creates a confirmed account when the invite was sent to that email, and refuses any other address", async () => {
    invite!.email = "sam@acme.com";
    const { POST } = await import("@/app/api/team/join/route");
    const other = await POST(req({ ...good, email: "eve@evil.example" }));
    expect(other.status).toBe(403);
    expect((await other.json()).code).toBe("email_mismatch");
    expect(created()).toHaveLength(0);
    const r = await POST(req(good));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true });
    expect(created()[0].body).toMatchObject({ email_confirm: true });
    expect(calls.some((c) => c.url.includes("/auth/v1/resend"))).toBe(false);
  });

  it("makes only one account per code", async () => {
    const { POST } = await import("@/app/api/team/join/route");
    expect((await POST(req(good))).status).toBe(200);
    const again = await POST(req({ ...good, email: "second@acme.com" }, "5.6.7.8"));
    expect(again.status).toBe(409);
    expect((await again.json()).code).toBe("code_used");
    expect(created()).toHaveLength(1);
  });

  it("refuses while another sign-up holds the code", async () => {
    invite!.signup_claimed_at = new Date().toISOString();
    const { POST } = await import("@/app/api/team/join/route");
    const r = await POST(req(good));
    expect(r.status).toBe(409);
    expect((await r.json()).code).toBe("code_busy");
    expect(created()).toHaveLength(0);
  });

  it("records the terms the person accepted", async () => {
    const { POST } = await import("@/app/api/team/join/route");
    await POST(req({ ...good, acceptedTerms: true, termsVersion: "2026-11" }));
    const meta = created()[0].body.user_metadata as Record<string, unknown>;
    expect(meta).toMatchObject({ name: "Sam", terms_version: "2026-11" });
    expect(Date.now() - Date.parse(String(meta.terms_accepted_at))).toBeLessThan(60_000);
  });

  it("doesn't record terms nobody accepted", async () => {
    const { POST } = await import("@/app/api/team/join/route");
    await POST(req({ ...good, termsVersion: "2026-11" }));
    expect(created()[0].body.user_metadata).toEqual({ name: "Sam" });
  });

  it("refuses a dead code without creating anyone", async () => {
    liveCode = false;
    const { POST } = await import("@/app/api/team/join/route");
    const r = await POST(req(good));
    expect(r.status).toBe(400);
    expect((await r.json()).code).toBe("invalid_code");
    expect(created()).toHaveLength(0);
  });

  it("validates input before calling Supabase", async () => {
    const { POST } = await import("@/app/api/team/join/route");
    for (const bad of [{ ...good, password: "short" }, { ...good, email: "nope" }, { ...good, code: "x" }, { ...good, email: 42 }]) {
      const r = await POST(req(bad));
      expect(r.status).toBe(400);
    }
    expect(calls).toHaveLength(0);
  });

  it("says when the email already has an account, and frees the code again", async () => {
    adminStatus = 422;
    adminBody = { code: 422, error_code: "email_exists", msg: "A user with this email address has already been registered" };
    const { POST } = await import("@/app/api/team/join/route");
    const r = await POST(req(good));
    expect(r.status).toBe(409);
    expect((await r.json()).code).toBe("exists");
    expect(invite).toMatchObject({ created_user_id: null, signup_claimed_at: null });
  });

  it("puts Supabase's password complaints in plain words", async () => {
    adminStatus = 422;
    adminBody = { code: 422, error_code: "weak_password", msg: "Password is known to be weak and easy to guess, please choose a different one.", weak_password: { reasons: ["pwned"] } };
    const { POST } = await import("@/app/api/team/join/route");
    const r = await POST(req(good));
    expect(r.status).toBe(400);
    const j = await r.json();
    expect(j).toMatchObject({ code: "weak_password", error: "That password has shown up in a data leak. Choose a different one." });
    adminBody = { code: 422, error_code: "weak_password", msg: "Password should contain at least one character of each: abcdefghijklmnopqrstuvwxyz…", weak_password: { reasons: ["characters"] } };
    expect((await (await POST(req(good, "9.9.9.9"))).json()).error).toMatch(/mix of upper and lower case/);
  });

  it("doesn't pass Supabase's own error text through", async () => {
    adminStatus = 500;
    adminBody = { msg: "internal: relation auth.users lock timeout" };
    const { POST } = await import("@/app/api/team/join/route");
    const r = await POST(req(good));
    expect(r.status).toBe(502);
    expect(JSON.stringify(await r.json())).not.toContain("relation");
  });

  it("slows down repeated tries on one code, counting in the shared store", async () => {
    const { POST } = await import("@/app/api/team/join/route");
    const statuses: number[] = [];
    for (let i = 0; i < 7; i++) statuses.push((await POST(req({ ...good, email: `w${i}@acme.com` }, `10.0.0.${i}`))).status);
    expect(statuses.slice(0, 5).every((s) => s !== 429)).toBe(true);
    expect(statuses[5]).toBe(429);
    expect(statuses[6]).toBe(429);
    expect(counts.get("join-code:K7QMXR4TPA")).toBe(7);
    const ten = calls.find((c) => c.url.endsWith("/rpc/rate_limit_hit"))!;
    expect(ten.headers.authorization).toBe("Bearer service-key");
    expect(ten.body).toMatchObject({ p_window_seconds: 3600 });
  });

  it("falls back to counting in memory when the shared store is missing", async () => {
    const original = vi.mocked(fetch).getMockImplementation()!;
    vi.mocked(fetch).mockImplementation(async (input, init) => (String(input).endsWith("/rpc/rate_limit_hit") ? new Response("missing", { status: 404 }) : original(input, init)));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { POST } = await import("@/app/api/team/join/route");
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) statuses.push((await POST(req({ ...good, email: `m${i}@acme.com` }, `10.1.0.${i}`))).status);
    expect(statuses[5]).toBe(429);
    warn.mockRestore();
  });

  it("checks Turnstile when TURNSTILE_SECRET_KEY is set", async () => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", "ts-secret");
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "ts-site");
    const { POST, GET } = await import("@/app/api/team/join/route");
    expect(await (await GET()).json()).toEqual({ available: true, captcha: true, turnstileSiteKey: "ts-site" });
    const none = await POST(req(good));
    expect(none.status).toBe(400);
    expect((await none.json()).code).toBe("captcha_failed");
    const bad = await POST(req({ ...good, turnstileToken: "bad-token" }));
    expect(bad.status).toBe(400);
    expect(created()).toHaveLength(0);
    const ok = await POST(req({ ...good, turnstileToken: "good-token" }));
    expect(ok.status).toBe(200);
    const verify = calls.find((c) => c.url.startsWith("https://challenges.cloudflare.com/"))!;
    expect(verify.body).toMatchObject({ secret: "ts-secret", remoteip: "1.2.3.4" });
  });
});
