// Change orders: pricing parity with the estimate, totals, life cycle, contract value, the client view and the
// public route (with a mocked Supabase).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS, seedCatalog } from "@/lib/catalog";
import {
  approvedLinesFor,
  baseContractMarkers,
  canEdit,
  changeOrderTotals,
  coCode,
  contractSummary,
  laborHoursLine,
  linesFromMarkers,
  nextCoNumber,
  planCandidates,
  priceDeviceLine,
  priceLaborLine,
  publicCoView,
  revisedTitle,
  sellLines,
  transition,
  type CoAction,
} from "@/lib/changeOrders";
import { buildEstimate, money } from "@/lib/estimate";
import { computeTakeoff } from "@/lib/takeoff";
import { TABLES, toLocal, toRemote } from "@/lib/syncMap";
import type { AppSettings, ChangeOrder, ChangeOrderLine, ChangeOrderStatus, DeviceType, Marker, PricingSettings, Product } from "@/lib/types";
import { buildSampleJob } from "./fixtures/sampleJob";

const ts = "2026-11-19T10:00:00.000Z";

/** The seed catalog with awkward prices (fractions of a cent, so rounding is exercised). */
function pricedCatalog(): DeviceType[] {
  return seedCatalog().map((d, i) => ({ ...d, unitPrice: 37.333 + i * 11.005, laborPrice: i % 3 === 0 ? 0 : 20.125 + i * 3.333 }));
}

function co(patch: Partial<ChangeOrder> = {}): ChangeOrder {
  return {
    id: "co1",
    projectId: "p",
    number: 1,
    title: "Extra cameras",
    reason: "client_request",
    status: "draft",
    lines: [{ id: "l1", kind: "device", deviceTypeId: "cam-indoor", description: "Indoor camera", qty: 2, unit: "each", unitPrice: 250 }],
    markupPct: 20,
    taxPct: 8.875,
    createdAt: ts,
    updatedAt: ts,
    ...patch,
  };
}

const line = (id: string, kind: ChangeOrderLine["kind"], qty: number, unitPrice: number, taxable?: boolean): ChangeOrderLine => ({ id, kind, description: id, qty, unit: "each", unitPrice, taxable });

describe("device prices match the estimate", () => {
  const job = buildSampleJob();
  const takeoff = computeTakeoff(job);
  const catalog = pricedCatalog();
  const typeIds = Object.values(job.TYPE_IDS);

  for (const laborMode of ["combined", "separate"] as const) {
    it(`gives the estimate's unit price for every sample-job device type (${laborMode} labor)`, () => {
      const pricing: PricingSettings = { ...DEFAULT_SETTINGS.pricing, markupPct: 17.5, laborMode, includeTentative: true };
      const est = buildEstimate(takeoff, catalog, pricing);
      for (const id of typeIds) {
        const d = catalog.find((x) => x.id === id)!;
        const devLine = est.lines.find((l) => l.key === `dev:${id}` || l.key === `opt:${id}`);
        expect(devLine, id).toBeTruthy();
        expect(priceDeviceLine(d, null, pricing), id).toBe(devLine!.unitPrice);
        const labor = est.lines.find((l) => l.key === `labor:${id}` || l.key === `optlabor:${id}`);
        if (laborMode === "separate" && d.laborPrice) expect(priceLaborLine(d, null, pricing), id).toBe(labor!.unitPrice);
        else expect(priceLaborLine(d, null, pricing)).toBe(laborMode === "separate" ? money(d.laborPrice) : 0);
      }
    });
  }

  it("prices a chosen product like the estimate's product line", () => {
    const pricing: PricingSettings = { ...DEFAULT_SETTINGS.pricing, markupPct: 12.5, laborMode: "combined" };
    const p: Product = { id: "pr", deviceTypeId: "cam-indoor", brand: "Axis", model: "M3086", unitPrice: 199.99, laborPrice: 85.005, updatedAt: ts };
    const est = buildEstimate(takeoff, catalog, pricing, [], { products: [p], split: { "cam-indoor": { pr: { confirmed: 2, tentative: 0 } } } });
    expect(priceDeviceLine(catalog[0], p, pricing)).toBe(est.lines.find((l) => l.key === "prod:pr")!.unitPrice);
  });
});

describe("linesFromMarkers", () => {
  const catalog = pricedCatalog();
  const m = (id: string, deviceTypeId: string, productId?: string): Marker => ({
    id, projectId: "p", sheetId: "s1", deviceTypeId, productId, x: 0, y: 0, label: id, room: "", mount: "ceiling", wireType: "Cat6", tentative: true, notes: "", createdAt: ts, updatedAt: ts,
  });
  let n = 0;
  const newId = () => `id${++n}`;

  it("groups by device type in catalog order, one device line each", () => {
    const pricing: PricingSettings = { ...DEFAULT_SETTINGS.pricing, laborMode: "combined", markupPct: 10 };
    const lines = linesFromMarkers([m("a", "wap"), m("b", "cam-indoor"), m("c", "cam-indoor"), m("d", "gone"), { ...m("e", "wap"), deleted: true }], catalog, [], pricing, { newId });
    expect(lines.map((l) => [l.kind, l.deviceTypeId, l.qty])).toEqual([
      ["device", "cam-indoor", 2],
      ["device", "wap", 1],
    ]);
    expect(lines[0].description).toBe("Indoor camera — installed");
    expect(lines[0].unitPrice).toBe(priceDeviceLine(catalog[0], null, pricing));
  });

  it("adds labor lines when labor is separate (and only for types with a labor price)", () => {
    const pricing: PricingSettings = { ...DEFAULT_SETTINGS.pricing, laborMode: "separate", markupPct: 10 };
    const out = catalog.find((d) => d.id === "cam-outdoor")!;
    const lines = linesFromMarkers([m("a", "cam-outdoor"), m("b", "cam-indoor"), m("c", "cam-indoor")], catalog, [], pricing, { newId });
    expect(lines.map((l) => [l.kind, l.deviceTypeId, l.qty])).toEqual([
      ["device", "cam-indoor", 2],
      ["device", "cam-outdoor", 1],
      ["labor", "cam-outdoor", 1], // cam-indoor has no labor price in this catalog
    ]);
    expect(lines[2].unitPrice).toBe(money(out.laborPrice));
  });

  it("splits a type by product (device pick, then the job's choice)", () => {
    const pricing: PricingSettings = { ...DEFAULT_SETTINGS.pricing, laborMode: "combined", markupPct: 0 };
    const products: Product[] = [
      { id: "ax", deviceTypeId: "cam-indoor", brand: "Axis", model: "A", unitPrice: 300, laborPrice: 50, updatedAt: ts },
      { id: "ub", deviceTypeId: "cam-indoor", brand: "Ubiquiti", model: "G5", unitPrice: 130, laborPrice: 40, updatedAt: ts },
    ];
    const lines = linesFromMarkers([m("a", "cam-indoor", "ax"), m("b", "cam-indoor"), m("c", "cam-indoor")], catalog, products, pricing, { newId, project: { productChoices: { "cam-indoor": "ub" } } });
    expect(lines.map((l) => [l.description, l.qty, l.unitPrice])).toEqual([
      ["Axis A — Indoor camera — installed", 1, 350],
      ["Ubiquiti G5 — Indoor camera — installed", 2, 170],
    ]);
  });

  it("labor hours use the job's hourly rate", () => {
    expect(laborHoursLine(3, { ...DEFAULT_SETTINGS.pricing, laborRate: 92.5 }, "Labor", "x")).toMatchObject({ kind: "labor", qty: 3, unit: "hr", unitPrice: 92.5 });
    expect(laborHoursLine(1, DEFAULT_SETTINGS.pricing, "Labor", "x").unitPrice).toBe(0);
  });
});

describe("totals", () => {
  it("marks up material lines only, per unit and rounded like the estimate", () => {
    const c = co({ markupPct: 15, taxPct: 0, lines: [line("dev", "device", 2, 250), line("lab", "labor", 3, 85), line("mat", "material", 3, 10.01), line("oth", "custom", 1, 99.99)] });
    // 10.01 × 1.15 = 11.5115 → 11.51 per unit (as buildEstimate rounds unit prices), × 3 = 34.53.
    expect(sellLines(c).find((l) => l.id === "mat")).toMatchObject({ unitPrice: 11.51, total: 34.53, cost: 30.03 });
    expect(changeOrderTotals(c)).toEqual({ subtotal: 885.02, markup: 4.5, tax: 0, total: 889.52 });
  });

  it("taxes taxable lines (markup included) and rounds half away from zero", () => {
    const c = co({ markupPct: 10, taxPct: 8.875, lines: [line("a", "device", 1, 100), line("b", "material", 1, 10), line("c", "labor", 2, 50, false)] });
    // Taxable: 100 + 11 = 111 → tax 9.85125 → 9.85.
    expect(changeOrderTotals(c)).toEqual({ subtotal: 210, markup: 1, tax: 9.85, total: 220.85 });
    const half = co({ markupPct: 0, taxPct: 10, lines: [line("a", "custom", 1, 0.05)] });
    expect(changeOrderTotals(half).tax).toBe(0.01); // 0.005 rounds up
  });

  it("handles credits (negative quantities) and bad input", () => {
    const c = co({ markupPct: 0, taxPct: 0, lines: [line("a", "device", -2, 125.5), line("b", "custom", Number.NaN, 10)] });
    expect(changeOrderTotals(c)).toEqual({ subtotal: -251, markup: 0, tax: 0, total: -251 });
    expect(changeOrderTotals(co({ lines: [], markupPct: null, taxPct: null }))).toEqual({ subtotal: 0, markup: 0, tax: 0, total: 0 });
  });

  it("client lines add up to subtotal + markup exactly", () => {
    const c = co({ markupPct: 13.7, taxPct: 7.25, lines: [line("a", "material", 7, 3.333), line("b", "material", 3, 19.999), line("c", "device", 2, 401.5)] });
    const t = changeOrderTotals(c);
    const v = publicCoView(c, { address: "1 Main", clientName: "Pat" }, { business: DEFAULT_SETTINGS.business, pricing: { currency: "USD" } });
    expect(money(v.lines.reduce((s, l) => s + l.total, 0))).toBe(v.subtotal);
    expect(v.subtotal).toBe(money(t.subtotal + t.markup));
    expect(v.total).toBe(t.total);
  });
});

describe("numbering", () => {
  it("numbers per job, never reusing void or revised numbers", () => {
    expect(nextCoNumber([])).toBe(1);
    expect(nextCoNumber([{ number: 1 }, { number: 4, deleted: false }, { number: 9, deleted: true }])).toBe(5);
    expect(coCode(3)).toBe("CO-003");
    expect(coCode(1234)).toBe("CO-1234");
  });
  it("revision titles count up", () => {
    expect(revisedTitle("Extra cameras")).toBe("Extra cameras (rev 1)");
    expect(revisedTitle("Extra cameras (rev 1)")).toBe("Extra cameras (rev 2)");
    expect(revisedTitle("")).toBe("Change order (rev 1)");
  });
});

describe("transition matrix", () => {
  const now = "2026-11-20T12:00:00.000Z";
  const opts = { token: "t".repeat(24), name: "Pat", newId: "co2" };
  const expected: Record<ChangeOrderStatus, Partial<Record<CoAction, ChangeOrderStatus | "error">>> = {
    draft: { send: "sent", approve: "approved", reject: "rejected", void: "void", revise: "error" },
    sent: { send: "sent", approve: "approved", reject: "rejected", void: "void", revise: "void" },
    approved: { send: "error", approve: "error", reject: "error", void: "error", revise: "error" },
    rejected: { send: "error", approve: "error", reject: "error", void: "void", revise: "rejected" },
    void: { send: "error", approve: "error", reject: "error", void: "error", revise: "void" },
  };
  for (const [from, row] of Object.entries(expected) as [ChangeOrderStatus, Partial<Record<CoAction, ChangeOrderStatus | "error">>][]) {
    for (const [action, to] of Object.entries(row) as [CoAction, ChangeOrderStatus | "error"][]) {
      it(`${from} → ${action} → ${to}`, () => {
        const start = co({ status: from });
        if (to === "error") expect(() => transition(start, action, now, opts)).toThrow();
        else expect(transition(start, action, now, opts).co.status).toBe(to);
      });
    }
  }

  it("approved change orders are immutable and not editable", () => {
    const a = transition(co(), "approve", now, { name: " Pat " }).co;
    expect(a).toMatchObject({ status: "approved", approvedName: "Pat", respondedAt: now });
    expect(canEdit(a)).toBe(false);
    expect(canEdit(co())).toBe(true);
    expect(() => transition(a, "void", now)).toThrow(/approved/);
  });

  it("approving needs a name; sending needs lines and a token", () => {
    expect(() => transition(co(), "approve", now, { name: "  " })).toThrow();
    expect(() => transition(co({ lines: [] }), "send", now, opts)).toThrow();
    expect(() => transition(co(), "send", now)).toThrow();
    const sent = transition(co(), "send", now, opts).co;
    expect(sent).toMatchObject({ status: "sent", shareToken: opts.token, sentAt: now });
    // Sending again keeps the same link and date.
    expect(transition(sent, "send", "2026-12-01T00:00:00.000Z", { token: "x".repeat(24) }).co).toMatchObject({ shareToken: opts.token, sentAt: now });
  });

  it("revise copies into a new draft (same number, rev title) and withdraws a sent link", () => {
    const sent = transition(co({ photoIds: ["ph"], markerIds: ["m"] }), "send", now, opts).co;
    const { co: original, copy } = transition(sent, "revise", now, { newId: "co2" });
    expect(original.status).toBe("void");
    expect(copy).toMatchObject({ id: "co2", number: 1, status: "draft", title: "Extra cameras (rev 1)", shareToken: null, sentAt: null, markerIds: ["m"], photoIds: ["ph"] });
    expect(copy!.lines).toEqual(sent.lines);
    expect(copy!.lines[0]).not.toBe(sent.lines[0]);
    const rejected = transition(sent, "reject", now, { comment: "too much" }).co;
    expect(transition(rejected, "revise", now, { newId: "co3" }).co.status).toBe("rejected");
  });
});

describe("contract summary", () => {
  it("adds approved change orders; drafts and sent ones are pending; void / rejected / deleted don't count", () => {
    const one = [line("a", "custom", 1, 100)];
    const cos = [
      co({ id: "a", status: "approved", lines: one, taxPct: 10 }),
      co({ id: "b", status: "approved", lines: [line("c", "custom", -1, 40)], taxPct: 0 }),
      co({ id: "c", status: "sent", lines: one, taxPct: 0 }),
      co({ id: "d", status: "draft", lines: one, taxPct: 0 }),
      co({ id: "e", status: "void", lines: one }),
      co({ id: "f", status: "rejected", lines: one }),
      co({ id: "g", status: "approved", lines: one, deleted: true }),
    ];
    expect(contractSummary(10000.005, cos)).toEqual({ original: 10000.01, approved: 70, pending: 200, revised: 10070.01 });
    expect(contractSummary(0, [])).toEqual({ original: 0, approved: 0, pending: 0, revised: 0 });
  });

  it("keeps change-order devices out of the original contract (no double count once confirmed)", () => {
    const ms = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }];
    const cos = [
      co({ id: "1", status: "approved", markerIds: ["a"] }),
      co({ id: "2", status: "draft", markerIds: ["b"] }),
      co({ id: "3", status: "void", markerIds: ["c"] }),
      co({ id: "4", status: "sent", markerIds: ["d"], deleted: true }),
    ];
    expect(baseContractMarkers(ms, cos).map((m) => m.id)).toEqual(["c", "d"]);
    expect(baseContractMarkers(ms, [])).toBe(ms);
  });

  it("lists approved lines for invoicing", () => {
    const out = approvedLinesFor([co({ id: "x", number: 2, status: "approved", respondedAt: now(), approvedName: "Pat" }), co({ id: "y", status: "sent" })]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ changeOrderId: "x", code: "CO-002", approvedName: "Pat" });
    expect(out[0].lines[0]).toMatchObject({ kind: "device", deviceTypeId: "cam-indoor", qty: 2, unitPrice: 250, total: 500 });
  });
});
function now() {
  return ts;
}

describe("client view", () => {
  const settings: Pick<AppSettings, "business"> & { pricing: { currency: string } } = {
    business: { ...DEFAULT_SETTINGS.business, name: "Acme AV", logo: "/brand/logo.png", estimateTerms: "SECRET TERMS" },
    pricing: { currency: "USD" },
  };
  const c = co({
    status: "sent",
    description: "Two more cameras by the garage",
    markupPct: 25,
    lines: [line("a", "material", 2, 40), line("b", "device", 1, 300)],
    photoIds: ["img1"],
    markerIds: ["m1"],
    sheetIds: ["s1"],
    rfiId: "rfi-9",
    createdBy: "office@acme.com",
    shareToken: "tok".repeat(8),
    clientComment: "internal?",
    scheduleDays: 2,
  });
  const v = publicCoView(c, { address: "12 Maple", clientName: "Pat" }, settings, { origin: "https://app.example", photoCaptions: { img1: "Garage corner" } });

  it("whitelists what the client may see", () => {
    expect(Object.keys(v).sort()).toEqual(
      ["business", "code", "currency", "description", "lines", "photos", "project", "reason", "reasonLabel", "scheduleDays", "sentAt", "subtotal", "tax", "taxPct", "title", "total", "v"].sort(),
    );
    for (const l of v.lines) expect(Object.keys(l).sort()).toEqual(["description", "qty", "total", "unit", "unitPrice"]);
    expect(Object.keys(v.business).sort()).toEqual(["accentColor", "address", "brandColor", "email", "logo", "name", "phone", "tagline", "website"]);
    const text = JSON.stringify(v);
    for (const secret of ["SECRET TERMS", "office@acme.com", "rfi-9", "m1", "internal?", "markupPct", "cost", "deviceTypeId", "kind", c.shareToken!]) expect(text).not.toContain(secret);
  });

  it("folds markup into material prices and resolves the logo", () => {
    expect(v.lines[0]).toEqual({ description: "a", qty: 2, unit: "each", unitPrice: 50, total: 100 });
    expect(v.subtotal).toBe(400);
    expect(v.business.logo).toBe("https://app.example/brand/logo.png");
    expect(v.photos).toEqual([{ imageId: "img1", caption: "Garage corner" }]);
    expect(v.code).toBe("CO-001");
    expect(v.reasonLabel).toBe("Client request");
  });
});

describe("plan candidates", () => {
  const m = (id: string, sheetId: string, tentative: boolean, createdAt: string): Marker => ({
    id, projectId: "p", sheetId, deviceTypeId: "cam-indoor", x: 0, y: 0, label: id, room: "", mount: "ceiling", wireType: "Cat6", tentative, notes: "", createdAt, updatedAt: createdAt,
  });
  it("lists tentative devices and devices placed after the baseline, by sheet, flagging ones on other change orders", () => {
    const sheets = [
      { id: "s2", name: "2nd", order: 1 },
      { id: "s1", name: "1st", order: 0 },
    ];
    const markers = [m("old", "s1", false, "2026-11-01T00:00:00Z"), m("t1", "s1", true, "2026-11-01T00:00:00Z"), m("new", "s2", false, "2026-11-15T00:00:00Z"), m("t2", "s2", true, "2026-11-16T00:00:00Z")];
    const out = planCandidates(markers, sheets, "2026-11-10T00:00:00Z", [co({ id: "other", number: 2, markerIds: ["t2"] })]);
    expect(out.map((g) => [g.sheet.name, g.items.map((i) => [i.marker.id, i.tentative, i.isNew, i.onCo])])).toEqual([
      ["1st", [["t1", true, false, null]]],
      [
        "2nd",
        [
          ["new", false, true, null],
          ["t2", true, true, "CO-002"],
        ],
      ],
    ]);
    // Without a baseline only tentative devices show.
    expect(planCandidates(markers, sheets, null, []).flatMap((g) => g.items.map((i) => i.marker.id))).toEqual(["t1", "t2"]);
  });
});

describe("sync mapping", () => {
  it("round-trips a change order", () => {
    const row = co({ status: "approved", shareToken: "tok".repeat(8), respondedAt: ts, approvedName: "Pat", signatureImageId: "sig1", photoIds: ["a"], markerIds: ["m"], scheduleDays: 2 });
    const remote = toRemote("changeOrders", row as unknown as Record<string, unknown>);
    expect(TABLES.changeOrders.remote).toBe("change_orders");
    expect(remote).toMatchObject({ project_id: "p", number: 1, status: "approved", share_token: row.shareToken, approved_name: "Pat", signature_image_id: "sig1", markup_pct: 20, tax_pct: 8.875, schedule_days: 2, deleted: false });
    const back = toLocal("changeOrders", { ...remote, updated_at: "2026-11-19T10:00:00+00:00", synced_at: "x", owner_id: "y" });
    expect(back).toEqual({ ...row, deleted: false });
  });
  it("fills NOT NULL columns for a sparse row", () => {
    expect(toRemote("changeOrders", { id: "c", projectId: "p" })).toMatchObject({ lines: [], status: "draft", reason: "other", title: "", number: 0 });
  });
});

// ---------------- the public route, with a mocked Supabase ----------------

vi.mock("next/server", () => ({ connection: async () => undefined }));

const SB = "https://sb.example.co";
const TOKEN = "AbCdEfGhJkMnPqRsTuVwXyZ2";
const PNG_HEADER = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const pngDataUrl = (bytes: number) => {
  const buf = Buffer.alloc(bytes);
  Buffer.from(PNG_HEADER).copy(buf);
  return `data:image/png;base64,${buf.toString("base64")}`;
};

describe("public change order route", () => {
  type Call = { url: string; method: string; headers: Record<string, string>; body: unknown };
  let calls: Call[];
  let row: Record<string, unknown>;
  const view = publicCoView(co({ status: "sent", photoIds: ["img1"] }), { address: "12 Maple", clientName: "Pat" }, { business: DEFAULT_SETTINGS.business, pricing: { currency: "USD" } });

  beforeEach(() => {
    vi.resetModules();
    calls = [];
    row = { id: "co1", project_id: "p1", status: "sent", deleted: false, public_view: view, responded_at: null, approved_name: null, client_comment: null };
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", SB);
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-key");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input instanceof Request ? input.url : input);
        const method = init?.method ?? "GET";
        const isJson = typeof init?.body === "string";
        calls.push({ url, method, headers: Object.fromEntries(new Headers(init?.headers).entries()), body: isJson ? JSON.parse(String(init!.body)) : init?.body });
        if (url.startsWith(`${SB}/rest/v1/change_orders?share_token=`) && method === "GET") return Response.json(url.includes(TOKEN) ? [row] : []);
        if (url.startsWith(`${SB}/rest/v1/change_orders?id=eq.co1&status=eq.sent`) && method === "PATCH") {
          if (row.status !== "sent") return Response.json([]);
          row = { ...row, ...(JSON.parse(String(init!.body)) as Record<string, unknown>) };
          return Response.json([row]);
        }
        if (url === `${SB}/storage/v1/object/sign/plans`) return Response.json([{ path: "p1/img1", signedURL: "/object/sign/plans/p1/img1?token=abc", error: null }]);
        if (url.startsWith(`${SB}/storage/v1/object/plans/`)) return Response.json({ Key: "ok" });
        return new Response("not found", { status: 404 });
      }),
    );
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  const post = (body: unknown, ip = "1.2.3.4") =>
    new Request("http://localhost/api/change-orders/public", { method: "POST", headers: { "Content-Type": "application/json", "x-forwarded-for": ip }, body: JSON.stringify(body) });

  it("GET returns the frozen client view with signed photo links and nothing internal", async () => {
    const { GET } = await import("@/app/api/change-orders/public/route");
    const r = await GET(new Request(`http://localhost/api/change-orders/public?t=${TOKEN}`));
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j.status).toBe("sent");
    expect(j.view.total).toBe(view.total);
    expect(j.view.photos).toEqual([{ url: `${SB}/storage/v1/object/sign/plans/p1/img1?token=abc`, caption: "" }]);
    const text = JSON.stringify(j);
    for (const s of ["service-key", "co1", "imageId"]) expect(text).not.toContain(s);
    expect(calls[0].headers.authorization).toBe("Bearer service-key");
  });

  it("GET refuses bad, unknown and draft links", async () => {
    const { GET } = await import("@/app/api/change-orders/public/route");
    expect((await GET(new Request("http://localhost/api/change-orders/public?t=short"))).status).toBe(400);
    expect((await GET(new Request(`http://localhost/api/change-orders/public?t=${"Z".repeat(24)}`))).status).toBe(404);
    row.status = "draft";
    expect((await GET(new Request(`http://localhost/api/change-orders/public?t=${TOKEN}`))).status).toBe(404);
  });

  it("approve uploads the signature and sets status, name, date and signature id", async () => {
    const { POST } = await import("@/app/api/change-orders/public/route");
    const r = await POST(post({ t: TOKEN, decision: "approve", name: " Pat Client ", signature: pngDataUrl(2000), comment: "Go ahead" }));
    expect(r.status).toBe(200);
    const upload = calls.find((c) => c.url.startsWith(`${SB}/storage/v1/object/plans/p1/`))!;
    expect(upload.method).toBe("POST");
    expect(upload.headers["content-type"]).toBe("image/png");
    const sigId = upload.url.split("/").pop();
    expect(row).toMatchObject({ status: "approved", approved_name: "Pat Client", signature_image_id: sigId, client_comment: "Go ahead" });
    expect(Date.parse(String(row.responded_at))).toBeGreaterThan(0);
    expect(row.updated_at).toBe(row.responded_at);
    const j = await r.json();
    expect(j).toMatchObject({ status: "approved", approvedName: "Pat Client" });
    // Answered once only.
    expect((await POST(post({ t: TOKEN, decision: "reject", name: "Pat", comment: "no" }))).status).toBe(409);
  });

  it("stamps the answer newer than a sent row from a device whose clock runs ahead", async () => {
    const ahead = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    row.updated_at = ahead;
    const { POST } = await import("@/app/api/change-orders/public/route");
    const r = await POST(post({ t: TOKEN, decision: "reject", name: "Pat", comment: "No" }, "5.5.5.5"));
    expect(r.status).toBe(200);
    expect(Date.parse(String(row.updated_at))).toBeGreaterThan(Date.parse(ahead));
    expect(Date.parse(String(row.responded_at))).toBeLessThan(Date.parse(ahead));
  });

  it("reject needs no signature", async () => {
    const { POST } = await import("@/app/api/change-orders/public/route");
    const r = await POST(post({ t: TOKEN, decision: "reject", name: "Pat", comment: "Too much" }));
    expect(r.status).toBe(200);
    expect(row).toMatchObject({ status: "rejected", signature_image_id: null, client_comment: "Too much" });
    expect(calls.some((c) => c.url.includes("/storage/v1/object/plans/"))).toBe(false);
  });

  it("void change orders can't be answered", async () => {
    row.status = "void";
    const { POST } = await import("@/app/api/change-orders/public/route");
    const r = await POST(post({ t: TOKEN, decision: "approve", name: "Pat", signature: pngDataUrl(500) }));
    expect(r.status).toBe(410);
    expect(row.status).toBe("void");
    expect(calls.some((c) => c.method === "PATCH" || c.url.includes("/storage/"))).toBe(false);
  });

  it("rejects oversized, missing or fake signatures before touching anything", async () => {
    const { POST } = await import("@/app/api/change-orders/public/route");
    expect((await POST(post({ t: TOKEN, decision: "approve", name: "Pat", signature: pngDataUrl(210 * 1024) }))).status).toBe(413);
    expect((await POST(post({ t: TOKEN, decision: "approve", name: "Pat", signature: "" }))).status).toBe(400);
    expect((await POST(post({ t: TOKEN, decision: "approve", name: "", signature: pngDataUrl(500) }))).status).toBe(400);
    expect((await POST(post({ t: TOKEN, decision: "approve", name: "Pat", signature: `data:image/png;base64,${Buffer.from("not a png at all").toString("base64")}` }))).status).toBe(400);
    expect((await POST(post({ t: TOKEN, decision: "maybe", name: "Pat" }))).status).toBe(400);
    expect(calls).toHaveLength(0);
    expect(row.status).toBe("sent");
  });

  it("rate-limits one link", async () => {
    const { POST } = await import("@/app/api/change-orders/public/route");
    const statuses: number[] = [];
    for (let i = 0; i < 12; i++) statuses.push((await POST(post({ t: TOKEN, decision: "approve", name: "Pat", signature: "" }, `9.9.9.${i}`))).status);
    expect(statuses.slice(0, 10).every((s) => s === 400)).toBe(true);
    expect(statuses.slice(10)).toEqual([429, 429]);
  });

  it("answers 501 without the service key", async () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    const { GET } = await import("@/app/api/change-orders/public/route");
    expect((await GET(new Request(`http://localhost/api/change-orders/public?t=${TOKEN}`))).status).toBe(501);
  });
});
