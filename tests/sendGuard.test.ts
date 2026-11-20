// Email abuse limits (src/lib/server/sendGuard.ts) and the site address for links (appOrigin), with fetch mocked:
// no network, no real keys, no real addresses.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const SB = "https://sb.example.co";
type Call = { url: string; method: string; headers: Record<string, string>; body: unknown };
let calls: Call[];
let routes: Record<string, (url: string, init: RequestInit) => Response | Promise<Response>>;

beforeEach(() => {
  vi.resetModules();
  calls = [];
  routes = {};
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", SB);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-key");
  vi.stubEnv("PINPLAN_APP_URL", "");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request, init: RequestInit = {}) => {
      const url = String(input instanceof Request ? input.url : input);
      const raw = init.body ? String(init.body) : "";
      let body: unknown = raw;
      try {
        body = raw ? JSON.parse(raw) : undefined;
      } catch {
        /* text */
      }
      calls.push({ url, method: init.method ?? "GET", headers: Object.fromEntries(new Headers(init.headers).entries()), body });
      for (const [prefix, h] of Object.entries(routes)) if (url.startsWith(prefix)) return h(url, init);
      return new Response("not found", { status: 404 });
    }),
  );
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const load = () => import("@/lib/server/sendGuard");
const RESERVE = `${SB}/rest/v1/rpc/email_send_reserve`;

describe("recipientHash", () => {
  it("is a sha256 of the trimmed, lower-cased address", async () => {
    const { recipientHash } = await load();
    expect(recipientHash(" Client@Example.com ")).toBe(recipientHash("client@example.com"));
    expect(recipientHash("client@example.com")).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("reserveSend", () => {
  it("asks the database with the service key and never sends the address itself", async () => {
    routes[RESERVE] = () => Response.json({ ok: true, id: 41, trial: false, team_id: "t1", sent_today: 3, cap: 300 });
    const { reserveSend, recipientHash } = await load();
    const r = await reserveSend("u1", "document", "client@example.com");
    expect(r).toEqual({ ok: true, id: 41, trial: false, durable: true });
    expect(calls[0].headers.authorization).toBe("Bearer service-key");
    expect(calls[0].body).toEqual({ p_user: "u1", p_kind: "document", p_recipient_hash: recipientHash("client@example.com") });
    expect(JSON.stringify(calls)).not.toContain("client@example.com");
  });

  it("turns each refusal into a fixed, friendly answer", async () => {
    const { reserveSend } = await load();
    const cases: [Record<string, unknown>, number, string, RegExp][] = [
      [{ ok: false, reason: "unconfirmed" }, 403, "email_unconfirmed", /Confirm your email address/],
      [{ ok: false, reason: "plan_inactive" }, 402, "plan_inactive", /Settings → Billing/],
      [{ ok: false, reason: "daily_cap", trial: true, cap: 20 }, 429, "daily_email_limit", /free trial you can send 20 emails/],
      [{ ok: false, reason: "daily_cap", trial: false, cap: 300 }, 429, "daily_email_limit", /today's email limit/],
      [{ ok: false, reason: "recipient_cap", trial: true }, 429, "recipient_limit", /That address/],
      [{ ok: false, reason: "something_new" }, 403, "email_refused", /can't be sent/],
    ];
    for (const [answer, status, code, message] of cases) {
      routes[RESERVE] = () => Response.json(answer);
      const r = await reserveSend("u1", "document", "client@example.com");
      expect(r.ok).toBe(false);
      if (r.ok) continue;
      expect(r.response.status).toBe(status);
      const j = await r.response.json();
      expect(j.code).toBe(code);
      expect(j.error).toMatch(message);
    }
  });

  it("trial invite limit points at sharing the link instead", async () => {
    routes[RESERVE] = () => Response.json({ ok: false, reason: "daily_cap", trial: true, cap: 10 });
    const { reserveSend } = await load();
    const r = await reserveSend("u1", "invite", "crew@example.com");
    expect(r.ok).toBe(false);
    if (!r.ok) expect((await r.response.json()).error).toMatch(/10 invites a day.*Copy link/);
  });

  it("migration not run: falls back to the route's own limits outside production, refuses in production", async () => {
    let { reserveSend } = await load();
    expect(await reserveSend("u1", "document", "client@example.com")).toEqual({ ok: true, id: null, trial: true, durable: false });
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "production");
    ({ reserveSend } = await load());
    const r = await reserveSend("u1", "document", "client@example.com");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.response.status).toBe(503);
  });

  it("no service key: fallback outside production, refused in production", async () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    let { reserveSend } = await load();
    expect((await reserveSend("u1", "invite", "crew@example.com")).ok).toBe(true);
    expect(calls).toHaveLength(0);
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "production");
    ({ reserveSend } = await load());
    expect((await reserveSend("u1", "invite", "crew@example.com")).ok).toBe(false);
  });

  it("a database error refuses (never sends unchecked)", async () => {
    routes[RESERVE] = () => new Response("boom", { status: 500 });
    const { reserveSend } = await load();
    const r = await reserveSend("u1", "document", "client@example.com");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.response.status).toBe(503);
  });
});

describe("finishSend", () => {
  it("records Resend's id, or removes the reservation when the send failed", async () => {
    routes[`${SB}/rest/v1/email_sends`] = () => new Response(null, { status: 204 });
    const { finishSend } = await load();
    await finishSend({ ok: true, id: 7, trial: false, durable: true }, { ok: true, id: "re_1" });
    expect(calls[0]).toMatchObject({ method: "PATCH", body: { resend_id: "re_1" } });
    expect(calls[0].url).toBe(`${SB}/rest/v1/email_sends?id=eq.7`);
    await finishSend({ ok: true, id: 8, trial: false, durable: true }, { ok: false });
    expect(calls[1]).toMatchObject({ method: "DELETE", url: `${SB}/rest/v1/email_sends?id=eq.8` });
    await finishSend({ ok: true, id: null, trial: true, durable: false }, { ok: true, id: "re_2" });
    expect(calls).toHaveLength(2);
  });
});

describe("durableLimited", () => {
  it("over the limit when the database says no; null when it can't answer", async () => {
    let allowed = true;
    routes[`${SB}/rest/v1/rpc/answer_rate_hit`] = () => Response.json(allowed);
    const { durableLimited, keyHash } = await load();
    const key = keyHash("ip", "203.0.113.9");
    expect(key).toMatch(/^ip:[0-9a-f]{40}$/);
    expect(await durableLimited(key, 3_600_000, 30)).toBe(false);
    expect(calls[0].body).toEqual({ p_key: key, p_window_seconds: 3600, p_max: 30 });
    allowed = false;
    expect(await durableLimited(key, 3_600_000, 30)).toBe(true);
    delete routes[`${SB}/rest/v1/rpc/answer_rate_hit`];
    expect(await durableLimited(key, 3_600_000, 30)).toBeNull();
  });
});

describe("answerRecipient", () => {
  const owner = { owner_id: "owner-1", address: "12 Sample St", client_name: "Sample Client" };
  beforeEach(() => {
    routes[`${SB}/rest/v1/projects`] = () => Response.json([owner]);
    routes[`${SB}/rest/v1/team_members?user_id=`] = () => Response.json([{ team_id: "t1" }]);
    routes[`${SB}/rest/v1/team_members?team_id=`] = (url) =>
      Response.json(
        [
          { email: "office@acme.example", role: "admin" },
          { email: "tech@acme.example", role: "tech" },
        ].filter((m) => !url.includes("role=in.") || m.role !== "tech"),
      );
    routes[`${SB}/auth/v1/admin/users/owner-1`] = () => Response.json({ id: "owner-1", email: "owner@acme.example" });
  });

  it("the office person who made it, when they're on the job owner's company", async () => {
    const { answerRecipient } = await load();
    expect(await answerRecipient("p1", "Office@Acme.example", true)).toEqual({ to: "office@acme.example", ownerId: "owner-1", jobName: "12 Sample St" });
  });

  it("a technician only when office-only isn't asked; else the owner", async () => {
    const { answerRecipient } = await load();
    expect((await answerRecipient("p1", "tech@acme.example", false))?.to).toBe("tech@acme.example");
    expect((await answerRecipient("p1", "tech@acme.example", true))?.to).toBe("owner@acme.example");
  });

  it("never an address that isn't on the company, or a name", async () => {
    const { answerRecipient } = await load();
    expect((await answerRecipient("p1", "stranger@elsewhere.example", false))?.to).toBe("owner@acme.example");
    expect((await answerRecipient("p1", "Sam Rivera", false))?.to).toBe("owner@acme.example");
    expect((await answerRecipient("p1", null, false))?.to).toBe("owner@acme.example");
  });

  it("null for an unknown job", async () => {
    routes[`${SB}/rest/v1/projects`] = () => Response.json([]);
    const { answerRecipient } = await load();
    expect(await answerRecipient("p404", null, false)).toBeNull();
  });
});

describe("appOrigin", () => {
  const req = (host = "app.example.com") => new Request(`https://${host}/api/x`, { headers: { host } });

  it("uses PINPLAN_APP_URL, trimmed of trailing slashes", async () => {
    vi.stubEnv("PINPLAN_APP_URL", "https://pinplan.example.org/");
    const { appOrigin } = await import("@/lib/server/email");
    expect(appOrigin(req("evil.example"))).toBe("https://pinplan.example.org");
  });

  it("in production: required, https only, and never taken from the request's Host", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const email = await import("@/lib/server/email");
    let { appOrigin } = email;
    expect(appOrigin(req("evil.example"))).toBeNull();
    const r = email.appOriginMissing();
    expect(r.status).toBe(501);
    expect((await r.json()).code).toBe("app_url_unconfigured");
    vi.resetModules();
    vi.stubEnv("PINPLAN_APP_URL", "http://pinplan.example.org");
    ({ appOrigin } = await import("@/lib/server/email"));
    expect(appOrigin(req())).toBeNull();
    vi.resetModules();
    vi.stubEnv("PINPLAN_APP_URL", "not a url");
    ({ appOrigin } = await import("@/lib/server/email"));
    expect(appOrigin(req())).toBeNull();
  });

  it("local development falls back to the request's own address", async () => {
    const { appOrigin } = await import("@/lib/server/email");
    expect(appOrigin(new Request("http://localhost:3000/api/x"))).toBe("http://localhost:3000");
  });
});

describe("sendEmail reply-to", () => {
  it("client mail never falls back to the platform reply-to", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("EMAIL_FROM", "PinPlan <noreply@example.com>");
    vi.stubEnv("EMAIL_REPLY_TO", "support@example.com");
    routes["https://api.resend.com/emails"] = () => Response.json({ id: "e1" });
    const { sendEmail } = await import("@/lib/server/email");
    await sendEmail({ to: "client@example.com", subject: "s", html: "h", text: "t", platformReplyTo: false });
    expect(calls[0].body).not.toHaveProperty("reply_to");
    await sendEmail({ to: "client@example.com", subject: "s", html: "h", text: "t" });
    expect(calls[1].body).toMatchObject({ reply_to: "support@example.com" });
  });
});
