// Find similar (docs/find-similar.md): the pure parts of symbol matching on a sheet image. The heavy step (OpenCV
// template matching) runs in match.worker.ts; everything here is plain math so it can be tested without a browser.
// Coordinates: "sheet px" are the sheet image's own pixels (Sheet.width/height); "work px" are the downscaled image
// the matcher runs on (sheet px × scale); results are stored sheet-relative (0–1) like markers.

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A symbol turned by a multiple of 90° (clockwise), optionally mirrored left↔right first. */
export interface Orientation {
  rot: 0 | 90 | 180 | 270;
  flip: boolean;
}

/** All eight: four turns, each plain and mirrored (door swings go either way). */
export const ORIENTATIONS: Orientation[] = [0, 90, 180, 270].flatMap((rot) => [false, true].map((flip) => ({ rot: rot as Orientation["rot"], flip })));

/** Size of a w × h box after the orientation (90° and 270° swap the sides). */
export function orientedSize(w: number, h: number, o: Orientation): { w: number; h: number } {
  return o.rot === 90 || o.rot === 270 ? { w: h, h: w } : { w, h };
}

/**
 * A grey image (row-major, one byte per pixel) mirrored (if o.flip) and then turned o.rot degrees clockwise.
 * Exact pixel moves, no resampling.
 */
export function orientGray(data: ArrayLike<number>, w: number, h: number, o: Orientation): { data: Uint8Array; w: number; h: number } {
  const { w: ow, h: oh } = orientedSize(w, h, o);
  const out = new Uint8Array(ow * oh);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const sx = o.flip ? w - 1 - x : x;
      let dx: number;
      let dy: number;
      switch (o.rot) {
        case 0:
          dx = x;
          dy = y;
          break;
        case 90:
          dx = h - 1 - y;
          dy = x;
          break;
        case 180:
          dx = w - 1 - x;
          dy = h - 1 - y;
          break;
        default:
          dx = y;
          dy = w - 1 - x;
      }
      out[dy * ow + dx] = data[y * w + sx];
    }
  }
  return { data: out, w: ow, h: oh };
}

/**
 * The orientations worth searching for a template: a symmetric symbol (a plain square or circle) looks the same in
 * several, and searching each twice only costs time. Keeps the first of every group of identical images.
 */
export function distinctOrientations(data: ArrayLike<number>, w: number, h: number): Orientation[] {
  const seen: { w: number; data: Uint8Array }[] = [];
  const out: Orientation[] = [];
  for (const o of ORIENTATIONS) {
    const g = orientGray(data, w, h, o);
    if (seen.some((s) => s.w === g.w && sameBytes(s.data, g.data))) continue;
    seen.push(g);
    out.push(o);
  }
  return out;
}

function sameBytes(a: Uint8Array, b: Uint8Array) {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

export interface Candidate {
  /** Centre, in sheet px. */
  cx: number;
  cy: number;
  /** Box size in sheet px (oriented). */
  w: number;
  h: number;
  /** Normalised correlation, 0–1 (1 = identical). */
  score: number;
  orientation: Orientation;
}

/**
 * Local maxima of a score map (row-major, w × h) at or above minScore, best first. A peak must be at least as high as
 * every neighbour within `radius` px. At most `limit` peaks (the best ones).
 */
export function scorePeaks(scores: ArrayLike<number>, w: number, h: number, minScore: number, radius = 1, limit = 4000): { x: number; y: number; score: number }[] {
  const out: { x: number; y: number; score: number }[] = [];
  const r = Math.max(1, Math.round(radius));
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      const v = scores[row + x];
      if (!(v >= minScore)) continue;
      let peak = true;
      for (let yy = Math.max(0, y - r); yy <= Math.min(h - 1, y + r) && peak; yy++) {
        const rr = yy * w;
        for (let xx = Math.max(0, x - r); xx <= Math.min(w - 1, x + r); xx++) {
          const u = scores[rr + xx];
          // Ties: the first in reading order wins, so a flat top gives one peak.
          if (u > v || (u === v && (yy < y || (yy === y && xx < x)))) {
            peak = false;
            break;
          }
        }
      }
      if (peak) out.push({ x, y, score: v });
    }
  }
  out.sort((a, b) => b.score - a.score);
  return out.length > limit ? out.slice(0, limit) : out;
}

/**
 * Greedy non-maximum suppression: best score first; a candidate is dropped when its centre is closer than `minDist`
 * (sheet px) to one already kept. Because only better candidates can drop a candidate, filtering the result by a
 * higher threshold later gives the same as running NMS on the filtered list (the sensitivity slider relies on this).
 */
export function nonMaxSuppress<T extends { cx: number; cy: number; score: number }>(cands: T[], minDist: number): T[] {
  const sorted = [...cands].sort((a, b) => b.score - a.score);
  const kept: T[] = [];
  const d2 = minDist * minDist;
  // Grid buckets keep this fast for thousands of candidates.
  const cell = Math.max(1, minDist);
  const grid = new Map<string, T[]>();
  const key = (gx: number, gy: number) => `${gx},${gy}`;
  for (const c of sorted) {
    const gx = Math.floor(c.cx / cell);
    const gy = Math.floor(c.cy / cell);
    let clash = false;
    for (let i = -1; i <= 1 && !clash; i++) {
      for (let j = -1; j <= 1 && !clash; j++) {
        for (const k of grid.get(key(gx + i, gy + j)) ?? []) {
          const dx = k.cx - c.cx;
          const dy = k.cy - c.cy;
          if (dx * dx + dy * dy < d2) {
            clash = true;
            break;
          }
        }
      }
    }
    if (clash) continue;
    kept.push(c);
    const list = grid.get(key(gx, gy));
    if (list) list.push(c);
    else grid.set(key(gx, gy), [c]);
  }
  return kept;
}

/** Slider (0–100, higher finds more) → the lowest score shown. 50 → 0.7. */
export function thresholdFor(sensitivity: number): number {
  const s = Math.min(100, Math.max(0, sensitivity));
  return Math.round((0.95 - (0.5 * s) / 100) * 1000) / 1000;
}

/** The lowest threshold the slider can reach: the worker keeps everything above it, so moving the slider is instant. */
export const MIN_THRESHOLD = thresholdFor(100);

/** Template side (shorter one) the matcher works at, in work px, and the most work px on the sheet's long side. */
export const TARGET_TEMPLATE_PX = 32;
export const MAX_WORK_SIDE = 3200;
/** A template smaller than this (in work px, shorter side) is too little to match on. */
export const MIN_TEMPLATE_PX = 10;

/**
 * How much to shrink the sheet for matching: the template's shorter side becomes ~TARGET_TEMPLATE_PX, never enlarged,
 * and the sheet's long side stays within MAX_WORK_SIDE. Null when the box would end up too small to match.
 */
export function chooseScale(box: Pick<Box, "w" | "h">, sheet: { width: number; height: number }): number | null {
  const short = Math.min(box.w, box.h);
  if (!(short > 0)) return null;
  let s = Math.min(1, TARGET_TEMPLATE_PX / short, MAX_WORK_SIDE / Math.max(sheet.width, sheet.height));
  if (short * s < MIN_TEMPLATE_PX) s = Math.min(1, MIN_TEMPLATE_PX / short);
  if (short * s < MIN_TEMPLATE_PX - 0.5) return null;
  return s;
}

/**
 * The box a single tap picks, in sheet px: a square about one door wide plus its swing (4 ft) when the sheet has a
 * scale, else 1.5% of the sheet's long side; centred on the tap and kept on the sheet.
 */
export function tapBox(at: { x: number; y: number }, sheet: { width: number; height: number; pxPerFt?: number | null }): Box {
  const side = Math.max(16, sheet.pxPerFt ? 4 * sheet.pxPerFt : 0.015 * Math.max(sheet.width, sheet.height));
  return clampBox({ x: at.x - side / 2, y: at.y - side / 2, w: side, h: side }, sheet);
}

/** A box (sheet px) moved and cut to lie on the sheet. */
export function clampBox(b: Box, sheet: { width: number; height: number }): Box {
  const w = Math.min(b.w, sheet.width);
  const h = Math.min(b.h, sheet.height);
  const x = Math.min(Math.max(0, b.x), sheet.width - w);
  const y = Math.min(Math.max(0, b.y), sheet.height - h);
  return { x, y, w, h };
}

/** A box from two drag corners (any order). */
export function boxFromCorners(a: { x: number; y: number }, b: { x: number; y: number }): Box {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) };
}

/**
 * The tight box around the ink (pixels darker than `ink`) of a grey crop, with a small margin, in crop px; null when
 * the crop is blank. Used to trim the white edges of a tapped square so the template is the symbol, not paper.
 */
export function inkBounds(data: ArrayLike<number>, w: number, h: number, ink = 160, margin = 2): Box | null {
  let x0 = w;
  let y0 = h;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[y * w + x] >= ink) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  if (x1 < 0) return null;
  x0 = Math.max(0, x0 - margin);
  y0 = Math.max(0, y0 - margin);
  x1 = Math.min(w - 1, x1 + margin);
  y1 = Math.min(h - 1, y1 + margin);
  return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

/** Standard deviation of a grey crop: near 0 for blank paper (nothing to match). */
export function grayStd(data: ArrayLike<number>): number {
  let s = 0;
  let s2 = 0;
  const n = data.length || 1;
  for (let i = 0; i < data.length; i++) {
    s += data[i];
    s2 += data[i] * data[i];
  }
  const m = s / n;
  return Math.sqrt(Math.max(0, s2 / n - m * m));
}

/** A peak of one orientation's score map (top-left of the match, work px) → a candidate centred in sheet px. */
export function peakToCandidate(p: { x: number; y: number; score: number }, tpl: { w: number; h: number }, scale: number, orientation: Orientation): Candidate {
  return {
    cx: (p.x + tpl.w / 2) / scale,
    cy: (p.y + tpl.h / 2) / scale,
    w: tpl.w / scale,
    h: tpl.h / scale,
    score: Math.min(1, p.score),
    orientation,
  };
}

/**
 * Drop suggestions that sit on a device of the same type already on the sheet (within `radiusPx` sheet px of it), so
 * running Find similar again, or after placing some by hand, doesn't suggest them twice. Positions are 0–1.
 */
export function withoutExisting<T extends { x: number; y: number }>(
  items: T[],
  markers: { x: number; y: number; deviceTypeId: string; sheetId: string; deleted?: boolean }[],
  opts: { sheetId: string; deviceTypeId: string; width: number; height: number; radiusPx: number },
): T[] {
  const mine = markers.filter((m) => !m.deleted && m.sheetId === opts.sheetId && m.deviceTypeId === opts.deviceTypeId);
  if (!mine.length) return items;
  const r2 = opts.radiusPx * opts.radiusPx;
  return items.filter((it) => !mine.some((m) => ((m.x - it.x) * opts.width) ** 2 + ((m.y - it.y) * opts.height) ** 2 < r2));
}
