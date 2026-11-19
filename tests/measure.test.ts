import { describe, expect, it } from "vitest";
import {
  areaSqFt,
  cleanPoints,
  estimateLineFromGroup,
  formatFeetInches,
  formatSqFt,
  hitMeasurement,
  isSelfIntersecting,
  labelAnchor,
  lengthFt,
  measureLineKey,
  measurementValue,
  perimeterFt,
  recentLabels,
  rotatePointsCW,
  suggestUnitPrice,
  summarize,
  toCsv,
  toPx,
  totalFt,
  totalSqFt,
} from "@/lib/measure";
import { PUSH_ORDER, TABLES, toLocal, toRemote } from "@/lib/syncMap";
import type { Measurement } from "@/lib/types";

// 1000 × 500 px sheet at 10 px/ft = 100 ft × 50 ft.
const sheet = { id: "s1", name: "Level 1", order: 0, width: 1000, height: 500, pxPerFt: 10 };
// Rectangle 100 px × 50 px (10 ft × 5 ft) starting at (100, 100).
const rect = [0.1, 0.2, 0.2, 0.2, 0.2, 0.3, 0.1, 0.3];

const ts = "2026-11-19T00:00:00.000Z";
const mk = (p: Partial<Measurement>): Measurement => ({ id: "m", projectId: "p", sheetId: "s1", kind: "polyline", points: [0, 0, 0.1, 0], createdAt: ts, updatedAt: ts, ...p });

describe("geometry", () => {
  it("measures a known rectangle: length, area and perimeter", () => {
    expect(lengthFt([0.1, 0.2, 0.2, 0.2], sheet)).toBeCloseTo(10);
    expect(lengthFt(rect, sheet)).toBeCloseTo(10 + 5 + 10);
    expect(areaSqFt(rect, sheet)).toBeCloseTo(50);
    expect(perimeterFt(rect, sheet)).toBeCloseTo(30);
    // Winding doesn't matter (absolute shoelace).
    const reversed: number[] = [];
    for (let i = rect.length - 2; i >= 0; i -= 2) reversed.push(rect[i], rect[i + 1]);
    expect(areaSqFt(reversed, sheet)).toBeCloseTo(50);
  });

  it("returns null on uncalibrated sheets", () => {
    expect(lengthFt(rect, { ...sheet, pxPerFt: null })).toBeNull();
    expect(areaSqFt(rect, { ...sheet, pxPerFt: 0 })).toBeNull();
    expect(measurementValue(mk({}), { ...sheet, pxPerFt: null })).toBeNull();
  });

  it("follows recalibration (values are never stored)", () => {
    const m = mk({ points: [0, 0, 0.1, 0] }); // 100 px
    expect(totalFt(m, sheet)).toBeCloseTo(10);
    expect(totalFt(m, { ...sheet, pxPerFt: 20 })).toBeCloseTo(5);
  });

  it("flags self-intersecting polygons and still gives the absolute shoelace value", () => {
    const bowtie = [0.1, 0.2, 0.2, 0.3, 0.2, 0.2, 0.1, 0.3];
    expect(isSelfIntersecting(bowtie)).toBe(true);
    expect(isSelfIntersecting(rect)).toBe(false);
    const v = measurementValue(mk({ kind: "area", points: bowtie }), sheet)!;
    expect(v.warning).toBe("self-intersecting");
    expect(v.value).toBeGreaterThanOrEqual(0);
    expect(measurementValue(mk({ kind: "area", points: rect }), sheet)!.warning).toBeUndefined();
  });

  it("discards too few points and cleans repeated taps", () => {
    expect(cleanPoints("length", [0.1, 0.1])).toBeNull();
    expect(cleanPoints("polyline", [0.1, 0.1, 0.1, 0.1])).toBeNull();
    expect(cleanPoints("area", [0.1, 0.1, 0.2, 0.2])).toBeNull();
    expect(cleanPoints("area", [0.1, 0.1, 0.2, 0.1, 0.2, 0.2, 0.1, 0.1])).toEqual([0.1, 0.1, 0.2, 0.1, 0.2, 0.2]);
    expect(cleanPoints("polyline", [0.1, 0.1, 0.1, 0.1, 0.3, 0.3])).toEqual([0.1, 0.1, 0.3, 0.3]);
    expect(cleanPoints("length", [0, 0, 0.5, 0.5, 1, 1])).toEqual([0, 0, 1, 1]);
  });

  it("rotates points clockwise with the sheet", () => {
    expect(rotatePointsCW([0.1, 0.2, 0.3, 0.4])).toEqual([0.8, 0.1, 0.6, 0.3]);
    // A 90° turn keeps the length when the sheet's dimensions swap.
    const pts = [0.1, 0.2, 0.4, 0.6];
    const rotated = { ...sheet, width: 500, height: 1000 };
    expect(lengthFt(rotatePointsCW(pts), rotated)).toBeCloseTo(lengthFt(pts, sheet)!);
  });

  it("anchors labels at the middle of a run and the centroid of an area", () => {
    expect(labelAnchor("polyline", toPx([0, 0, 0.2, 0], sheet))).toEqual({ x: 100, y: 0 });
    const c = labelAnchor("area", toPx(rect, sheet))!;
    expect(c.x).toBeCloseTo(150);
    expect(c.y).toBeCloseTo(125);
  });

  it("hits lines near the tap and areas containing it", () => {
    const ms = [mk({ id: "line", points: [0, 0.5, 1, 0.5] }), mk({ id: "box", kind: "area", points: rect })];
    expect(hitMeasurement(ms, sheet, { x: 500, y: 253 }, 5)).toBe("line");
    expect(hitMeasurement(ms, sheet, { x: 150, y: 125 }, 5)).toBe("box");
    expect(hitMeasurement(ms, sheet, { x: 900, y: 50 }, 5)).toBeNull();
  });
});

describe("allowances", () => {
  it("adds extra feet then waste to lengths", () => {
    const m = mk({ points: [0, 0, 0.1, 0], extraFt: 10, wastePct: 10 }); // 10 ft
    expect(totalFt(m, sheet)).toBeCloseTo((10 + 10) * 1.1);
    expect(totalFt({ ...m, extraFt: null, wastePct: null }, sheet)).toBeCloseTo(10);
    // Negative / junk allowances count as zero.
    expect(totalFt({ ...m, extraFt: -5, wastePct: Number.NaN }, sheet)).toBeCloseTo(10);
  });

  it("applies waste to areas (extra feet don't apply)", () => {
    const m = mk({ kind: "area", points: rect, wastePct: 20, extraFt: 99 });
    expect(totalSqFt(m, sheet)).toBeCloseTo(60);
    const v = measurementValue(m, sheet)!;
    expect(v.unit).toBe("sq ft");
    expect(v.value).toBeCloseTo(60);
    expect(v.raw).toBeCloseTo(50);
    expect(v.perimeterFt).toBeCloseTo(30);
  });
});

describe("summary", () => {
  const sheets = [sheet, { id: "s2", name: "Level 2", order: 1, width: 1000, height: 500, pxPerFt: 20 }, { id: "s3", name: "Photo", order: 2, width: 1000, height: 500, pxPerFt: null }];
  const ms = [
    mk({ id: "a", label: "Cat6 tray", points: [0, 0, 0.1, 0] }), // 10 ft
    mk({ id: "b", label: " cat6  TRAY ", kind: "length", points: [0, 0, 0.2, 0], sheetId: "s2" }), // 200 px / 20 = 10 ft
    mk({ id: "c", label: "Cat6 tray", kind: "area", points: rect }), // 50 sq ft
    mk({ id: "d", label: "Drop ceiling", kind: "area", points: rect, wastePct: 10 }), // 55 sq ft
    mk({ id: "e", label: "Cat6 tray", points: [0, 0, 0.5, 0], sheetId: "s3" }), // uncalibrated
    mk({ id: "f", label: null, points: [0, 0, 0.1, 0] }),
    mk({ id: "g", label: "Cat6 tray", points: [0, 0, 0.5, 0], deleted: true }),
  ];

  it("groups by label (case/space-insensitive) and kind, runs with lengths, and excludes uncalibrated sheets", () => {
    const s = summarize(ms, sheets);
    const byKey = Object.fromEntries(s.rows.map((r) => [r.key, r]));
    expect(byKey["cat6-tray|length"]).toMatchObject({ label: "Cat6 tray", count: 2, total: 20, unit: "ft" });
    expect(byKey["cat6-tray|length"].sheets.map((x) => x.name)).toEqual(["Level 1", "Level 2"]);
    expect(byKey["cat6-tray|area"]).toMatchObject({ count: 1, total: 50, unit: "sq ft", perimeterFt: 30 });
    expect(byKey["drop-ceiling|area"].total).toBeCloseTo(55);
    expect(byKey["unlabeled|length"]).toMatchObject({ label: "Unlabeled", count: 1, total: 10 });
    expect(s.rows.at(-1)!.label).toBe("Unlabeled");
    expect(s.uncalibrated).toEqual([{ sheetId: "s3", name: "Photo", count: 1 }]);
    expect(s.rows.flatMap((r) => r.ids)).not.toContain("e");
    expect(s.rows.flatMap((r) => r.ids)).not.toContain("g");
  });

  it("writes a CSV with one row per group", () => {
    const csv = toCsv(summarize(ms, sheets).rows);
    const lines = csv.trim().split("\n");
    expect(lines[0]).toBe("Group,Kind,Count,Total,Unit,Perimeter (ft),Sheets");
    expect(lines).toContain("Cat6 tray,Length,2,20.00,ft,,Level 1; Level 2");
    expect(lines).toContain("Cat6 tray,Area,1,50.00,sq ft,30.00,Level 1");
    // Quotes, commas and formula-looking cells are escaped.
    const tricky = toCsv([{ key: "k", label: `3/4" EMT, =x`, kind: "length", unit: "ft", count: 1, total: 1, color: null, sheets: [], ids: [] }]);
    expect(tricky.split("\n")[1]).toBe(`"3/4"" EMT, =x",Length,1,1.00,ft,,`);
    const formula = toCsv([{ key: "k", label: "=SUM(A1)", kind: "length", unit: "ft", count: 1, total: 1, color: null, sheets: [], ids: [] }]);
    expect(formula.split("\n")[1].startsWith(`"'=SUM(A1)"`)).toBe(true);
  });
});

describe("formatting", () => {
  it("formats feet and inches", () => {
    expect(formatFeetInches(12.5)).toBe(`12' 6"`);
    expect(formatFeetInches(0)).toBe(`0' 0"`);
    expect(formatFeetInches(9.999)).toBe(`10' 0"`);
    expect(formatFeetInches(1234.25)).toBe(`1,234' 3"`);
    expect(formatFeetInches(null)).toBe("—");
    expect(formatSqFt(1234.4)).toBe("1,234 sq ft");
    expect(formatSqFt(2.25)).toBe("2.3 sq ft");
  });
});

describe("estimate line", () => {
  it("keeps a stable key per label + kind and rounds the quantity up", () => {
    const row = { label: `3/4" EMT`, kind: "length" as const, total: 120.2 };
    const line = estimateLineFromGroup(row, 1.5);
    expect(line).toEqual({ key: "custom:meas-3-4-emt-length", description: `3/4" EMT`, qty: 121, unit: "ft", unitPrice: 1.5, removed: false });
    expect(estimateLineFromGroup({ ...row, total: 300 }).key).toBe(line.key);
    expect(estimateLineFromGroup({ ...row, total: 300 }).qty).toBe(300);
    expect(estimateLineFromGroup({ ...row, total: 300 })).not.toHaveProperty("unitPrice");
    const area = estimateLineFromGroup({ label: "Drop ceiling", kind: "area", total: 0.4 });
    expect(area).toMatchObject({ key: "custom:meas-drop-ceiling-area", description: "Drop ceiling (area)", qty: 1, unit: "sq ft" });
    expect(measureLineKey({ label: "Drop Ceiling", kind: "area" })).toBe(area.key);
    // Not a "per device" charge (no @): estimate.ts uses the stored qty.
    expect(line.key).not.toContain("@");
  });

  it("gives one group and one estimate line per key, for any script", () => {
    // Labels that would share an estimate key are one group (adding one must not overwrite the other's line).
    const s = summarize([mk({ id: "x", label: "Cat 6" }), mk({ id: "y", label: "cat-6" })], [sheet]);
    expect(s.rows).toHaveLength(1);
    expect(s.rows[0]).toMatchObject({ count: 2, total: 20 });
    expect(measureLineKey(s.rows[0])).toBe("custom:meas-cat-6-length");
    // Non-Latin labels keep their letters instead of all collapsing to one key.
    const a = measureLineKey({ label: "Кабель", kind: "length" });
    const b = measureLineKey({ label: "Труба", kind: "length" });
    expect(a).toBe("custom:meas-кабель-length");
    expect(a).not.toBe(b);
    // Punctuation-only labels get distinct hashed keys.
    expect(measureLineKey({ label: "//", kind: "area" })).not.toBe(measureLineKey({ label: "**", kind: "area" }));
    expect(measureLineKey({ label: "//", kind: "area" })).toBe(measureLineKey({ label: "//", kind: "area" }));
  });

  it("suggests a unit price from wire prices or products", () => {
    const products = [{ brand: "Acme", model: "EMT 3/4", sku: "EMT34", unitPrice: 0.85 }];
    expect(suggestUnitPrice("Cat6", { wirePrices: { Cat6: 0.3 } })).toEqual({ price: 0.3, source: "Cat6 wire price" });
    expect(suggestUnitPrice("Cat6 tray", { wirePrices: { Cat6: 0.3, RG6: 0.2 } })?.price).toBe(0.3);
    expect(suggestUnitPrice("emt34", { products })).toEqual({ price: 0.85, source: "Acme EMT 3/4" });
    expect(suggestUnitPrice("Drop ceiling", { wirePrices: { Cat6: 0.3 }, products })).toBeNull();
    expect(suggestUnitPrice("Unlabeled", { wirePrices: { Unlabeled: 1 } })).toBeNull();
  });

  it("lists recent labels, newest first, once each", () => {
    const rows = [mk({ label: "A", updatedAt: "2026-11-01T00:00:00Z" }), mk({ label: "b", updatedAt: "2026-11-03T00:00:00Z" }), mk({ label: "a ", updatedAt: "2026-11-04T00:00:00Z" }), mk({ label: "", updatedAt: "2026-11-05T00:00:00Z" })];
    expect(recentLabels(rows)).toEqual(["a", "b"]);
  });
});

describe("sync", () => {
  it("round-trips a measurement through the Supabase mapping", () => {
    const m = mk({ id: "m1", kind: "area", points: rect, label: "Drop ceiling", color: "#e11d48", extraFt: null, wastePct: 10, notes: "grid", author: "Sam" });
    const r = toRemote("measurements", m as unknown as Record<string, unknown>);
    expect(r).toMatchObject({ id: "m1", project_id: "p", sheet_id: "s1", kind: "area", points: rect, label: "Drop ceiling", extra_ft: null, waste_pct: 10, deleted: false });
    const back = toLocal("measurements", { ...r, created_at: "2026-11-19T00:00:00+00:00", updated_at: "2026-11-19T00:00:00+00:00" });
    expect(back).toEqual({ ...m, extraFt: undefined, deleted: false });
    expect(back).not.toHaveProperty("extraFt");
    expect(toRemote("measurements", { id: "x", projectId: "p", sheetId: "s", kind: "length" }).points).toEqual([]);
    expect(TABLES.measurements.remote).toBe("measurements");
    expect(PUSH_ORDER).toContain("measurements");
    expect(PUSH_ORDER.indexOf("measurements")).toBeGreaterThan(PUSH_ORDER.indexOf("sheets"));
  });
});
