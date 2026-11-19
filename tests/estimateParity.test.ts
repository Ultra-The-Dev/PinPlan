// Pricing math shared with the iPad app: the same fixture is priced in
// ios/PinPlanCore/Tests/PinPlanCoreTests/EstimateParityTests.swift and must give the same numbers.
import { describe, expect, it } from "vitest";
import { linesToItems } from "@/lib/billdu/mapping";
import { DEFAULT_SETTINGS, seedCatalog } from "@/lib/catalog";
import { buildEstimate, chargeOrder, compareProducts, depositAmount, lineProductId, money } from "@/lib/estimate";
import type { Takeoff, TakeoffBucket } from "@/lib/takeoff";
import type { EstimateLine, PricingSettings, Product } from "@/lib/types";

const ts = "2026-11-15T00:00:00.000Z";
const bucket = (patch: Partial<TakeoffBucket>): TakeoffBucket => ({
  counts: {}, tentative: {}, ledFt: {}, ledTentativeFt: {}, ledZones: 0, ledTotalFt: 0, stairFt: 0, stairSteps: 0,
  wireFt: {}, wireRuns: {}, closets: { equipment: 0, switch: 0, rack: 0 }, unmeasuredRuns: 0, ...patch,
});
const takeoff = (patch: Partial<TakeoffBucket>): Takeoff => ({ floors: [], total: bucket(patch) });
const product = (id: string, brand: string, model: string, unitPrice: number, laborPrice: number, deviceTypeId = "cam-indoor"): Product => ({
  id, deviceTypeId, brand, model, sku: `SKU-${id}`, unitPrice, laborPrice, updatedAt: ts,
});
const line = (id: string, key: string, extra: Partial<EstimateLine>): EstimateLine => ({ id, projectId: "p", key, updatedAt: ts, ...extra });

describe("money rounding", () => {
  it("rounds half away from zero, without binary-float slips", () => {
    expect(money(1.005)).toBe(1.01);
    expect(money(-1.005)).toBe(-1.01);
    expect(money(0.735)).toBe(0.74);
    expect(money(-0.025)).toBe(-0.03); // Math.round gave -0.02 (the iPad app said -0.03)
    expect(money(2.675)).toBe(2.68);
    expect(money(1.004999)).toBe(1);
    expect(Object.is(money(-0.001), 0)).toBe(true);
    expect(money(Number.NaN)).toBe(0);
    expect(depositAmount(1234.5, 30)).toBe(370.35);
  });
});

describe("estimate parity fixture (same as EstimateParityTests.swift)", () => {
  const pricing: PricingSettings = { ...DEFAULT_SETTINGS.pricing, markupPct: 12.5, taxPct: 8.875, laborMode: "separate", includeTentative: false, wirePrices: { Cat6: 0.335 } };
  const ax = product("p-ax", "axis", "M3086", 199.99, 85.005);
  const ub = product("p-ub", "Ubiquiti", "G5", 129.5, 0);
  const t = takeoff({ counts: { "cam-indoor": 3, wap: 2 }, tentative: { "cam-indoor": 1 }, wireFt: { Cat6: 123.4 }, wireRuns: { Cat6: 5 } });
  const overrides = [
    line("o3", "custom:blank", { description: "", unit: "", unitPrice: 10, qty: 2, sort: 3 }),
    line("o2", "custom:disc", { description: "Discount", unitPrice: -12.345, qty: 1, sort: 2 }),
    line("o1", "custom:trip", { description: "Trip", unitPrice: 1.005, qty: 1, sort: 1 }),
  ];
  const est = buildEstimate(t, seedCatalog(), pricing, overrides, {
    products: [ub, ax],
    split: { "cam-indoor": { [ub.id]: { confirmed: 1, tentative: 0 }, [ax.id]: { confirmed: 1, tentative: 1 } } },
  });
  const row = (key: string) => est.lines.find((l) => l.key === key)!;

  it("orders product lines by title case-insensitively (axis before Ubiquiti)", () => {
    expect(est.lines.filter((l) => l.group === "devices").map((l) => l.key)).toEqual(["prod:p-ax", "optprod:p-ax", "prod:p-ub", "dev:wap"]);
    expect([ub, ax].sort(compareProducts).map((p) => p.id)).toEqual(["p-ax", "p-ub"]);
  });

  it("prices every line the same as the iPad app", () => {
    expect(row("prod:p-ax").unitPrice).toBe(224.99); // 199.99 × 1.125 = 224.98875
    expect(row("prod:p-ub").unitPrice).toBe(145.69); // 129.5 × 1.125 = 145.6875
    expect(row("labor:prod:p-ax").unitPrice).toBe(85.01);
    expect(row("optlabor:prod:p-ax").included).toBe(false);
    expect(row("wire:Cat6").unitPrice).toBe(0.38); // 0.335 × 1.125 = 0.376875
    expect(row("wire:Cat6").total).toBe(46.89);
    expect(row("custom:trip").total).toBe(1.01);
    expect(row("custom:disc").total).toBe(-12.35);
    expect(row("custom:blank").description).toBe("Custom item");
    expect(row("custom:blank").unit).toBe("each");
  });

  it("lists added charges in the order they were added, whatever their ids", () => {
    expect(est.lines.filter((l) => l.group === "custom").map((l) => l.key)).toEqual(["custom:trip", "custom:disc", "custom:blank"]);
  });

  it("totals", () => {
    // 224.99 + 145.69 + 46.89 + 85.01 + 1.01 − 12.35 + 20; tax 8.875% = 45.37255; optional = 224.99 + 85.01
    expect({ subtotal: est.subtotal, tax: est.tax, total: est.total, optionalTotal: est.optionalTotal }).toEqual({ subtotal: 511.24, tax: 45.37, total: 556.61, optionalTotal: 310 });
  });
});

describe("added charges from both apps", () => {
  it("interleaves web (ms) and older iPad (seconds) order stamps by time", () => {
    expect(chargeOrder(1_763_000_000)).toBe(1_763_000_000_000);
    expect(chargeOrder(1_763_000_100_000)).toBe(1_763_000_100_000);
    expect(chargeOrder(undefined)).toBe(0);
    const est = buildEstimate(takeoff({}), seedCatalog(), DEFAULT_SETTINGS.pricing, [
      line("a", "custom:ipad-late", { description: "iPad later", unitPrice: 1, qty: 1, sort: 1_763_000_200 }),
      line("b", "custom:web", { description: "Web", unitPrice: 1, qty: 1, sort: 1_763_000_100_000 }),
      line("c", "custom:ipad-early", { description: "iPad earlier", unitPrice: 1, qty: 1, sort: 1_763_000_000 }),
    ]);
    expect(est.lines.filter((l) => l.group === "custom").map((l) => l.key)).toEqual(["custom:ipad-early", "custom:web", "custom:ipad-late"]);
  });
});

describe("product behind a line (SKU for Billdu)", () => {
  const cable = product("c1", "Belden", "2412", 0.32, 0.25, "wire:Cat6");
  const cam = product("p1", "Ubiquiti", "G5", 129, 85);
  const gone = { ...product("p2", "Old", "Cam", 1, 1), deleted: true };
  const project = { productChoices: { "wire:Cat6": "c1", "wire:HDMI": "p1", "cam-indoor": "p1" } };
  const products = [cable, cam, gone];
  it("finds device products, the job's cable product, and nothing else", () => {
    expect(lineProductId("prod:p1", project, products)).toBe("p1");
    expect(lineProductId("optprod:p1", project, products)).toBe("p1");
    expect(lineProductId("wire:Cat6", project, products)).toBe("c1");
    expect(lineProductId("wire:HDMI", project, products)).toBeNull(); // not a cable product: priced at the default rate, no SKU
    expect(lineProductId("prod:p2", project, products)).toBeNull();
    expect(lineProductId("labor:prod:p1", project, products)).toBeNull();
    expect(lineProductId("dev:cam-indoor", project, products)).toBeNull();
  });
});

describe("Billdu deposit", () => {
  const l = (total: number, included = true) => ({ key: "k", description: "d", qty: 1, unit: "each", unitPrice: total, total, included });
  it("sends no deposit line when nothing is included", () => {
    expect(linesToItems([l(100, false)], 0, { depositPct: 30 })).toEqual([]);
    expect(linesToItems([], 0, { depositPct: 30 })).toEqual([]);
  });
  it("takes the deposit from the included subtotal, rounded like the estimate", () => {
    const items = linesToItems([l(1000.05), l(234.45), l(99, false)], 8, { depositPct: 30 });
    expect(items).toHaveLength(1);
    expect(items[0].price).toBe(depositAmount(1234.5, 30));
  });
  it("rounds negative (discount) prices the same as the estimate", () => {
    expect(linesToItems([{ ...l(-12.345), unitPrice: -12.345 }], 0)[0].price).toBe(-12.35);
  });
});
