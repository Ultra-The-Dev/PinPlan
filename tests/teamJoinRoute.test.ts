// POST /api/team/join: creates one account per live invite code that PinPlan emailed, only with the service key set,
// for the invite's address only, without a password the requester chose (Supabase emails an invite link), counted
// against the inviting company's email allowance, with shared rate limits, an optional Turnstile check, the terms
// required, and the same answer whether or not the address already has an account.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/server", () => ({ connection: async () => undefined }));

const URL_ = "https://sb.example.co";
type Call = { method: string; url: string; headers: Record<string, string>; body: Record<string, unknown> };

function req(body: unknown, ip = "1.2.3.4") {
  return new Request("http://localhost/api/team/join", { method: "POST", headers: { "Content-Type": "application/json", "cf-connecting-ip": ip }, body: JSON.stringify(body) });
}
const good = { code: "k7qm-xr4t-pa", email: "Sam@Acme.com ", password: "chosen-by-requester", name: "Sam", acceptedTerms: true, termsVersion: "2026-11" };

type Invite = {
  code: string;
  email: string | null;
  created_by: string | null;
  created_user_id: string | null;
  signup_claimed_at: string | null;
  invite_emailed_at: string | null;
};

describe("POST /api/team/join", () => {
  let calls: Call[];
  let liveCode: boolean;
  let inviteStatus: number;
  let inviteBody: Record<string, unknown>;
  let invite: Invite | null;
  let counts: Map<string, number>;
  let turnstile: boolean;
  let reserve: Record<string, unknown>;

  beforeEach(() => {
    vi.resetModules();
    calls = [];
    liveCode = true;
    inviteStatus = 200;
    inviteBody = { id: "u1" };
    invite = { code: "K7QMXR4TPA", email: "sam@acme.com", created_by: "owner-1", created_user_id: null, signup_claimed_at: null, invite_emailed_at: "2026-11-19T10:00:00Z" };
    counts = new Map();
    turnstile = true;
    reserve = { ok: true, id: 7, trial: true, cap: 10 };
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", URL_);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-key");
    vi.stubEnv("TURNSTILE_SECRET_KEY", "");
    vi.stubEnv("PINPLAN_APP_URL", "https://app.example.com");
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
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
        if (url.endsWith("/rest/v1/rpc/email_send_reserve")) return Response.json(reserve);
        if (url.startsWith(`${URL_}/rest/v1/email_sends`)) return new Response(null, { status: 204 });
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
        if (url.startsWith(`${URL_}/auth/v1/invite`)) return Response.json(inviteBody, { status: inviteStatus });
        if (url.startsWith(`${URL_}/auth/v1/otp`)) return Response.json({});
        return new Response("not found", { status: 404 });
      }),
    );
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });
  const created = () => calls.filter((c) => c.url.startsWith(`${URL_}/auth/v1/invite`));
  const anyAuth = () => calls.filter((c) => c.url.startsWith(`${URL_}/auth/v1/`));

  it("answers 501 without the service key, so the page falls back to a normal sign-up", async () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    const { POST, GET } = await import("@/app/api/team/join/route");
    const r = await POST(req(good));
    expect(r.status).toBe(501);
    expect(calls).toHaveLength(0);
    expect(await (await GET()).json()).toMatchObject({ available: false, captcha: false });
  });

  it("has Supabase invite the address (no password), counted against the inviting company", async () => {
    const { POST } = await import("@/app/api/team/join/route");
    const r = await POST(req(good));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true, confirmEmail: true });
    const info = calls.find((c) => c.url.endsWith("/rpc/team_invite_info"))!;
    expect(info.headers.apikey).toBe("anon-key");
    expect(info.body).toEqual({ p_code: "K7QMXR4TPA" });
    // The send is reserved against the person who made the invite, before any account exists.
    const reservation = calls.find((c) => c.url.endsWith("/rpc/email_send_reserve"))!;
    expect(reservation.body).toMatchObject({ p_user: "owner-1", p_kind: "invite" });
    expect(calls.indexOf(reservation)).toBeLessThan(calls.indexOf(created()[0]));
    const [user] = created();
    expect(user.headers.authorization).toBe("Bearer service-key");
    expect(user.body).toMatchObject({ email: "sam@acme.com", data: { name: "Sam", terms_version: "2026-11" } });
    // Never the password the requester chose.
    expect(JSON.stringify(calls)).not.toContain("chosen-by-requester");
    expect(user.body).not.toHaveProperty("password");
    expect(decodeURIComponent(new URL(user.url).searchParams.get("redirect_to")!)).toBe("https://app.example.com/join?code=K7QMXR4TPA");
    // The code now remembers the account it made, and the send log keeps the row.
    expect(invite!.created_user_id).toBe("u1");
    expect(calls.find((c) => c.url.startsWith(`${URL_}/rest/v1/email_sends`))!.method).toBe("PATCH");
    // The key never goes out with the anon key.
    expect(JSON.stringify(calls.filter((c) => c.headers.apikey === "anon-key").map((c) => c.headers))).not.toContain("service-key");
  });

  it("only for invites PinPlan emailed: a copied or texted code uses the normal sign-up", async () => {
    const { POST } = await import("@/app/api/team/join/route");
    for (const patch of [{ email: null }, { invite_emailed_at: null }, { created_by: null }]) {
      Object.assign(invite!, { email: "sam@acme.com", invite_emailed_at: "2026-11-19T10:00:00Z", created_by: "owner-1" }, patch);
      const r = await POST(req(good, `9.0.0.${Object.keys(patch)[0].length}`));
      expect(r.status).toBe(501);
      expect((await r.json()).code).toBe("signup_required");
    }
    expect(anyAuth()).toHaveLength(0);
    expect(calls.some((c) => c.url.endsWith("/rpc/email_send_reserve"))).toBe(false);
  });

  it("only the invite's address can sign up with it", async () => {
    const { POST } = await import("@/app/api/team/join/route");
    const other = await POST(req({ ...good, email: "eve@evil.example" }));
    expect(other.status).toBe(403);
    expect((await other.json()).code).toBe("email_mismatch");
    expect(anyAuth()).toHaveLength(0);
  });

  it("the inviting company's email allowance is used up: no auth email, normal sign-up instead", async () => {
    reserve = { ok: false, reason: "daily_cap", trial: true, cap: 10 };
    const { POST } = await import("@/app/api/team/join/route");
    const r = await POST(req(good));
    expect(r.status).toBe(501);
    expect(anyAuth()).toHaveLength(0);
    expect(invite).toMatchObject({ created_user_id: null, signup_claimed_at: null });
  });

  it("needs the terms accepted", async () => {
    const { POST } = await import("@/app/api/team/join/route");
    for (const acceptedTerms of [undefined, false, "true", 1]) {
      const r = await POST(req({ ...good, acceptedTerms }));
      expect(r.status).toBe(400);
      expect((await r.json()).code).toBe("terms_required");
    }
    expect(calls).toHaveLength(0);
  });

  it("records the terms version (the database copies it into terms_acceptances)", async () => {
    const { POST } = await import("@/app/api/team/join/route");
    await POST(req(good));
    const meta = created()[0].body.data as Record<string, unknown>;
    expect(meta).toMatchObject({ name: "Sam", terms_version: "2026-11" });
    expect(Date.now() - Date.parse(String(meta.terms_accepted_at))).toBeLessThan(60_000);
  });

  it("an address that already has an account gets the same answer, and a sign-in link instead", async () => {
    inviteStatus = 422;
    inviteBody = { code: 422, error_code: "email_exists", msg: "A user with this email address has already been registered" };
    const { POST } = await import("@/app/api/team/join/route");
    const r = await POST(req(good));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true, confirmEmail: true });
    const otp = calls.find((c) => c.url.startsWith(`${URL_}/auth/v1/otp`))!;
    expect(otp.body).toEqual({ email: "sam@acme.com", create_user: false });
    expect(invite).toMatchObject({ created_user_id: null, signup_claimed_at: null });
  });

  it("makes only one account per code", async () => {
    const { POST } = await import("@/app/api/team/join/route");
    expect((await POST(req(good))).status).toBe(200);
    const again = await POST(req(good, "5.6.7.8"));
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
    for (const bad of [{ ...good, email: "nope" }, { ...good, code: "x" }, { ...good, email: 42 }, { ...good, name: "n".repeat(81) }]) {
      const r = await POST(req(bad));
      expect(r.status).toBe(400);
    }
    expect(calls).toHaveLength(0);
  });

  it("refuses an oversized body without reading it into Supabase", async () => {
    const { POST } = await import("@/app/api/team/join/route");
    const big = await POST(req({ ...good, name: "x".repeat(20_000) }));
    expect(big.status).toBe(413);
    const junk = await POST(new Request("http://localhost/api/team/join", { method: "POST", body: "{not json" }));
    expect(junk.status).toBe(400);
    expect(calls).toHaveLength(0);
  });

  it("doesn't pass Supabase's own error text through, and gives the allowance back", async () => {
    inviteStatus = 500;
    inviteBody = { msg: "internal: relation auth.users lock timeout" };
    const { POST } = await import("@/app/api/team/join/route");
    const r = await POST(req(good));
    expect(r.status).toBe(502);
    expect(JSON.stringify(await r.json())).not.toContain("relation");
    expect(calls.find((c) => c.url.startsWith(`${URL_}/rest/v1/email_sends`))!.method).toBe("DELETE");
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

  it("counts per IP from the trusted header (clientIp)", async () => {
    const { POST } = await import("@/app/api/team/join/route");
    await POST(new Request("http://localhost/api/team/join", { method: "POST", headers: { "cf-connecting-ip": "7.7.7.7", "x-forwarded-for": "1.1.1.1" }, body: JSON.stringify(good) }));
    expect(counts.get("join-ip:7.7.7.7")).toBe(1);
    expect(counts.has("join-ip:1.1.1.1")).toBe(false);
  });

  it("falls back to counting in memory when the shared store is missing", async () => {
    const original = vi.mocked(fetch).getMockImplementation()!;
    vi.mocked(fetch).mockImplementation(async (input, init) => (String(input).endsWith("/rpc/rate_limit_hit") ? new Response("missing", { status: 404 }) : original(input, init)));
    const { POST } = await import("@/app/api/team/join/route");
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) statuses.push((await POST(req({ ...good, email: `m${i}@acme.com` }, `10.1.0.${i}`))).status);
    expect(statuses[5]).toBe(429);
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

  it("reads the token and the terms the join page sends (joinRequestBody)", async () => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", "ts-secret");
    const { joinRequestBody } = await import("@/lib/teamLogic");
    const { POST } = await import("@/app/api/team/join/route");
    const page = (token: string) => joinRequestBody({ code: good.code, email: good.email, password: good.password, name: good.name, captchaToken: token, termsVersion: "2026-11" });
    expect(page("x")).toHaveProperty("captchaToken", "x");
    const bad = await POST(req(page("bad-token"), "1.2.3.5"));
    expect((await bad.json()).code).toBe("captcha_failed");
    expect(created()).toHaveLength(0);
    const ok = await POST(req(page("good-token"), "1.2.3.5"));
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ ok: true, confirmEmail: true });
    expect((created()[0].body.data as Record<string, unknown>).terms_version).toBe("2026-11");
  });

  it("refuses an oversized token without asking Cloudflare, and skips the check when no secret is set", async () => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", "ts-secret");
    let { POST } = await import("@/app/api/team/join/route");
    const r = await POST(req({ ...good, captchaToken: "x".repeat(2049) }));
    expect((await r.json()).code).toBe("captcha_failed");
    expect(calls.some((c) => c.url.startsWith("https://challenges.cloudflare.com/"))).toBe(false);
    vi.stubEnv("TURNSTILE_SECRET_KEY", "");
    vi.resetModules();
    ({ POST } = await import("@/app/api/team/join/route"));
    expect((await POST(req(good, "1.2.3.6"))).status).toBe(200);
    expect(calls.some((c) => c.url.startsWith("https://challenges.cloudflare.com/"))).toBe(false);
  });
});
