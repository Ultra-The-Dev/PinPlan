// Sheet revisions: a re-issued drawing replaces a sheet's image while the Sheet row stays, so every device, run,
// closet, photo and task pinned to it carries over by sheetId. Pure (no browser or database): history, scale rules,
// 2-point alignment transforms and page→sheet matching. See docs/sheet-revisions.md for the data model.
import { nanoid } from "nanoid";
import { floorKey } from "./floorName";
import { guessFloorName } from "./importPlans";
import type { EstimateLine, RevisionTransform, Sheet, SheetRevision } from "./types";

export type Affine = RevisionTransform;
export type Pt = [number, number];
export interface Size {
  width: number;
  height: number;
}

export const IDENTITY: Affine = [1, 0, 0, 1, 0, 0];
/** Key of the current drawing in a sheet's revision chain. */
export const CURRENT = "current";

// ---------------- transforms (relative 0–1 coordinates) ----------------

export function applyTransform(T: Affine, x: number, y: number): Pt {
  return [T[0] * x + T[2] * y + T[4], T[1] * x + T[3] * y + T[5]];
}

/** Transform a flat [x0, y0, x1, y1, …] list (a run's points). */
export function transformPoints(T: Affine, pts: number[]): number[] {
  const out: number[] = [];
  for (let i = 0; i + 1 < pts.length; i += 2) out.push(...applyTransform(T, pts[i], pts[i + 1]));
  return out;
}

/** `then ∘ first`: apply `first`, then `then`. */
export function composeTransforms(first: Affine, then: Affine): Affine {
  const [a1, b1, c1, d1, e1, f1] = first;
  const [a2, b2, c2, d2, e2, f2] = then;
  return [a2 * a1 + c2 * b1, b2 * a1 + d2 * b1, a2 * c1 + c2 * d1, b2 * c1 + d2 * d1, a2 * e1 + c2 * f1 + e2, b2 * e1 + d2 * f1 + f2];
}

export function invertTransform(T: Affine): Affine | null {
  const [a, b, c, d, e, f] = T;
  const det = a * d - b * c;
  if (!Number.isFinite(det) || Math.abs(det) < 1e-12) return null;
  const ia = d / det;
  const ib = -b / det;
  const ic = -c / det;
  const id = a / det;
  return [ia, ib, ic, id, -(ia * e + ic * f), -(ib * e + id * f)];
}

export function isIdentity(T: Affine | null | undefined, eps = 1e-6): boolean {
  return !T || T.every((v, i) => Math.abs(v - IDENTITY[i]) < eps);
}

/**
 * The similarity (rotation + uniform scale + shift, in pixels) that takes two points on the old drawing onto the
 * matching points on the new one, as a transform of relative coordinates. Points are relative (0–1) to each image.
 * Null when the two points coincide.
 */
export function similarityFromPairs(pairs: [[Pt, Pt], [Pt, Pt]], oldSize: Size, newSize: Size): Affine | null {
  const [[oA, nA], [oB, nB]] = pairs;
  const px = (p: Pt, s: Size): Pt => [p[0] * s.width, p[1] * s.height];
  const [ox1, oy1] = px(oA, oldSize);
  const [ox2, oy2] = px(oB, oldSize);
  const [nx1, ny1] = px(nA, newSize);
  const [nx2, ny2] = px(nB, newSize);
  const vx = ox2 - ox1;
  const vy = oy2 - oy1;
  const wx = nx2 - nx1;
  const wy = ny2 - ny1;
  const len2 = vx * vx + vy * vy;
  if (len2 < 1e-9 || wx * wx + wy * wy < 1e-9) return null;
  // w = (p + q·i)·v as complex numbers: p = s·cosθ, q = s·sinθ.
  const p = (wx * vx + wy * vy) / len2;
  const q = (wy * vx - wx * vy) / len2;
  const tx = nx1 - (p * ox1 - q * oy1);
  const ty = ny1 - (q * ox1 + p * oy1);
  const W0 = oldSize.width;
  const H0 = oldSize.height;
  const W1 = newSize.width;
  const H1 = newSize.height;
  return [(p * W0) / W1, (q * W0) / H1, (-q * H0) / W1, (p * H0) / H1, tx / W1, ty / H1];
}

/** The transform in pixels (for canvas drawing): image `from` (its own pixels) → image `to` pixels. */
export function toPixelMatrix(T: Affine, from: Size, to: Size): Affine {
  const [a, b, c, d, e, f] = T;
  return [(a * to.width) / from.width, (b * to.height) / from.width, (c * to.width) / from.height, (d * to.height) / from.height, e * to.width, f * to.height];
}

/** Uniform scale of a transform in pixel terms (new px per old px). */
export function pixelScale(T: Affine, from: Size, to: Size): number {
  const [a, b] = toPixelMatrix(T, from, to);
  return Math.hypot(a, b);
}

// ---------------- carrying markup ----------------

export interface CarryFields {
  xy?: ["x", "y"];
  points?: "points";
}
export interface RevisionCarry {
  table: string;
  fields: CarryFields;
}

const carries = new Map<string, RevisionCarry>();

/** Tables whose rows are pinned to a sheet position. Other features (tasks, plan markups, sheet links) register theirs. */
export function registerRevisionCarry(table: string, fields: CarryFields): void {
  carries.set(table, { table, fields });
}
export function revisionCarries(): RevisionCarry[] {
  return [...carries.values()];
}
registerRevisionCarry("markers", { xy: ["x", "y"] });
registerRevisionCarry("runs", { points: "points" });
registerRevisionCarry("closets", { xy: ["x", "y"] });
registerRevisionCarry("photos", {}); // follow by sheetId; no position

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const off = (v: number) => v < -1e-9 || v > 1 + 1e-9;

/** Move one row's position(s) by T, clamped to the sheet. `clamped` is true when anything fell off the sheet. */
export function carryRow<R extends Record<string, unknown>>(row: R, fields: CarryFields, T: Affine): { row: R; changed: boolean; clamped: boolean } {
  let clamped = false;
  let changed = false;
  const next: Record<string, unknown> = { ...row };
  if (fields.xy && typeof row.x === "number" && typeof row.y === "number") {
    const [x, y] = applyTransform(T, row.x, row.y);
    if (off(x) || off(y)) clamped = true;
    next.x = clamp01(x);
    next.y = clamp01(y);
    changed = next.x !== row.x || next.y !== row.y;
  }
  if (fields.points && Array.isArray(row.points) && row.points.length) {
    const moved = transformPoints(T, row.points as number[]);
    if (moved.some(off)) clamped = true;
    const pts = moved.map(clamp01);
    changed = changed || pts.some((v, i) => v !== (row.points as number[])[i]);
    next.points = pts;
  }
  return { row: next as R, changed, clamped };
}

/** "3 devices fell off the new sheet" (null when nothing did). */
export function clampWarning(counts: { devices?: number; runs?: number; other?: number }): string | null {
  const parts: string[] = [];
  const n = (k: number, one: string, many: string) => (k ? parts.push(`${k} ${k === 1 ? one : many}`) : 0);
  n(counts.devices ?? 0, "device", "devices");
  n(counts.runs ?? 0, "run", "runs");
  n(counts.other ?? 0, "item", "items");
  if (!parts.length) return null;
  const total = (counts.devices ?? 0) + (counts.runs ?? 0) + (counts.other ?? 0);
  return `${parts.join(", ")} fell off the new sheet — ${total === 1 ? "it was" : "they were"} moved to the edge. Check ${total === 1 ? "it" : "them"}.`;
}

// ---------------- history ----------------

export interface NewRevisionImage {
  imageId: string;
  width: number;
  height: number;
  /** Known for PDF renders. */
  pxPerInch?: number | null;
  /** Scale printed on the new page (findScale on its text). */
  printedScale?: { label: string; inchesPerFoot: number } | null;
}

/** What happened to the sheet's scale: kept (same size), recomputed (PDF paper scale), printed (read off the new page), cleared (recalibrate), none (never had one). */
export type ScaleOutcome = "kept" | "recomputed" | "printed" | "cleared" | "none";

const within1pct = (a: number, b: number) => b > 0 && Math.abs(a / b - 1) <= 0.01;

/** The current drawing as a history entry. */
export function currentAsRevision(sheet: Sheet, id: string = nanoid(12)): SheetRevision {
  const prev = sheet.revisions?.[0];
  return {
    id,
    label: sheet.revisionLabel?.trim() || "Original",
    imageId: sheet.imageId,
    imageUrl: sheet.imageUrl ?? null,
    width: sheet.width,
    height: sheet.height,
    pxPerFt: sheet.pxPerFt ?? null,
    pxPerInch: sheet.pxPerInch ?? null,
    scaleLabel: sheet.scaleLabel ?? null,
    uploadedAt: prev?.replacedAt ?? sheet.createdAt,
    uploadedBy: prev?.replacedBy ?? null,
    transformToNext: null,
  };
}

/** When the current drawing became current (and who uploaded it). */
export function currentSince(sheet: Sheet): { at: string; by: string | null } {
  const prev = sheet.revisions?.[0];
  return { at: prev?.replacedAt ?? sheet.createdAt, by: prev?.replacedBy ?? null };
}

/**
 * Make `img` the sheet's current drawing; the old one moves to the front of the history. Markup is untouched (it
 * stays on the sheet by sheetId, at the same relative positions). The scale is kept when the size is the same
 * within 1%, recomputed from the paper scale for PDF renders, read off the new page if printed, or cleared.
 */
export function pushRevision(sheet: Sheet, img: NewRevisionImage, label: string, by: string | null, now: string, id: string = nanoid(12)): { sheet: Sheet; scale: ScaleOutcome } {
  const old = currentAsRevision(sheet, id);
  old.replacedAt = now;
  old.replacedBy = by;
  let pxPerFt: number | null = null;
  let scaleLabel: string | null = null;
  let scale: ScaleOutcome = sheet.pxPerFt ? "cleared" : "none";
  const same = within1pct(img.width, sheet.width) && within1pct(img.height, sheet.height) && within1pct(img.width / img.height, sheet.width / sheet.height);
  if (sheet.pxPerFt && same) {
    pxPerFt = sheet.pxPerFt;
    scaleLabel = sheet.scaleLabel ?? null;
    scale = "kept";
  } else if (sheet.pxPerFt && sheet.pxPerInch && img.pxPerInch) {
    pxPerFt = (sheet.pxPerFt / sheet.pxPerInch) * img.pxPerInch;
    scaleLabel = sheet.scaleLabel ?? null;
    scale = "recomputed";
  } else if (img.printedScale && img.pxPerInch) {
    pxPerFt = img.printedScale.inchesPerFoot * img.pxPerInch;
    scaleLabel = img.printedScale.label;
    scale = "printed";
  }
  return {
    sheet: {
      ...sheet,
      imageId: img.imageId,
      imageUrl: null,
      width: img.width,
      height: img.height,
      pxPerFt,
      pxPerInch: img.pxPerInch ?? (same ? (sheet.pxPerInch ?? null) : null),
      scaleLabel,
      revisionLabel: label.trim() || null,
      revisions: [old, ...(sheet.revisions ?? [])],
      updatedAt: now,
    },
    scale,
  };
}

/**
 * The current drawing's scale after aligning it to the previous one with `T` (previous → current). The scale is
 * carried through the alignment when it was reset, or when it still is the one derived from the previous drawing
 * (kept for a same-size page, or set by an earlier alignment of this link). A scale calibrated or read on the new
 * drawing itself is left alone. Null: leave the scale as it is.
 */
export function scaleAfterAlign(sheet: Pick<Sheet, "pxPerFt" | "width" | "height" | "revisions">, T: Affine): number | null {
  const prev = sheet.revisions?.[0];
  if (!prev?.pxPerFt) return null;
  const derived = prev.pxPerFt * pixelScale(prev.transformToNext ?? IDENTITY, prev, sheet);
  if (sheet.pxPerFt && Math.abs(sheet.pxPerFt / derived - 1) > 1e-6) return null;
  const next = prev.pxPerFt * pixelScale(T, prev, sheet);
  if (!Number.isFinite(next) || next <= 0) return null;
  // Two tapped points are only so precise: a derived scale within 1% stays as it is.
  if (sheet.pxPerFt && within1pct(next, sheet.pxPerFt)) return null;
  return next;
}

/** True while the sheet lost its scale to a new revision and hasn't been calibrated again. */
export function needsRecalibration(sheet: Sheet): boolean {
  return !sheet.pxPerFt && !!sheet.revisions?.[0]?.pxPerFt;
}

/** Entries of a sheet's chain: index 0 is the current drawing, then the history (newest first). */
export interface ChainEntry {
  key: string;
  label: string;
  imageId: string;
  width: number;
  height: number;
  since: string;
  current: boolean;
}
export function revisionChain(sheet: Sheet): ChainEntry[] {
  const since = currentSince(sheet);
  return [
    { key: CURRENT, label: sheet.revisionLabel?.trim() || (sheet.revisions?.length ? "Current" : "Original"), imageId: sheet.imageId, width: sheet.width, height: sheet.height, since: since.at, current: true },
    ...(sheet.revisions ?? []).map((r) => ({ key: r.id, label: r.label, imageId: r.imageId, width: r.width, height: r.height, since: r.uploadedAt, current: false })),
  ];
}

function chainIndex(sheet: Sheet, key: string): number {
  if (key === CURRENT) return 0;
  const i = (sheet.revisions ?? []).findIndex((r) => r.id === key);
  return i < 0 ? -1 : i + 1;
}

/**
 * Relative-coordinate transform taking positions on drawing `fromKey` to drawing `toKey` of the same sheet, through
 * the stored `transformToNext` links (an unaligned link carried positions unchanged: identity). Null if a key is unknown.
 */
export function transformBetween(sheet: Sheet, fromKey: string, toKey: string): Affine | null {
  const p = chainIndex(sheet, fromKey);
  const q = chainIndex(sheet, toKey);
  if (p < 0 || q < 0) return null;
  if (p === q) return [...IDENTITY] as Affine;
  if (p < q) {
    const back = transformBetween(sheet, toKey, fromKey);
    return back ? invertTransform(back) : null;
  }
  const revs = sheet.revisions ?? [];
  let T: Affine = [...IDENTITY] as Affine;
  // Entry k (k ≥ 1) is revs[k-1]; its link goes to entry k-1.
  for (let k = p; k > q; k--) T = composeTransforms(T, revs[k - 1].transformToNext ?? IDENTITY);
  return T;
}

/** True when any link between the two drawings was aligned (a stored, non-identity transform). */
export function hasStoredAlignment(sheet: Sheet, fromKey: string, toKey: string): boolean {
  const p = chainIndex(sheet, fromKey);
  const q = chainIndex(sheet, toKey);
  if (p < 0 || q < 0 || p === q) return false;
  const revs = sheet.revisions ?? [];
  for (let k = Math.max(p, q); k > Math.min(p, q); k--) if (!isIdentity(revs[k - 1].transformToNext)) return true;
  return false;
}

/**
 * Make an earlier drawing current again. The drawing being replaced stays in the history (newest first), linked to
 * the restored one; `transform` is what the markup needs to follow (current → restored positions).
 */
export function rollbackRevision(sheet: Sheet, revisionId: string, by: string | null = null, now = new Date().toISOString(), id: string = nanoid(12)): { sheet: Sheet; transform: Affine } | null {
  const revs = sheet.revisions ?? [];
  const k = revs.findIndex((r) => r.id === revisionId);
  if (k < 0) return null;
  const target = revs[k];
  const back = transformBetween(sheet, CURRENT, revisionId) ?? ([...IDENTITY] as Affine);
  const old = currentAsRevision(sheet, id);
  old.replacedAt = now;
  old.replacedBy = by;
  old.note = `Rolled back to ${target.label}`;
  old.transformToNext = isIdentity(back) ? null : back;
  // Close the gap where the target was: the drawing older than it now links straight to the one newer than it.
  const rest = revs.slice();
  rest.splice(k, 1);
  if (k < rest.length) {
    const olderLink = rest[k].transformToNext ?? IDENTITY;
    const joined = composeTransforms(olderLink, target.transformToNext ?? IDENTITY);
    rest[k] = { ...rest[k], transformToNext: isIdentity(joined) ? null : joined };
  }
  return {
    sheet: {
      ...sheet,
      imageId: target.imageId,
      imageUrl: target.imageUrl ?? null,
      width: target.width,
      height: target.height,
      pxPerFt: target.pxPerFt ?? null,
      pxPerInch: target.pxPerInch ?? null,
      scaleLabel: target.scaleLabel ?? null,
      revisionLabel: target.label,
      revisions: [old, ...rest],
      updatedAt: now,
    },
    transform: back,
  };
}

/** Default label for the next drawing: "Rev B" after "Rev A" (or the original), "Rev 3" after "Rev 2". */
export function nextRevisionLabel(sheet: Pick<Sheet, "revisionLabel" | "revisions">): string {
  const cur = sheet.revisionLabel?.trim() ?? "";
  const letter = cur.match(/^(.*\bRev\.?\s*)([A-Y])$/i);
  if (letter) return `${letter[1]}${String.fromCharCode(letter[2].charCodeAt(0) + 1)}`;
  const num = cur.match(/^(.*\bRev\.?\s*)(\d+)$/i);
  if (num) return `${num[1]}${Number(num[2]) + 1}`;
  const n = (sheet.revisions?.length ?? 0) + 1;
  return n < 26 ? `Rev ${String.fromCharCode(65 + n)}` : `Rev ${n + 1}`;
}

/** The sheet got a new drawing after the estimate was last touched. */
export function changedSinceEstimate(sheet: Sheet, lines: Pick<EstimateLine, "updatedAt" | "deleted">[]): boolean {
  const at = sheet.revisions?.[0]?.replacedAt;
  if (!at) return false;
  const latest = lines.filter((l) => !l.deleted && l.updatedAt).reduce((m, l) => (l.updatedAt > m ? l.updatedAt : m), "");
  return !!latest && Date.parse(at) > Date.parse(latest);
}

// ---------------- page → sheet matching ----------------

const DISCIPLINES = "A|AD|AE|AV|C|D|E|EL|EP|ES|FA|FP|FS|G|I|ID|L|LV|M|MP|P|PL|PV|S|SE|SEC|T|TC|TL|TN";
const SHEET_NO = new RegExp(`\\b(${DISCIPLINES})[-\\s.]?(\\d{1,3}(?:\\.\\d{1,3})?[A-Z]?)\\b`, "g");

/** Sheet numbers in a title block ("E-101", "LV-2.1", "FA1"), normalised to "E101", "LV2.1", "FA1"; the one after "SHEET" first. */
export function extractSheetNumbers(text: string): string[] {
  const t = text.toUpperCase();
  const found: { no: string; score: number; at: number }[] = [];
  for (const m of t.matchAll(SHEET_NO)) {
    const no = `${m[1]}${m[2]}`;
    const before = t.slice(Math.max(0, (m.index ?? 0) - 24), m.index ?? 0);
    const labelled = /(SHEET|DWG|DRAWING)\s*(NO\.?|NUMBER|#)?\s*:?\s*$/.test(before);
    const referenced = /\b(SEE|REFER\s+TO|ON)\s*(SHEET|DWG)?\s*$/.test(before);
    const prev = found.find((f) => f.no === no);
    const score = (labelled ? 10 : 0) + (referenced ? -5 : 0) + 1;
    if (prev) prev.score += score;
    else found.push({ no, score, at: m.index ?? 0 });
  }
  return found.sort((a, b) => b.score - a.score || b.at - a.at).map((f) => f.no);
}

const words = (s: string) => new Set(s.toUpperCase().replace(/[^A-Z0-9 ]+/g, " ").split(/\s+/).filter((w) => w.length > 1));

export interface PageMatch {
  pageNumber: number;
  sheetId: string | null;
  confidence: number;
  /** Sheet number read off the page (handy for naming a new sheet). */
  sheetNumber: string | null;
}

/**
 * Propose which existing sheet each page of a re-issued set replaces: by sheet number (in the sheet's name), then by
 * floor name (guessFloorName), then by name similarity, then by page position when the counts match. One page per sheet.
 */
export function matchPagesToSheets(pages: { text: string; pageNumber: number }[], sheets: Pick<Sheet, "id" | "name" | "pageNumber" | "order" | "deleted">[]): PageMatch[] {
  const live = sheets.filter((s) => !s.deleted).sort((a, b) => a.order - b.order);
  const sheetNos = new Map(live.map((s) => [s.id, new Set(extractSheetNumbers(s.name))]));
  const cands: { page: number; sheet: string; conf: number }[] = [];
  for (const p of pages) {
    const nos = extractSheetNumbers(p.text);
    const floor = guessFloorName(p.text, "").toLowerCase();
    const fkey = floor ? floorKey(floor) : "";
    const pw = words(p.text);
    live.forEach((s, idx) => {
      let conf = 0;
      const sn = sheetNos.get(s.id)!;
      const hit = nos.findIndex((n) => sn.has(n));
      if (hit >= 0) conf = Math.max(conf, hit === 0 ? 0.95 : 0.85);
      const name = s.name.trim().toLowerCase();
      // Same floor however it is written ("SECOND FLOOR" on the page, "2nd Fl" as the sheet's name).
      if (floor && (name === floor || name.includes(floor) || floorKey(s.name) === fkey)) conf = Math.max(conf, 0.8);
      const sw = [...words(s.name)].filter((w) => !/^SHEET$|^\d+$/.test(w));
      if (sw.length) {
        const share = sw.filter((w) => pw.has(w)).length / sw.length;
        if (share > 0) conf = Math.max(conf, 0.3 + 0.3 * share);
      }
      if (pages.length === live.length && pages.indexOf(p) === idx) conf = Math.max(conf, 0.25);
      if (conf > 0) cands.push({ page: p.pageNumber, sheet: s.id, conf });
    });
  }
  // Best pairs first; each page and each sheet used once.
  cands.sort((a, b) => b.conf - a.conf);
  const byPage = new Map<number, { sheet: string; conf: number }>();
  const used = new Set<string>();
  for (const c of cands) {
    if (byPage.has(c.page) || used.has(c.sheet)) continue;
    byPage.set(c.page, { sheet: c.sheet, conf: c.conf });
    used.add(c.sheet);
  }
  return pages.map((p) => {
    const m = byPage.get(p.pageNumber);
    return { pageNumber: p.pageNumber, sheetId: m?.sheet ?? null, confidence: m ? Math.round(m.conf * 100) / 100 : 0, sheetNumber: extractSheetNumbers(p.text)[0] ?? null };
  });
}
