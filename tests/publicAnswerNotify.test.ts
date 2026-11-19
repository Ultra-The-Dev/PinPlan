// A client answers a change order or RFI from its link: the office is emailed once, a failed email never fails the
// client's answer, and the durable (database) answer limits apply. fetch is mocked: no network, no real addresses.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/server", () => ({ connection: async () => undefined }));

const SB = "https://sb.example.co";
const RESEND = "https://api.resend.com/emails";
const TOKEN = "AbCdEfGhJkMnPqRsTuVwXyZ2";
type Call = { url: string; method: string; headers: Record<string, string>; body: unknown };
let calls: Call[];
let routes: [string, string, (url: string, init: RequestInit) => Response | Promise<Response>][];
let allowed: boolean | null;

const on = (method: string, prefix: string, h: (url: string, init: RequestInit) => Response | Promise<Response>) => routes.unshift([method, prefix, h]);

beforeEach(() => {
  vi.resetModules();
  calls = [];
  routes = [];
  allowed = true;
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", SB);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-key");
  vi.stubEnv("RESEND_API_KEY", "re_secret_123");
  vi.stubEnv("EMAIL_FROM", "PinPlan <noreply@example.com>");
  vi.stubEnv("EMAIL_REPLY_TO", "");
  vi.stubEnv("PINPLAN_APP_URL", "https://app.example.com");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request, init: RequestInit = {}) => {
      const url = String(input instanceof Request ? input.url : input);
      const method = init.method ?? "GET";
      let body: unknown = init.body;
      if (typeof init.body === "string") {
        try {
          body = JSON.parse(init.body);
        } catch {
          /* text */
        }
      }
      calls.push({ url, method, headers: Object.fromEntries(new Headers(init.headers).entries()), body });
      for (const [m, prefix, h] of routes) if ((m === "*" || m === method) && url.startsWith(prefix)) return h(url, init);
      return new Response("not found", { status: 404 });
    }),
  );
  on("POST", `${SB}/rest/v1/rpc/answer_rate_hit`, () => (allowed === null ? new Response("nope", { status: 404 }) : Response.json(allowed)));
  on("POST", `${SB}/rest/v1/rpc/email_send_log`, () => Response.json(1));
  on("GET", `${SB}/rest/v1/projects`, () => Response.json([{ owner_id: "owner-1", address: "12 Sample St", client_name: "Sample Client" }]));
  on("GET", `${SB}/rest/v1/team_members?user_id=`, () => Response.json([{ team_id: "t1" }]));
  on("GET", `${SB}/rest/v1/team_members?team_id=`, (url) =>
    Response.json([{ email: "office@sample-electric.example", role: "admin" }, { email: "tech@sample-electric.example", role: "tech" }].filter((m) => !url.includes("role=in.") || m.role !== "tech")),
  );
  on("GET", `${SB}/auth/v1/admin/users/owner-1`, () => Response.json({ id: "owner-1", email: "owner@sample-electric.example" }));
  on("POST", RESEND, () => Response.json({ id: "re_n1" }));
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const sends = () => calls.filter((c) => c.url === RESEND);

// ------------------------------------------------------------------ change orders
describe("change order answered", () => {
  let row: Record<string, unknown>;
  let notified: string | null;
  const view = {
    v: 1,
    code: "CO-002",
    title: "Two extra cameras",
    reason: "client_request",
    reasonLabel: "Client request",
    description: "",
    scheduleDays: null,
    currency: "USD",
    lines: [],
    subtotal: 900,
    tax: 0,
    taxPct: 0,
    total: 900,
    project: { address: "12 Sample St", clientName: "Sample Client" },
    business: { name: "Sample Electric" },
    photos: [],
    sentAt: "2026-11-18T10:00:00Z",
  };
  const post = (body: unknown, ip = "198.51.100.7") =>
    new Request("http://localhost/api/change-orders/public", { method: "POST", headers: { "Content-Type": "application/json", "x-forwarded-for": ip }, body: JSON.stringify(body) });
  const load = async () => (await import("@/app/api/change-orders/public/route")).POST;

  beforeEach(() => {
    notified = null;
    row = { id: "co1", project_id: "p1", status: "sent", deleted: false, public_view: view, responded_at: null, approved_name: null, client_comment: null, created_by: "office@sample-electric.example" };
    on("GET", `${SB}/rest/v1/change_orders?share_token=`, () => Response.json([row]));
    on("PATCH", `${SB}/rest/v1/change_orders?id=eq.co1&status=eq.sent`, (_u, init) => {
      if (row.status !== "sent") return Response.json([]);
      row = { ...row, ...(JSON.parse(String(init.body)) as Record<string, unknown>) };
      return Response.json([row]);
    });
    // The notification claim (and its release).
    on("PATCH", `${SB}/rest/v1/change_orders?id=eq.co1&status=in.`, (url, init) => {
      const u = decodeURIComponent(url);
      if (!u.includes("response_notified_at=is.null") || notified || !["approved", "rejected"].includes(String(row.status))) return Response.json([]);
      notified = (JSON.parse(String(init.body)) as { response_notified_at: string }).response_notified_at;
      return Response.json([row]);
    });
    on("PATCH", `${SB}/rest/v1/change_orders?id=eq.co1&response_notified_at=eq.`, () => {
      notified = null;
      return new Response(null, { status: 204 });
    });
  });

  it("emails the office person who sent it, once, and logs it", async () => {
    const POST = await load();
    const r = await POST(post({ t: TOKEN, decision: "reject", name: "Sample Client", comment: "Too much right now" }));
    expect(r.status).toBe(200);
    expect(notified).not.toBeNull();
    expect(sends()).toHaveLength(1);
    const b = sends()[0].body as { to: string[]; subject: string; text: string };
    expect(b.to).toEqual(["office@sample-electric.example"]);
    expect(b.subject).toBe("Rejected: CO-002 Two extra cameras — 12 Sample St");
    expect(b.text).toContain("Too much right now");
    expect(b.text).toContain("https://app.example.com/project?id=p1&tab=changes");
    expect(calls.some((c) => c.url === `${SB}/rest/v1/rpc/email_send_log`)).toBe(true);
    // A repeat answer is refused and sends nothing more.
    expect((await POST(post({ t: TOKEN, decision: "reject", name: "Sample Client" }))).status).toBe(409);
    expect(sends()).toHaveLength(1);
  });

  it("a creator who isn't office staff: the job's owner hears instead", async () => {
    row.created_by = "tech@sample-electric.example";
    expect((await (await load())(post({ t: TOKEN, decision: "reject", name: "Sample Client" }))).status).toBe(200);
    expect((sends()[0].body as { to: string[] }).to).toEqual(["owner@sample-electric.example"]);
  });

  it("a failed email never fails the client's answer, and is released for a retry", async () => {
    on("POST", RESEND, () => Response.json({ name: "internal_server_error" }, { status: 500 }));
    const r = await (await load())(post({ t: TOKEN, decision: "reject", name: "Sample Client" }));
    expect(r.status).toBe(200);
    expect(row.status).toBe("rejected");
    expect(notified).toBeNull();
  });

  it("a broken database during the email still answers the client", async () => {
    on("GET", `${SB}/rest/v1/projects`, () => {
      throw new Error("network down");
    });
    const r = await (await load())(post({ t: TOKEN, decision: "reject", name: "Sample Client" }));
    expect(r.status).toBe(200);
    expect(sends()).toHaveLength(0);
    expect(notified).toBeNull();
  });

  it("without PINPLAN_APP_URL in production: answered, but no claim and no email", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("PINPLAN_APP_URL", "");
    expect((await (await load())(post({ t: TOKEN, decision: "reject", name: "Sample Client" }))).status).toBe(200);
    expect(notified).toBeNull();
    expect(sends()).toHaveLength(0);
  });

  it("the shared answer limit refuses when the database says so", async () => {
    allowed = false;
    const r = await (await load())(post({ t: TOKEN, decision: "reject", name: "Sample Client" }));
    expect(r.status).toBe(429);
    expect(row.status).toBe("sent");
    // Keys are hashed: the IP address and the link token never reach the database.
    const hits = calls.filter((c) => c.url.endsWith("/rpc/answer_rate_hit"));
    expect(hits.length).toBeGreaterThan(0);
    expect(JSON.stringify(hits)).not.toContain("198.51.100.7");
    expect(JSON.stringify(hits)).not.toContain(TOKEN);
  });

  it("falls back to the in-memory limits when the database can't answer", async () => {
    allowed = null;
    expect((await (await load())(post({ t: TOKEN, decision: "reject", name: "Sample Client" }))).status).toBe(200);
  });
});

// ------------------------------------------------------------------ RFIs
describe("RFI answered", () => {
  let row: Record<string, unknown>;
  let claimUrl: string;
  const post = (body: unknown, ip = "198.51.100.8") =>
    new Request("http://localhost/api/rfis/public", { method: "POST", headers: { "Content-Type": "application/json", "x-forwarded-for": ip }, body: JSON.stringify(body) });
  const load = async () => (await import("@/app/api/rfis/public/route")).POST;

  beforeEach(() => {
    claimUrl = "";
    row = {
      id: "r1",
      project_id: "p1",
      number: 7,
      subject: "Mount height for the AP",
      question: "Ceiling or wall?",
      status: "open",
      ball_in_court: "them",
      share_token: TOKEN,
      created_by: "Sam",
      to_company: "Sample Design Co",
      sender: { company: "Sample Electric" },
      deleted: false,
      updated_at: "2026-11-18T10:00:00Z",
      created_at: "2026-11-18T09:00:00Z",
    };
    on("GET", `${SB}/rest/v1/rfis?share_token=`, () => Response.json([row]));
    on("PATCH", `${SB}/rest/v1/rfis?id=eq.r1&status=eq.open`, (_u, init) => {
      if (row.status !== "open") return Response.json([]);
      row = { ...row, ...(JSON.parse(String(init.body)) as Record<string, unknown>) };
      return Response.json([row]);
    });
    on("PATCH", `${SB}/rest/v1/rfis?id=eq.r1&status=eq.answered`, (url) => {
      claimUrl = decodeURIComponent(url);
      return Response.json([row]);
    });
    on("GET", `${SB}/rest/v1/photos`, () => Response.json([]));
    on("GET", `${SB}/rest/v1/sheets`, () => Response.json([]));
  });

  it("emails the job's owner (the RFI was raised by name) with the answer", async () => {
    const r = await (await load())(post({ t: TOKEN, answer: "Ceiling, centre of the room.", name: "Pat Architect" }));
    expect(r.status).toBe(200);
    expect(claimUrl).toContain(`answered_at=eq.${row.answered_at}`);
    expect(claimUrl).toContain("or=(response_notified_at.is.null,response_notified_at.lt.");
    const b = sends()[0].body as { to: string[]; subject: string; text: string };
    expect(b.to).toEqual(["owner@sample-electric.example"]);
    expect(b.subject).toBe("Answered: RFI-007: Mount height for the AP — 12 Sample St");
    expect(b.text).toContain("Ceiling, centre of the room.");
    expect(b.text).toContain("https://app.example.com/project?id=p1&tab=field&section=rfis");
  });

  it("an RFI already announced for this answer sends nothing", async () => {
    on("PATCH", `${SB}/rest/v1/rfis?id=eq.r1&status=eq.answered`, () => Response.json([]));
    expect((await (await load())(post({ t: TOKEN, answer: "Yes", name: "Pat" }))).status).toBe(200);
    expect(sends()).toHaveLength(0);
  });

  it("email not set up: answered all the same", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    expect((await (await load())(post({ t: TOKEN, answer: "Yes", name: "Pat" }))).status).toBe(200);
    expect(claimUrl).toBe("");
  });

  it("the shared answer limit applies to RFIs too", async () => {
    allowed = false;
    expect((await (await load())(post({ t: TOKEN, answer: "Yes", name: "Pat" }))).status).toBe(429);
    expect(row.status).toBe("open");
  });
});
