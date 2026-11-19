// Plan viewer geometry: pure functions (no DOM) for the pan/zoom transform, sheet ↔ screen conversion, zoom limits,
// fitting, the image pyramid (levels, tiles) and constant-size marker scaling. Shared by the canvas, its chrome
// (minimap, zoom controls) and plan overlays from other features. Tested in tests/viewport.test.ts.
//
// Spaces:
// - "rel"    sheet-relative 0–1 (what markers, runs and closets store: x, y, points)
// - "sheet"  sheet image pixels (rel × sheet.width/height) — the Konva stage's own coordinates
// - "screen" CSS pixels inside the canvas element (0,0 = top-left of the plan view)
// The transform maps sheet px → screen px: screen = sheet × scale + (x, y).

export interface ViewTransform {
  /** Screen px per sheet px. */
  scale: number;
  x: number;
  y: number;
}
export interface ViewSize {
  w: number;
  h: number;
}
export interface SheetDims {
  width: number;
  height: number;
}
export interface Point {
  x: number;
  y: number;
}

export const IDENTITY: ViewTransform = { scale: 1, x: 0, y: 0 };

// ---------------- conversions ----------------

export function sheetPxToScreen(t: ViewTransform, p: Point): Point {
  return { x: p.x * t.scale + t.x, y: p.y * t.scale + t.y };
}
export function screenToSheetPx(t: ViewTransform, p: Point): Point {
  return { x: (p.x - t.x) / t.scale, y: (p.y - t.y) / t.scale };
}
export function relToScreen(t: ViewTransform, sheet: SheetDims, p: Point): Point {
  return { x: p.x * sheet.width * t.scale + t.x, y: p.y * sheet.height * t.scale + t.y };
}
export function screenToRel(t: ViewTransform, sheet: SheetDims, p: Point): Point {
  return { x: (p.x - t.x) / t.scale / sheet.width, y: (p.y - t.y) / t.scale / sheet.height };
}
/** The part of the sheet (in sheet px) the view shows. May extend past the sheet. */
export function visibleSheetRect(t: ViewTransform, size: ViewSize): { x: number; y: number; w: number; h: number } {
  return { x: -t.x / t.scale, y: -t.y / t.scale, w: size.w / t.scale, h: size.h / t.scale };
}

// ---------------- fitting & limits ----------------

export type FitMode = "sheet" | "width";

/** Fit the whole sheet (or its width, top aligned) in the view, with a margin in screen px. */
export function fitTransform(size: ViewSize, sheet: SheetDims, mode: FitMode = "sheet", margin = 16): ViewTransform {
  const aw = Math.max(1, size.w - margin * 2);
  const ah = Math.max(1, size.h - margin * 2);
  if (mode === "width") {
    const scale = aw / sheet.width;
    const h = sheet.height * scale;
    // A sheet that fits vertically anyway is centred; a tall one starts at the top.
    return { scale, x: (size.w - sheet.width * scale) / 2, y: h <= ah ? (size.h - h) / 2 : margin };
  }
  const scale = Math.min(aw / sheet.width, ah / sheet.height);
  return { scale, x: (size.w - sheet.width * scale) / 2, y: (size.h - sheet.height * scale) / 2 };
}

export interface ZoomLimits {
  min: number;
  max: number;
  fit: number;
}

/** Zoom out to half the fitted size; zoom in until one sheet pixel is 4 screen px (or 8× fit for small photos). */
export function zoomLimits(size: ViewSize, sheet: SheetDims): ZoomLimits {
  const fit = fitTransform(size, sheet).scale;
  return { fit, min: Math.min(fit * 0.5, 1), max: Math.max(4, fit * 8) };
}

export function clampScale(scale: number, limits: Pick<ZoomLimits, "min" | "max">): number {
  return Math.max(limits.min, Math.min(limits.max, scale));
}

/**
 * Keep some of the sheet on screen: no sheet edge may pass the middle of the view (so a sheet smaller than the view
 * can still float anywhere around the centre, and a zoomed-in one can be panned until its edge reaches the middle).
 */
export function clampTransform(t: ViewTransform, size: ViewSize, sheet: SheetDims): ViewTransform {
  const sw = sheet.width * t.scale;
  const sh = sheet.height * t.scale;
  const x = Math.max(size.w / 2 - sw, Math.min(size.w / 2, t.x));
  const y = Math.max(size.h / 2 - sh, Math.min(size.h / 2, t.y));
  return x === t.x && y === t.y ? t : { scale: t.scale, x, y };
}

/** Zoom by `factor` keeping the sheet point under `p` (screen px) fixed. Scale is clamped to the limits if given. */
export function zoomAbout(t: ViewTransform, p: Point, factor: number, limits?: Pick<ZoomLimits, "min" | "max">): ViewTransform {
  const scale = limits ? clampScale(t.scale * factor, limits) : t.scale * factor;
  const k = scale / t.scale;
  return { scale, x: p.x - (p.x - t.x) * k, y: p.y - (p.y - t.y) * k };
}

/** Set an absolute scale, keeping the sheet point under `p` fixed (the view centre by default). */
export function zoomTo(t: ViewTransform, scale: number, p: Point): ViewTransform {
  return zoomAbout(t, p, scale / t.scale);
}

/** Centre a sheet point (sheet px) at a given scale. */
export function centerOn(size: ViewSize, p: Point, scale: number): ViewTransform {
  return { scale, x: size.w / 2 - p.x * scale, y: size.h / 2 - p.y * scale };
}

/**
 * Two-finger gesture: the sheet point under the previous centre follows the fingers' new centre, scaled by how far
 * apart they moved. Handles pinch and two-finger pan in one step.
 */
export function pinchTransform(t: ViewTransform, prev: { center: Point; dist: number }, next: { center: Point; dist: number }, limits?: Pick<ZoomLimits, "min" | "max">): ViewTransform {
  const factor = prev.dist > 0 ? next.dist / prev.dist : 1;
  const scale = limits ? clampScale(t.scale * factor, limits) : t.scale * factor;
  const sx = (prev.center.x - t.x) / t.scale;
  const sy = (prev.center.y - t.y) / t.scale;
  return { scale, x: next.center.x - sx * scale, y: next.center.y - sy * scale };
}

/**
 * Interpolate two transforms for an animation (k = 0…1). Scale moves geometrically and the sheet point at the view
 * centre moves in a straight line, so a zoom feels even and the focus point doesn't swing.
 */
export function lerpTransform(a: ViewTransform, b: ViewTransform, k: number, size: ViewSize): ViewTransform {
  if (k <= 0) return a;
  if (k >= 1) return b;
  const scale = a.scale * Math.pow(b.scale / a.scale, k);
  const ca = screenToSheetPx(a, { x: size.w / 2, y: size.h / 2 });
  const cb = screenToSheetPx(b, { x: size.w / 2, y: size.h / 2 });
  return centerOn(size, { x: ca.x + (cb.x - ca.x) * k, y: ca.y + (cb.y - ca.y) * k }, scale);
}

export const easeOutCubic = (k: number) => 1 - Math.pow(1 - k, 3);

/** Friction for fling momentum: velocity (px/ms) after `dt` ms. */
export function decayVelocity(v: Point, dt: number, timeConstant = 325): Point {
  const f = Math.exp(-dt / timeConstant);
  return { x: v.x * f, y: v.y * f };
}

/** Pointer velocity (px/ms) from recent samples, using only the last `window` ms. */
export function releaseVelocity(samples: { x: number; y: number; t: number }[], window = 100): Point {
  if (samples.length < 2) return { x: 0, y: 0 };
  const last = samples[samples.length - 1];
  let first = last;
  for (let i = samples.length - 2; i >= 0; i--) {
    if (last.t - samples[i].t > window) break;
    first = samples[i];
  }
  const dt = last.t - first.t;
  if (dt <= 0) return { x: 0, y: 0 };
  return { x: (last.x - first.x) / dt, y: (last.y - first.y) / dt };
}

// ---------------- per-sheet memory ----------------

/** Resolution-independent view memory: zoom relative to "fit sheet" and the sheet point (0–1) at the view centre. */
export interface ViewMemory {
  zoom: number;
  cx: number;
  cy: number;
}

export function toMemory(t: ViewTransform, size: ViewSize, sheet: SheetDims): ViewMemory {
  const fit = fitTransform(size, sheet).scale;
  const c = screenToRel(t, sheet, { x: size.w / 2, y: size.h / 2 });
  return { zoom: t.scale / fit, cx: c.x, cy: c.y };
}

export function fromMemory(m: ViewMemory, size: ViewSize, sheet: SheetDims): ViewTransform {
  const lim = zoomLimits(size, sheet);
  const scale = clampScale(m.zoom * lim.fit, lim);
  return clampTransform(centerOn(size, { x: m.cx * sheet.width, y: m.cy * sheet.height }, scale), size, sheet);
}

// ---------------- marker scaling ----------------

/**
 * On-screen size factor for markers, closets and labels. They keep a constant screen size, a little smaller when the
 * whole sheet is in view (so a busy floor doesn't turn into a carpet of badges) and a little larger when zoomed far in.
 */
export function markerSizeFactor(scale: number, fitScale: number): number {
  if (!(fitScale > 0)) return 1;
  const z = Math.log2(scale / fitScale); // 0 at fit, 1 at 2× fit…
  return Math.max(0.72, Math.min(1.15, 0.86 + z * 0.14));
}

// ---------------- image pyramid ----------------

export const TILE_SIZE = 512;
/** Longest side of the always-loaded low-res preview of a sheet. */
export const PREVIEW_MAX = 2048;
/** Longest side of a sheet thumbnail (sheet browser, minimap). */
export const THUMB_MAX = 320;

export interface PyramidLevel {
  level: number;
  /** Level pixels per sheet-image pixel (1, ½, ¼…). */
  scale: number;
  width: number;
  height: number;
  cols: number;
  rows: number;
}

export interface PyramidInfo {
  width: number;
  height: number;
  tileSize: number;
  /** Preview pixels per image pixel (1 when the image is small enough to be its own preview). */
  previewScale: number;
  previewWidth: number;
  previewHeight: number;
  /** Tiled levels, finest first; empty when the preview already holds the full resolution. */
  levels: PyramidLevel[];
}

/** Levels finer than the preview, each half the previous, cut into tiles. */
export function pyramidInfo(width: number, height: number, tileSize = TILE_SIZE, previewMax = PREVIEW_MAX): PyramidInfo {
  const side = Math.max(width, height);
  const previewScale = Math.min(1, previewMax / side);
  const levels: PyramidLevel[] = [];
  for (let level = 0; ; level++) {
    const scale = Math.pow(2, -level);
    if (scale <= previewScale) break;
    const w = Math.max(1, Math.round(width * scale));
    const h = Math.max(1, Math.round(height * scale));
    levels.push({ level, scale, width: w, height: h, cols: Math.ceil(w / tileSize), rows: Math.ceil(h / tileSize) });
  }
  return {
    width,
    height,
    tileSize,
    previewScale,
    previewWidth: Math.max(1, Math.round(width * previewScale)),
    previewHeight: Math.max(1, Math.round(height * previewScale)),
    levels,
  };
}

/**
 * Which tiled level to draw at a view scale: the coarsest level that still has at least one image pixel per device
 * pixel (with a little slack). -1 means the preview is sharp enough and no tiles are needed.
 */
export function chooseLevel(info: PyramidInfo, viewScale: number, dpr = 1, slack = 1.1): number {
  const need = (viewScale * dpr) / slack;
  if (info.previewScale >= need || !info.levels.length) return -1;
  let best = 0;
  for (const l of info.levels) if (l.scale >= need) best = l.level;
  return best;
}

export interface TileRef {
  level: number;
  col: number;
  row: number;
  /** Where the tile goes, in sheet-image px. */
  x: number;
  y: number;
  w: number;
  h: number;
}

export const tileKey = (imageId: string, level: number, col: number, row: number) => `${imageId}/${level}/${col}/${row}`;

/** Tiles of `level` that intersect the view (plus `pad` screen px around it, so a pan finds them loaded). */
export function visibleTiles(info: PyramidInfo, level: number, t: ViewTransform, size: ViewSize, pad = 0): TileRef[] {
  const L = info.levels[level];
  if (!L) return [];
  const r = visibleSheetRect(t, { w: size.w + pad * 2, h: size.h + pad * 2 });
  const rx = r.x - pad / t.scale;
  const ry = r.y - pad / t.scale;
  const tsImg = info.tileSize / L.scale; // tile edge in image px
  const c0 = Math.max(0, Math.floor(rx / tsImg));
  const r0 = Math.max(0, Math.floor(ry / tsImg));
  const c1 = Math.min(L.cols - 1, Math.floor((rx + r.w) / tsImg));
  const r1 = Math.min(L.rows - 1, Math.floor((ry + r.h) / tsImg));
  const out: TileRef[] = [];
  // Centre-out order, so the middle of the screen sharpens first.
  const cc = (c0 + c1) / 2;
  const rc = (r0 + r1) / 2;
  for (let row = r0; row <= r1; row++)
    for (let col = c0; col <= c1; col++) {
      const x = col * tsImg;
      const y = row * tsImg;
      out.push({ level, col, row, x, y, w: Math.min(tsImg, info.width - x), h: Math.min(tsImg, info.height - y) });
    }
  return out.sort((a, b) => Math.hypot(a.col - cc, a.row - rc) - Math.hypot(b.col - cc, b.row - rc));
}

/** The level-pixel rectangle a tile is cut from. */
export function tileSourceRect(info: PyramidInfo, level: number, col: number, row: number): { x: number; y: number; w: number; h: number } {
  const L = info.levels[level];
  const x = col * info.tileSize;
  const y = row * info.tileSize;
  return { x, y, w: Math.min(info.tileSize, L.width - x), h: Math.min(info.tileSize, L.height - y) };
}

/** The coarser tile covering a tile (for a blurry stand-in while the sharp one loads), or null at the top. */
export function parentTile(info: PyramidInfo, ref: Pick<TileRef, "level" | "col" | "row">): { level: number; col: number; row: number } | null {
  const level = ref.level + 1;
  if (!info.levels[level]) return null;
  return { level, col: Math.floor(ref.col / 2), row: Math.floor(ref.row / 2) };
}
