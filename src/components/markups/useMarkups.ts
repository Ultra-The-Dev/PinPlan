"use client";
// Plan markup state: the job's markups (from IndexedDB, saved with put() so they sync), the active tool, colour,
// size and layer, hidden layers (remembered per user on this device) and this session's undo / redo.
// Kept apart from the editor store on purpose: markups never touch devices, counts or the editor's history.
import { create } from "zustand";
import { db, newId, nowIso, put } from "@/lib/db";
import { DEFAULT_LAYERS, PRIVATE_COLOR, rotateMarkupCW, STROKE_SIZES, type StrokeSize } from "@/lib/markups";
import { getAuthor } from "@/lib/photos";
import { claimPlanInput } from "@/lib/planOverlays";
import { SYNCED_EVENT, useSyncStatus } from "@/lib/sync";
import type { MarkupKind, PlanMarkup } from "@/lib/types";

export type MarkupTool = "select" | MarkupKind;

interface Step {
  before: PlanMarkup | null;
  after: PlanMarkup | null;
}

export interface MarkupState {
  projectId: string | null;
  items: PlanMarkup[];
  /** The markup toolbar is open (markups can be selected / drawn). */
  open: boolean;
  tool: MarkupTool;
  color: string;
  size: StrokeSize;
  layer: string;
  hiddenLayers: string[];
  allHidden: boolean;
  /** Layers added on this device that have no markups yet. */
  extraLayers: string[];
  selectedId: string | null;
  /** Long-press / right-click details card, at a screen position. */
  details: { id: string; x: number; y: number } | null;
  /** Text box being typed: a new one at (x, y) on a sheet, or an existing one (editId). */
  textDraft: { sheetId: string; x: number; y: number; editId?: string; value: string } | null;
  /** The markup list panel is open. */
  listOpen: boolean;
  past: Step[];
  future: Step[];

  load(projectId: string): Promise<void>;
  setOpen(open: boolean): void;
  setTool(tool: MarkupTool): void;
  setColor(color: string): void;
  setSize(size: StrokeSize): void;
  setLayer(layer: string): void;
  addLayer(name: string): void;
  toggleLayer(name: string): void;
  setAllHidden(hidden: boolean): void;
  select(id: string | null): void;
  set(patch: Partial<MarkupState>): void;
  /** New markup from the current tool settings (not saved). */
  draft(kind: MarkupKind, sheetId: string, points: number[], text?: string): PlanMarkup | null;
  /** Save a markup (new or changed) and record it for undo. */
  save(m: PlanMarkup): Promise<void>;
  remove(id: string): Promise<void>;
  duplicate(id: string): Promise<void>;
  undo(): Promise<void>;
  redo(): Promise<void>;
}

const userKey = () => useSyncStatus.getState().userId ?? "local";
const HIDDEN_KEY = () => `pinplan.markups.hidden.${userKey()}`;
const LAYERS_KEY = (projectId: string) => `pinplan.markups.layers.${projectId}`;
const PREFS_KEY = "pinplan.markups.prefs";

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function writeJson(key: string, v: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* storage unavailable */
  }
}

let loadSeq = 0;
let listening = false;

export const useMarkups = create<MarkupState>((set, get) => {
  const persistHidden = () => writeJson(HIDDEN_KEY(), { layers: get().hiddenLayers, all: get().allHidden });
  const persistPrefs = () => writeJson(PREFS_KEY, { color: get().color, size: get().size, layer: get().layer });
  async function write(m: PlanMarkup): Promise<PlanMarkup> {
    const saved = await put("planMarkups", m);
    set((s) => ({ items: s.items.some((x) => x.id === saved.id) ? s.items.map((x) => (x.id === saved.id ? saved : x)) : [...s.items, saved] }));
    return saved;
  }
  return {
    projectId: null,
    items: [],
    open: false,
    tool: "select",
    color: "#dc2626",
    size: "M",
    layer: DEFAULT_LAYERS[0],
    hiddenLayers: [],
    allHidden: false,
    extraLayers: [],
    selectedId: null,
    details: null,
    textDraft: null,
    listOpen: false,
    past: [],
    future: [],

    async load(projectId) {
      if (typeof window !== "undefined" && !listening) {
        listening = true;
        // Pulled from the cloud: reload when markups of this job changed.
        window.addEventListener(SYNCED_EVENT, (e) => {
          const d = (e as CustomEvent<{ tables?: string[]; projectIds?: string[] }>).detail;
          const pid = get().projectId;
          if (pid && d?.tables?.includes("planMarkups") && (!d.projectIds || d.projectIds.includes(pid))) void get().load(pid);
        });
      }
      const seq = ++loadSeq;
      const rows = await db().planMarkups.where("projectId").equals(projectId).toArray();
      if (seq !== loadSeq) return;
      const hidden = readJson<{ layers?: string[]; all?: boolean }>(HIDDEN_KEY(), {});
      const prefs = readJson<{ color?: string; size?: StrokeSize; layer?: string }>(PREFS_KEY, {});
      const same = get().projectId === projectId;
      set({
        projectId,
        items: rows,
        hiddenLayers: Array.isArray(hidden.layers) ? hidden.layers : [],
        allHidden: !!hidden.all,
        extraLayers: readJson<string[]>(LAYERS_KEY(projectId), []),
        ...(same ? {} : { selectedId: null, details: null, textDraft: null, past: [], future: [] }),
        ...(same || !prefs.color ? {} : { color: prefs.color, size: prefs.size && prefs.size in STROKE_SIZES ? prefs.size : "M", layer: prefs.layer || DEFAULT_LAYERS[0] }),
      });
    },
    setOpen(open) {
      // Open markups take the plan's taps: Measure, Walk, the Link tool, a task drop and device tools close.
      if (open) claimPlanInput("markups");
      set({ open, tool: "select", selectedId: null, details: null, textDraft: null, listOpen: open ? get().listOpen : false });
    },
    setTool(tool) {
      if (!get().open) claimPlanInput("markups");
      set({ tool, open: true, selectedId: tool === "select" ? get().selectedId : null, details: null });
    },
    setColor(color) {
      set({ color });
      persistPrefs();
    },
    setSize(size) {
      set({ size });
      persistPrefs();
    },
    setLayer(layer) {
      set({ layer });
      // Drawing on a hidden layer would make the new markup vanish: show it.
      if (get().hiddenLayers.includes(layer)) get().toggleLayer(layer);
      persistPrefs();
    },
    addLayer(name) {
      const n = name.trim();
      if (!n) return;
      const pid = get().projectId;
      const extra = get().extraLayers.some((l) => l.toLowerCase() === n.toLowerCase()) ? get().extraLayers : [...get().extraLayers, n];
      set({ extraLayers: extra });
      if (pid) writeJson(LAYERS_KEY(pid), extra);
      get().setLayer(n);
    },
    toggleLayer(name) {
      const h = get().hiddenLayers;
      set({ hiddenLayers: h.includes(name) ? h.filter((l) => l !== name) : [...h, name], selectedId: null });
      persistHidden();
    },
    setAllHidden(allHidden) {
      set({ allHidden, selectedId: null, ...(allHidden ? {} : { hiddenLayers: [] }) });
      persistHidden();
    },
    select(id) {
      set({ selectedId: id, details: null });
    },
    set(patch) {
      set(patch);
    },
    draft(kind, sheetId, points, text) {
      const { projectId, color, size, layer } = get();
      if (!projectId) return null;
      const priv = color === PRIVATE_COLOR;
      const { email, userId } = useSyncStatus.getState();
      const now = nowIso();
      return {
        id: newId(),
        projectId,
        sheetId,
        kind,
        points,
        text: kind === "text" ? (text ?? "") : null,
        color,
        width: STROKE_SIZES[size].width,
        fontSize: kind === "text" ? STROKE_SIZES[size].fontSize : null,
        layer,
        private: priv,
        author: getAuthor(email),
        authorId: userId ?? null,
        createdAt: now,
        updatedAt: now,
      };
    },
    async save(m) {
      const before = get().items.find((x) => x.id === m.id) ?? null;
      const after = await write(m);
      set((s) => ({ past: [...s.past.slice(-99), { before, after }], future: [] }));
    },
    async remove(id) {
      const before = get().items.find((x) => x.id === id);
      if (!before) return;
      const after = await write({ ...before, deleted: true });
      set((s) => ({ past: [...s.past.slice(-99), { before, after }], future: [], selectedId: s.selectedId === id ? null : s.selectedId, details: null }));
    },
    async duplicate(id) {
      const src = get().items.find((x) => x.id === id);
      if (!src) return;
      const copy = get().draft(src.kind, src.sheetId, src.points.map((v) => Math.min(1, v + 0.015)), src.text ?? undefined);
      if (!copy) return;
      // Same look; the copy belongs to whoever made it.
      await get().save({ ...copy, color: src.color, width: src.width, fontSize: src.fontSize, layer: src.layer, private: src.private });
      set({ selectedId: copy.id, details: null, tool: "select" });
    },
    async undo() {
      const step = get().past[get().past.length - 1];
      if (!step) return;
      const base = step.before ?? { ...step.after!, deleted: true };
      await write({ ...base, deleted: step.before ? !!step.before.deleted : true });
      set((s) => ({ past: s.past.slice(0, -1), future: [...s.future, step], selectedId: null, details: null }));
    },
    async redo() {
      const step = get().future[get().future.length - 1];
      if (!step) return;
      const base = step.after ?? { ...step.before!, deleted: true };
      await write(base);
      set((s) => ({ future: s.future.slice(0, -1), past: [...s.past, step], selectedId: null, details: null }));
    },
  };
});

/** After a sheet turned 90° clockwise: turn its markups with it (old / new sheet width keep strokes the same size). */
export async function rotateSheetMarkups(sheetId: string, oldWidth: number, newWidth: number): Promise<void> {
  const rows = (await db().planMarkups.where("sheetId").equals(sheetId).toArray()).filter((m) => !m.deleted);
  const ratio = newWidth ? oldWidth / newWidth : 1;
  for (const m of rows) await put("planMarkups", rotateMarkupCW(m, ratio, newWidth));
  const pid = useMarkups.getState().projectId;
  if (pid && rows.length) await useMarkups.getState().load(pid);
}
