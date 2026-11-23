// Count pins ("Add by count"): one pin that stands for several devices of its type (12 windows). Every count of
// devices uses its count: takeoff (and with it the estimate, exports, Billdu), product split, change orders, the job
// summary, the port schedule / cable labels, the panel schedule and install progress. Same rules as
// ios/PinPlanCore/Tests/PinPlanCoreTests/MarkerCountTests.swift.
import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, seedCatalog } from "@/lib/catalog";
import { linesFromMarkers } from "@/lib/changeOrders";
import { projectEstimate } from "@/lib/estimate";
import { installedQuantities, progressTotals } from "@/lib/installProgress";
import { countPinSpot, markerQty, normalizeCount, pinLabel, sumQty } from "@/lib/markerCount";
import { layerCounts } from "@/lib/planFilter";
import { productSplit } from "@/lib/products";
import { toRemote } from "@/lib/syncMap";
import { computeTakeoff } from "@/lib/takeoff";
import type { Closet, Marker, Product, Project, Run, Sheet } from "@/lib/types";
import { materialList, portSchedule } from "@/lib/wiring";

const ts = "2026-11-23T00:00:00.000Z";
const catalog = seedCatalog();
const sheets: Sheet[] = [
  { id: "s1", projectId: "p", name: "1st Fl", pageNumber: 1, order: 0, imageId: "i", width: 100, height: 100, pxPerFt: 1, createdAt: ts, updatedAt: ts },
  { id: "s2", projectId: "p", name: "2nd Fl", pageNumber: 2, order: 1, imageId: "i", width: 100, height: 100, pxPerFt: 1, createdAt: ts, updatedAt: ts },
];
const project: Project = { id: "p", clientName: "", address: "", status: "estimate", billduDocs: [], createdAt: ts, updatedAt: ts };
const eq: Closet = { id: "eq", projectId: "p", sheetId: "s1", kind: "equipment", x: 0, y: 0, name: "Equipment closet", createdAt: ts, updatedAt: ts };
const mk = (id: string, deviceTypeId: string, sheetId: string, extra: Partial<Marker> = {}): Marker => ({
  id, projectId: "p", sheetId, deviceTypeId, x: 0.5, y: 0.5, label: id, room: "Den", mount: "wall", wireType: "Cat6", closetId: "eq", tentative: false, notes: "", createdAt: ts, updatedAt: ts, ...extra,
});

describe("markerQty / normalizeCount", () => {
  it("absent, null, 0, 1 and junk are one device; 2…9999 are that many", () => {
    expect([undefined, null, 0, 1, -3, NaN, 1.9].map((count) => markerQty({ count }))).toEqual([1, 1, 1, 1, 1, 1, 1]);
    expect([2, 12, 12.7, 9999, 20000].map((count) => markerQty({ count }))).toEqual([2, 12, 12, 9999, 9999]);
    expect(markerQty(null)).toBe(1);
  });
  it("what to store for a typed count: null for 1, whole numbers up to 9999", () => {
    expect([1, 0, "", "abc", null, undefined].map(normalizeCount)).toEqual([null, null, null, null, null, null]);
    expect([2, "12", " 40 ", 7.6, 10000].map(normalizeCount)).toEqual([2, 12, 40, 7, 9999]);
  });
  it("labels and sums", () => {
    expect(pinLabel({ label: "WIN-1-01", count: 12 })).toBe("WIN-1-01 ×12");
    expect(pinLabel({ label: "WIN-1-01", count: null })).toBe("WIN-1-01");
    expect(sumQty([{ count: 12 }, {}, { count: 3 }])).toBe(16);
  });
});

describe("where Add by count puts the pin", () => {
  it("the middle of the view, kept off the edge, stepping aside from a pin already there", () => {
    expect(countPinSpot({ x: 0.5, y: 0.4 }, [])).toEqual({ x: 0.5, y: 0.4 });
    expect(countPinSpot({ x: -2, y: 1.5 }, [])).toEqual({ x: 0.03, y: 0.97 });
    const p = countPinSpot({ x: 0.5, y: 0.4 }, [{ x: 0.5, y: 0.4 }]);
    expect(p.x).toBeCloseTo(0.52, 9);
    expect(p.y).toBeCloseTo(0.42, 9);
  });
});

describe("takeoff counts a count pin as its count", () => {
  const markers = [
    mk("w", "gen-window", "s1", { count: 12 }),
    mk("w1", "gen-window", "s1"),
    mk("c", "cam-indoor", "s2", { count: 3, tentative: true }),
    mk("x", "gen-door", "s2", { count: 5, deleted: true }),
  ];
  const takeoff = computeTakeoff({ sheets, markers, runs: [], closets: [] });
  it("per floor and in total, tentative included", () => {
    expect(takeoff.floors[0].counts["gen-window"]).toBe(13);
    expect(takeoff.floors[1].counts["cam-indoor"]).toBe(3);
    expect(takeoff.floors[1].tentative["cam-indoor"]).toBe(3);
    expect(takeoff.total.counts["gen-door"]).toBeUndefined();
  });
  it("the estimate prices the count (opt: line for the tentative pin)", () => {
    const priced = catalog.map((d) => (d.id === "cam-indoor" ? { ...d, unitPrice: 100, laborPrice: 0 } : d));
    const est = projectEstimate({ project, sheets, markers, runs: [], closets: [], estimateLines: [] }, priced, [], { ...DEFAULT_SETTINGS.pricing, markupPct: 0, laborMode: "combined" });
    expect(est.lines.find((l) => l.key === "opt:cam-indoor")?.qty).toBe(3);
  });
  it("layer counts on the plan", () => {
    expect(layerCounts(markers.filter((m) => m.sheetId === "s1"), [], () => "general")).toEqual({ general: 13 });
  });
});

describe("products, change orders, order list", () => {
  const p: Product = { id: "pr", deviceTypeId: "cam-indoor", brand: "Axis", model: "M1", unitPrice: 50, laborPrice: 0, updatedAt: ts };
  const markers = [mk("a", "cam-indoor", "s1", { count: 4, productId: "pr" }), mk("b", "cam-indoor", "s1")];
  it("product split by count", () => {
    const split = productSplit({ project, markers, sheets }, computeTakeoff({ sheets, markers, runs: [], closets: [] }), catalog, [p]);
    expect(split["cam-indoor"].pr).toEqual({ confirmed: 4, tentative: 0 });
  });
  it("change order lines from the plan", () => {
    const lines = linesFromMarkers(markers, catalog, [p], { ...DEFAULT_SETTINGS.pricing, laborMode: "combined" }, { newId: () => "n" });
    expect(lines.filter((l) => l.kind === "device").map((l) => l.qty).sort()).toEqual([1, 4]);
  });
  it("order list: 4 of the product, 1 without", () => {
    const rows = materialList({ project, sheets, markers, runs: [], closets: [eq] }, catalog, [p], { includeTentative: true });
    expect(rows.filter((r) => r.item.includes("Indoor camera")).map((r) => r.qty)).toEqual([4, 1]);
  });
});

describe("port schedule and cable labels", () => {
  it("a count pin gets a row, port and label per device", () => {
    const markers = [mk("WC-1-01", "window-contact", "s1", { count: 3, wireType: "22/4 alarm" }), mk("WC-1-02", "window-contact", "s1", { wireType: "22/4 alarm" })];
    const run: Run = { id: "r", projectId: "p", sheetId: "s1", kind: "wire", points: [0, 0, 1, 1], typedFt: 40, wireType: "22/4 alarm", markerId: "WC-1-01", closetId: "eq", createdAt: ts, updatedAt: ts };
    const rows = portSchedule({ project, sheets, markers, runs: [run], closets: [eq] }, catalog);
    expect(rows.map((r) => [r.label, r.port, r.lengthFt])).toEqual([
      ["WC-1-01.1", "ZN-01", 40],
      ["WC-1-01.2", "ZN-02", 40],
      ["WC-1-01.3", "ZN-03", 40],
      ["WC-1-02", "ZN-04", null],
    ]);
  });
});

describe("install progress", () => {
  it("one status per pin, counted once per device it stands for", () => {
    const markers = [mk("a", "cam-indoor", "s1", { count: 4, install: { status: "installed", history: [] } }), mk("b", "cam-indoor", "s1")];
    expect(progressTotals(markers, catalog)).toMatchObject({ total: 5, counts: { installed: 4, planned: 1 } });
    expect(installedQuantities(markers, catalog)).toEqual({ "cam-indoor": 4 });
  });
});

describe("sync", () => {
  it("markers.count goes up as null (a normal pin) or 2…9999", () => {
    const base = { id: "m", projectId: "p", sheetId: "s", deviceTypeId: "gen-window", x: 0.5, y: 0.5, tentative: false };
    expect(toRemote("markers", { ...base, count: 12 }).count).toBe(12);
    expect(toRemote("markers", { ...base, count: 1 }).count).toBeNull();
    expect(toRemote("markers", base).count).toBeNull();
    expect(toRemote("markers", { ...base, count: 123456 }).count).toBe(9999);
  });
});
