// Sheet index and plan hyperlinks: sheet numbers, titles and disciplines read from a PDF's text layer, and callouts
// ("E-501", "3 over A-501") that become tappable links to other sheets. Pure except `readPdfText` (browser, PDF.js).
// No AI: it only reads the text the PDF already carries (scanned pages: floor names come from on-device OCR, src/lib/ocr.ts). See
// docs/sheet-index-links.md.
import { t } from "./i18n";
import { loadPdfjs, pageTextItems, type PageTextItem } from "./importPlans";
import type { Sheet, SheetLink, SheetLinkTarget } from "./types";

export type TextItem = PageTextItem;

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Title blocks sit in the bottom-right of a sheet: the last 30% across and down. */
export const TITLE_BLOCK: Rect = { x: 0.7, y: 0.7, w: 0.3, h: 0.3 };

/** "E-101", "A1.01", "FA-001", "M201A", "T-1". Upper case; one to three letters, then digits. */
export const SHEET_NUMBER_RE = /^(?:[A-Z]{1,3})[-.]?\d{1,3}(?:\.\d{1,2})?[A-Z]?$/;

/** Letter prefixes that look like sheet numbers but are something else on a drawing. */
const NOT_SHEETS = new Set(["REV", "NO", "RM", "PG", "PH", "SQ", "FT", "IN", "UL", "CAT", "QTY", "DIA", "AWG", "MM", "CM", "KW", "KV", "HP", "V", "W", "X", "LF", "SF", "EA", "TYP", "MIN", "MAX", "DATE", "JOB", "AHU", "RTU", "EF", "LP", "MDP", "PNL", "VAV", "WH", "DET", "BLDG", "UNIT", "APT", "STE", "LVL", "FLR", "SEC"]);

export interface Discipline {
  prefix: string;
  name: string;
}

/** Discipline by sheet-number prefix (two-letter prefixes are checked first). */
export const DISCIPLINES: Discipline[] = [
  { prefix: "G", name: "General" },
  { prefix: "C", name: "Civil" },
  { prefix: "A", name: "Architectural" },
  { prefix: "S", name: "Structural" },
  { prefix: "M", name: "Mechanical" },
  { prefix: "P", name: "Plumbing" },
  { prefix: "FP", name: "Fire protection" },
  { prefix: "FA", name: "Fire alarm" },
  { prefix: "E", name: "Electrical" },
  { prefix: "T", name: "Low voltage" },
  { prefix: "LV", name: "Low voltage" },
  { prefix: "TC", name: "Low voltage" },
];

export const OTHER_DISCIPLINE = "Other";

/** Names to offer in pickers, in sheet-set order. */
export const DISCIPLINE_NAMES: string[] = [...new Set([...DISCIPLINES.map((d) => d.name), OTHER_DISCIPLINE])];

function prefixOf(num: string): string {
  return /^[A-Z]+/.exec(num.toUpperCase())?.[0] ?? "";
}

/** "E-101" → "Electrical"; unknown prefixes → "Other". */
export function disciplineFromNumber(num: string | null | undefined): string {
  const p = prefixOf(num ?? "");
  const exact = DISCIPLINES.find((d) => d.prefix === p);
  if (exact) return exact.name;
  // "EP-1", "AD-101" (demolition), "MP-2": the first letter still names the discipline.
  const first = p.length === 2 ? DISCIPLINES.find((d) => d.prefix === p[0]) : undefined;
  return first?.name ?? OTHER_DISCIPLINE;
}

const knownPrefix = (num: string) => disciplineFromNumber(num) !== OTHER_DISCIPLINE;

/** A key that matches "E-101", "E101", "e.101" and "E 101" to each other (but keeps "E1.01" distinct from "E101"). */
export function sheetNumberKey(num: string | null | undefined): string {
  return (num ?? "").trim().toUpperCase().replace(/^([A-Z]{1,3})[-. ]?/, "$1");
}

/** True for a token that reads as a sheet number (not a scale, date, revision or equipment tag). */
export function looksLikeSheetNumber(token: string): boolean {
  const t = token.trim();
  if (!SHEET_NUMBER_RE.test(t)) return false;
  return !NOT_SHEETS.has(prefixOf(t));
}

/** Strip punctuation a callout often carries: "(E-501)", "E-501,", "E-501." */
function cleanToken(s: string): string {
  return s.replace(/^[([{"'“‘]+/, "").replace(/[)\]}"'”’,;:]+$/, "").replace(/\.$/, "");
}

/** Split text runs into words, each with an estimated box (by character position within the run). */
export function wordsOf(items: TextItem[]): TextItem[] {
  const out: TextItem[] = [];
  for (const it of items) {
    const str = it.str;
    const n = str.length || 1;
    const re = /\S+/g;
    for (let m = re.exec(str); m; m = re.exec(str)) {
      // Horizontal text: slice the box by characters. Vertical runs (h > w) keep the run's box.
      const horiz = it.w >= it.h || n === 1;
      const x = horiz ? it.x + (it.w * m.index) / n : it.x;
      const w = horiz ? (it.w * m[0].length) / n : it.w;
      out.push({ str: m[0], x, y: it.y, w, h: it.h });
    }
  }
  return out;
}

const cx = (r: Rect) => r.x + r.w / 2;
const cy = (r: Rect) => r.y + r.h / 2;
export const inRect = (r: Rect, p: { x: number; y: number }) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
const inTitleBlock = (t: Rect, tb: Rect = TITLE_BLOCK) => inRect(tb, { x: cx(t), y: cy(t) });

const LABEL_RE = /^(SHEET|SHT|DWG|DRAWING)\.?$/i;
const LABEL_NO_RE = /^(NO\.?|NUMBER|#|NO:|NUMBER:)$/i;

/**
 * The sheet's own number from its text. With positioned items it prefers the title block (bottom-right 30%) and a
 * nearby "SHEET" / "SHEET NO." label, then larger type. Without positions (plain text) it takes the token after a
 * "SHEET" label, else the last token with a known discipline prefix. Null when nothing qualifies.
 */
export function parseSheetNumber(input: TextItem[] | string): string | null {
  if (typeof input === "string") {
    const toks = input.split(/\s+/).map(cleanToken).filter(Boolean);
    let afterLabel: string | null = null;
    let lastKnown: string | null = null;
    toks.forEach((t, i) => {
      if (!looksLikeSheetNumber(t)) return;
      const prev = toks.slice(Math.max(0, i - 3), i).join(" ");
      if (!afterLabel && /\b(SHEET|SHT|DWG|DRAWING)\b/i.test(prev)) afterLabel = t;
      if (knownPrefix(t)) lastKnown = t;
    });
    return afterLabel ?? lastKnown;
  }
  const words = wordsOf(input).map((w) => ({ ...w, str: cleanToken(w.str) }));
  const labels = words.filter((w) => LABEL_RE.test(w.str) || (LABEL_NO_RE.test(w.str) && words.some((o) => LABEL_RE.test(o.str) && Math.abs(cy(o) - cy(w)) < o.h)));
  const cands = words.filter((w) => w.str && looksLikeSheetNumber(w.str));
  if (!cands.length) return null;
  const maxH = Math.max(...cands.map((c) => c.h)) || 1;
  let best: { t: TextItem; score: number } | null = null;
  for (const t of cands) {
    const tb = inTitleBlock(t);
    // A label to the left on the same line, or just above.
    const labelNear = labels.some((l) => {
      const sameLine = Math.abs(cy(l) - cy(t)) < Math.max(l.h, t.h) * 0.8 && l.x < t.x && t.x - (l.x + l.w) < Math.max(t.h, l.h) * 12;
      const above = l.y < t.y && t.y - (l.y + l.h) < Math.max(t.h, l.h) * 3 && Math.abs(cx(l) - cx(t)) < 0.08;
      return sameLine || above;
    });
    if (!tb && !labelNear) continue;
    const known = knownPrefix(t.str);
    const score = (tb ? 4 : 0) + (labelNear ? 3 : 0) + (known ? 2 : 0) + (2 * t.h) / maxH + (cx(t) + cy(t)) / 2;
    if (!best || score > best.score) best = { t, score };
  }
  return best?.t.str ?? null;
}

const TITLE_RE = /\b(PLANS?|DETAILS?|RISERS?|SCHEDULES?|ELEVATIONS?|SECTIONS?|NOTES|DIAGRAMS?|LEGENDS?|LAYOUT|INDEX|COVER)\b/;

interface Line extends Rect {
  str: string;
}

/** Group text runs into lines (same baseline band, left to right, small gaps). */
export function linesOf(items: TextItem[]): Line[] {
  const sorted = [...items].filter((i) => i.str.trim()).sort((a, b) => a.y - b.y || a.x - b.x);
  const lines: (Line & { parts: TextItem[] })[] = [];
  for (const it of sorted) {
    const line = lines.find((l) => Math.abs(cy(l) - cy(it)) < Math.min(l.h, it.h) * 0.5 && Math.abs(l.h - it.h) < Math.max(l.h, it.h) * 0.35 && it.x - (l.x + l.w) < it.h * 2.5 && it.x + it.w > l.x - it.h * 2.5);
    if (line) {
      line.parts.push(it);
      const x0 = Math.min(line.x, it.x);
      const y0 = Math.min(line.y, it.y);
      line.w = Math.max(line.x + line.w, it.x + it.w) - x0;
      line.h = Math.max(line.y + line.h, it.y + it.h) - y0;
      line.x = x0;
      line.y = y0;
    } else lines.push({ str: "", x: it.x, y: it.y, w: it.w, h: it.h, parts: [it] });
  }
  return lines.map((l) => ({ x: l.x, y: l.y, w: l.w, h: l.h, str: l.parts.sort((a, b) => a.x - b.x).map((p) => p.str.trim()).join(" ").replace(/\s+/g, " ") }));
}

/**
 * The sheet title: the largest line near the sheet number (else in the title block, else anywhere) that names a
 * drawing ("… PLAN", "DETAILS", "RISER DIAGRAM", "SCHEDULES", "ELEVATIONS", "SECTIONS", "NOTES"). A title set on two
 * lines of the same size ("FIRST FLOOR" / "POWER PLAN") is joined. Null when nothing qualifies.
 */
export function parseSheetTitle(items: TextItem[], number?: string | null): string | null {
  const lines = linesOf(items).filter((l) => l.str.length <= 70 && !/\b(SEE|REFER|SCALE\s*:|NTS\b)/.test(l.str.toUpperCase()));
  const numWord = number ? wordsOf(items).find((w) => cleanToken(w.str) === number && inTitleBlock(w)) ?? wordsOf(items).find((w) => cleanToken(w.str) === number) : undefined;
  const anchor: Rect = numWord ?? TITLE_BLOCK;
  const near = (l: Rect) => Math.hypot(cx(l) - cx(anchor), cy(l) - cy(anchor)) < (numWord ? 0.3 : 0.25) || inTitleBlock(l);
  const cands = lines.filter((l) => TITLE_RE.test(l.str.toUpperCase()) && !(number && l.str.trim() === number));
  const pick = (ls: Line[]) => [...ls].sort((a, b) => b.h - a.h || Math.hypot(cx(a) - cx(anchor), cy(a) - cy(anchor)) - Math.hypot(cx(b) - cx(anchor), cy(b) - cy(anchor)))[0];
  const best = pick(cands.filter(near)) ?? pick(cands);
  if (!best) return null;
  // A first line of the same size directly above (a two-line title).
  const above = lines.find(
    (l) => l !== best && l.y < best.y && best.y - (l.y + l.h) < best.h * 0.9 && Math.abs(l.h - best.h) < best.h * 0.2 && Math.abs(cx(l) - cx(best)) < Math.max(l.w, best.w) * 0.6 && !TITLE_RE.test(l.str.toUpperCase()) && !looksLikeSheetNumber(l.str) && !/\d{3,}/.test(l.str),
  );
  const title = above ? `${above.str} ${best.str}` : best.str;
  return title.replace(/\s+/g, " ").trim() || null;
}

/** Number, title and discipline proposed for one page. */
export interface SheetProposal {
  number: string | null;
  title: string | null;
  discipline: string | null;
}

export function proposeSheetMeta(items: TextItem[] | undefined, text = ""): SheetProposal {
  const number = items?.length ? parseSheetNumber(items) : text ? parseSheetNumber(text) : null;
  const title = items?.length ? parseSheetTitle(items, number) : null;
  return { number, title, discipline: number ? disciplineFromNumber(number) : null };
}

/** "E-101 First floor power plan" when the sheet has a number, else its name. */
export function sheetDisplayName(sheet: Pick<Sheet, "name"> & Partial<Pick<Sheet, "number" | "title">>): string {
  const num = sheet.number?.trim();
  return num ? `${num} ${sheet.title?.trim() || sheet.name}` : sheet.name;
}

/** The sheet's discipline: as set, else from its number, else "Other". */
export function sheetDiscipline(sheet: Partial<Pick<Sheet, "number" | "discipline">>): string {
  return sheet.discipline?.trim() || (sheet.number ? disciplineFromNumber(sheet.number) : OTHER_DISCIPLINE);
}

/** Natural compare for sheet numbers: E-2 before E-10. */
export function compareSheetNumbers(a: string | null | undefined, b: string | null | undefined): number {
  return (a ?? "").localeCompare(b ?? "", undefined, { numeric: true, sensitivity: "base" });
}

/** Sheets grouped by discipline, groups in set order (General, Civil, Architectural…, Other), sheets in plan order. */
export function groupSheetsByDiscipline<T extends Pick<Sheet, "order"> & Partial<Pick<Sheet, "number" | "discipline" | "deleted">>>(sheets: T[]): { discipline: string; sheets: T[] }[] {
  const groups = new Map<string, T[]>();
  for (const s of sheets) {
    if (s.deleted) continue;
    const d = sheetDiscipline(s);
    groups.set(d, [...(groups.get(d) ?? []), s]);
  }
  const rank = (d: string) => {
    const i = DISCIPLINE_NAMES.indexOf(d);
    return i < 0 ? DISCIPLINE_NAMES.length - 1 : i;
  };
  return [...groups.entries()]
    .sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b))
    .map(([discipline, list]) => ({ discipline, sheets: [...list].sort((a, b) => a.order - b.order) }));
}

/** Sheet-number keys used by more than one live sheet (never auto-linked; flagged in review). */
export function duplicateNumbers(sheets: Pick<Sheet, "id" | "number" | "deleted">[]): Set<string> {
  const seen = new Map<string, number>();
  for (const s of sheets) if (!s.deleted && s.number?.trim()) seen.set(sheetNumberKey(s.number), (seen.get(sheetNumberKey(s.number)) ?? 0) + 1);
  return new Set([...seen.entries()].filter(([, n]) => n > 1).map(([k]) => k));
}

/** Text that matches sheets: a search over number, title and name ("e1", "riser", "first floor"). */
export function matchSheet(sheet: Pick<Sheet, "name"> & Partial<Pick<Sheet, "number" | "title" | "discipline" | "tags">>, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const hay = [sheet.number, sheetNumberKey(sheet.number), sheet.title, sheet.name, sheet.discipline, ...(sheet.tags ?? [])].filter(Boolean).join(" ").toLowerCase();
  return q.split(/\s+/).every((w) => hay.includes(w) || hay.includes(sheetNumberKey(w).toLowerCase()));
}

/** A link proposed from callout text (not saved yet). */
export interface ProposedLink extends Rect {
  sheetId: string;
  target: { kind: "sheet"; sheetId: string };
  label: string;
  auto: true;
}

export interface CalloutOptions {
  /** The page's own title block (excluded). Default: bottom-right 30%. Null: exclude nothing by region. */
  titleBlock?: Rect | null;
  /** How far (in text heights) a detail number may sit from its sheet number. */
  radius?: number;
}

/**
 * Callouts on a page that point at other sheets: a word equal to another sheet's number ("E-501", "(E-501)"), a
 * "3/E-501" word, or a detail number set just above (or before) a sheet number ("3" over "E-501" in a section bubble).
 * The page's own number and its title block are skipped, and so are numbers shared by several sheets (ambiguous).
 */
export function findCallouts(items: TextItem[], sheets: Pick<Sheet, "id" | "number" | "deleted">[], selfSheetId: string, opts: CalloutOptions = {}): ProposedLink[] {
  const radius = opts.radius ?? 2.5;
  const tb = opts.titleBlock === undefined ? TITLE_BLOCK : opts.titleBlock;
  const dup = duplicateNumbers(sheets);
  const byKey = new Map<string, string>();
  for (const s of sheets) if (!s.deleted && s.number?.trim() && !dup.has(sheetNumberKey(s.number))) byKey.set(sheetNumberKey(s.number), s.id);
  const self = sheets.find((s) => s.id === selfSheetId);
  const selfKey = self?.number ? sheetNumberKey(self.number) : null;
  const words = wordsOf(items);
  const details = words.filter((w) => /^\d{1,2}[A-Z]?$/.test(cleanToken(w.str)));
  const out: ProposedLink[] = [];
  for (const w of words) {
    const raw = cleanToken(w.str);
    // "3/E-501" or "E-501/3": the sheet part of a detail reference.
    const parts = raw.split("/");
    const sheetPart = parts.find((p) => looksLikeSheetNumber(p)) ?? raw;
    const key = sheetNumberKey(sheetPart);
    const targetId = byKey.get(key);
    if (!targetId || targetId === selfSheetId || key === selfKey) continue;
    if (!looksLikeSheetNumber(sheetPart)) continue;
    if (tb && inTitleBlock(w, tb)) continue;
    let rect: Rect = { x: w.x, y: w.y, w: w.w, h: w.h };
    let label = sheetPart;
    const slashDetail = parts.length === 2 ? parts.find((p) => p !== sheetPart && /^\d{1,2}[A-Z]?$/.test(p)) : undefined;
    if (slashDetail) label = `${slashDetail}/${sheetPart}`;
    else {
      // A detail number above the sheet number (bubble), or just to its left on the same line.
      const d = details
        .filter((o) => o !== w)
        .map((o) => ({ o, dist: Math.hypot(cx(o) - cx(w), cy(o) - cy(w)) }))
        .filter(({ o, dist }) => dist < Math.max(w.h, o.h) * radius && (o.y + o.h <= cy(w) || (Math.abs(cy(o) - cy(w)) < w.h * 0.6 && o.x + o.w <= w.x + w.w * 0.1)))
        .sort((a, b) => a.dist - b.dist)[0]?.o;
      if (d) {
        rect = union(rect, d);
        label = `${cleanToken(d.str)}/${sheetPart}`;
      }
    }
    const pad = Math.max(rect.h, 0.002) * 0.35;
    out.push({ sheetId: selfSheetId, x: rect.x - pad, y: rect.y - pad, w: rect.w + pad * 2, h: rect.h + pad * 2, target: { kind: "sheet", sheetId: targetId }, label, auto: true });
  }
  return dedupeLinks(out);
}

function union(a: Rect, b: Rect): Rect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
}

/** Intersection over union of two rects (0–1). */
export function overlap(a: Rect, b: Rect): number {
  const ix = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const iy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  const inter = ix * iy;
  const uni = a.w * a.h + b.w * b.h - inter;
  return uni > 0 ? inter / uni : 0;
}

export function sameTarget(a: SheetLinkTarget, b: SheetLinkTarget): boolean {
  if (a.kind !== b.kind) return false;
  switch (a.kind) {
    case "sheet":
      return a.sheetId === (b as typeof a).sheetId;
    case "document":
      return a.documentId === (b as typeof a).documentId;
    case "photo":
      return a.photoId === (b as typeof a).photoId;
    case "url":
      return a.url === (b as typeof a).url;
  }
}

/**
 * Drop links that repeat one already kept (or one in `existing`) on the same sheet: same target and mostly the same
 * area. Existing links count even when deleted, so re-detecting doesn't bring back a link someone removed.
 */
export function dedupeLinks<T extends Rect & { sheetId: string; target: SheetLinkTarget }>(links: T[], existing: (Rect & { sheetId: string; target: SheetLinkTarget })[] = []): T[] {
  const kept: (Rect & { sheetId: string; target: SheetLinkTarget })[] = [...existing];
  const out: T[] = [];
  for (const l of links) {
    if (kept.some((k) => k.sheetId === l.sheetId && sameTarget(k.target, l.target) && (overlap(k, l) > 0.4 || inRect(k, { x: cx(l), y: cy(l) })))) continue;
    kept.push(l);
    out.push(l);
  }
  return out;
}

/** The link under a point (relative), allowing `tol` (relative x, y) around small boxes; the smallest box wins. */
export function linkAt<T extends Rect>(links: T[], p: { x: number; y: number }, tol: { x: number; y: number } = { x: 0, y: 0 }): T | null {
  let best: T | null = null;
  for (const l of links) {
    if (p.x < l.x - tol.x || p.x > l.x + l.w + tol.x || p.y < l.y - tol.y || p.y > l.y + l.h + tol.y) continue;
    if (!best || l.w * l.h < best.w * best.h) best = l;
  }
  return best;
}

/** A rect from two corners, clamped to the sheet. */
export function rectFromCorners(a: { x: number; y: number }, b: { x: number; y: number }): Rect {
  const c = (v: number) => Math.max(0, Math.min(1, v));
  const x0 = c(Math.min(a.x, b.x));
  const y0 = c(Math.min(a.y, b.y));
  return { x: x0, y: y0, w: c(Math.max(a.x, b.x)) - x0, h: c(Math.max(a.y, b.y)) - y0 };
}

/**
 * A link after its sheet image is turned 90° clockwise (the same mapping as markers: x, y → 1 − y, x): its box when it
 * sits on `sheetId`, and its target point when it points into `sheetId`. Null when the link isn't affected. Pure.
 */
export function rotateLinkCW<T extends Rect & { sheetId: string; target: SheetLinkTarget }>(link: T, sheetId: string): T | null {
  let next: T | null = null;
  if (link.sheetId === sheetId) next = { ...link, x: 1 - link.y - link.h, y: link.x, w: link.h, h: link.w };
  const t = link.target;
  if (t && t.kind === "sheet" && t.sheetId === sheetId && t.x != null && t.y != null) next = { ...(next ?? link), target: { ...t, x: 1 - t.y, y: t.x } };
  return next;
}

/** Why a link can't be followed (target deleted or gone), or null when it works. */
export function brokenReason(
  link: Pick<SheetLink, "target">,
  have: { sheets: Pick<Sheet, "id" | "deleted">[]; documents: { id: string; deleted?: boolean }[]; photos: { id: string; deleted?: boolean }[] },
): string | null {
  const target = link.target;
  if (target.kind === "sheet") return have.sheets.some((s) => s.id === target.sheetId && !s.deleted) ? null : t("The sheet this link pointed to was deleted.");
  if (target.kind === "document") return have.documents.some((d) => d.id === target.documentId && !d.deleted) ? null : t("The document this link pointed to was deleted.");
  if (target.kind === "photo") return have.photos.some((p) => p.id === target.photoId && !p.deleted) ? null : t("The photo this link pointed to was deleted.");
  return /^https?:\/\//i.test(target.url) ? null : t("This link's web address isn't valid.");
}

/** Make a typed URL openable ("example.com/spec" → "https://example.com/spec"); null when it isn't a web address. */
export function normalizeUrl(input: string): string | null {
  const s = input.trim();
  if (!s) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(s) ? s : `https://${s}`;
  try {
    const u = new URL(withScheme);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    if (!u.hostname.includes(".") && u.hostname !== "localhost") return null;
    return u.toString();
  } catch {
    return null;
  }
}

/** Text of one PDF page for the sheet index (no rendering). */
export interface PdfPageText {
  pageNumber: number;
  /** Page size in PDF points (rotation applied), for matching pages to sheets by shape. */
  width: number;
  height: number;
  items: TextItem[];
  text: string;
}

/** Read every page's positioned text from a PDF without rendering it (fast; scanned pages give no items). */
export async function readPdfText(file: File | Blob, onProgress?: (done: number, total: number) => void): Promise<PdfPageText[]> {
  const lib = await loadPdfjs();
  const task = lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  const doc = await task.promise;
  const out: PdfPageText[] = [];
  try {
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const viewport = page.getViewport({ scale: 1 });
      let items: TextItem[] = [];
      let text = "";
      try {
        const tc = await page.getTextContent();
        items = pageTextItems(tc, viewport);
        text = items.map((t) => t.str).join(" ");
      } catch {
        /* scanned page: no text layer */
      }
      out.push({ pageNumber: i, width: viewport.width, height: viewport.height, items, text });
      page.cleanup();
      onProgress?.(i, doc.numPages);
    }
  } finally {
    await task.destroy();
  }
  return out;
}

/**
 * Which sheet each PDF page belongs to, for "Detect links / names from PDF" on sheets imported earlier: same page
 * number and the same shape (rotated sheets are skipped: their coordinates no longer match the page). When several
 * sheets share a page number (several PDFs), the first not already taken in plan order wins.
 */
export function matchPagesToSheets(pages: Pick<PdfPageText, "pageNumber" | "width" | "height">[], sheets: Pick<Sheet, "id" | "pageNumber" | "width" | "height" | "order" | "deleted" | "pxPerInch">[]): Map<number, string> {
  const taken = new Set<string>();
  const out = new Map<number, string>();
  const live = sheets.filter((s) => !s.deleted).sort((a, b) => a.order - b.order);
  for (const p of pages) {
    const ar = p.width / p.height;
    const s = live.find((sh) => !taken.has(sh.id) && sh.pageNumber === p.pageNumber && sh.pxPerInch != null && Math.abs(sh.width / sh.height - ar) / ar < 0.03);
    if (s) {
      taken.add(s.id);
      out.set(p.pageNumber, s.id);
    }
  }
  return out;
}
