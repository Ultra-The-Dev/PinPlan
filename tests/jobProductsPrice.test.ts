// "Products for this job" shows the price the pricing table actually uses for an item with no product (not the bare
// catalog price), and says where it comes from.
import { describe, expect, it } from "vitest";
import { jobPriceSources, productJobPrice } from "@/components/products/priceSource";
import { DEFAULT_SETTINGS, seedCatalog } from "@/lib/catalog";
import { projectEstimate } from "@/lib/estimate";
import { cableKey } from "@/lib/products";
import { computeTakeoff } from "@/lib/takeoff";
import type { EstimateLine, Marker, PricingSettings, Product, Project, Run, Sheet } from "@/lib/types";

const ts = "2026-11-15T00:00:00.000Z";
const catalog = seedCatalog().map((d) => (d.id === "cam-indoor" ? { ...d, unitPrice: 100, laborPrice: 50 } : d.id === "wap" ? { ...d, unitPrice: 0, laborPrice: 0 } : d));
const pricing = (p: Partial<PricingSettings> = {}): PricingSettings => ({ ...DEFAULT_SETTINGS.pricing, markupPct: 0, taxPct: 0, laborMode: "combined", wirePrices: { Cat6: 0.5 }, ...p });
const sheet: Sheet = { id: "s1", projectId: "p", name: "1st Fl", pageNumber: 1, order: 0, imageId: "i", width: 1000, height: 1000, pxPerFt: 10, createdAt: ts, updatedAt: ts };
const project: Project = { id: "p", clientName: "", address: "", status: "estimate", billduDocs: [], productChoices: null, createdAt: ts, updatedAt: ts };
let n = 0;
const marker = (deviceTypeId: string, extra: Partial<Marker> = {}): Marker => ({
  id: `m${++n}`, projectId: "p", sheetId: "s1", deviceTypeId, x: 0.5, y: 0.5, label: "", room: "", mount: "ceiling", wireType: "Cat6", tentative: false, notes: "", createdAt: ts, updatedAt: ts, ...extra,
});
const run: Run = { id: "r", projectId: "p", sheetId: "s1", kind: "wire", points: [0, 0, 1, 0], typedFt: 100, wireType: "Cat6", createdAt: ts, updatedAt: ts };
const line = (key: string, extra: Partial<EstimateLine>): EstimateLine => ({ id: key, projectId: "p", key, updatedAt: ts, ...extra });

const markers = [marker("cam-indoor"), marker("cam-indoor"), marker("wap"), marker("wap", { tentative: true })];
const data = (estimateLines: EstimateLine[] = []) => ({ project, sheets: [sheet], markers, runs: [run], closets: [], estimateLines });
const sources = (pr: PricingSettings, overrides: EstimateLine[] = []) => jobPriceSources(computeTakeoff(data(overrides)), catalog, pr, overrides, cableKey);
const tablePrice = (pr: PricingSettings, overrides: EstimateLine[], key: string) => projectEstimate(data(overrides), catalog, [], pr).lines.find((l) => l.key === key)?.unitPrice;

describe("Products for this job: price with no product", () => {
  it("is the price-list price with markup and labor, the same as the table", () => {
    const pr = pricing({ markupPct: 10 });
    const s = sources(pr);
    expect(s.get("cam-indoor")).toEqual({ price: 160, source: "price list + 10% markup + labor" });
    expect(s.get("cam-indoor")!.price).toBe(tablePrice(pr, [], "dev:cam-indoor"));
    expect(s.get(cableKey("Cat6"))).toEqual({ price: 0.55, source: "wire price in Settings + 10% markup" });
    expect(s.get(cableKey("Cat6"))!.price).toBe(tablePrice(pr, [], "wire:Cat6"));
  });

  it("uses a price typed in the table for this job (the catalog price is $0)", () => {
    const typed = [line("dev:wap", { unitPrice: 189 }), line("wire:Cat6", { unitPrice: 0.8 })];
    const s = sources(pricing(), typed);
    expect(s.get("wap")).toEqual({ price: 189, source: "typed for this job" });
    expect(s.get("wap")!.price).toBe(tablePrice(pricing(), typed, "dev:wap"));
    expect(s.get(cableKey("Cat6"))).toEqual({ price: 0.8, source: "typed for this job" });
  });

  it("says when there is no price yet", () => {
    expect(sources(pricing()).get("wap")).toEqual({ price: 0, source: "no price yet" });
  });

  it("labor on separate lines: material only", () => {
    expect(sources(pricing({ laborMode: "separate" })).get("cam-indoor")).toEqual({ price: 100, source: "price list" });
  });

  it("keeps the price of a line removed from the pricing", () => {
    const s = sources(pricing(), [line("dev:cam-indoor", { removed: true, unitPrice: 120 })]);
    expect(s.get("cam-indoor")).toEqual({ price: 120, source: "typed for this job" });
  });

  it("prices products as their table lines do", () => {
    const g5: Product = { id: "g5", deviceTypeId: "cam-indoor", brand: "Ubiquiti", model: "G5", unitPrice: 129, laborPrice: 85, updatedAt: ts };
    for (const pr of [pricing(), pricing({ markupPct: 12.5 }), pricing({ laborMode: "separate", markupPct: 7 })]) {
      const e = projectEstimate({ ...data(), project: { ...project, productChoices: { "cam-indoor": "g5" } } }, catalog, [g5], pr);
      expect(productJobPrice(g5, pr)).toBe(e.lines.find((l) => l.key === "prod:g5")!.unitPrice);
    }
  });
});
