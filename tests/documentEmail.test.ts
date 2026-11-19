// Quotes / invoices by email: the templates, POST /api/documents/email and POST /api/notify/document-response,
// with fetch mocked (no network, no real keys).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { documentEmail, documentResponseEmail } from "@/lib/emailTemplates";

const SB = "https://sb.example.co";
const RESEND = "https://api.resend.com/emails";
const TOKEN = "tok_abcdefghijklmnopqrstu";
type Call = { url: string; method: string; headers: Record<string, string>; body: unknown };
let calls: Call[];
let routes: Record<string, (url: string, init: RequestInit) => Response | Promise<Response>>;

const snapshot = {
  title: "Invoice",
  number: "INV-2026-0007",
  business: { name: "Brightline <Integration>", email: "office@brightline.example" },
  client: { name: "Jane Whitfield", email: "jane@example.com", siteAddress: "12 Maple Ridge Rd" },
  payment: { payUrl: "https://pay.example.com/x?amount={amount}&ref={number}" },
};
const docRow = { id: "d1", kind: "invoice", number: "INV-2026-0007", status: "sent", total: 1200, amount_paid: 200, balance_due: 1000, currency: "USD", due_date: "2000-01-01", valid_until: null, client: { name: "Jane Whitfield" }, deleted: false };

beforeEach(() => {
  vi.resetModules();
  calls = [];
  routes = {};
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", SB);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-key");
  vi.stubEnv("RESEND_API_KEY", "re_secret_123");
  vi.stubEnv("EMAIL_FROM", "PinPlan <noreply@example.com>");
  vi.stubEnv("EMAIL_REPLY_TO", "");
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
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const sends = () => calls.filter((c) => c.url === RESEND);
const signedIn = (role = "admin") => {
  routes[`${SB}/auth/v1/user`] = () => Response.json({ id: "u1" });
  routes[`${SB}/rest/v1/team_members`] = () => Response.json([{ role }]);
};
const post = (path: string, body: unknown, auth = true) =>
  new Request(`https://app.example.com${path}`, { method: "POST", headers: { "Content-Type": "application/json", ...(auth ? { Authorization: "Bearer user-token" } : {}) }, body: JSON.stringify(body) });

describe("templates", () => {
  it("invoice email: company-branded, escaped, with the link and pay button", () => {
    const e = documentEmail({ kind: "document", docKind: "invoice", title: "Invoice", number: "INV-1", companyName: "Acme <b>", clientName: "Jane", total: 100, balanceDue: 60, currency: "USD", dueDate: "2026-12-01", url: "https://app.example.com/d?t=abc", payUrl: "https://pay.example.com/p" });
    expect(e.subject).toBe("Invoice INV-1 from Acme <b>");
    expect(e.html).toContain("Acme &lt;b&gt;");
    expect(e.html).not.toContain("Acme <b>");
    expect(e.html).toContain("https://app.example.com/d?t=abc");
    expect(e.text).toContain("Pay $60.00 online: https://pay.example.com/p");
    expect(e.text.split("\n")[0]).toBe("Acme <b>");
  });

  it("quote email asks to review and accept; reminders and receipts read right", () => {
    const q = documentEmail({ kind: "document", docKind: "quote", title: "Estimate", number: "EST-3", companyName: "Acme", total: 5000, url: "https://x.example/d?t=1", validUntil: "2026-12-19" });
    expect(q.text).toContain("Review & accept: https://x.example/d?t=1");
    expect(q.text).toContain("Valid until: Dec 19, 2026");
    const r = documentEmail({ kind: "reminder", docKind: "invoice", title: "Invoice", number: "INV-2", companyName: "Acme", total: 100, balanceDue: 100, overdue: true, dueDate: "2026-11-01", url: "https://x.example/d?t=2" });
    expect(r.subject).toBe("Past due: Invoice INV-2 from Acme");
    const p = documentEmail({ kind: "receipt", docKind: "invoice", title: "Invoice", number: "INV-2", companyName: "Acme", total: 100, balanceDue: 0, amountPaid: 100, url: "https://x.example/d?t=2", lastPayment: { amount: 100, date: "2026-11-19", method: "Check" }, payUrl: "https://pay.example.com" });
    expect(p.subject).toBe("Payment received — Invoice INV-2");
    expect(p.text).not.toContain("online");
  });

  it("tells the company a quote was accepted", () => {
    const e = documentResponseEmail({ outcome: "accepted", title: "Quote", number: "Q-1", signerName: "Jane", jobName: "12 Maple", total: 3000, url: "https://app.example.com/project?id=p", note: "Start Monday?" });
    expect(e.subject).toBe("Accepted: Quote Q-1 — 12 Maple");
    expect(e.text).toContain("Start Monday?");
  });
});

describe("POST /api/documents/email", () => {
  const load = async () => (await import("@/app/api/documents/email/route")).POST;

  it("emails the client the link, pay link and reply-to the company", async () => {
    signedIn();
    routes[`${SB}/rest/v1/document_links`] = () => Response.json([{ document_id: "d1", status: "active", snapshot }]);
    routes[`${SB}/rest/v1/sales_documents`] = () => Response.json([docRow]);
    routes[RESEND] = () => Response.json({ id: "e1" });
    const r = await (await load())(post("/api/documents/email", { documentId: "d1", token: TOKEN, to: "jane@example.com", kind: "reminder", message: "Thanks!" }));
    expect(r.status).toBe(200);
    const c = sends()[0];
    expect(c.body).toMatchObject({ to: ["jane@example.com"], reply_to: "office@brightline.example", subject: "Past due: Invoice INV-2026-0007 from Brightline <Integration>" });
    const text = (c.body as { text: string }).text;
    expect(text).toContain(`https://app.example.com/d?t=${TOKEN}`);
    expect(text).toContain("https://pay.example.com/x?amount=1000.00&ref=INV-2026-0007");
    // Read with the caller's own token (row-level security decides).
    expect(calls.find((x) => x.url.includes("/rest/v1/sales_documents"))!.headers.authorization).toBe("Bearer user-token");
  });

  it("refuses technicians, unknown documents and withdrawn links", async () => {
    signedIn("tech");
    expect((await (await load())(post("/api/documents/email", { documentId: "d1", token: TOKEN, to: "jane@example.com" }))).status).toBe(403);
    vi.resetModules();
    signedIn();
    routes[`${SB}/rest/v1/document_links`] = () => Response.json([]);
    routes[`${SB}/rest/v1/sales_documents`] = () => Response.json([]);
    expect((await (await load())(post("/api/documents/email", { documentId: "d1", token: TOKEN, to: "jane@example.com" }))).status).toBe(404);
    vi.resetModules();
    signedIn();
    routes[`${SB}/rest/v1/document_links`] = () => Response.json([{ document_id: "d1", status: "revoked", snapshot }]);
    routes[`${SB}/rest/v1/sales_documents`] = () => Response.json([docRow]);
    expect((await (await load())(post("/api/documents/email", { documentId: "d1", token: TOKEN, to: "jane@example.com" }))).status).toBe(409);
    expect(sends()).toHaveLength(0);
  });

  it("501 without email; 400 for a bad address", async () => {
    signedIn();
    expect((await (await load())(post("/api/documents/email", { documentId: "d1", token: TOKEN, to: "nope" }))).status).toBe(400);
    vi.resetModules();
    vi.stubEnv("RESEND_API_KEY", "");
    expect((await (await load())(post("/api/documents/email", { documentId: "d1", token: TOKEN, to: "jane@example.com" }))).status).toBe(501);
  });
});

describe("POST /api/notify/document-response", () => {
  const load = async () => (await import("@/app/api/notify/document-response/route")).POST;

  it("emails whoever published the link, once", async () => {
    routes[`${SB}/rest/v1/document_links`] = (_u, init) => (init.method === "PATCH" ? Response.json([{ id: TOKEN, owner_id: "owner-1", project_id: "p1", document_id: "d1", snapshot: { ...snapshot, title: "Quote", number: "Q-1" } }]) : Response.json([]));
    routes[`${SB}/rest/v1/sales_documents`] = () => Response.json([{ status: "accepted", number: "Q-1", total: 3000, currency: "USD", signer_name: "Jane W", client_note: null, responded_at: "2026-11-19T10:00:00Z" }]);
    routes[`${SB}/auth/v1/admin/users/owner-1`] = () => Response.json({ id: "owner-1", email: "owner@brightline.example" });
    routes[RESEND] = () => Response.json({ id: "e1" });
    const r = await (await load())(post("/api/notify/document-response", { token: TOKEN }, false));
    expect(r.status).toBe(200);
    const claim = calls.find((c) => c.method === "PATCH")!;
    expect(claim.url).toContain("responded_at=not.is.null");
    expect(claim.url).toContain("response_notified_at=is.null");
    expect(sends()[0].body).toMatchObject({ to: ["owner@brightline.example"], reply_to: "jane@example.com" });
    expect((sends()[0].body as { text: string }).text).toContain("https://app.example.com/project?id=p1&tab=billing&doc=d1");
  });

  it("does nothing for an unanswered or already-notified link", async () => {
    routes[`${SB}/rest/v1/document_links`] = () => Response.json([]);
    const r = await (await load())(post("/api/notify/document-response", { token: TOKEN }, false));
    expect(r.status).toBe(204);
    expect(sends()).toHaveLength(0);
  });
});
