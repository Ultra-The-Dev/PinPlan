"use client";
// Find similar (docs/find-similar.md): the tool's state on this device. What it finds are suggestions only — held
// here in memory, drawn as ghost pins, never counted — until accepted, when they become ordinary devices through the
// editor store (one undo step). Nothing is saved or synced until then.
import { create } from "zustand";
import { findSimilarOnSheet } from "@/lib/findSimilar/client";
import { thresholdFor, withoutExisting, type Box } from "@/lib/findSimilar/match";
import { loadSheetText, readTextFromPdf } from "@/lib/findSimilar/sheetText";
import { defaultTagPrefixes, findTags, parsePrefixes } from "@/lib/findSimilar/tags";
import { claimPlanInput } from "@/lib/planOverlays";
import { useEditor } from "@/lib/store";
import { toast } from "@/lib/toast";
import type { Marker, Sheet } from "@/lib/types";

export interface Found {
  id: string;
  /** Sheet-relative centre. */
  x: number;
  y: number;
  /** Likeness 0–1 (tags: 1). */
  score: number;
  /** Read tags: the tag text. */
  tag?: string;
  /** Tapped off (or skipped in review): not added by Accept all. */
  rejected: boolean;
}

export type FindMode = "match" | "tags";

interface FindState {
  open: boolean;
  mode: FindMode;
  /** Device type the finds are counted as. */
  typeId: string | null;
  /** Waiting for a tap / box on the plan (match mode). */
  picking: boolean;
  /** Box being dragged, sheet-relative corners. */
  drag: { a: { x: number; y: number }; b: { x: number; y: number } } | null;
  /** Results belong to this sheet. */
  sheetId: string | null;
  source: FindMode | null;
  /** The symbol searched for, sheet px. */
  template: Box | null;
  found: Found[];
  /** Existing devices of the type within this distance (sheet px) of a find hide it. */
  nearPx: number;
  sensitivity: number;
  prefixes: string;
  busy: string | null;
  /** A plain-words note (nothing found, no text layer…). */
  note: string | null;
  /** The plan's text isn't on this device: offer to choose the PDF. */
  needPdf: boolean;
  /** Review one by one: position in the shown list, or null. */
  review: number | null;
  set(p: Partial<FindState>): void;
  setOpen(open: boolean): void;
  setType(typeId: string, typeName: string): void;
  clear(): void;
}

const TYPE_KEY = "pinplan.findSimilar.type";

export function rememberedType(): string | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage.getItem(TYPE_KEY);
  } catch {
    return null;
  }
}

const cleared = { sheetId: null, source: null, template: null, found: [] as Found[], note: null, needPdf: false, review: null, busy: null, drag: null };

export const useFindSimilar = create<FindState>((set, get) => ({
  open: false,
  mode: "match",
  typeId: null,
  picking: true,
  drag: null,
  sheetId: null,
  source: null,
  template: null,
  found: [],
  nearPx: 0,
  sensitivity: 50,
  prefixes: "",
  busy: null,
  note: null,
  needPdf: false,
  review: null,
  set: (p) => set(p),
  setOpen(open) {
    if (open) claimPlanInput("find-similar");
    set({ open, drag: null, review: null, picking: open ? get().found.length === 0 : get().picking });
  },
  setType(typeId, typeName) {
    try {
      localStorage.setItem(TYPE_KEY, typeId);
    } catch {
      /* storage unavailable */
    }
    set({ typeId, prefixes: defaultTagPrefixes(typeName) });
    // Read tags: other prefixes, so the tags found for the last type no longer apply. (Matches stay: a symbol found
    // as one type can be counted as another.)
    if (get().mode === "tags" && get().found.length) get().clear();
  },
  clear() {
    set({ ...cleared, picking: get().mode === "match" });
  },
}));

let seq = 0;
const fid = () => `f${++seq}`;

/** The finds shown now: above the sensitivity threshold (tags always) and not on a device of the type already. */
export function shownFinds(st: Pick<FindState, "found" | "sensitivity" | "source" | "sheetId" | "typeId" | "nearPx">, markers: Marker[], sheet: Pick<Sheet, "id" | "width" | "height"> | null): Found[] {
  if (!sheet || st.sheetId !== sheet.id || !st.typeId) return [];
  const t = thresholdFor(st.sensitivity);
  const above = st.source === "tags" ? st.found : st.found.filter((f) => f.score >= t);
  return withoutExisting(above, markers, { sheetId: sheet.id, deviceTypeId: st.typeId, width: sheet.width, height: sheet.height, radiusPx: st.nearPx });
}

/** Search the sheet for symbols like the one in `box` (sheet px). `trim`: a tap's square, cut down to its ink. */
export async function runMatch(sheet: Sheet, box: Box, trim: boolean) {
  const s = useFindSimilar.getState();
  s.set({ ...cleared, busy: "Getting ready…", picking: false, sheetId: sheet.id, source: "match", template: box });
  try {
    const r = await findSimilarOnSheet(sheet, box, {
      trim,
      onProgress: (p) =>
        useFindSimilar.getState().set({
          busy: p.stage === "load" ? "Loading the matcher (first time only)…" : p.stage === "image" ? "Reading the plan…" : `Searching… ${Math.round((100 * p.done) / Math.max(1, p.total))}%`,
        }),
    });
    const found: Found[] = r.candidates.map((c) => ({ id: fid(), x: c.cx / sheet.width, y: c.cy / sheet.height, score: c.score, rejected: false }));
    useFindSimilar.getState().set({ busy: null, template: r.template, found, nearPx: 0.6 * Math.max(r.template.w, r.template.h) });
    if (!found.length) useFindSimilar.getState().set({ note: "Nothing similar found. Try a tighter box around one symbol.", picking: true });
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === "replaced") return;
    useFindSimilar.getState().set({ busy: null, template: null, note: msg, picking: true, sheetId: null });
  }
}

/** Read door / window tags from the sheet's PDF text (this device's copy, or `file` when the user chose the PDF). */
export async function runTags(sheet: Sheet, file?: File) {
  const s = useFindSimilar.getState();
  const prefixes = parsePrefixes(s.prefixes);
  s.set({ ...cleared, picking: false });
  if (!prefixes.length) return s.set({ note: "Type what the tags start with, e.g. D for doors or W for windows." });
  if (sheet.pxPerInch == null && !file) return s.set({ note: "This plan was added as a picture, so it has no text to read. Use Match a symbol instead." });
  try {
    if (file) {
      s.set({ busy: "Reading the PDF…" });
      const r = await readTextFromPdf(file, useEditor.getState().sheets, sheet.id, (d, t) => useFindSimilar.getState().set({ busy: `Reading page ${d} of ${t}…` }));
      if (!r.thisSheet) return s.set({ busy: null, needPdf: true, note: "No page of that PDF matches this plan (same page and size, not turned). Choose the PDF this plan came from." });
    }
    const items = await loadSheetText(sheet.imageId);
    if (items == null) return s.set({ busy: null, needPdf: true, note: "This plan’s text isn’t on this device. Choose the PDF it came from to read its tags." });
    if (!items.length) return s.set({ busy: null, note: "This plan has no text layer (it’s a scan or a picture), so there are no tags to read. Use Match a symbol instead." });
    const tags = findTags(items, prefixes);
    const longSide = Math.max(sheet.width, sheet.height);
    // A tag sits beside its door or window, a little way from where its device goes.
    const nearPx = sheet.pxPerFt ? 4 * sheet.pxPerFt : 0.02 * longSide;
    const found: Found[] = tags.map((t) => ({ id: fid(), x: t.x, y: t.y, score: 1, tag: t.tag, rejected: false }));
    s.set({ busy: null, sheetId: sheet.id, source: "tags", found, nearPx, note: found.length ? null : `No tags starting with ${prefixes.join(", ")} on this plan.` });
  } catch (e) {
    s.set({ busy: null, note: `Couldn’t read the PDF: ${(e as Error).message}` });
  }
}

/** Turn the shown, not rejected finds into devices of the chosen type, as one undo step. Returns how many. */
export async function acceptFinds(sheet: Sheet): Promise<number> {
  const s = useFindSimilar.getState();
  const ed = useEditor.getState();
  if (!s.typeId || ed.activeSheetId !== sheet.id) return 0;
  const shown = shownFinds(s, ed.markers, sheet).filter((f) => !f.rejected);
  if (!shown.length) return 0;
  const added = await ed.addMarkers(shown.map((f) => ({ deviceTypeId: s.typeId!, x: f.x, y: f.y })));
  const name = ed.catalog.find((d) => d.id === s.typeId)?.name ?? "devices";
  toast(`Added ${added.length} × ${name}. Undo puts them all back.`, "success");
  const ids = new Set(shown.map((f) => f.id));
  const rest = s.found.filter((f) => !ids.has(f.id));
  // Nothing left worth showing (only rejected or below the slider): start over, ready for the next symbol.
  if (!shownFinds({ ...s, found: rest }, useEditor.getState().markers, sheet).some((f) => !f.rejected)) useFindSimilar.getState().clear();
  else useFindSimilar.getState().set({ found: rest, review: null });
  return added.length;
}

export function toggleFind(id: string) {
  const s = useFindSimilar.getState();
  s.set({ found: s.found.map((f) => (f.id === id ? { ...f, rejected: !f.rejected } : f)) });
}
