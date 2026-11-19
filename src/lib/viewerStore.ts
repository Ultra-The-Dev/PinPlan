"use client";
// Plan viewer preferences and navigation memory, kept on this device per user: view/edit mode, minimap, layers and
// filters, the zoom/position of each sheet, and recently viewed sheets per job. Display only — nothing here syncs or
// changes the takeoff.
import { create } from "zustand";
import { DEFAULT_FILTERS, normalizeFilters, type PlanFilters } from "./planFilter";
import { useEditor } from "./store";
import type { Layer } from "./types";
import type { ViewMemory } from "./viewport";

export type ViewerMode = "view" | "edit";

interface Persisted {
  mode: ViewerMode | null;
  minimap: boolean | null;
  filters: PlanFilters;
  hiddenLayers: Layer[];
  views: Record<string, ViewMemory>;
  recent: Record<string, string[]>;
}

interface ViewerState extends Persisted {
  userKey: string | null;
  fullscreen: boolean;
  browserOpen: boolean;
  layersOpen: boolean;

  hydrate(userKey: string): void;
  setMode(m: ViewerMode): void;
  setMinimap(on: boolean): void;
  setFilters(patch: Partial<PlanFilters>): void;
  resetFilters(): void;
  rememberView(sheetId: string, m: ViewMemory | null): void;
  markViewed(projectId: string, sheetId: string): void;
  setFullscreen(on: boolean): void;
  setBrowserOpen(on: boolean): void;
  setLayersOpen(on: boolean): void;
}

const MAX_VIEWS = 80;
const MAX_RECENT = 6;
const key = (u: string) => `pinplan.viewer.v1.${u}`;

function read(u: string): Partial<Persisted> {
  try {
    const raw = localStorage.getItem(key(u));
    return raw ? (JSON.parse(raw) as Partial<Persisted>) : {};
  } catch {
    return {};
  }
}

let writeTimer: ReturnType<typeof setTimeout> | null = null;
function save(s: ViewerState) {
  if (!s.userKey) return;
  if (writeTimer) clearTimeout(writeTimer);
  const u = s.userKey;
  const data: Persisted = { mode: s.mode, minimap: s.minimap, filters: s.filters, hiddenLayers: s.hiddenLayers, views: s.views, recent: s.recent };
  writeTimer = setTimeout(() => {
    try {
      localStorage.setItem(key(u), JSON.stringify(data));
    } catch {
      /* storage full or blocked: preferences just aren't remembered */
    }
  }, 250);
}

export const useViewer = create<ViewerState>((set, get) => ({
  userKey: null,
  mode: null,
  minimap: null,
  filters: DEFAULT_FILTERS,
  hiddenLayers: [],
  views: {},
  recent: {},
  fullscreen: false,
  browserOpen: false,
  layersOpen: false,

  hydrate(userKey) {
    if (get().userKey === userKey) return;
    const p = read(userKey);
    const hiddenLayers = Array.isArray(p.hiddenLayers) ? (p.hiddenLayers as Layer[]) : [];
    set({
      userKey,
      mode: p.mode === "view" || p.mode === "edit" ? p.mode : null,
      minimap: typeof p.minimap === "boolean" ? p.minimap : null,
      filters: normalizeFilters(p.filters),
      hiddenLayers,
      views: p.views && typeof p.views === "object" ? p.views : {},
      recent: p.recent && typeof p.recent === "object" ? p.recent : {},
    });
    // Layer toggles live in the editor store (the canvas and panels read them there); restore them once.
    useEditor.setState({ hiddenLayers });
  },
  setMode(mode) {
    set({ mode });
    if (mode === "view") useEditor.getState().setTool({ kind: "select" });
    save(get());
  },
  setMinimap(minimap) {
    set({ minimap });
    save(get());
  },
  setFilters(patch) {
    set({ filters: { ...get().filters, ...patch } });
    save(get());
  },
  resetFilters() {
    set({ filters: { ...DEFAULT_FILTERS, labels: get().filters.labels, dim: get().filters.dim } });
    save(get());
  },
  rememberView(sheetId, m) {
    if (!m) return;
    const views = { ...get().views, [sheetId]: m };
    const ids = Object.keys(views);
    if (ids.length > MAX_VIEWS) for (const id of ids.slice(0, ids.length - MAX_VIEWS)) delete views[id];
    set({ views });
    save(get());
  },
  markViewed(projectId, sheetId) {
    const cur = get().recent[projectId] ?? [];
    if (cur[0] === sheetId) return;
    set({ recent: { ...get().recent, [projectId]: [sheetId, ...cur.filter((x) => x !== sheetId)].slice(0, MAX_RECENT) } });
    save(get());
  },
  setFullscreen(fullscreen) {
    set({ fullscreen });
  },
  setBrowserOpen(browserOpen) {
    set({ browserOpen, ...(browserOpen ? { layersOpen: false } : {}) });
  },
  setLayersOpen(layersOpen) {
    set({ layersOpen, ...(layersOpen ? { browserOpen: false } : {}) });
  },
}));

// Remember layer toggles whenever they change in the editor.
if (typeof window !== "undefined") {
  useEditor.subscribe((s, prev) => {
    if (s.hiddenLayers === prev.hiddenLayers) return;
    const v = useViewer.getState();
    if (!v.userKey) return;
    useViewer.setState({ hiddenLayers: s.hiddenLayers });
    save(useViewer.getState());
  });
}
