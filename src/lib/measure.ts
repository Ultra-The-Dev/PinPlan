// Saved measurements: pure geometry, totals, grouping, CSV and estimate lines (docs/saved-measurements.md).
// Points are relative (0–1) x,y pairs on the sheet image. Nothing here is stored: every value is computed from the
// points and the sheet's current scale (pxPerFt), so recalibrating a sheet updates every measurement on it.
import { msg } from "./i18n/msg";
import type { EstimateLine, Measurement, MeasurementKind, Product, Sheet } from "./types";

export type SheetScale = Pick<Sheet, "width" | "height" | "pxPerFt">;
type Pt = { x: number; y: number };

/** Fewest points a measurement of each kind needs (fewer is discarded). */
export const MIN_POINTS: Record<MeasurementKind, number> = { length: 2, polyline: 2, area: 3 };

/** Lengths and runs total together (both are linear feet); areas separately. */
export type GroupKind = "length" | "area";
export const groupKind = (k: MeasurementKind): GroupKind => (k === "area" ? "area" : "length");
export const unitFor = (k: MeasurementKind | GroupKind): "ft" | "sq ft" => (k === "area" ? "sq ft" : "ft");

export const KIND_NAMES: Record<MeasurementKind, string> = { length: msg("Length"), polyline: msg("Run"), area: msg("Area") };

const calibrated = (s: SheetScale | null | undefined): s is SheetScale & { pxPerFt: number } => !!s && !!s.pxPerFt && s.pxPerFt > 0 && s.width > 0 && s.height > 0;

/** Relative pairs → image pixels. */
export function toPx(points: number[], sheet: Pick<Sheet, "width" | "height">): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i + 1 < points.length; i += 2) out.push({ x: points[i] * sheet.width, y: points[i + 1] * sheet.height });
  return out;
}

function pathPx(p: Pt[], closed: boolean): number {
  let d = 0;
  for (let i = 1; i < p.length; i++) d += Math.hypot(p[i].x - p[i - 1].x, p[i].y - p[i - 1].y);
  if (closed && p.length > 2) d += Math.hypot(p[0].x - p[p.length - 1].x, p[0].y - p[p.length - 1].y);
  return d;
}

/** Length along the points in feet (open path). Null when the sheet isn't calibrated. */
export function lengthFt(points: number[], sheet: SheetScale | null | undefined): number | null {
  if (!calibrated(sheet)) return null;
  return pathPx(toPx(points, sheet), false) / sheet.pxPerFt;
}

/** Closed-path length (the area's outline) in feet. */
export function perimeterFt(points: number[], sheet: SheetScale | null | undefined): number | null {
  if (!calibrated(sheet)) return null;
  return pathPx(toPx(points, sheet), true) / sheet.pxPerFt;
}

/** Polygon area in square feet (shoelace, absolute value). Null when uncalibrated. */
export function areaSqFt(points: number[], sheet: SheetScale | null | undefined): number | null {
  if (!calibrated(sheet)) return null;
  const p = toPx(points, sheet);
  if (p.length < 3) return 0;
  let a = 0;
  for (let i = 0; i < p.length; i++) {
    const j = (i + 1) % p.length;
    a += p[i].x * p[j].y - p[j].x * p[i].y;
  }
  return Math.abs(a) / 2 / (sheet.pxPerFt * sheet.pxPerFt);
}

function segmentsCross(a: Pt, b: Pt, c: Pt, d: Pt): boolean {
  const o = (p: Pt, q: Pt, r: Pt) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const d1 = o(c, d, a);
  const d2 = o(c, d, b);
  const d3 = o(a, b, c);
  const d4 = o(a, b, d);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

/** True when a polygon's edges cross (its shoelace area is then only an approximation). */
export function isSelfIntersecting(points: number[]): boolean {
  const p = toPx(points, { width: 1, height: 1 });
  const n = p.length;
  if (n < 4) return false;
  for (let i = 0; i < n; i++) {
    const a = p[i];
    const b = p[(i + 1) % n];
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue; // neighbours through the closing edge
      if (segmentsCross(a, b, p[j], p[(j + 1) % n])) return true;
    }
  }
  return false;
}

/**
 * Clean up drawn points before saving: drop repeated taps (closer than `minGap`, relative), drop a closing point that
 * repeats the first vertex of an area, keep only the two ends of a straight length. Null when too few points remain.
 */
export function cleanPoints(kind: MeasurementKind, points: number[], minGap = 0.0015): number[] | null {
  const out: number[] = [];
  for (let i = 0; i + 1 < points.length; i += 2) {
    const x = points[i];
    const y = points[i + 1];
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    const n = out.length;
    if (n && Math.hypot(out[n - 2] - x, out[n - 1] - y) < minGap) continue;
    out.push(x, y);
  }
  if (kind === "area" && out.length >= 6 && Math.hypot(out[0] - out[out.length - 2], out[1] - out[out.length - 1]) < minGap) out.splice(-2, 2);
  const pts = kind === "length" && out.length > 4 ? [out[0], out[1], out[out.length - 2], out[out.length - 1]] : out;
  return pts.length / 2 >= MIN_POINTS[kind] ? pts : null;
}

const pos = (v: number | null | undefined) => (v != null && Number.isFinite(v) && v > 0 ? v : 0);

/** Linear feet with allowances: (length + extraFt) × (1 + wastePct/100). For an area, its perimeter is the length. */
export function totalFt(m: Pick<Measurement, "kind" | "points" | "extraFt" | "wastePct">, sheet: SheetScale | null | undefined): number | null {
  const len = m.kind === "area" ? perimeterFt(m.points, sheet) : lengthFt(m.points, sheet);
  if (len == null) return null;
  return (len + pos(m.extraFt)) * (1 + pos(m.wastePct) / 100);
}

/** Square feet with the waste allowance: area × (1 + wastePct/100). */
export function totalSqFt(m: Pick<Measurement, "points" | "wastePct">, sheet: SheetScale | null | undefined): number | null {
  const a = areaSqFt(m.points, sheet);
  return a == null ? null : a * (1 + pos(m.wastePct) / 100);
}

export interface MeasureValue {
  /** Feet for a length/run, square feet for an area — with allowances. */
  value: number;
  unit: "ft" | "sq ft";
  /** Before extra/waste. */
  raw: number;
  /** Areas: outline length in feet (no allowances). */
  perimeterFt?: number;
  warning?: "self-intersecting";
}

/** A measurement's value on its sheet, or null when the sheet isn't calibrated. */
export function measurementValue(m: Pick<Measurement, "kind" | "points" | "extraFt" | "wastePct">, sheet: SheetScale | null | undefined): MeasureValue | null {
  if (m.kind === "area") {
    const raw = areaSqFt(m.points, sheet);
    if (raw == null) return null;
    return { value: totalSqFt(m, sheet)!, unit: "sq ft", raw, perimeterFt: perimeterFt(m.points, sheet)!, ...(isSelfIntersecting(m.points) ? { warning: "self-intersecting" as const } : {}) };
  }
  const raw = lengthFt(m.points, sheet);
  if (raw == null) return null;
  return { value: totalFt(m, sheet)!, unit: "ft", raw };
}

// ---------------- formatting ----------------

/** 12.5 → 12' 6" (rounded to the inch). */
export function formatFeetInches(ft: number | null | undefined): string {
  if (ft == null || !Number.isFinite(ft)) return "—";
  const neg = ft < 0;
  const totalIn = Math.round(Math.abs(ft) * 12);
  const f = Math.floor(totalIn / 12);
  const i = totalIn % 12;
  return `${neg ? "-" : ""}${f.toLocaleString("en-US")}' ${i}"`;
}

/** 1234.4 → "1,234 sq ft" (one decimal under 10). */
export function formatSqFt(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${v.toLocaleString("en-US", { maximumFractionDigits: v < 10 ? 1 : 0 })} sq ft`;
}

export function formatValue(v: Pick<MeasureValue, "value" | "unit"> | null): string {
  if (!v) return "—";
  return v.unit === "sq ft" ? formatSqFt(v.value) : formatFeetInches(v.value);
}

// ---------------- grouping ----------------

export const UNLABELED = "Unlabeled";
export const groupLabel = (label: string | null | undefined) => label?.trim().replace(/\s+/g, " ") || UNLABELED;

export interface SummaryRow {
  /** Stable group key: `<slugify(label)>|<group kind>`. Labels that differ only in case or punctuation share a group, as they share an estimate line. */
  key: string;
  label: string;
  kind: GroupKind;
  unit: "ft" | "sq ft";
  count: number;
  /** Sum of each measurement's total (with extra/waste): feet or square feet. */
  total: number;
  /** Areas: summed outlines in feet (no allowances). */
  perimeterFt?: number;
  /** Most used colour in the group. */
  color: string | null;
  sheets: { id: string; name: string }[];
  ids: string[];
  /** Some areas in the group cross themselves. */
  warning?: boolean;
}

export interface Summary {
  rows: SummaryRow[];
  /** Measurements on sheets without a scale: not totalled. */
  uncalibrated: { sheetId: string; name: string; count: number }[];
}

const round2 = (v: number) => Math.round(v * 100) / 100;

/** Group live measurements by label + kind (length and run together) with totals; uncalibrated sheets reported apart. */
export function summarize(measurements: Measurement[], sheets: Pick<Sheet, "id" | "name" | "width" | "height" | "pxPerFt" | "order">[]): Summary {
  const byId = new Map(sheets.map((s) => [s.id, s]));
  const order = new Map(sheets.map((s, i) => [s.id, s.order ?? i]));
  const groups = new Map<string, SummaryRow & { colors: Map<string, number> }>();
  const unc = new Map<string, { sheetId: string; name: string; count: number }>();
  for (const m of measurements) {
    if (m.deleted) continue;
    const sheet = byId.get(m.sheetId);
    if (!sheet) continue;
    const v = measurementValue(m, sheet);
    if (!v) {
      const u = unc.get(sheet.id) ?? { sheetId: sheet.id, name: sheet.name, count: 0 };
      u.count++;
      unc.set(sheet.id, u);
      continue;
    }
    const label = groupLabel(m.label);
    const kind = groupKind(m.kind);
    const key = `${slugify(label)}|${kind}`;
    let g = groups.get(key);
    if (!g) {
      g = { key, label, kind, unit: unitFor(kind), count: 0, total: 0, color: null, sheets: [], ids: [], colors: new Map() };
      if (kind === "area") g.perimeterFt = 0;
      groups.set(key, g);
    }
    g.count++;
    g.total += v.value;
    if (kind === "area") g.perimeterFt = (g.perimeterFt ?? 0) + (v.perimeterFt ?? 0);
    if (v.warning) g.warning = true;
    g.ids.push(m.id);
    if (!g.sheets.some((s) => s.id === sheet.id)) g.sheets.push({ id: sheet.id, name: sheet.name });
    if (m.color) g.colors.set(m.color, (g.colors.get(m.color) ?? 0) + 1);
  }
  const rows: SummaryRow[] = [...groups.values()].map(({ colors, ...g }) => ({
    ...g,
    total: round2(g.total),
    ...(g.perimeterFt != null ? { perimeterFt: round2(g.perimeterFt) } : {}),
    color: [...colors.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null,
    sheets: g.sheets.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0)),
  }));
  rows.sort((a, b) => (a.label === UNLABELED ? 1 : 0) - (b.label === UNLABELED ? 1 : 0) || a.label.localeCompare(b.label) || a.kind.localeCompare(b.kind));
  return { rows, uncalibrated: [...unc.values()].sort((a, b) => (order.get(a.sheetId) ?? 0) - (order.get(b.sheetId) ?? 0)) };
}

const csvCell = (v: string | number) => {
  const s = String(v);
  return /[",\n\r]/.test(s) || /^[=+\-@]/.test(s) ? `"${(/^[=+\-@]/.test(s) ? "'" : "") + s.replace(/"/g, '""')}"` : s;
};

/** CSV of a summary: one row per group. */
export function toCsv(rows: SummaryRow[]): string {
  const head = ["Group", "Kind", "Count", "Total", "Unit", "Perimeter (ft)", "Sheets"];
  const lines = [head.join(",")];
  for (const r of rows) {
    lines.push(
      [r.label, r.kind === "area" ? "Area" : "Length", r.count, r.total.toFixed(2), r.unit, r.perimeterFt != null ? r.perimeterFt.toFixed(2) : "", r.sheets.map((s) => s.name).join("; ")].map(csvCell).join(","),
    );
  }
  return lines.join("\n") + "\n";
}

// ---------------- estimate ----------------

/**
 * Label → key part: lower-case letters and digits (any script) joined by "-". A label with neither (e.g. "//") gets a
 * short hash, so two such labels don't share one estimate line.
 */
export function slugify(s: string): string {
  const out = s.toLowerCase().normalize("NFC").replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "");
  if (out) return out;
  let h = 0;
  for (const ch of s.trim()) h = (Math.imul(h, 31) + ch.codePointAt(0)!) >>> 0;
  return s.trim() ? `g${h.toString(36)}` : "group";
}

/** Estimate line key for a group: `custom:meas-<slug(label)>-<kind>` (stable, so re-adding updates the same line). */
export const measureLineKey = (row: Pick<SummaryRow, "label" | "kind">) => `custom:meas-${slugify(row.label)}-${row.kind}`;

/** A custom estimate line for a group: quantity rounded up, unit ft or sq ft. */
export function estimateLineFromGroup(row: Pick<SummaryRow, "label" | "kind" | "total">, unitPrice?: number | null): Partial<EstimateLine> & { key: string } {
  return {
    key: measureLineKey(row),
    description: row.kind === "area" ? `${row.label} (area)` : row.label,
    qty: Math.ceil(Math.max(0, row.total) - 1e-9),
    unit: unitFor(row.kind),
    ...(unitPrice != null && Number.isFinite(unitPrice) ? { unitPrice } : {}),
    removed: false,
  };
}

/**
 * A unit price for a group label: the job's wire price for a matching cable name ("Cat6" → wirePrices.Cat6), else a
 * product whose model, SKU or "brand model" matches. Null when nothing matches.
 */
export function suggestUnitPrice(
  label: string,
  opts: { wirePrices?: Record<string, number>; products?: Pick<Product, "brand" | "model" | "sku" | "unitPrice" | "deleted" | "archived">[] },
): { price: number; source: string } | null {
  const l = label.trim().toLowerCase();
  if (!l || l === UNLABELED.toLowerCase()) return null;
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");
  const ln = norm(l);
  const wires = Object.entries(opts.wirePrices ?? {}).filter(([k, v]) => k.trim() && Number.isFinite(v) && v > 0);
  const exactWire = wires.find(([k]) => norm(k) === ln);
  if (exactWire) return { price: exactWire[1], source: `${exactWire[0]} wire price` };
  const products = (opts.products ?? []).filter((p) => !p.deleted && !p.archived && Number.isFinite(p.unitPrice) && p.unitPrice > 0);
  for (const p of products) {
    const names = [p.model, p.sku ?? "", `${p.brand} ${p.model}`].map(norm).filter((n) => n.length >= 3);
    if (names.includes(ln)) return { price: p.unitPrice, source: `${p.brand} ${p.model}` };
  }
  // Partial: the label mentions a wire type ("Cat6 tray" → Cat6), longest name first.
  const partial = wires.filter(([k]) => norm(k).length >= 3 && ln.includes(norm(k))).sort((a, b) => b[0].length - a[0].length)[0];
  if (partial) return { price: partial[1], source: `${partial[0]} wire price` };
  return null;
}

// ---------------- drawing helpers ----------------

/** Rotate relative points 90° clockwise with their sheet (same as markers: (x, y) → (1 − y, x)). */
export function rotatePointsCW(points: number[]): number[] {
  const out: number[] = [];
  for (let i = 0; i + 1 < points.length; i += 2) out.push(1 - points[i + 1], points[i]);
  return out;
}

/** Where to put a measurement's label (image px): the halfway point along a path, or an area's centroid. */
export function labelAnchor(kind: MeasurementKind, p: Pt[]): Pt | null {
  if (!p.length) return null;
  if (kind === "area" && p.length >= 3) {
    let a = 0;
    let cx = 0;
    let cy = 0;
    for (let i = 0; i < p.length; i++) {
      const j = (i + 1) % p.length;
      const f = p[i].x * p[j].y - p[j].x * p[i].y;
      a += f;
      cx += (p[i].x + p[j].x) * f;
      cy += (p[i].y + p[j].y) * f;
    }
    if (Math.abs(a) > 1e-9) return { x: cx / (3 * a), y: cy / (3 * a) };
    return { x: p.reduce((s, q) => s + q.x, 0) / p.length, y: p.reduce((s, q) => s + q.y, 0) / p.length };
  }
  const total = pathPx(p, false);
  let left = total / 2;
  for (let i = 1; i < p.length; i++) {
    const d = Math.hypot(p[i].x - p[i - 1].x, p[i].y - p[i - 1].y);
    if (d >= left && d > 0) {
      const t = left / d;
      return { x: p[i - 1].x + (p[i].x - p[i - 1].x) * t, y: p[i - 1].y + (p[i].y - p[i - 1].y) * t };
    }
    left -= d;
  }
  return p[0];
}

/** Snap `p` to the nearest 45° direction from `from` (shift-drawing straight runs). Image px. */
export function snapAngle(from: Pt, p: Pt): Pt {
  const dx = p.x - from.x;
  const dy = p.y - from.y;
  const len = Math.hypot(dx, dy);
  if (!len) return p;
  const step = Math.PI / 4;
  const a = Math.round(Math.atan2(dy, dx) / step) * step;
  return { x: from.x + Math.cos(a) * len, y: from.y + Math.sin(a) * len };
}

/** Squared distance from point p to segment ab (image px). */
export function distToSegment(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2)) : 0;
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** Point inside a polygon (even-odd). */
export function pointInPolygon(p: Pt, poly: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/**
 * The measurement under a tap (image px, tolerance in image px): the nearest line/outline within `tol`, else the
 * smallest area containing the point. Later (top-most) measurements win ties.
 */
export function hitMeasurement(ms: Pick<Measurement, "id" | "kind" | "points">[], sheet: Pick<Sheet, "width" | "height">, p: Pt, tol: number): string | null {
  let best: { id: string; d: number } | null = null;
  let inside: { id: string; a: number } | null = null;
  for (const m of ms) {
    const q = toPx(m.points, sheet);
    const closed = m.kind === "area" && q.length > 2;
    const n = closed ? q.length : q.length - 1;
    for (let i = 0; i < n; i++) {
      const d = distToSegment(p, q[i], q[(i + 1) % q.length]);
      if (d <= tol && (!best || d <= best.d)) best = { id: m.id, d };
    }
    if (closed && pointInPolygon(p, q)) {
      const a = areaSqFt(m.points, { ...sheet, pxPerFt: 1 }) ?? 0;
      if (!inside || a <= inside.a) inside = { id: m.id, a };
    }
  }
  return best?.id ?? inside?.id ?? null;
}

/** Recently used group labels, most recent first (for the label picker). */
export function recentLabels(ms: Pick<Measurement, "label" | "updatedAt" | "deleted">[], limit = 8): string[] {
  const seen = new Map<string, { label: string; t: string }>();
  for (const m of ms) {
    if (m.deleted || !m.label?.trim()) continue;
    const label = groupLabel(m.label);
    const k = label.toLowerCase();
    const prev = seen.get(k);
    if (!prev || prev.t < m.updatedAt) seen.set(k, { label, t: m.updatedAt });
  }
  return [...seen.values()].sort((a, b) => b.t.localeCompare(a.t)).slice(0, limit).map((x) => x.label);
}
