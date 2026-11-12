import type { Closet, Marker, PricingSettings, Run, Sheet } from "./types";

/** Length of a relative-coordinate polyline in image pixels. */
export function polylinePx(points: number[], width: number, height: number): number {
  let total = 0;
  for (let i = 2; i + 1 < points.length; i += 2) {
    const dx = (points[i] - points[i - 2]) * width;
    const dy = (points[i + 1] - points[i - 1]) * height;
    total += Math.hypot(dx, dy);
  }
  return total;
}

export function polylineFt(points: number[], sheet: Pick<Sheet, "width" | "height" | "pxPerFt">): number | null {
  if (!sheet.pxPerFt) return null;
  return polylinePx(points, sheet.width, sheet.height) / sheet.pxPerFt;
}

/** The effective length of a run in feet (typed beats measured; stairs are steps × LF/step). */
export function runLengthFt(run: Run): number | null {
  if (run.kind === "stair") {
    if (run.typedFt != null) return run.typedFt;
    if (run.steps != null && run.lfPerStep != null) return run.steps * run.lfPerStep;
    return null;
  }
  if (run.typedFt != null) return run.typedFt;
  if (run.measuredFt != null) return run.measuredFt;
  return null;
}

/**
 * Parse a length typed by a user into feet. Accepts: 12, 12.5, 12', 12'6", 12' 6", 12ft 6in,
 * 150", 6in, 3.5m.
 */
export function parseFeet(input: string): number | null {
  const s = input.trim().toLowerCase().replace(/[’′]/g, "'").replace(/[”″]/g, '"');
  if (!s) return null;
  const m = s.match(/^(\d+(?:\.\d+)?)\s*m$/);
  if (m) return parseFloat(m[1]) * 3.28084;
  const ftIn = s.match(/^(?:(\d+(?:\.\d+)?)\s*(?:'|ft|feet|foot))?\s*-?\s*(?:(\d+(?:\.\d+)?)\s*(?:"|in|inch|inches))?$/);
  if (ftIn && (ftIn[1] || ftIn[2])) {
    return (ftIn[1] ? parseFloat(ftIn[1]) : 0) + (ftIn[2] ? parseFloat(ftIn[2]) / 12 : 0);
  }
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Parse an architectural scale like `1/4" = 1'-0"`, `1/8"=1'`, `3/16 = 1`, or `1:48`.
 * Returns paper inches per real foot.
 */
export function parseScale(input: string): number | null {
  const s = input.trim().replace(/[’′]/g, "'").replace(/[”″]/g, '"');
  const ratio = s.match(/^1\s*:\s*(\d+(?:\.\d+)?)$/);
  if (ratio) return 12 / parseFloat(ratio[1]);
  const parts = s.split("=");
  if (parts.length !== 2) return null;
  const paperIn = parseInchesFraction(parts[0]);
  const realFt = parseFeet(parts[1].replace(/'\s*-\s*/, "' "));
  if (!paperIn || !realFt) return null;
  return paperIn / realFt;
}

function parseInchesFraction(raw: string): number | null {
  const s = raw.replace(/"|in/g, "").trim();
  const mixed = s.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (mixed) return parseInt(mixed[1]) + parseInt(mixed[2]) / parseInt(mixed[3]);
  const frac = s.match(/^(\d+)\/(\d+)$/);
  if (frac) return parseInt(frac[1]) / parseInt(frac[2]);
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function formatFt(ft: number | null | undefined, digits = 1): string {
  if (ft == null || !Number.isFinite(ft)) return "—";
  return `${Number(ft.toFixed(digits))} LF`;
}

/**
 * Estimate a home-run cable length from a device to its closet.
 * Same sheet: orthogonal (Manhattan) path. Different sheet: Manhattan distance to the closet's
 * position on the device's floor (sheets of a plan set share framing), plus floor-to-floor height
 * for each floor between them. Adds slack % and a fixed drop allowance.
 * Returns null when the device's sheet has no scale.
 */
export function estimateHomeRunFt(
  marker: Pick<Marker, "x" | "y" | "sheetId">,
  closet: Pick<Closet, "x" | "y" | "sheetId">,
  sheets: Pick<Sheet, "id" | "width" | "height" | "pxPerFt" | "order">[],
  pricing: Pick<PricingSettings, "wireSlackPct" | "wireDropFt" | "floorHeightFt">,
): number | null {
  const ms = sheets.find((s) => s.id === marker.sheetId);
  const cs = sheets.find((s) => s.id === closet.sheetId);
  if (!ms || !cs || !ms.pxPerFt) return null;
  const dx = Math.abs(marker.x - closet.x) * ms.width;
  const dy = Math.abs(marker.y - closet.y) * ms.height;
  let ft = (dx + dy) / ms.pxPerFt;
  if (ms.id !== cs.id) {
    const sorted = [...sheets].sort((a, b) => a.order - b.order);
    const floors = Math.abs(sorted.findIndex((s) => s.id === ms.id) - sorted.findIndex((s) => s.id === cs.id));
    ft += Math.max(1, floors) * pricing.floorHeightFt;
  }
  ft = ft * (1 + pricing.wireSlackPct / 100) + pricing.wireDropFt;
  return Math.round(ft * 10) / 10;
}

/** L-shaped path from device to closet (on the device's sheet) for drawing a home run. */
export function homeRunPoints(marker: Pick<Marker, "x" | "y">, closet: Pick<Closet, "x" | "y">): number[] {
  return [marker.x, marker.y, closet.x, marker.y, closet.x, closet.y];
}
