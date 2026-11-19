"use client";
// Plan hyperlinks: the job's links (from Dexie, synced like other job rows), the link tool's state, display
// preferences (this device) and the back stack for "Back to E-101". See docs/sheet-index-links.md.
import { useEffect } from "react";
import { create } from "zustand";
import { db, newId, nowIso, put, putMany } from "./db";
import { dedupeLinks, type ProposedLink, type Rect } from "./sheetIndex";
import { useEditor } from "./store";
import { SYNCED_EVENT } from "./sync";
import type { SheetLink, SheetLinkTarget } from "./types";

const PREFS_KEY = "pinplan.sheetLinks.v1";

interface Prefs {
  /** Draw links on the plan. */
  visible: boolean;
  /** Include links found automatically from callouts. */
  showAuto: boolean;
}

interface LinksState extends Prefs {
  projectId: string | null;
  /** Live links of the loaded job. */
  links: SheetLink[];
  /** Every row including deleted ones (so re-detecting doesn't bring back a removed link). */
  all: SheetLink[];
  /** Link tool: drawing new links on the plan. */
  drawing: boolean;
  /** A rect waiting for its target (new link), or the link being edited. */
  pending: { rect: Rect; sheetId: string } | null;
  editingId: string | null;
  /** Sheets visited by following links (most recent last). */
  back: string[];
  /** Photo opened from a link. */
  photoId: string | null;
  /** URL waiting for "Open in a new tab?". */
  confirmUrl: string | null;

  load(projectId: string): Promise<void>;
  add(sheetId: string, rect: Rect, target: SheetLinkTarget, label?: string | null): Promise<SheetLink | null>;
  addProposed(links: ProposedLink[]): Promise<number>;
  update(id: string, patch: Partial<Pick<SheetLink, "target" | "label" | "x" | "y" | "w" | "h">>): Promise<void>;
  remove(ids: string[]): Promise<void>;
  setDrawing(on: boolean): void;
  setPending(p: LinksState["pending"]): void;
  setEditing(id: string | null): void;
  setPrefs(p: Partial<Prefs>): void;
  hydratePrefs(): void;
  pushBack(sheetId: string): void;
  popBack(): string | null;
  clearBack(): void;
  setPhoto(id: string | null): void;
  setConfirmUrl(url: string | null): void;
}

let loadSeq = 0;

export const useSheetLinks = create<LinksState>((set, get) => ({
  visible: true,
  showAuto: true,
  projectId: null,
  links: [],
  all: [],
  drawing: false,
  pending: null,
  editingId: null,
  back: [],
  photoId: null,
  confirmUrl: null,

  async load(projectId) {
    const seq = ++loadSeq;
    let rows: SheetLink[] = [];
    try {
      rows = await db().sheetLinks.where("projectId").equals(projectId).toArray();
    } catch {
      /* database not ready (private window): no links */
    }
    if (seq !== loadSeq) return;
    const same = get().projectId === projectId;
    set({ projectId, all: rows, links: rows.filter((l) => !l.deleted), ...(same ? {} : { back: [], drawing: false, pending: null, editingId: null }) });
  },

  async add(sheetId, rect, target, label = null) {
    const projectId = get().projectId;
    if (!projectId) return null;
    const now = nowIso();
    const row: SheetLink = { id: newId(), projectId, sheetId, ...clampRect(rect), target, label: label || null, auto: false, createdAt: now, updatedAt: now };
    const saved = await put("sheetLinks", row);
    set((s) => ({ all: [...s.all, saved], links: [...s.links, saved] }));
    return saved;
  },

  async addProposed(proposed) {
    const projectId = get().projectId ?? useEditor.getState().project?.id ?? null;
    if (!projectId || !proposed.length) return 0;
    if (get().projectId !== projectId) await get().load(projectId);
    const fresh = dedupeLinks(proposed, get().all);
    if (!fresh.length) return 0;
    const now = nowIso();
    const rows: SheetLink[] = fresh.map((p) => ({ id: newId(), projectId, sheetId: p.sheetId, ...clampRect(p), target: p.target, label: p.label, auto: true, createdAt: now, updatedAt: now }));
    const saved = await putMany("sheetLinks", rows);
    set((s) => ({ all: [...s.all, ...saved], links: [...s.links, ...saved] }));
    return saved.length;
  },

  async update(id, patch) {
    const cur = get().all.find((l) => l.id === id);
    if (!cur) return;
    const next = { ...cur, ...patch, ...(patch.x != null || patch.w != null ? clampRect({ ...cur, ...patch }) : {}) };
    const saved = await put("sheetLinks", next);
    set((s) => ({ all: s.all.map((l) => (l.id === id ? saved : l)), links: s.links.map((l) => (l.id === id ? saved : l)) }));
  },

  async remove(ids) {
    const rows = get().all.filter((l) => ids.includes(l.id)).map((l) => ({ ...l, deleted: true }));
    if (!rows.length) return;
    const saved = await putMany("sheetLinks", rows);
    const byId = new Map(saved.map((r) => [r.id, r]));
    set((s) => ({ all: s.all.map((l) => byId.get(l.id) ?? l), links: s.links.filter((l) => !byId.has(l.id)), editingId: null }));
  },

  setDrawing(on) {
    set({ drawing: on, pending: null, editingId: null });
  },
  setPending(pending) {
    set({ pending });
  },
  setEditing(editingId) {
    set({ editingId });
  },
  setPrefs(p) {
    set(p);
    try {
      const { visible, showAuto } = get();
      localStorage.setItem(PREFS_KEY, JSON.stringify({ visible, showAuto }));
    } catch {
      /* storage blocked: preference lasts this session */
    }
  },
  hydratePrefs() {
    try {
      const raw = localStorage.getItem(PREFS_KEY);
      if (!raw) return;
      const p = JSON.parse(raw) as Partial<Prefs>;
      set({ visible: p.visible !== false, showAuto: p.showAuto !== false });
    } catch {
      /* defaults */
    }
  },
  pushBack(sheetId) {
    set((s) => ({ back: [...s.back.filter((x) => x !== sheetId), sheetId].slice(-20) }));
  },
  popBack() {
    const b = get().back;
    const top = b[b.length - 1] ?? null;
    set({ back: b.slice(0, -1) });
    return top;
  },
  clearBack() {
    set({ back: [] });
  },
  setPhoto(photoId) {
    set({ photoId });
  },
  setConfirmUrl(confirmUrl) {
    set({ confirmUrl });
  },
}));

function clampRect(r: Rect): Rect {
  const c = (v: number) => Math.max(0, Math.min(1, v));
  const x = c(r.x);
  const y = c(r.y);
  return { x, y, w: Math.max(0.001, c(r.x + r.w) - x), h: Math.max(0.001, c(r.y + r.h) - y) };
}

let wired = false;
/** Reload links after a sync brought new rows for the loaded job. */
function wireSync() {
  if (wired || typeof window === "undefined") return;
  wired = true;
  window.addEventListener(SYNCED_EVENT, (e) => {
    const detail = (e as CustomEvent<{ tables?: string[]; projectIds?: string[] }>).detail;
    const pid = useSheetLinks.getState().projectId;
    if (pid && (!detail?.tables || detail.tables.includes("sheetLinks"))) void useSheetLinks.getState().load(pid);
  });
}

const EMPTY: SheetLink[] = [];

/** The open job's live links (loads them, and keeps them in step with sync). */
export function useJobLinks(): SheetLink[] {
  const pid = useEditor((s) => s.project?.id ?? null);
  const links = useSheetLinks((s) => (s.projectId === pid ? s.links : EMPTY));
  useEffect(() => {
    wireSync();
    useSheetLinks.getState().hydratePrefs();
  }, []);
  useEffect(() => {
    if (pid) void useSheetLinks.getState().load(pid);
  }, [pid]);
  return links;
}

/** Links shown on a sheet with the current preferences. */
export function visibleLinks(links: SheetLink[], sheetId: string, prefs: Prefs): SheetLink[] {
  if (!prefs.visible) return EMPTY;
  return links.filter((l) => l.sheetId === sheetId && (prefs.showAuto || !l.auto));
}
