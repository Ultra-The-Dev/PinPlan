// RFIs: numbering, the status/ball-in-court matrix, overdue, summary, permissions, email text, the public view
// whitelist, the sync mapping and the no-login answer route (Supabase mocked).
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  canEditRfi,
  canRfi,
  canTransition,
  emailText,
  filterRfis,
  isOverdue,
  mailtoUrl,
  newRfi,
  newShareToken,
  nextRfiNumber,
  parseCc,
  planCropRect,
  publicRfiView,
  RFI_TRANSITIONS,
  rfiCode,
  rfiSummary,
  SHARE_TOKEN_RE,
  transition,
  type RfiAction,
} from "@/lib/rfis";
import { PUSH_ORDER, TABLES, toLocal, toRemote } from "@/lib/syncMap";
import type { Rfi, RfiStatus } from "@/lib/types";

const T0 = "2026-11-19T15:00:00.000Z";
const base = (p: Partial<Rfi> = {}): Rfi => ({ ...newRfi("r1", "p1", 7, "Sam", T0), subject: "FACP location", question: "Where does the FACP go?", ...p });

describe("numbering and codes", () => {
  it("numbers one past the highest ever used, deleted and void included", () => {
    expect(nextRfiNumber([])).toBe(1);
    expect(nextRfiNumber([{ number: 1 }, { number: 4 }, { number: 2 }])).toBe(5);
    expect(nextRfiNumber([base({ number: 9, deleted: true }), base({ number: 3, status: "void" })])).toBe(10);
  });
  it("formats codes with three digits and never cuts wider numbers", () => {
    expect(rfiCode(7)).toBe("RFI-007");
    expect(rfiCode(42)).toBe("RFI-042");
    expect(rfiCode(1234)).toBe("RFI-1234");
    expect(rfiCode(0)).toBe("RFI-000");
  });
  it("makes 24-character URL-safe share tokens", () => {
    const t = newShareToken();
    expect(t).toHaveLength(24);
    expect(SHARE_TOKEN_RE.test(t)).toBe(true);
    expect(newShareToken()).not.toBe(t);
    // Deterministic with a fixed source, and bytes past the fair range are skipped.
    expect(newShareToken((n) => new Uint8Array(n).fill(255).map((_, i) => (i % 2 ? 1 : 255)))).toBe("B".repeat(24));
  });
});

describe("transitions and ball in court", () => {
  const statuses: RfiStatus[] = ["draft", "open", "answered", "closed", "void"];
  const actions: RfiAction[] = ["send", "answer", "close", "reopen", "void"];

  it("allows exactly the moves in the matrix and throws on the rest", () => {
    for (const s of statuses)
      for (const a of actions) {
        const r = base({ status: s, answer: s === "answered" ? "x" : null });
        const run = () => transition(r, a, "Pat", T0, { answer: "Garage", shareToken: "tok_tok_tok_tok_tok_tok" });
        if (RFI_TRANSITIONS[a].includes(s)) expect(run, `${a} from ${s}`).not.toThrow();
        else expect(run, `${a} from ${s}`).toThrow();
        expect(canTransition(s, a)).toBe(RFI_TRANSITIONS[a].includes(s));
      }
    expect(RFI_TRANSITIONS.answer).toEqual(["open"]);
    expect(RFI_TRANSITIONS.send).toEqual(["draft", "open"]);
  });

  it("send opens it, puts the ball with them, stamps sentAt once and keeps the token", () => {
    const sent = transition(base(), "send", "Sam", T0, { shareToken: "abcabcabcabcabcabcabcabc" });
    expect(sent).toMatchObject({ status: "open", ballInCourt: "them", sentAt: T0, shareToken: "abcabcabcabcabcabcabcabc" });
    const again = transition(sent, "send", "Sam", "2026-11-21T00:00:00.000Z");
    expect(again.sentAt).toBe(T0);
    expect(again.shareToken).toBe("abcabcabcabcabcabcabcabc");
  });

  it("answer puts the ball with us and records who and when", () => {
    const open = transition(base(), "send", "Sam", T0);
    const a = transition(open, "answer", "Pat Rivera", "2026-11-20T10:00:00.000Z", { answer: "  Garage wall  " });
    expect(a).toMatchObject({ status: "answered", ballInCourt: "us", answer: "Garage wall", answeredBy: "Pat Rivera", answeredAt: "2026-11-20T10:00:00.000Z" });
    expect(() => transition(open, "answer", "Pat", T0, { answer: "   " })).toThrow(/answer/i);
  });

  it("close, reopen and void set the ball and closedAt; reopen keeps the earlier answer", () => {
    const answered = transition(transition(base(), "send", "Sam", T0), "answer", "Pat", T0, { answer: "Garage" });
    const closed = transition(answered, "close", "Sam", "2026-11-22T00:00:00.000Z");
    expect(closed).toMatchObject({ status: "closed", ballInCourt: "us", closedAt: "2026-11-22T00:00:00.000Z" });
    const re = transition(closed, "reopen", "Sam", T0);
    expect(re).toMatchObject({ status: "open", ballInCourt: "them", closedAt: null, answer: "Garage" });
    const v = transition(re, "void", "Sam", T0);
    expect(v).toMatchObject({ status: "void", ballInCourt: "us" });
    expect(() => transition(v, "reopen", "Sam", T0)).toThrow();
  });

  it("refuses to send an empty RFI or touch a deleted one", () => {
    expect(() => transition(base({ subject: "", question: " " }), "send", "Sam", T0)).toThrow();
    expect(() => transition(base({ deleted: true }), "send", "Sam", T0)).toThrow();
  });
});

describe("overdue", () => {
  it("is overdue only when open and due before today", () => {
    expect(isOverdue(base({ status: "open", due: "2026-11-18" }), "2026-11-19")).toBe(true);
    expect(isOverdue(base({ status: "open", due: "2026-11-19" }), "2026-11-19")).toBe(false);
    expect(isOverdue(base({ status: "open", due: "2026-11-20" }), "2026-11-19")).toBe(false);
    expect(isOverdue(base({ status: "open", due: null }), "2026-11-19")).toBe(false);
    for (const s of ["draft", "answered", "closed", "void"] as RfiStatus[]) expect(isOverdue(base({ status: s, due: "2026-01-01" }), "2026-11-19")).toBe(false);
    expect(isOverdue(base({ status: "open", due: "2026-01-01", deleted: true }), "2026-11-19")).toBe(false);
  });
});

describe("summary and filters", () => {
  const list: Rfi[] = [
    base({ id: "a", number: 1, status: "open", ballInCourt: "them", due: "2026-11-10" }),
    base({ id: "b", number: 2, status: "open", ballInCourt: "them", due: "2026-12-10" }),
    base({ id: "c", number: 3, status: "answered", ballInCourt: "us", sentAt: "2026-11-01T12:00:00.000Z", answeredAt: "2026-11-04T12:00:00.000Z" }),
    base({ id: "d", number: 4, status: "closed", ballInCourt: "us", sentAt: "2026-11-01T12:00:00.000Z", answeredAt: "2026-11-02T00:00:00.000Z" }),
    base({ id: "e", number: 5, status: "void" }),
    base({ id: "f", number: 6, status: "open", deleted: true, due: "2026-01-01" }),
    base({ id: "g", number: 7, status: "draft" }),
  ];
  it("counts open, overdue, with them and the average days to answer", () => {
    expect(rfiSummary(list, "2026-11-19")).toEqual({ open: 2, overdue: 1, withThem: 2, avgDaysToAnswer: 1.8, total: 5 });
    expect(rfiSummary([], "2026-11-19").avgDaysToAnswer).toBeNull();
  });
  it("filters open / with them / overdue / all, newest number first", () => {
    expect(filterRfis(list, "open", "2026-11-19").map((r) => r.id)).toEqual(["g", "c", "b", "a"]);
    expect(filterRfis(list, "them", "2026-11-19").map((r) => r.id)).toEqual(["b", "a"]);
    expect(filterRfis(list, "overdue", "2026-11-19").map((r) => r.id)).toEqual(["a"]);
    expect(filterRfis(list, "all", "2026-11-19").map((r) => r.id)).toEqual(["g", "e", "d", "c", "b", "a"]);
  });
});

describe("permissions", () => {
  it("techs create drafts and add photos; the office sends, closes and voids", () => {
    for (const a of ["view", "create", "editDraft", "addPhoto"] as const) expect(canRfi("tech", a)).toBe(true);
    for (const a of ["send", "close", "void", "reopen", "recordAnswer", "edit", "delete"] as const) expect(canRfi("tech", a)).toBe(false);
    for (const role of ["owner", "admin", null, undefined] as const) for (const a of ["send", "close", "void", "edit"] as const) expect(canRfi(role, a)).toBe(true);
  });
  it("techs edit only drafts; nobody edits a void one", () => {
    expect(canEditRfi("tech", { status: "draft" })).toBe(true);
    expect(canEditRfi("tech", { status: "open" })).toBe(false);
    expect(canEditRfi("admin", { status: "open" })).toBe(true);
    expect(canEditRfi("owner", { status: "void" })).toBe(false);
  });
});

describe("email text", () => {
  const project = { address: "12 Oak St", clientName: "Smith" };
  it("carries the code, subject, question, due date and the answer link", () => {
    const r = base({ toName: "Pat Rivera", suggestion: "Garage by the panel", due: "2026-11-25", photoIds: ["ph1", "ph2"], sheetId: "s", x: 0.5, y: 0.5, costImpact: "yes" });
    const link = "https://app.example.com/q?t=abcabcabcabcabcabcabcabc";
    const { subject, body } = emailText(r, project, link, { sheetName: "First floor", from: "Sam", company: "Acme Low Voltage" });
    expect(subject).toBe("RFI-007: FACP location — 12 Oak St");
    expect(body).toContain("Hi Pat,");
    expect(body).toContain("Where does the FACP go?");
    expect(body).toContain("Our suggestion: Garage by the panel");
    expect(body).toContain("Nov 25, 2026");
    expect(body).toContain('plan sheet "First floor"');
    expect(body).toContain("Photos: 2");
    expect(body).toContain(link);
    expect(body).toContain("Acme Low Voltage");
  });
  it("asks for a reply when there's no link (no cloud sync), and builds a mailto with cc", () => {
    const t = emailText(base(), project, null);
    expect(t.body).toContain("reply to this email");
    expect(t.body).not.toContain("/q?t=");
    const url = mailtoUrl("pat@gc.com", ["a@b.co", "c@d.co"], t);
    expect(url.startsWith("mailto:pat%40gc.com?cc=a%40b.co,c%40d.co&subject=RFI-007")).toBe(true);
    expect(decodeURIComponent(url.split("body=")[1])).toBe(t.body);
  });
  it("parses typed CC lists", () => {
    expect(parseCc("a@b.co, c@d.co; nope  a@b.co\ne@f.co")).toEqual(["a@b.co", "c@d.co", "e@f.co"]);
  });
});

describe("public view", () => {
  const photos = [{ url: "https://sb/x.jpg?token=1", width: 4, height: 3, caption: "Garage", annotations: [] }];
  it("shows only whitelisted fields (no author, emails, ids, tokens or internal links)", () => {
    const r = base({
      status: "open",
      ballInCourt: "them",
      createdBy: "sam@acme.com",
      toEmail: "pat@gc.com",
      cc: ["boss@gc.com"],
      shareToken: "secretsecretsecretsecret",
      taskId: "task-1",
      markerId: "m-1",
      documentIds: ["doc-1"],
      photoIds: ["ph-1"],
      sheetId: "sheet-1",
      x: 0.2,
      y: 0.3,
      sender: { company: "Acme", contact: "Sam", email: "office@acme.com", logo: "javascript:alert(1)", brandColor: "red;background:url(x)" },
    });
    const v = publicRfiView(r, { address: "12 Oak St", clientName: "Smith", notes: "internal" } as never, photos, { url: "https://sb/plan.png", width: 100, height: 80, x: 0.2, y: 0.3, sheetName: "L1" })!;
    expect(Object.keys(v).sort()).toEqual(
      ["address", "answer", "answeredAt", "answeredBy", "code", "costImpact", "due", "photos", "plan", "priority", "question", "scheduleImpact", "sender", "sentAt", "status", "subject", "suggestion", "toCompany", "toName"].sort(),
    );
    const s = JSON.stringify(v);
    for (const secret of ["sam@acme.com", "pat@gc.com", "boss@gc.com", "secretsecret", "task-1", "m-1", "doc-1", "ph-1", "sheet-1", "Smith", "internal", "javascript:", "background"]) expect(s).not.toContain(secret);
    expect(v).toMatchObject({ code: "RFI-007", address: "12 Oak St", status: "open", sender: { company: "Acme", email: "office@acme.com", logo: null, brandColor: null } });
    expect(v.plan).toEqual({ url: "https://sb/plan.png", width: 100, height: 80, x: 0.2, y: 0.3, sheetName: "L1" });
  });
  it("hides drafts, void and deleted RFIs entirely", () => {
    expect(publicRfiView(base({ status: "draft" }), null, [])).toBeNull();
    expect(publicRfiView(base({ status: "void" }), null, [])).toBeNull();
    expect(publicRfiView(base({ status: "open", deleted: true }), null, [])).toBeNull();
    expect(publicRfiView(base({ status: "closed", answer: "ok" }), null, [])?.answer).toBe("ok");
  });
});

describe("plan crop", () => {
  it("keeps a 4:3 window inside the sheet, centred on the spot when it can", () => {
    const c = planCropRect(0.5, 0.5, 4000, 3000);
    expect(c.x + c.w / 2).toBeCloseTo(0.5);
    expect(c.y + c.h / 2).toBeCloseTo(0.5);
    expect((c.w * 4000) / (c.h * 3000)).toBeCloseTo(4 / 3, 2);
    const corner = planCropRect(0, 1, 4000, 3000);
    expect(corner.x).toBe(0);
    expect(corner.y + corner.h).toBeCloseTo(1);
    const tiny = planCropRect(0.5, 0.5, 100, 50, 2);
    expect(tiny).toEqual({ x: 0, y: 0, w: 1, h: 1 });
  });
});

describe("sync mapping", () => {
  it("round-trips every field and is pushed after its project", () => {
    const r = base({
      status: "answered", ballInCourt: "us", suggestion: "s", priority: "high", costImpact: "yes", scheduleImpact: "no", toName: "Pat", toEmail: "p@g.co", toCompany: "GC", cc: ["a@b.co"],
      due: "2026-11-25", sheetId: "s", x: 0.25, y: 0.75, markerId: "m", taskId: "t", photoIds: ["ph"], documentIds: ["d"], answer: "A", answeredBy: "Pat", answeredAt: "2026-11-20T10:00:00.000Z",
      shareToken: "tok", sentAt: T0, closedAt: null, sender: { company: "Acme" },
    });
    const remote = toRemote("rfis", r as unknown as Record<string, unknown>);
    expect(remote).toMatchObject({ project_id: "p1", ball_in_court: "us", share_token: "tok", photo_ids: ["ph"], answered_at: "2026-11-20T10:00:00.000Z", due: "2026-11-25", deleted: false });
    const back = toLocal("rfis", { ...remote, answered_at: "2026-11-20T10:00:00+00:00", sent_at: "2026-11-19T15:00:00+00:00" });
    for (const [k, v] of Object.entries(r)) if (v != null) expect(back[k], k).toEqual(v);
    expect(PUSH_ORDER.indexOf("rfis")).toBeGreaterThan(PUSH_ORDER.indexOf("projects"));
    expect(TABLES.rfis.remote).toBe("rfis");
  });
  it("sends the NOT NULL columns even for a sparse row", () => {
    expect(toRemote("rfis", { id: "x", projectId: "p" })).toMatchObject({ number: 0, subject: "", question: "", status: "draft", ball_in_court: "us" });
  });
  it("the migration has RLS by job membership, a unique token index and the write guard", () => {
    const sql = readFileSync(path.resolve(__dirname, "../supabase/migrations/20261123100700_rfis.sql"), "utf8");
    expect(sql).toMatch(/create policy rfis_member on public\.rfis for all\s+using \(public\.is_project_member\(project_id\)\)/);
    expect(sql).toMatch(/create unique index if not exists rfis_share_token_key on public\.rfis \(share_token\)/);
    expect(sql).toMatch(/execute function public\.job_write_guard\(\)/);
    expect(sql).not.toMatch(/to anon/);
    // Stale offline copies can't blank an answer, un-send, un-void or delete a sent RFI.
    expect(sql).toMatch(/old\.answered_at is not null and new\.answered_at is null/);
    expect(sql).toMatch(/old\.status <> 'draft' and new\.status = 'draft'/);
    expect(sql).toMatch(/old\.status = 'void' and new\.status <> 'void'/);
    expect(sql).toMatch(/old\.share_token is not null and new\.share_token is null/);
  });
});

// ---------------- the no-login answer route ----------------

const URL_ = "https://sb.example.co";
const TOKEN = "abcdefghijklmnopqrstuvwx";
type Call = { url: string; method: string; headers: Record<string, string>; body: Record<string, unknown> | null };

function row(p: Record<string, unknown> = {}) {
  return {
    id: "r1", project_id: "p1", number: 3, subject: "Cans", question: "IC-rated?", suggestion: null, status: "open", ball_in_court: "them", share_token: TOKEN, deleted: false,
    photo_ids: ["ph1"], sheet_id: "s1", x: 0.4, y: 0.6, created_by: "sam@acme.com", to_email: "pat@gc.com", answer: null, answered_by: null, answered_at: null,
    created_at: T0, updated_at: T0, sender: { company: "Acme" }, ...p,
  };
}

describe("api/rfis/public", () => {
  let calls: Call[];
  let current: Record<string, unknown> | null;

  beforeEach(() => {
    vi.resetModules();
    calls = [];
    current = row();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", URL_);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-key");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input instanceof Request ? input.url : input);
        const method = init?.method ?? "GET";
        calls.push({ url, method, headers: Object.fromEntries(new Headers(init?.headers).entries()), body: init?.body ? JSON.parse(String(init.body)) : null });
        const u = new URL(url);
        if (u.pathname === "/rest/v1/rfis" && method === "GET") {
          const tok = u.searchParams.get("share_token");
          return Response.json(current && tok === `eq.${current.share_token}` && !current.deleted ? [current] : []);
        }
        if (u.pathname === "/rest/v1/rfis" && method === "PATCH") {
          if (!current || u.searchParams.get("status") !== "eq.open" || current.status !== "open") return Response.json([]);
          current = { ...current, ...(JSON.parse(String(init!.body)) as Record<string, unknown>) };
          return Response.json([current]);
        }
        if (u.pathname === "/rest/v1/projects") return Response.json([{ address: "12 Oak St" }]);
        if (u.pathname === "/rest/v1/photos") return Response.json([{ id: "ph1", image_id: "img1", width: 400, height: 300, caption: "Ceiling", annotations: [] }]);
        if (u.pathname === "/rest/v1/sheets") return Response.json([{ image_id: "simg", image_path: "p1/simg", width: 1000, height: 800, name: "L1" }]);
        if (u.pathname === "/storage/v1/object/sign/plans") {
          const { paths } = JSON.parse(String(init!.body)) as { paths: string[] };
          return Response.json(paths.map((p) => ({ path: p, signedURL: `/object/sign/plans/${p}?token=sig`, error: null })));
        }
        return new Response("not found", { status: 404 });
      }),
    );
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  const get = (t: string, ip = "1.1.1.1") => new Request(`http://localhost/api/rfis/public?t=${t}`, { headers: { "x-forwarded-for": ip } });
  const post = (body: unknown, ip = "2.2.2.2") => new Request("http://localhost/api/rfis/public", { method: "POST", headers: { "Content-Type": "application/json", "x-forwarded-for": ip }, body: JSON.stringify(body) });

  it("404s a bad or unknown token without leaking anything", async () => {
    const { GET } = await import("@/app/api/rfis/public/route");
    expect((await GET(get("short"))).status).toBe(404);
    expect(calls).toHaveLength(0);
    expect((await GET(get("zzzzzzzzzzzzzzzzzzzzzzzz"))).status).toBe(404);
  });

  it("returns the whitelisted view with signed photo and plan URLs, read with the service key", async () => {
    const { GET } = await import("@/app/api/rfis/public/route");
    const r = await GET(get(TOKEN));
    expect(r.status).toBe(200);
    const v = await r.json();
    expect(v).toMatchObject({ code: "RFI-003", subject: "Cans", address: "12 Oak St", status: "open" });
    expect(v.photos[0].url).toBe(`${URL_}/storage/v1/object/sign/plans/p1/img1?token=sig`);
    expect(v.plan).toMatchObject({ url: `${URL_}/storage/v1/object/sign/plans/p1/simg?token=sig`, x: 0.4, y: 0.6, sheetName: "L1" });
    expect(JSON.stringify(v)).not.toContain("sam@acme.com");
    expect(JSON.stringify(v)).not.toContain("pat@gc.com");
    expect(JSON.stringify(v)).not.toContain(TOKEN);
    expect(calls[0].headers.authorization).toBe("Bearer service-key");
  });

  it("void and draft RFIs look like unknown links (GET and POST)", async () => {
    const { GET, POST } = await import("@/app/api/rfis/public/route");
    for (const status of ["void", "draft"]) {
      current = row({ status });
      expect((await GET(get(TOKEN))).status).toBe(404);
      expect((await POST(post({ t: TOKEN, answer: "Yes", name: "Pat" }))).status).toBe(404);
      expect(calls.some((c) => c.method === "PATCH")).toBe(false);
    }
  });

  it("answering sets the answer, status answered, ball with us and bumps updated_at", async () => {
    const { POST } = await import("@/app/api/rfis/public/route");
    const r = await POST(post({ t: TOKEN, answer: "  Yes, IC-rated  ", name: "Pat Rivera" }));
    expect(r.status).toBe(200);
    const patch = calls.find((c) => c.method === "PATCH")!;
    expect(patch.url).toContain("status=eq.open");
    expect(patch.body).toMatchObject({ answer: "Yes, IC-rated", answered_by: "Pat Rivera", status: "answered", ball_in_court: "us" });
    expect(patch.body!.updated_at).toBe(patch.body!.answered_at);
    expect(Date.parse(String(patch.body!.updated_at))).toBeGreaterThan(Date.parse(T0));
    expect(Object.keys(patch.body!).sort()).toEqual(["answer", "answered_at", "answered_by", "ball_in_court", "status", "updated_at"]);
    const j = await r.json();
    expect(j.view).toMatchObject({ status: "answered", answer: "Yes, IC-rated", answeredBy: "Pat Rivera" });
    // A second answer is refused.
    expect((await POST(post({ t: TOKEN, answer: "No", name: "Someone" }))).status).toBe(409);
  });

  it("stamps the answer newer than the row even when the last device's clock ran ahead", async () => {
    const ahead = new Date(Date.now() + 3_600_000).toISOString();
    current = row({ updated_at: ahead });
    const { POST } = await import("@/app/api/rfis/public/route");
    expect((await POST(post({ t: TOKEN, answer: "Yes", name: "Pat" }, "3.3.3.3"))).status).toBe(200);
    const patch = calls.find((c) => c.method === "PATCH")!;
    expect(Date.parse(String(patch.body!.updated_at))).toBeGreaterThan(Date.parse(ahead));
    expect(Date.parse(String(patch.body!.answered_at))).toBeLessThan(Date.parse(ahead));
  });

  it("validates the answer and name before touching the database", async () => {
    const { POST } = await import("@/app/api/rfis/public/route");
    for (const bad of [{ t: TOKEN, answer: "", name: "Pat" }, { t: TOKEN, answer: "ok", name: "" }, { t: TOKEN, answer: "x".repeat(5001), name: "Pat" }, { t: 1, answer: "ok", name: "Pat" }])
      expect((await POST(post(bad))).status).not.toBe(200);
    expect(calls).toHaveLength(0);
  });

  it("answers 501 without the service key (sharing needs cloud sync)", async () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    const { GET, POST } = await import("@/app/api/rfis/public/route");
    expect((await GET(get(TOKEN))).status).toBe(501);
    expect((await POST(post({ t: TOKEN, answer: "Yes", name: "Pat" }))).status).toBe(501);
    expect(calls).toHaveLength(0);
  });

  it("rate-limits answers per link", async () => {
    current = row({ status: "answered" });
    const { POST } = await import("@/app/api/rfis/public/route");
    const codes: number[] = [];
    for (let i = 0; i < 12; i++) codes.push((await POST(post({ t: TOKEN, answer: "Yes", name: "Pat" }, `9.9.9.${i}`))).status);
    expect(codes.slice(0, 10).every((c) => c === 409)).toBe(true);
    expect(codes[11]).toBe(429);
  });
});
