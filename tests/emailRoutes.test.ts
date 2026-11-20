// Email: the Resend client and the routes that use it, with fetch mocked (no network, no real keys).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/server", () => ({ connection: async () => undefined }));

const SB = "https://sb.example.co";
const RESEND = "https://api.resend.com/emails";
type Call = { url: string; method: string; headers: Record<string, string>; body: unknown };

let calls: Call[];
let routes: Record<string, (url: string, init: RequestInit) => Response | Promise<Response>>;

function setup() {
  calls = [];
  routes = {};
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", SB);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-key");
  vi.stubEnv("RESEND_API_KEY", "re_secret_123");
  vi.stubEnv("EMAIL_FROM", "Northpin <noreply@example.com>");
  vi.stubEnv("EMAIL_REPLY_TO", "");
  vi.stubEnv("PINPLAN_APP_URL", "");
  vi.stubEnv("PINPLAN_ACCESS_CODE", "");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request, init: RequestInit = {}) => {
      const url = String(input instanceof Request ? input.url : input);
      const raw = init.body ? String(init.body) : "";
      let body: unknown = raw;
      try {
        body = raw ? JSON.parse(raw) : undefined;
      } catch {
        /* keep text */
      }
      calls.push({ url, method: init.method ?? "GET", headers: Object.fromEntries(new Headers(init.headers).entries()), body });
      for (const [prefix, h] of Object.entries(routes)) if (url.startsWith(prefix)) return h(url, init);
      return new Response("not found", { status: 404 });
    }),
  );
}
const sends = () => calls.filter((c) => c.url === RESEND);
const resendOk = () => Response.json({ id: "email_1" });

beforeEach(() => {
  vi.resetModules();
  setup();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ------------------------------------------------------------------ Resend client
describe("sendEmail", () => {
  it("reports unconfigured without calling anything", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    const { sendEmail, emailConfigured } = await import("@/lib/server/email");
    expect(emailConfigured()).toBe(false);
    const r = await sendEmail({ to: "a@b.co", subject: "s", html: "h", text: "t" });
    expect(r).toMatchObject({ ok: false, status: 501, code: "email_unconfigured" });
    expect(calls).toHaveLength(0);
  });

  it("posts to Resend with the key, sender, reply-to and idempotency key", async () => {
    vi.stubEnv("EMAIL_REPLY_TO", "office@example.com");
    routes[RESEND] = resendOk;
    const { sendEmail } = await import("@/lib/server/email");
    const r = await sendEmail({ to: "sam@example.com", subject: "Hi\r\nBcc: x@y.z", html: "<p>h</p>", text: "t", idempotencyKey: "k1", tags: { type: "team invite!" } });
    expect(r).toEqual({ ok: true, id: "email_1" });
    const c = sends()[0];
    expect(c.method).toBe("POST");
    expect(c.headers.authorization).toBe("Bearer re_secret_123");
    expect(c.headers["idempotency-key"]).toBe("k1");
    expect(c.body).toMatchObject({ from: "Northpin <noreply@example.com>", to: ["sam@example.com"], subject: "Hi Bcc: x@y.z", reply_to: "office@example.com", text: "t" });
    expect((c.body as { tags: unknown }).tags).toEqual([{ name: "type", value: "team_invite_" }]);
  });

  it("refuses a bad address before calling Resend", async () => {
    const { sendEmail } = await import("@/lib/server/email");
    expect(await sendEmail({ to: "not an email", subject: "s", html: "h", text: "t" })).toMatchObject({ ok: false, status: 400 });
    expect(await sendEmail({ to: "a@b.co>, evil@x.y", subject: "s", html: "h", text: "t" })).toMatchObject({ ok: false, status: 400 });
    expect(calls).toHaveLength(0);
  });

  it("maps Resend errors to friendly messages and never logs the key or recipient", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { sendEmail } = await import("@/lib/server/email");
    const cases: [number, string, string][] = [
      [403, "invalid_api_key", "email_auth"],
      [403, "validation_error", "email_auth"],
      [422, "invalid_from_address", "email_from"],
      [429, "rate_limit_exceeded", "email_rate_limited"],
      [422, "validation_error", "email_rejected"],
      [409, "invalid_idempotent_request", "email_duplicate"],
      [500, "internal_server_error", "email_upstream"],
    ];
    for (const [status, name, code] of cases) {
      routes[RESEND] = () => Response.json({ statusCode: status, name, message: "secret detail re_secret_123" }, { status });
      const r = await sendEmail({ to: "sam@example.com", subject: "s", html: "h", text: "t" });
      expect(r, name).toMatchObject({ ok: false, code });
      expect(JSON.stringify(r)).not.toContain("re_secret_123");
    }
    const logged = warn.mock.calls.flat().join(" ");
    expect(logged).not.toContain("re_secret_123");
    expect(logged).not.toContain("sam@example.com");
  });

  it("times out", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    routes[RESEND] = (_u, init) =>
      new Promise((_res, rej) => init.signal?.addEventListener("abort", () => rej(Object.assign(new Error("timeout"), { name: "TimeoutError" }))));
    const { sendEmail } = await import("@/lib/server/email");
    const r = await sendEmail({ to: "sam@example.com", subject: "s", html: "h", text: "t" }, { timeoutMs: 20 });
    expect(r).toMatchObject({ ok: false, status: 504, code: "email_timeout", retryable: true });
  });
});

describe("GET /api/email/status", () => {
  it("says yes or no, nothing else", async () => {
    let { GET } = await import("@/app/api/email/status/route");
    expect(await (await GET()).json()).toEqual({ configured: true, notifications: true });
    vi.resetModules();
    vi.stubEnv("EMAIL_FROM", "");
    ({ GET } = await import("@/app/api/email/status/route"));
    expect(await (await GET()).json()).toEqual({ configured: false, notifications: false });
  });
});

// ------------------------------------------------------------------ invite email
describe("POST /api/team/invite-email", () => {
  const future = new Date(Date.now() + 7 * 86400000).toISOString();
  let invite: Record<string, unknown> | null;
  let me: Record<string, unknown>;

  function req(body: unknown, token: string | null = "user-token") {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;
    return new Request("https://app.example.com/api/team/invite-email", { method: "POST", headers, body: JSON.stringify(body) });
  }
  const good = { code: "k7qm-xr4t-pa", email: " Sam@Example.com ", name: "Sam" };

  beforeEach(() => {
    invite = { code: "K7QMXR4TPA", team_id: "t1", role: "tech", name: "", expires_at: future, used_by: null, revoked: false };
    me = { name: "Dana", email: "dana@acme.com", role: "owner", team_id: "t1" };
    routes[`${SB}/auth/v1/user`] = (_u, init) => (new Headers(init.headers).get("authorization") === "Bearer user-token" ? Response.json({ id: "u1" }) : new Response("{}", { status: 401 }));
    routes[`${SB}/rest/v1/team_invites`] = () => Response.json(invite ? [invite] : []);
    routes[`${SB}/rest/v1/teams`] = () => Response.json([{ name: "Acme Low Voltage" }]);
    routes[`${SB}/rest/v1/team_members`] = () => Response.json([me]);
    routes[RESEND] = resendOk;
  });

  it("501 with a friendly message when email isn't set up", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    const { POST } = await import("@/app/api/team/invite-email/route");
    const r = await POST(req(good));
    expect(r.status).toBe(501);
    expect((await r.json()).error).toMatch(/Email isn't set up yet/);
    expect(calls).toHaveLength(0);
  });

  it("needs a signed-in caller", async () => {
    const { POST } = await import("@/app/api/team/invite-email/route");
    expect((await POST(req(good, null))).status).toBe(401);
    expect((await POST(req(good, "expired"))).status).toBe(401);
    expect(sends()).toHaveLength(0);
  });

  it("validates the address", async () => {
    const { POST } = await import("@/app/api/team/invite-email/route");
    expect((await POST(req({ ...good, email: "nope" }))).status).toBe(400);
    expect(sends()).toHaveLength(0);
  });

  it("reads the invite with the caller's own token and sends the email", async () => {
    const { POST } = await import("@/app/api/team/invite-email/route");
    const r = await POST(req(good));
    expect(r.status).toBe(200);
    const lookup = calls.find((c) => c.url.startsWith(`${SB}/rest/v1/team_invites`))!;
    expect(lookup.url).toContain("code=eq.K7QMXR4TPA");
    expect(lookup.headers.authorization).toBe("Bearer user-token");
    expect(lookup.headers.apikey).toBe("anon-key");
    const s = sends()[0].body as { to: string[]; subject: string; html: string; text: string; reply_to: string };
    expect(s.to).toEqual(["sam@example.com"]);
    expect(s.subject).toBe("Dana invited you to join Acme Low Voltage on Northpin");
    expect(s.text).toContain("https://app.example.com/join?code=K7QMXR4TPA");
    expect(s.text).toContain("Hi Sam,");
    expect(s.reply_to).toBe("dana@acme.com");
    // The invite itself is read with the caller's token; the service key is only used for the send guard's RPC and,
    // after the send, to stamp the invite as emailed (invite_emailed_at is the server's).
    expect(
      calls
        .filter((c) => c.headers.authorization === "Bearer service-key")
        .every((c) => c.url.includes("/rpc/email_send") || (c.method === "PATCH" && c.url.startsWith(`${SB}/rest/v1/team_invites?code=eq.K7QMXR4TPA&team_id=eq.`))),
    ).toBe(true);
  });

  it("uses PINPLAN_APP_URL for the link when set", async () => {
    vi.stubEnv("PINPLAN_APP_URL", "https://pinplan.example.org/");
    const { POST } = await import("@/app/api/team/invite-email/route");
    await POST(req(good));
    expect((sends()[0].body as { text: string }).text).toContain("https://pinplan.example.org/join?code=K7QMXR4TPA");
  });

  it("404 for an invite the caller can't see (another team, or a technician)", async () => {
    invite = null;
    const { POST } = await import("@/app/api/team/invite-email/route");
    expect((await POST(req(good))).status).toBe(404);
    expect(sends()).toHaveLength(0);
  });

  it("409 for a used, expired or revoked invite", async () => {
    const { POST } = await import("@/app/api/team/invite-email/route");
    for (const patch of [{ used_by: "u9" }, { expires_at: "2020-01-01T00:00:00Z" }, { revoked: true }]) {
      invite = { code: "K7QMXR4TPA", team_id: "t1", role: "tech", name: "", expires_at: future, used_by: null, revoked: false, ...patch };
      expect((await POST(req(good))).status).toBe(409);
    }
    expect(sends()).toHaveLength(0);
  });

  it("403 when the caller isn't an owner or admin of that team", async () => {
    me = { ...me, role: "tech" };
    const { POST } = await import("@/app/api/team/invite-email/route");
    expect((await POST(req(good))).status).toBe(403);
    expect(sends()).toHaveLength(0);
  });

  it("rate limits per user per hour", async () => {
    const { POST } = await import("@/app/api/team/invite-email/route");
    for (let i = 0; i < 20; i++) expect((await POST(req(good))).status).toBe(200);
    const r = await POST(req(good));
    expect(r.status).toBe(429);
    expect(sends()).toHaveLength(20);
  });

  it("passes on a Resend failure as a friendly error", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    routes[RESEND] = () => Response.json({ name: "invalid_api_key" }, { status: 403 });
    const { POST } = await import("@/app/api/team/invite-email/route");
    const r = await POST(req(good));
    expect(r.status).toBe(502);
    expect((await r.json()).code).toBe("email_auth");
  });
});

// ------------------------------------------------------------------ proposal response notification
describe("POST /api/notify/proposal-response", () => {
  const TOKEN = "abcdefghijkmnpqrstuvwxyz23";
  let notified: string | null;
  let status: string;
  let kind: "proposal" | "review";
  const row = () => ({
    id: TOKEN,
    owner_id: "owner-1",
    project_id: "proj-1",
    status,
    client_name: "Pat Jones",
    chosen_options: ["opt:cam"],
    accepted_total: 1234.5,
    client_note: kind === "review" ? "Move the TV\n\nPinned on the plan:\n1st, pin 1 at (10%, 20%): here" : null,
    responded_at: "2026-11-19T15:00:00Z",
    response_notified_at: notified,
    snapshot: {
      kind,
      title: "Proposal — 12 Elm St",
      currency: "USD",
      business: { name: "Acme Low Voltage" },
      client: { name: "Pat Jones", email: "pat@client.com", address: "12 Elm St" },
      lines: [
        { key: "dev:cam", description: "Camera", optional: false },
        { key: "opt:cam", description: "Extra camera", optional: true },
        { key: "opt:ap", description: "Extra access point", optional: true },
      ],
    },
  });
  const req = (body: unknown, ip = "1.2.3.4") =>
    new Request("https://app.example.com/api/notify/proposal-response", { method: "POST", headers: { "Content-Type": "application/json", "x-forwarded-for": ip }, body: JSON.stringify(body) });

  beforeEach(() => {
    notified = null;
    status = "accepted";
    kind = "proposal";
    // A tiny PostgREST: PATCH with response_notified_at=is.null claims only an answered, un-notified row.
    routes[`${SB}/rest/v1/proposals`] = (url, init) => {
      const q = new URL(url).searchParams;
      const patch = JSON.parse(String(init.body)) as { response_notified_at: string | null };
      if (q.get("response_notified_at") === "is.null") {
        if (q.get("id") !== `eq.${TOKEN}` || notified || !["accepted", "declined"].includes(status)) return Response.json([]);
        notified = patch.response_notified_at;
        return Response.json([row()]);
      }
      if (q.get("response_notified_at")?.startsWith("eq.") && q.get("response_notified_at") === `eq.${notified}`) notified = patch.response_notified_at;
      return new Response(null, { status: 204 });
    };
    routes[`${SB}/auth/v1/admin/users/owner-1`] = () => Response.json({ id: "owner-1", email: "dana@acme.com", app_metadata: {}, user_metadata: {} });
    routes[RESEND] = resendOk;
  });

  it("does nothing (204) when email or the service key isn't set up", async () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    let { POST } = await import("@/app/api/notify/proposal-response/route");
    expect((await POST(req({ token: TOKEN }))).status).toBe(204);
    vi.resetModules();
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-key");
    vi.stubEnv("RESEND_API_KEY", "");
    ({ POST } = await import("@/app/api/notify/proposal-response/route"));
    expect((await POST(req({ token: TOKEN }))).status).toBe(204);
    expect(calls).toHaveLength(0);
  });

  it("rejects a malformed token without looking anything up", async () => {
    const { POST } = await import("@/app/api/notify/proposal-response/route");
    for (const token of ["short", "x".repeat(200), "abc'or'1'='1abcdefghijklmnop", 42]) expect((await POST(req({ token }))).status).toBe(400);
    expect(calls).toHaveLength(0);
  });

  it("emails the installer once, and a repeat call sends nothing", async () => {
    const { POST } = await import("@/app/api/notify/proposal-response/route");
    const r = await POST(req({ token: TOKEN }));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true });
    const claim = calls[0];
    expect(claim.method).toBe("PATCH");
    expect(claim.headers.authorization).toBe("Bearer service-key");
    expect(decodeURIComponent(claim.url)).toContain("status=in.(accepted,declined)");
    const s = sends()[0];
    const b = s.body as { to: string[]; subject: string; text: string; reply_to: string };
    expect(b.to).toEqual(["dana@acme.com"]);
    expect(b.subject).toBe("Proposal accepted: 12 Elm St");
    expect(b.text).toContain("Extra camera");
    expect(b.text).not.toContain("Extra access point");
    expect(b.text).toContain("$1,234.50");
    expect(b.text).toContain("https://app.example.com/project?id=proj-1&tab=estimate");
    expect(b.reply_to).toBe("pat@client.com");
    expect(s.headers["idempotency-key"]).toMatch(/^proposal-response\/[0-9a-f]{40}$/);
    expect(s.headers["idempotency-key"]).not.toContain(TOKEN);

    const again = await POST(req({ token: TOKEN }));
    expect(again.status).toBe(204);
    expect(sends()).toHaveLength(1);
  });

  it("plan review changes: subject, pin count, link to the takeoff tab", async () => {
    kind = "review";
    status = "declined";
    const { POST } = await import("@/app/api/notify/proposal-response/route");
    expect((await POST(req({ token: TOKEN }))).status).toBe(200);
    const b = sends()[0].body as { subject: string; text: string };
    expect(b.subject).toBe("Changes requested: 12 Elm St");
    expect(b.text).toContain("Pins on the plan: 1");
    expect(b.text).toContain("tab=takeoff");
  });

  it("an unanswered or unknown proposal gives the same empty answer", async () => {
    status = "viewed";
    const { POST } = await import("@/app/api/notify/proposal-response/route");
    const a = await POST(req({ token: TOKEN }));
    const b = await POST(req({ token: "zzzzzzzzzzzzzzzzzzzzzzzz" }));
    expect(a.status).toBe(204);
    expect(b.status).toBe(204);
    expect(await a.text()).toBe("");
    expect(sends()).toHaveLength(0);
  });

  it("releases the claim when sending fails, so a later call can retry", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    routes[RESEND] = () => Response.json({ name: "internal_server_error" }, { status: 500 });
    const { POST } = await import("@/app/api/notify/proposal-response/route");
    const r = await POST(req({ token: TOKEN }));
    expect(r.status).toBe(502);
    expect(await r.json()).toEqual({ ok: false });
    expect(notified).toBeNull();
    routes[RESEND] = resendOk;
    expect((await POST(req({ token: TOKEN }))).status).toBe(200);
    expect(notified).not.toBeNull();
  });

  it("no-ops quietly before the email migration is run", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    routes[`${SB}/rest/v1/proposals`] = () => Response.json({ code: "PGRST204", message: "Could not find the 'response_notified_at' column" }, { status: 400 });
    const { POST } = await import("@/app/api/notify/proposal-response/route");
    expect((await POST(req({ token: TOKEN }))).status).toBe(204);
    expect(sends()).toHaveLength(0);
  });

  it("rate limits per link", async () => {
    status = "viewed";
    const { POST } = await import("@/app/api/notify/proposal-response/route");
    for (let i = 0; i < 6; i++) expect((await POST(req({ token: TOKEN }, `9.9.9.${i}`)))?.status).toBe(204);
    expect((await POST(req({ token: TOKEN }, "9.9.9.99"))).status).toBe(429);
  });
});

// ------------------------------------------------------------------ welcome
describe("POST /api/email/welcome", () => {
  let appMeta: Record<string, unknown>;
  const req = (body?: unknown, token = "user-token") =>
    new Request("https://app.example.com/api/email/welcome", { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });

  beforeEach(() => {
    appMeta = { provider: "email" };
    routes[`${SB}/auth/v1/user`] = (_u, init) => (new Headers(init.headers).get("authorization") === "Bearer user-token" ? Response.json({ id: "u1" }) : new Response("{}", { status: 401 }));
    routes[`${SB}/auth/v1/admin/users/u1`] = (_u, init) => {
      if (init.method === "PUT") {
        appMeta = (JSON.parse(String(init.body)) as { app_metadata: Record<string, unknown> }).app_metadata;
        return Response.json({ id: "u1" });
      }
      return Response.json({ id: "u1", email: "dana@acme.com", app_metadata: appMeta, user_metadata: { name: "Dana" } });
    };
    routes[`${SB}/rest/v1/teams`] = () => Response.json([{ name: "Acme Low Voltage" }]);
    routes[RESEND] = resendOk;
  });

  it("sends once to the account's own address and remembers it", async () => {
    const { POST } = await import("@/app/api/email/welcome/route");
    const r = await POST(req({}));
    expect(r.status).toBe(200);
    const s = sends()[0];
    expect((s.body as { to: string[] }).to).toEqual(["dana@acme.com"]);
    expect((s.body as { subject: string }).subject).toBe("Welcome to Northpin, Acme Low Voltage");
    expect(s.headers["idempotency-key"]).toBe("welcome/u1");
    expect(appMeta.pinplan_welcome_sent_at).toBeTruthy();
    expect(appMeta.provider).toBe("email");

    const again = await POST(req());
    expect(await again.json()).toEqual({ ok: true, already: true });
    expect(sends()).toHaveLength(1);
  });

  it("501 when email or the service key is missing; 401 signed out", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    let { POST } = await import("@/app/api/email/welcome/route");
    expect((await POST(req())).status).toBe(501);
    vi.resetModules();
    vi.stubEnv("RESEND_API_KEY", "re_x");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    ({ POST } = await import("@/app/api/email/welcome/route"));
    expect((await POST(req())).status).toBe(501);
    vi.resetModules();
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-key");
    ({ POST } = await import("@/app/api/email/welcome/route"));
    expect((await POST(req(undefined, "bad"))).status).toBe(401);
    expect(sends()).toHaveLength(0);
  });
});
