// Plan markups: pure geometry, visibility and permission rules shared by the plan overlay, the PDF export and tests.
// Positions are relative (0–1) to the sheet; widths and text sizes are fractions of the sheet width. See
// docs/plan-markups.md. Nothing here is counted: markups never reach computeTakeoff.
import { msg } from "./i18n/msg";
import type { MarkupKind, PlanMarkup } from "./types";
import type { TeamRole } from "./teamLogic";

/** Purple: private markups (only their author sees them). */
export const PRIVATE_COLOR = "#7c3aed";
export const MARKUP_COLORS: { color: string; name: string }[] = [
  { color: "#dc2626", name: "Red" },
  { color: "#ea580c", name: "Orange" },
  { color: "#ca8a04", name: "Yellow" },
  { color: "#16a34a", name: "Green" },
  { color: "#2563eb", name: "Blue" },
  { color: "#0f172a", name: "Black" },
];
export const DEFAULT_LAYERS = ["Redlines", "As-built", "Notes"];
/** Stroke widths (fraction of the sheet width) and the matching text sizes. */
export const STROKE_SIZES = {
  S: { width: 0.0012, fontSize: 0.009 },
  M: { width: 0.0024, fontSize: 0.013 },
  L: { width: 0.0048, fontSize: 0.02 },
} as const;
export type StrokeSize = keyof typeof STROKE_SIZES;
/** The highlighter is wide and see-through. */
export const HIGHLIGHT_FACTOR = 6;
export const HIGHLIGHT_OPACITY = 0.35;

export const KIND_NAMES: Record<MarkupKind, string> = {
  pen: msg("Pen"),
  highlight: msg("Highlighter"),
  line: msg("Line"),
  arrow: msg("Arrow"),
  cloud: msg("Cloud"),
  rect: msg("Rectangle"),
  ellipse: msg("Ellipse"),
  text: msg("Text"),
};

/** Kinds drawn by dragging from one corner / end to the other (two points). */
export const TWO_POINT_KINDS: MarkupKind[] = ["line", "arrow", "cloud", "rect", "ellipse"];
export const BOX_KINDS: MarkupKind[] = ["cloud", "rect", "ellipse"];

export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

// ---------- shapes ----------

/**
 * Revision-cloud outline for the box (x0,y0)–(x1,y1): scallops of about `arcSize` along each side, bulging outwards
 * from a box inset by the bulge height, so the whole outline stays inside the box. Returns a closed polyline
 * [x, y, …] whose last point repeats the first.
 */
export function cloudPath(x0: number, y0: number, x1: number, y1: number, arcSize: number): number[] {
  const lx = Math.min(x0, x1);
  const hx = Math.max(x0, x1);
  const ly = Math.min(y0, y1);
  const hy = Math.max(y0, y1);
  const w = hx - lx;
  const h = hy - ly;
  if (w <= 0 || h <= 0) return [lx, ly, hx, ly, hx, hy, lx, hy, lx, ly];
  // Bulge height: a third of a scallop, but never more than a quarter of the short side.
  const size = Math.max(arcSize, 1e-9);
  const bulge = Math.min(size / 3, Math.min(w, h) / 4);
  const ix0 = lx + bulge;
  const iy0 = ly + bulge;
  const ix1 = hx - bulge;
  const iy1 = hy - bulge;
  // Clockwise (screen coordinates): top, right, bottom, left, each with its outward normal.
  const sides: [number, number, number, number, number, number][] = [
    [ix0, iy0, ix1, iy0, 0, -1],
    [ix1, iy0, ix1, iy1, 1, 0],
    [ix1, iy1, ix0, iy1, 0, 1],
    [ix0, iy1, ix0, iy0, -1, 0],
  ];
  const STEPS = 8;
  const out: number[] = [];
  for (const [ax, ay, bx, by, nx, ny] of sides) {
    const len = Math.hypot(bx - ax, by - ay);
    const n = Math.max(1, Math.round(len / size));
    for (let s = 0; s < n; s++) {
      for (let k = 0; k < STEPS; k++) {
        const t = k / STEPS;
        const u = (s + t) / n;
        const b = Math.sin(Math.PI * t) * bulge;
        out.push(ax + (bx - ax) * u + nx * b, ay + (by - ay) * u + ny * b);
      }
    }
  }
  out.push(out[0], out[1]);
  return out;
}

/** Arrow head at the last point of `points`: [leftX, leftY, tipX, tipY, rightX, rightY]. Empty if there's no direction. */
export function arrowHead(points: number[], size: number): number[] {
  const n = points.length;
  if (n < 4) return [];
  const tx = points[n - 2];
  const ty = points[n - 1];
  // The last point that isn't on top of the tip gives the direction.
  for (let i = n - 4; i >= 0; i -= 2) {
    const dx = tx - points[i];
    const dy = ty - points[i + 1];
    const d = Math.hypot(dx, dy);
    if (d < 1e-12) continue;
    const ux = dx / d;
    const uy = dy / d;
    const bx = tx - ux * size;
    const by = ty - uy * size;
    const half = size * 0.5;
    return [bx - uy * half, by + ux * half, tx, ty, bx + uy * half, by - ux * half];
  }
  return [];
}

function segDist(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2)) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** Ramer–Douglas–Peucker on a flat [x, y, …] polyline. Keeps both ends. */
export function simplifyStroke(points: number[], tolerance: number): number[] {
  const n = points.length / 2;
  if (n <= 2) return points.slice();
  const keep = new Uint8Array(n);
  keep[0] = keep[n - 1] = 1;
  const stack: [number, number][] = [[0, n - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    let best = -1;
    let bestD = tolerance;
    for (let i = a + 1; i < b; i++) {
      const d = segDist(points[i * 2], points[i * 2 + 1], points[a * 2], points[a * 2 + 1], points[b * 2], points[b * 2 + 1]);
      if (d > bestD) {
        bestD = d;
        best = i;
      }
    }
    if (best >= 0) {
      keep[best] = 1;
      stack.push([a, best], [best, b]);
    }
  }
  const out: number[] = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push(points[i * 2], points[i * 2 + 1]);
  return out;
}

// ---------- text ----------

/** Lines of a text markup (never empty). */
export function textLines(m: Pick<PlanMarkup, "text">): string[] {
  const lines = (m.text ?? "").split("\n");
  return lines.length ? lines : [""];
}
/** Font size in sheet pixels. */
export function fontPx(m: Pick<PlanMarkup, "fontSize">, sheetW: number): number {
  return (m.fontSize || STROKE_SIZES.M.fontSize) * sheetW;
}
/** Padding around a text box, in font sizes. */
export const TEXT_PAD = 0.35;
/** Rough size of a text box in sheet pixels (average bold glyph ≈ 0.6 em; lines 1.25 em), padding included. */
export function textBoxPx(m: Pick<PlanMarkup, "text" | "fontSize">, sheetW: number): { w: number; h: number } {
  const fs = fontPx(m, sheetW);
  const lines = textLines(m);
  const longest = Math.max(1, ...lines.map((l) => l.length));
  return { w: longest * fs * 0.6 + 2 * TEXT_PAD * fs, h: lines.length * fs * 1.25 + 2 * TEXT_PAD * fs };
}

// ---------- geometry ----------

/** Bounding box in relative coordinates. Text needs the sheet size to know how big it is. */
export function bbox(m: Pick<PlanMarkup, "kind" | "points" | "text" | "fontSize">, sheetW = 1, sheetH = 1): Box {
  const p = m.points;
  if (!p.length) return { x0: 0, y0: 0, x1: 0, y1: 0 };
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (let i = 0; i + 1 < p.length; i += 2) {
    x0 = Math.min(x0, p[i]);
    x1 = Math.max(x1, p[i]);
    y0 = Math.min(y0, p[i + 1]);
    y1 = Math.max(y1, p[i + 1]);
  }
  if (m.kind === "text") {
    const { w, h } = textBoxPx(m, sheetW);
    x1 = x0 + w / sheetW;
    y1 = y0 + h / sheetH;
  }
  return { x0, y0, x1, y1 };
}

/**
 * Does a tap at (x, y) (relative) touch this markup? `tolerancePx` is in sheet pixels (finger size ÷ zoom).
 * Strokes and outlines are hit near the line; text anywhere in its box; small boxes anywhere inside.
 */
export function hitTest(m: PlanMarkup, x: number, y: number, tolerancePx: number, sheetW: number, sheetH: number): boolean {
  const px = x * sheetW;
  const py = y * sheetH;
  const P = m.points.map((v, i) => (i % 2 ? v * sheetH : v * sheetW));
  const half = ((m.width || 0) * sheetW * (m.kind === "highlight" ? HIGHLIGHT_FACTOR : 1)) / 2;
  const tol = tolerancePx + half;
  if (m.kind === "text") {
    const b = bbox(m, sheetW, sheetH);
    return px >= b.x0 * sheetW - tolerancePx && px <= b.x1 * sheetW + tolerancePx && py >= b.y0 * sheetH - tolerancePx && py <= b.y1 * sheetH + tolerancePx;
  }
  if (P.length < 2) return false;
  if (m.kind === "pen" || m.kind === "highlight" || m.kind === "line" || m.kind === "arrow") {
    if (P.length < 4) return Math.hypot(px - P[0], py - P[1]) <= tol;
    for (let i = 0; i + 3 < P.length; i += 2) if (segDist(px, py, P[i], P[i + 1], P[i + 2], P[i + 3]) <= tol) return true;
    return false;
  }
  // Boxes: rect, ellipse, cloud.
  if (P.length < 4) return false;
  const lx = Math.min(P[0], P[2]);
  const hx = Math.max(P[0], P[2]);
  const ly = Math.min(P[1], P[3]);
  const hy = Math.max(P[1], P[3]);
  const small = hx - lx < tolerancePx * 4 || hy - ly < tolerancePx * 4;
  const inside = px >= lx && px <= hx && py >= ly && py <= hy;
  if (small && inside) return true;
  if (m.kind === "ellipse") {
    const a = (hx - lx) / 2;
    const b = (hy - ly) / 2;
    if (a <= 0 || b <= 0) return false;
    const cx = lx + a;
    const cy = ly + b;
    const r = Math.hypot((px - cx) / a, (py - cy) / b);
    return Math.abs(r - 1) * Math.min(a, b) <= tol;
  }
  // rect / cloud: near any side (the cloud's scallops sit within the box).
  return (
    segDist(px, py, lx, ly, hx, ly) <= tol ||
    segDist(px, py, hx, ly, hx, hy) <= tol ||
    segDist(px, py, hx, hy, lx, hy) <= tol ||
    segDist(px, py, lx, hy, lx, ly) <= tol
  );
}

/** Move a markup by (dx, dy) (relative), kept on the sheet. */
export function translate<T extends Pick<PlanMarkup, "kind" | "points" | "text" | "fontSize">>(m: T, dx: number, dy: number): T {
  const b = bbox({ ...m, kind: m.kind === "text" ? "pen" : m.kind });
  const cdx = Math.max(-b.x0, Math.min(1 - b.x1, dx));
  const cdy = Math.max(-b.y0, Math.min(1 - b.y1, dy));
  return { ...m, points: m.points.map((v, i) => (i % 2 ? v + cdy : v + cdx)) };
}

/**
 * Drag a handle to (x, y). Boxes (rect / ellipse / cloud): handle 0–3 = corners clockwise from the top-left, and the
 * opposite corner stays put. Lines and arrows: handle i = point i. Other kinds don't resize.
 */
export function resize<T extends Pick<PlanMarkup, "kind" | "points">>(m: T, handle: number, x: number, y: number): T {
  const cx = Math.max(0, Math.min(1, x));
  const cy = Math.max(0, Math.min(1, y));
  if (BOX_KINDS.includes(m.kind) && m.points.length >= 4) {
    const [ax, ay, bx, by] = m.points;
    const lx = Math.min(ax, bx);
    const hx = Math.max(ax, bx);
    const ly = Math.min(ay, by);
    const hy = Math.max(ay, by);
    // The opposite corner of each handle.
    const opp: [number, number][] = [
      [hx, hy],
      [lx, hy],
      [lx, ly],
      [hx, ly],
    ];
    const [ox, oy] = opp[((handle % 4) + 4) % 4];
    return { ...m, points: [Math.min(ox, cx), Math.min(oy, cy), Math.max(ox, cx), Math.max(oy, cy)] };
  }
  if ((m.kind === "line" || m.kind === "arrow") && handle * 2 + 1 < m.points.length) {
    const points = m.points.slice();
    points[handle * 2] = cx;
    points[handle * 2 + 1] = cy;
    return { ...m, points };
  }
  return m;
}

/** Handles shown on a selected markup (relative), in the order `resize` numbers them. */
export function handlesOf(m: Pick<PlanMarkup, "kind" | "points">): [number, number][] {
  if (BOX_KINDS.includes(m.kind) && m.points.length >= 4) {
    const [ax, ay, bx, by] = m.points;
    const lx = Math.min(ax, bx);
    const hx = Math.max(ax, bx);
    const ly = Math.min(ay, by);
    const hy = Math.max(ay, by);
    return [
      [lx, ly],
      [hx, ly],
      [hx, hy],
      [lx, hy],
    ];
  }
  if ((m.kind === "line" || m.kind === "arrow") && m.points.length >= 4) {
    const out: [number, number][] = [];
    for (let i = 0; i + 1 < m.points.length; i += 2) out.push([m.points[i], m.points[i + 1]]);
    return out;
  }
  return [];
}

/** Rotate relative points 90° clockwise with their sheet: (x, y) → (1 − y, x). */
export function rotateMarkupPointsCW(points: number[]): number[] {
  const out: number[] = [];
  for (let i = 0; i + 1 < points.length; i += 2) out.push(1 - points[i + 1], points[i]);
  return out;
}

/**
 * The markup after its sheet turned 90° clockwise. `widthRatio` = old sheet width ÷ new sheet width, so strokes and
 * text keep their size on paper. A text box's anchor is its top-left corner, which after the turn is the top-right.
 */
export function rotateMarkupCW(m: PlanMarkup, widthRatio = 1, newSheetW = 1): PlanMarkup {
  let points = rotateMarkupPointsCW(m.points);
  const width = m.width * widthRatio;
  const fontSize = m.fontSize != null ? m.fontSize * widthRatio : m.fontSize;
  if (m.kind === "text" && points.length >= 2) {
    // Text stays upright: put the box's left edge back where its corner landed.
    const { w } = textBoxPx({ text: m.text, fontSize }, newSheetW);
    points = [Math.max(0, points[0] - w / newSheetW), points[1]];
  }
  return { ...m, points, width, fontSize };
}

// ---------- visibility & permissions ----------

export interface VisibilityFilter {
  /** The signed-in user (null: signed out / local only). */
  userId: string | null;
  hiddenLayers?: string[];
  /** Only these colours (null / empty: all). */
  colorFilter?: string[] | null;
}

/** Private markups are seen by their author only (unowned ones were drawn on this device while signed out). */
export function canSeeMarkup(m: Pick<PlanMarkup, "private" | "authorId">, userId: string | null): boolean {
  return !m.private || !m.authorId || m.authorId === userId;
}

/** Live markups to show: not deleted, private only to their author, hidden layers and colour filter applied. */
export function visibleMarkups<T extends PlanMarkup>(markups: T[], f: VisibilityFilter): T[] {
  const hidden = new Set(f.hiddenLayers ?? []);
  const colors = f.colorFilter?.length ? new Set(f.colorFilter.map((c) => c.toLowerCase())) : null;
  return markups.filter((m) => !m.deleted && canSeeMarkup(m, f.userId) && !hidden.has(m.layer || DEFAULT_LAYERS[0]) && (!colors || colors.has((m.color || "").toLowerCase())));
}

/** Everyone draws; the author or the office (owner / admin, or working alone) edits and deletes. Private: author only. */
export function canEditMarkup(role: TeamRole | null | undefined, m: Pick<PlanMarkup, "private" | "authorId">, userId: string | null): boolean {
  const mine = !m.authorId || m.authorId === userId;
  if (mine) return true;
  if (m.private) return false;
  return role !== "tech";
}

/** Layers to offer: the defaults, then any used on the job or added by the user, in first-seen order. */
export function layerNames(markups: Pick<PlanMarkup, "layer" | "deleted">[], extra: string[] = []): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const l of [...DEFAULT_LAYERS, ...markups.filter((m) => !m.deleted).map((m) => m.layer), ...extra]) {
    const name = (l ?? "").trim();
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    out.push(name);
  }
  return out;
}

/** Markups for the PDF: this sheet's live, non-private ones (private markups are never exported). */
export function exportableMarkups(markups: PlanMarkup[], sheetId: string, hiddenLayers: string[] = []): PlanMarkup[] {
  return markups.filter((m) => m.sheetId === sheetId && !m.deleted && !m.private && !hiddenLayers.includes(m.layer));
}

// ---------- drawing (PDF / canvas export; the plan overlay draws the same shapes with Konva) ----------

/** Pixel points of a markup for a sheet drawn w × h. */
export function toPx(points: number[], w: number, h: number): number[] {
  return points.map((v, i) => (i % 2 ? v * h : v * w));
}

/** Scallop size for clouds (sheet pixels). */
export function cloudArc(w: number, h: number): number {
  return Math.max(w, h) * 0.014;
}

/** Draw markups onto a 2D canvas that shows the whole sheet at w × h pixels. */
export function drawMarkupsOnCanvas(ctx: CanvasRenderingContext2D, markups: PlanMarkup[], w: number, h: number): void {
  for (const m of markups) {
    if (m.deleted) continue;
    const P = toPx(m.points, w, h);
    if (P.length < 2) continue;
    const lw = Math.max(1, (m.width || STROKE_SIZES.M.width) * w);
    ctx.save();
    ctx.strokeStyle = m.color;
    ctx.fillStyle = m.color;
    ctx.lineWidth = lw;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    const poly = (pts: number[], close = false) => {
      ctx.beginPath();
      ctx.moveTo(pts[0], pts[1]);
      for (let i = 2; i + 1 < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
      if (close) ctx.closePath();
    };
    switch (m.kind) {
      case "highlight":
        ctx.globalAlpha = HIGHLIGHT_OPACITY;
        ctx.lineWidth = lw * HIGHLIGHT_FACTOR;
        poly(P);
        ctx.stroke();
        break;
      case "pen":
      case "line":
        poly(P);
        ctx.stroke();
        break;
      case "arrow": {
        poly(P);
        ctx.stroke();
        const head = arrowHead(P, Math.max(lw * 5, w * 0.008));
        if (head.length) {
          poly(head, true);
          ctx.fill();
        }
        break;
      }
      case "rect":
        if (P.length >= 4) ctx.strokeRect(Math.min(P[0], P[2]), Math.min(P[1], P[3]), Math.abs(P[2] - P[0]), Math.abs(P[3] - P[1]));
        break;
      case "ellipse":
        if (P.length >= 4) {
          ctx.beginPath();
          ctx.ellipse((P[0] + P[2]) / 2, (P[1] + P[3]) / 2, Math.abs(P[2] - P[0]) / 2, Math.abs(P[3] - P[1]) / 2, 0, 0, Math.PI * 2);
          ctx.stroke();
        }
        break;
      case "cloud":
        if (P.length >= 4) {
          poly(cloudPath(P[0], P[1], P[2], P[3], cloudArc(w, h)), true);
          ctx.stroke();
        }
        break;
      case "text": {
        const fs = fontPx(m, w);
        const box = textBoxPx(m, w);
        ctx.globalAlpha = 0.9;
        ctx.fillStyle = "#fff";
        ctx.fillRect(P[0], P[1], box.w, box.h);
        ctx.globalAlpha = 1;
        ctx.lineWidth = Math.max(1, fs * 0.08);
        ctx.strokeRect(P[0], P[1], box.w, box.h);
        ctx.fillStyle = m.color;
        ctx.font = `bold ${fs}px sans-serif`;
        ctx.textBaseline = "top";
        textLines(m).forEach((line, i) => ctx.fillText(line, P[0] + TEXT_PAD * fs, P[1] + TEXT_PAD * fs + i * fs * 1.25 + fs * 0.1));
        break;
      }
    }
    ctx.restore();
  }
}

/**
 * Before pushing markups: claim the ones drawn on this device while signed out (so a private one stays visible to its
 * author on their other devices), and leave out rows the database would refuse (another person's markup edited by a
 * technician, e.g. when a tech turns a sheet; someone else's private one) so one refused row can't stall every sync.
 */
export function markupsToPush<T extends PlanMarkup>(rows: T[], role: TeamRole | null | undefined, userId: string | null): { send: T[]; claimed: T[] } {
  const send: T[] = [];
  const claimed: T[] = [];
  for (const r of rows) {
    const m = !r.authorId && userId ? { ...r, authorId: userId } : r;
    if (m !== r) claimed.push(m);
    if (canEditMarkup(role, m, userId)) send.push(m);
  }
  return { send, claimed };
}
