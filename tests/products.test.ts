import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, seedCatalog } from "@/lib/catalog";
import { projectEstimate } from "@/lib/estimate";
import {
  cableKey,
  cableSummary,
  cablesPatch,
  markerCables,
  matchCable,
  parseProductCsv,
  productIdFor,
  settingCable,
  withProductChoice,
} from "@/lib/products";
import { computeTakeoff } from "@/lib/takeoff";
import type { Marker, PricingSettings, Product, Project, Run, Sheet } from "@/lib/types";

const ts = "2026-11-15T00:00:00.000Z";
const catalog = seedCatalog().map((d) => (d.id === "cam-indoor" ? { ...d, unitPrice: 100, laborPrice: 50 } : d.id === "wap" ? { ...d, unitPrice: 150, laborPrice: 60 } : d));
const pricing = (p: Partial<PricingSettings> = {}): PricingSettings => ({ ...DEFAULT_SETTINGS.pricing, markupPct: 0, taxPct: 0, laborMode: "combined", ...p });
const sheet: Sheet = { id: "s1", projectId: "p", name: "1st Fl", pageNumber: 1, order: 0, imageId: "i", width: 1000, height: 1000, pxPerFt: 10, createdAt: ts, updatedAt: ts };
const project = (productChoices: Record<string, string> | null = null): Project => ({ id: "p", clientName: "", address: "", status: "estimate", billduDocs: [], productChoices, createdAt: ts, updatedAt: ts });
let n = 0;
const marker = (deviceTypeId: string, extra: Partial<Marker> = {}): Marker => ({
  id: `m${++n}`, projectId: "p", sheetId: "s1", deviceTypeId, x: 0.5, y: 0.5, label: "", room: "", mount: "ceiling", wireType: "Cat6", tentative: false, notes: "", createdAt: ts, updatedAt: ts, ...extra,
});
const product = (id: string, deviceTypeId: string, unitPrice: number, laborPrice = 0, brand = "Ubiquiti", model = id): Product => ({ id, deviceTypeId, brand, model, unitPrice, laborPrice, updatedAt: ts });
const est = (proj: Project, markers: Marker[], products: Product[], pr = pricing(), runs: Run[] = []) =>
  projectEstimate({ project: proj, sheets: [sheet], markers, runs, closets: [], estimateLines: [] }, catalog, products, pr);

describe("products", () => {
  const g5 = product("g5", "cam-indoor", 129, 85, "Ubiquiti", "G5 Turret");
  const axis = product("axis", "cam-indoor", 300, 90, "Axis", "M3086");

  it("prices devices with the job's product instead of the device type", () => {
    const e = est(project({ "cam-indoor": "g5" }), [marker("cam-indoor"), marker("cam-indoor")], [g5]);
    const l = e.lines.find((x) => x.key === "prod:g5")!;
    expect(l.qty).toBe(2);
    expect(l.unitPrice).toBe(214); // 129 + 85 installed
    expect(l.description).toBe("Ubiquiti G5 Turret — Indoor camera — installed");
    expect(e.lines.some((x) => x.key === "dev:cam-indoor")).toBe(false);
  });

  it("lets a single device use another product", () => {
    const e = est(project({ "cam-indoor": "g5" }), [marker("cam-indoor"), marker("cam-indoor", { productId: "axis" })], [g5, axis]);
    expect(e.lines.find((x) => x.key === "prod:g5")!.qty).toBe(1);
    expect(e.lines.find((x) => x.key === "prod:axis")!.qty).toBe(1);
  });

  it("keeps devices without a product on the device type line", () => {
    const e = est(project(), [marker("cam-indoor", { productId: "axis" }), marker("cam-indoor")], [axis]);
    expect(e.lines.find((x) => x.key === "prod:axis")!.qty).toBe(1);
    expect(e.lines.find((x) => x.key === "dev:cam-indoor")!.qty).toBe(1);
  });

  it("ignores a product chosen for another type", () => {
    expect(productIdFor(marker("wap", { productId: "g5" }), project(), [g5])).toBeNull();
  });

  it("lists product labor separately and applies markup to material only", () => {
    const e = est(project({ "cam-indoor": "g5" }), [marker("cam-indoor"), marker("cam-indoor", { tentative: true })], [g5], pricing({ laborMode: "separate", markupPct: 10 }));
    expect(e.lines.find((x) => x.key === "prod:g5")!.unitPrice).toBe(141.9);
    expect(e.lines.find((x) => x.key === "optprod:g5")!.qty).toBe(1);
    expect(e.lines.find((x) => x.key === "labor:prod:g5")!.unitPrice).toBe(85);
    expect(e.lines.find((x) => x.key === "optlabor:prod:g5")!.optional).toBe(true);
  });

  it("markup raises device prices", () => {
    const a = est(project(), [marker("wap")], [], pricing({ markupPct: 0 })).total;
    const b = est(project(), [marker("wap")], [], pricing({ markupPct: 20 })).total;
    expect(b - a).toBeCloseTo(30);
  });

  it("sets and clears job choices", () => {
    const c = withProductChoice(project(), "wap", "u7");
    expect(c).toEqual({ wap: "u7" });
    expect(withProductChoice(project(c), "wap", null)).toBeNull();
  });
});

describe("price list import", () => {
  let id = 0;
  const opts = { newId: () => `i${++id}`, now: ts };

  it("reads columns by header, in any order, with $ and commas", () => {
    const csv = 'Brand,Model,Device type,Price,Labor\nUbiquiti,U7 Pro,WAP,"$1,189.00",95\nAxis,M3086,indoor cam,300,\n';
    const r = parseProductCsv(csv, catalog, opts);
    expect(r.skipped).toEqual([]);
    expect(r.products[0]).toMatchObject({ deviceTypeId: "wap", brand: "Ubiquiti", model: "U7 Pro", unitPrice: 1189, laborPrice: 95 });
    expect(r.products[1].deviceTypeId).toBe("cam-indoor");
  });

  it("imports cable products and skips unknown rows", () => {
    const r = parseProductCsv("Type\tBrand\tModel\tCost\nCAT 6 cable\tBelden\t2412\t0.32\nwidget\tAcme\tX\t1\nWAP\t\t\t1\n", catalog, opts);
    expect(r.products).toHaveLength(1);
    expect(r.products[0]).toMatchObject({ deviceTypeId: "wire:Cat6", unitPrice: 0.32 });
    expect(r.skipped).toHaveLength(2);
  });
});

describe("cable bundles", () => {
  it("edits a bundle and summarises it", () => {
    let list = settingCable("HDMI", 1, []);
    list = settingCable("Cat6", 2, list);
    expect(cableSummary(list)).toBe("HDMI + 2× Cat6");
    expect(settingCable("HDMI", 0, list)).toEqual(["Cat6", "Cat6"]);
    expect(cablesPatch(list)).toEqual({ wires: ["HDMI", "Cat6", "Cat6"], wireType: "HDMI" });
    expect(cablesPatch(["Cat6"])).toEqual({ wires: null, wireType: "Cat6" });
    expect(markerCables({ wireType: "None" })).toEqual([]);
    expect(matchCable("hdmi cable")).toBe("HDMI");
  });

  it("counts a bundled home run's length once per cable", () => {
    const run: Run = { id: "r", projectId: "p", sheetId: "s1", kind: "wire", points: [0, 0, 1, 0], typedFt: 40, wireType: "HDMI", wireTypes: ["HDMI", "Cat6", "Cat6"], createdAt: ts, updatedAt: ts };
    const t = computeTakeoff({ sheets: [sheet], markers: [], runs: [run], closets: [] });
    expect(t.total.wireFt).toEqual({ HDMI: 40, Cat6: 80 });
    expect(t.total.wireRuns).toEqual({ HDMI: 1, Cat6: 2 });
  });

  it("prices cable with the job's cable product", () => {
    const run: Run = { id: "r", projectId: "p", sheetId: "s1", kind: "wire", points: [0, 0, 1, 0], typedFt: 100, wireType: "Cat6", createdAt: ts, updatedAt: ts };
    const belden = product("belden", cableKey("Cat6"), 0.5, 0.25, "Belden", "2412");
    const pr = pricing({ laborMode: "separate", markupPct: 10 });
    const e = est(project({ [cableKey("Cat6")]: "belden" }), [], [belden], pr, [run]);
    const w = e.lines.find((x) => x.key === "wire:Cat6")!;
    expect(w.description).toBe("Cat6 — Belden 2412 (home runs: 1)");
    expect(w.unitPrice).toBe(0.55);
    expect(e.lines.find((x) => x.key === "labor:wire:Cat6")!.total).toBe(25);
    // Without a cable product, the default price per ft (with markup).
    const d = est(project(), [], [belden], pr, [run]).lines.find((x) => x.key === "wire:Cat6")!;
    expect(d.unitPrice).toBeCloseTo((pr.wirePrices.Cat6 ?? 0) * 1.1, 2);
  });
});

describe("device icons", () => {
  it("gives every starting device type a pictogram, and custom types their letters", async () => {
    const { iconFor } = await import("@/lib/symbols");
    for (const d of seedCatalog()) expect(iconFor(d), d.id).toBeTruthy();
    expect(iconFor({ id: "custom-1" })).toBeNull();
    expect(iconFor({ id: "wap", icon: "letters" })).toBeNull();
    expect(iconFor({ id: "custom-1", icon: "doorbell" })).toBe("doorbell");
    expect(iconFor({ id: "custom-1", icon: "nope" })).toBeNull();
  });
});
