// POST /api/documents/email and /api/team/invite-email with the email abuse limits on (send log reservation, business
// reply-to, trial link stripping, https pay links), with fetch mocked: no network, no real keys, no real addresses.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const SB = "https://sb.example.co";
const RESEND = "https://api.resend.com/emails";
const RESERVE = `${SB}/rest/v1/rpc/email_send_reserve`;
const TOKEN = "tok_abcdefghijklmnopqrstu";
type Call = { url: string; method: string; headers: Record<string, string>; body: unknown };
let calls: Call[];
let routes: Record<string, (url: string, init: RequestInit) => Response | Promise<Response>>;
let reserve: Record<string, unknown>;
let company: Record<string, unknown>[];

const snapshot = {
  title: "Invoice",
  number: "INV-2026-0007",
  business: { name: "Sample Electric", email: "office@sample-electric.example" },
  client: { name: "Sample Client", email: "client@example.com" },
  payment: { payUrl: "https://buy.stripe.com/x?amount={amount}&ref={number}" },
};
const docRow = { id: "d1", kind: "invoice", number: "INV-2026-0007", status: "sent", total: 1200, amount_paid: 200, balance_due: 1000, currency: "USD", due_date: "2999-01-01", valid_until: null, client: { name: "Sample Client" }, deleted: false };

function setDocument(snap: Record<string, unknown> = snapshot, doc: Record<string, unknown> = docRow) {
  routes[`${SB}/rest/v1/document_links`] = () => Response.json([{ document_id: "d1", status: "active", snapshot: snap }]);
  routes[`${SB}/rest/v1/sales_documents`] = () => Response.json([doc]);
}

beforeEach(() => {
  vi.resetModules();
  calls = [];
  routes = {};
  reserve = { ok: true, id: 11, trial: false, team_id: "t1", sent_today: 1, cap: 300 };
  company = [{ business_name: "Sample Electric", email: "office@sample-electric.example" }];
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", SB);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-key");
  vi.stubEnv("RESEND_API_KEY", "re_secret_123");
  vi.stubEnv("EMAIL_FROM", "Northpin <noreply@example.com>");
  vi.stubEnv("EMAIL_REPLY_TO", "support@example.com");
  vi.stubEnv("PINPLAN_APP_URL", "https://app.example.com");
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
        /* text */
      }
      calls.push({ url, method: init.method ?? "GET", headers: Object.fromEntries(new Headers(init.headers).entries()), body });
      for (const [prefix, h] of Object.entries(routes)) if (url.startsWith(prefix)) return h(url, init);
      return new Response("not found", { status: 404 });
    }),
  );
  routes[`${SB}/auth/v1/user`] = () => Response.json({ id: "u1" });
  routes[`${SB}/rest/v1/team_members`] = () => Response.json([{ role: "admin" }]);
  routes[RESERVE] = () => Response.json(reserve);
  routes[`${SB}/rest/v1/company_settings`] = () => Response.json(company);
  routes[`${SB}/rest/v1/email_sends`] = () => new Response(null, { status: 204 });
  routes[RESEND] = () => Response.json({ id: "re_e1" });
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const sends = () => calls.filter((c) => c.url === RESEND);
const sent = () => sends()[0].body as { to: string[]; reply_to?: string; text: string; html: string; subject: string };
const post = (body: unknown) =>
  new Request("https://app.example.com/api/documents/email", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer user-token" }, body: JSON.stringify(body) });
const load = async () => (await import("@/app/api/documents/email/route")).POST;
const good = { documentId: "d1", token: TOKEN, to: "client@example.com", kind: "document", message: "Details at https://evil.example/login or secure-pay.com/x. Thanks!" };

describe("POST /api/documents/email (limits on)", () => {
  it("reserves the send, replies to the company only, and records Resend's id", async () => {
    setDocument();
    const r = await (await load())(post(good));
    expect(r.status).toBe(200);
    const reservation = calls.find((c) => c.url === RESERVE)!;
    expect(reservation.headers.authorization).toBe("Bearer service-key");
    expect(reservation.body).toMatchObject({ p_user: "u1", p_kind: "document" });
    expect(sent()).toMatchObject({ to: ["client@example.com"], reply_to: "office@sample-electric.example" });
    const log = calls.find((c) => c.url.startsWith(`${SB}/rest/v1/email_sends`))!;
    expect(log).toMatchObject({ method: "PATCH", url: `${SB}/rest/v1/email_sends?id=eq.11`, body: { resend_id: "re_e1" } });
    // A paying company's message is sent as written.
    expect(sent().text).toContain("https://evil.example/login");
  });

  it("a free trial can't send links in its message, and gets no pay button (the client link stays)", async () => {
    reserve = { ...reserve, trial: true, cap: 20 };
    setDocument();
    expect((await (await load())(post(good))).status).toBe(200);
    const t = sent().text;
    expect(t).not.toContain("evil.example");
    expect(t).not.toContain("secure-pay.com");
    expect(t).toContain("Details at [link removed] or [link removed] Thanks!");
    expect(t).toContain(`https://app.example.com/d?t=${TOKEN}`);
    expect(t).not.toContain("buy.stripe.com");
    expect(t).not.toContain("payment page");
  });

  it("needs the company's own business email: never replies to Northpin", async () => {
    company = [{ business_name: "Sample Electric", email: "" }];
    setDocument();
    const r = await (await load())(post(good));
    expect(r.status).toBe(400);
    const j = await r.json();
    expect(j.code).toBe("business_email_required");
    expect(j.error).toBe("Add your business email in Settings → Company → Your business, then send it again.");
    expect(sends()).toHaveLength(0);
    expect(calls.some((c) => c.url === RESERVE)).toBe(false);
  });

  it("no pay button for a plain-http pay link", async () => {
    setDocument({ ...snapshot, payment: { payUrl: "http://buy.stripe.com/x?amount={amount}" } });
    expect((await (await load())(post({ ...good, message: "" }))).status).toBe(200);
    expect(sent().text).not.toContain("buy.stripe.com");
    expect(sent().text).not.toContain("online:");
  });

  it("no pay button for a site that isn't a known payment site", async () => {
    for (const bad of ["https://pay.evil.example/x?amount={amount}", "https://buy.stripe.com.evil.example/x", "https://user@buy.stripe.com/x"]) {
      calls = [];
      setDocument({ ...snapshot, payment: { payUrl: bad } });
      expect((await (await load())(post({ ...good, message: "" }))).status).toBe(200);
      expect(sent().text).not.toContain("online:");
      expect(sent().text).not.toContain("evil.example");
    }
    calls = [];
    setDocument({ ...snapshot, payment: { payUrl: "https://www.paypal.com/paypalme/sample/{amount}" } });
    expect((await (await load())(post({ ...good, message: "" }))).status).toBe(200);
    expect(sent().text).toContain("online: https://www.paypal.com/paypalme/sample/1000.00");
  });

  it("the company's name and reply-to come from its settings, not the link's snapshot", async () => {
    setDocument({ ...snapshot, business: { name: "Sign in at evil.example", email: "attacker@evil.example" } });
    expect((await (await load())(post({ ...good, message: "" }))).status).toBe(200);
    expect(sent().reply_to).toBe("office@sample-electric.example");
    expect(sent().subject).toContain("Sample Electric");
    expect(JSON.stringify(sent())).not.toContain("evil.example");
    const read = calls.find((c) => c.url.startsWith(`${SB}/rest/v1/company_settings`))!;
    expect(read.headers.authorization).toBe("Bearer user-token");
  });

  it("a free trial can't put links in the title or the names either", async () => {
    reserve = { ...reserve, trial: true, cap: 20 };
    company = [{ business_name: "Acme www.evil.example", email: "office@sample-electric.example" }];
    setDocument({ ...snapshot, title: "Pay at evil-pay.com/now" }, { ...docRow, client: { name: "Visit http://evil.example/x" } });
    expect((await (await load())(post({ ...good, message: "" }))).status).toBe(200);
    expect(JSON.stringify(sent())).not.toMatch(/evil\.example|evil-pay\.com/);
    expect(sent().text).toContain("[link removed]");
  });

  it("a free trial can't put a link in the document number (its numbering format is the company's own text)", async () => {
    reserve = { ...reserve, trial: true, cap: 20 };
    setDocument(snapshot, { ...docRow, number: "Pay at evil-pay.com/now 0007" });
    expect((await (await load())(post({ ...good, message: "" }))).status).toBe(200);
    expect(JSON.stringify(sent())).not.toMatch(/evil-pay\.com/);
    expect(sent().subject).toContain("[link removed]");
  });

  it("refusals come back as they are and nothing is sent", async () => {
    setDocument();
    for (const [answer, status] of [
      [{ ok: false, reason: "daily_cap", trial: true, cap: 20 }, 429],
      [{ ok: false, reason: "unconfirmed" }, 403],
      [{ ok: false, reason: "plan_inactive" }, 402],
    ] as const) {
      reserve = answer;
      const r = await (await load())(post(good));
      expect(r.status).toBe(status);
    }
    expect(sends()).toHaveLength(0);
  });

  it("a failed send gives its allowance back", async () => {
    setDocument();
    routes[RESEND] = () => Response.json({ name: "validation_error" }, { status: 422 });
    const r = await (await load())(post(good));
    expect(r.status).toBe(400);
    expect(calls.find((c) => c.url.startsWith(`${SB}/rest/v1/email_sends`))).toMatchObject({ method: "DELETE", url: `${SB}/rest/v1/email_sends?id=eq.11` });
  });

  it("in production without PINPLAN_APP_URL: 501 before anything is read or sent", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("PINPLAN_APP_URL", "");
    setDocument();
    const r = await (await load())(post(good));
    expect(r.status).toBe(501);
    expect((await r.json()).code).toBe("app_url_unconfigured");
    expect(calls).toHaveLength(0);
  });

  it("errors are fixed messages: nothing from the database or Resend leaks through", async () => {
    setDocument();
    routes[RESERVE] = () => Response.json({ message: "relation secret_table does not exist" }, { status: 500 });
    const r = await (await load())(post(good));
    expect(r.status).toBe(503);
    expect(JSON.stringify(await r.json())).not.toContain("secret_table");
  });
});

describe("POST /api/team/invite-email (limits on)", () => {
  const future = new Date(Date.now() + 7 * 86400000).toISOString();
  const req = (body: unknown) =>
    new Request("https://app.example.com/api/team/invite-email", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer user-token" }, body: JSON.stringify(body) });

  beforeEach(() => {
    routes[`${SB}/rest/v1/team_invites`] = () => Response.json([{ code: "K7QMXR4TPA", team_id: "t1", role: "tech", name: "", expires_at: future, used_by: null, revoked: false }]);
    routes[`${SB}/rest/v1/teams`] = () => Response.json([{ name: "Sample Electric" }]);
    routes[`${SB}/rest/v1/team_members`] = () => Response.json([{ name: "Dana", email: "dana@sample-electric.example", role: "owner", team_id: "t1" }]);
  });

  it("reserves an invite and logs it", async () => {
    const { POST } = await import("@/app/api/team/invite-email/route");
    expect((await POST(req({ code: "K7QMXR4TPA", email: "crew@example.com" }))).status).toBe(200);
    expect(calls.find((c) => c.url === RESERVE)!.body).toMatchObject({ p_user: "u1", p_kind: "invite" });
    expect(sends()).toHaveLength(1);
  });

  it("a free trial's team, inviter and invitee names can't carry links", async () => {
    reserve = { ...reserve, trial: true, cap: 10 };
    routes[`${SB}/rest/v1/teams`] = () => Response.json([{ name: "Log in at www.evil.example" }]);
    routes[`${SB}/rest/v1/team_members`] = () => Response.json([{ name: "Visit evil-pay.com/x", email: "dana@sample-electric.example", role: "owner", team_id: "t1" }]);
    const { POST } = await import("@/app/api/team/invite-email/route");
    expect((await POST(req({ code: "K7QMXR4TPA", email: "crew@example.com", name: "http://evil.example/y" }))).status).toBe(200);
    const mail = JSON.stringify(sends()[0].body);
    expect(mail).not.toMatch(/evil\.example|evil-pay\.com/);
    expect(mail).toContain("[link removed]");
  });

  it("a paying team's names are sent as written", async () => {
    routes[`${SB}/rest/v1/teams`] = () => Response.json([{ name: "Sample Electric.com" }]);
    const { POST } = await import("@/app/api/team/invite-email/route");
    expect((await POST(req({ code: "K7QMXR4TPA", email: "crew@example.com" }))).status).toBe(200);
    expect(JSON.stringify(sends()[0].body)).toContain("Sample Electric.com");
  });

  it("a lapsed company or a full day of invites sends nothing", async () => {
    const { POST } = await import("@/app/api/team/invite-email/route");
    reserve = { ok: false, reason: "plan_inactive" };
    expect((await POST(req({ code: "K7QMXR4TPA", email: "crew@example.com" }))).status).toBe(402);
    reserve = { ok: false, reason: "daily_cap", trial: true, cap: 10 };
    const r = await POST(req({ code: "K7QMXR4TPA", email: "crew@example.com" }));
    expect(r.status).toBe(429);
    expect((await r.json()).error).toMatch(/Copy link/);
    expect(sends()).toHaveLength(0);
  });
});
