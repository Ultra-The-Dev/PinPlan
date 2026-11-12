"use client";
import { create } from "zustand";
import { getCatalog, getSettings, loadProject, newId, nowIso, put, type SyncTable } from "./db";
import { estimateHomeRunFt, homeRunPoints, polylineFt } from "./geometry";
import { nextLabel } from "./labels";
import type {
  AppSettings,
  Closet,
  ClosetKind,
  DeviceType,
  EstimateLine,
  Layer,
  Marker,
  PricingSettings,
  Project,
  Run,
  Sheet,
} from "./types";

export type Tool =
  | { kind: "select" }
  | { kind: "place"; deviceTypeId: string }
  | { kind: "led"; deviceTypeId: string }
  | { kind: "stair" }
  | { kind: "wire" }
  | { kind: "closet"; closetKind: ClosetKind }
  | { kind: "calibrate" };

export type Selection = { table: "markers" | "runs" | "closets"; id: string } | null;

type EntityTable = "markers" | "runs" | "closets" | "sheets" | "projects" | "estimateLines";
type AnyRow = Marker | Run | Closet | Sheet | Project | EstimateLine;
interface Change {
  table: EntityTable;
  before: AnyRow | null;
  after: AnyRow | null;
}

interface EditorState {
  loaded: boolean;
  project: Project | null;
  sheets: Sheet[];
  markers: Marker[];
  runs: Run[];
  closets: Closet[];
  estimateLines: EstimateLine[];
  catalog: DeviceType[];
  settings: AppSettings | null;
  activeSheetId: string | null;
  tool: Tool;
  selection: Selection;
  hiddenLayers: Layer[];
  past: Change[][];
  future: Change[][];

  load(projectId: string): Promise<void>;
  reloadCatalog(): Promise<void>;
  setActiveSheet(id: string): void;
  setTool(t: Tool): void;
  select(s: Selection): void;
  toggleLayer(l: Layer): void;
  setOnlyLayer(l: Layer | null): void;

  commit(changes: Change[], record?: boolean): Promise<void>;
  undo(): Promise<void>;
  redo(): Promise<void>;

  pricing(): PricingSettings;
  addMarker(deviceTypeId: string, x: number, y: number, extra?: Partial<Marker>): Promise<Marker | null>;
  updateMarker(id: string, patch: Partial<Marker>): Promise<void>;
  addRun(run: Omit<Run, "id" | "projectId" | "sheetId" | "createdAt" | "updatedAt">): Promise<Run | null>;
  updateRun(id: string, patch: Partial<Run>): Promise<void>;
  addCloset(kind: ClosetKind, x: number, y: number): Promise<Closet | null>;
  updateCloset(id: string, patch: Partial<Closet>): Promise<void>;
  deleteSelected(): Promise<void>;
  deleteEntity(table: "markers" | "runs" | "closets", id: string): Promise<void>;
  updateSheet(id: string, patch: Partial<Sheet>): Promise<void>;
  updateProject(patch: Partial<Project>): Promise<void>;
  upsertEstimateLine(key: string, patch: Partial<EstimateLine>): Promise<void>;
  removeEstimateOverride(key: string): Promise<void>;
  /** Draw (or redraw) home-run wire lines for every device that has a closet. */
  autoHomeRuns(sheetId?: string, markerId?: string): Promise<number>;
}

const tableKey: Record<EntityTable, keyof EditorState> = {
  markers: "markers",
  runs: "runs",
  closets: "closets",
  sheets: "sheets",
  projects: "project",
  estimateLines: "estimateLines",
};

function applyToState(state: EditorState, table: EntityTable, row: AnyRow): Partial<EditorState> {
  if (table === "projects") return { project: row as Project };
  const key = tableKey[table] as "markers" | "runs" | "closets" | "sheets" | "estimateLines";
  const list = state[key] as AnyRow[];
  const deleted = (row as { deleted?: boolean }).deleted;
  const without = list.filter((r) => r.id !== row.id);
  const next = deleted ? without : list.some((r) => r.id === row.id) ? list.map((r) => (r.id === row.id ? row : r)) : [...list, row];
  if (table === "sheets") (next as Sheet[]).sort((a, b) => a.order - b.order);
  return { [key]: next } as Partial<EditorState>;
}

export const useEditor = create<EditorState>((set, get) => ({
  loaded: false,
  project: null,
  sheets: [],
  markers: [],
  runs: [],
  closets: [],
  estimateLines: [],
  catalog: [],
  settings: null,
  activeSheetId: null,
  tool: { kind: "select" },
  selection: null,
  hiddenLayers: [],
  past: [],
  future: [],

  async load(projectId) {
    const [bundle, catalog, settings] = await Promise.all([loadProject(projectId), getCatalog(), getSettings()]);
    if (!bundle) {
      set({ loaded: true, project: null });
      return;
    }
    const cur = get().activeSheetId;
    set({
      ...bundle,
      catalog,
      settings,
      loaded: true,
      activeSheetId: bundle.sheets.some((s) => s.id === cur) ? cur : (bundle.sheets[0]?.id ?? null),
      past: get().project?.id === projectId ? get().past : [],
      future: get().project?.id === projectId ? get().future : [],
    });
  },
  async reloadCatalog() {
    set({ catalog: await getCatalog(), settings: await getSettings() });
  },
  setActiveSheet(id) {
    set({ activeSheetId: id, selection: null });
  },
  setTool(tool) {
    set({ tool, selection: tool.kind === "select" ? get().selection : null });
  },
  select(selection) {
    set({ selection });
  },
  toggleLayer(l) {
    const h = get().hiddenLayers;
    set({ hiddenLayers: h.includes(l) ? h.filter((x) => x !== l) : [...h, l] });
  },
  setOnlyLayer(l) {
    if (!l) return set({ hiddenLayers: [] });
    const all: Layer[] = ["security", "network", "audio", "video", "smarthome", "lighting", "shades", "infrastructure", "wiring"];
    set({ hiddenLayers: all.filter((x) => x !== l) });
  },

  async commit(changes, record = true) {
    for (const c of changes) {
      if (!c.after) continue;
      const saved = (await put(c.table as SyncTable, c.after)) as AnyRow;
      c.after = saved;
      set((s) => applyToState(s, c.table, saved));
    }
    if (record) set((s) => ({ past: [...s.past.slice(-99), changes], future: [] }));
  },
  async undo() {
    const past = get().past;
    const last = past[past.length - 1];
    if (!last) return;
    const inverse: Change[] = last
      .slice()
      .reverse()
      .map((c) => ({
        table: c.table,
        before: c.after,
        after: c.before ? { ...c.before, deleted: false } : c.after ? { ...c.after, deleted: true } : null,
      }));
    await get().commit(inverse, false);
    set((s) => ({ past: s.past.slice(0, -1), future: [...s.future, last], selection: null }));
  },
  async redo() {
    const future = get().future;
    const next = future[future.length - 1];
    if (!next) return;
    const replay: Change[] = next.map((c) => ({
      table: c.table,
      before: c.before,
      after: c.after ? { ...c.after, deleted: (c.after as { deleted?: boolean }).deleted ?? false } : null,
    }));
    await get().commit(replay, false);
    set((s) => ({ future: s.future.slice(0, -1), past: [...s.past, next] }));
  },

  pricing() {
    const s = get().settings;
    return { ...(s?.pricing as PricingSettings), ...(get().project?.pricing ?? {}) };
  },

  async addMarker(deviceTypeId, x, y, extra) {
    const { project, activeSheetId, sheets, markers, catalog } = get();
    const sheet = sheets.find((s) => s.id === activeSheetId);
    const type = catalog.find((d) => d.id === deviceTypeId);
    if (!project || !sheet || !type) return null;
    // Default home-run closet: the project's equipment closet (same floor first).
    const eq = defaultCloset(get().closets, sheet.id);
    const m: Marker = {
      id: newId(),
      projectId: project.id,
      sheetId: sheet.id,
      deviceTypeId,
      x,
      y,
      label: nextLabel(type, sheet, sheets, markers),
      room: "",
      mount: type.defaultMount,
      wireType: type.defaultWire,
      closetId: eq?.id ?? null,
      tentative: false,
      notes: "",
      photoId: null,
      createdAt: nowIso(),
      updatedAt: nowIso(),
      ...extra,
    };
    await get().commit([{ table: "markers", before: null, after: m }]);
    return m;
  },
  async updateMarker(id, patch) {
    const before = get().markers.find((m) => m.id === id);
    if (!before) return;
    const after = { ...before, ...patch };
    const changes: Change[] = [{ table: "markers", before, after }];
    // Keep an attached home-run line in sync when the device moves or changes closet/wire.
    if ("x" in patch || "y" in patch || "closetId" in patch || "wireType" in patch) {
      const run = get().runs.find((r) => r.kind === "wire" && r.markerId === id);
      if (run) {
        const closet = get().closets.find((c) => c.id === after.closetId);
        if (!closet) changes.push({ table: "runs", before: run, after: { ...run, deleted: true } });
        else changes.push({ table: "runs", before: run, after: buildHomeRun(get(), after, closet, run) });
      }
    }
    await get().commit(changes);
  },
  async addRun(partial) {
    const { project, activeSheetId, sheets } = get();
    const sheet = sheets.find((s) => s.id === activeSheetId);
    if (!project || !sheet) return null;
    const r: Run = {
      ...partial,
      id: newId(),
      projectId: project.id,
      sheetId: sheet.id,
      measuredFt: partial.kind === "stair" ? null : polylineFt(partial.points, sheet),
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    await get().commit([{ table: "runs", before: null, after: r }]);
    return r;
  },
  async updateRun(id, patch) {
    const before = get().runs.find((r) => r.id === id);
    if (!before) return;
    const after = { ...before, ...patch };
    if (patch.points) {
      const sheet = get().sheets.find((s) => s.id === after.sheetId);
      if (sheet && after.kind !== "stair") after.measuredFt = polylineFt(after.points, sheet);
    }
    await get().commit([{ table: "runs", before, after }]);
  },
  async addCloset(kind, x, y) {
    const { project, activeSheetId, sheets, closets } = get();
    const sheet = sheets.find((s) => s.id === activeSheetId);
    if (!project || !sheet) return null;
    const names: Record<ClosetKind, string> = { equipment: "Equipment closet", switch: "Switch closet", rack: "Network rack" };
    const n = closets.filter((c) => c.kind === kind).length;
    const c: Closet = {
      id: newId(),
      projectId: project.id,
      sheetId: sheet.id,
      kind,
      x,
      y,
      name: n ? `${names[kind]} ${n + 1}` : names[kind],
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    await get().commit([{ table: "closets", before: null, after: c }]);
    return c;
  },
  async updateCloset(id, patch) {
    const before = get().closets.find((c) => c.id === id);
    if (!before) return;
    const after = { ...before, ...patch };
    const changes: Change[] = [{ table: "closets", before, after }];
    if ("x" in patch || "y" in patch) {
      for (const run of get().runs.filter((r) => r.kind === "wire" && r.closetId === id && r.markerId)) {
        const m = get().markers.find((mm) => mm.id === run.markerId);
        if (m) changes.push({ table: "runs", before: run, after: buildHomeRun(get(), m, after, run) });
      }
    }
    await get().commit(changes);
  },
  async deleteEntity(table, id) {
    const list = get()[table] as AnyRow[];
    const before = list.find((r) => r.id === id);
    if (!before) return;
    const changes: Change[] = [{ table, before, after: { ...before, deleted: true } }];
    if (table === "markers") {
      for (const r of get().runs.filter((rr) => rr.markerId === id)) changes.push({ table: "runs", before: r, after: { ...r, deleted: true } });
    }
    if (table === "closets") {
      for (const r of get().runs.filter((rr) => rr.closetId === id)) changes.push({ table: "runs", before: r, after: { ...r, deleted: true } });
      for (const m of get().markers.filter((mm) => mm.closetId === id)) changes.push({ table: "markers", before: m, after: { ...m, closetId: null } });
    }
    await get().commit(changes);
    if (get().selection?.id === id) set({ selection: null });
  },
  async deleteSelected() {
    const sel = get().selection;
    if (sel) await get().deleteEntity(sel.table, sel.id);
  },
  async updateSheet(id, patch) {
    const before = get().sheets.find((s) => s.id === id);
    if (!before) return;
    const after = { ...before, ...patch };
    const changes: Change[] = [{ table: "sheets", before, after }];
    // Re-measure runs when the scale changes.
    if ("pxPerFt" in patch) {
      for (const r of get().runs.filter((rr) => rr.sheetId === id && rr.kind !== "stair")) {
        const measuredFt = polylineFt(r.points, after);
        if (r.kind === "wire" && r.markerId) {
          const m = get().markers.find((mm) => mm.id === r.markerId);
          const c = get().closets.find((cc) => cc.id === r.closetId);
          const est = m && c ? estimateHomeRunFt(m, c, get().sheets.map((s) => (s.id === id ? after : s)), get().pricing()) : null;
          changes.push({ table: "runs", before: r, after: { ...r, measuredFt: est ?? measuredFt } });
        } else changes.push({ table: "runs", before: r, after: { ...r, measuredFt } });
      }
    }
    await get().commit(changes);
  },
  async updateProject(patch) {
    const before = get().project;
    if (!before) return;
    await get().commit([{ table: "projects", before, after: { ...before, ...patch } }], false);
  },
  async upsertEstimateLine(key, patch) {
    const { project, estimateLines } = get();
    if (!project) return;
    const before = estimateLines.find((l) => l.key === key) ?? null;
    const after: EstimateLine = before
      ? { ...before, ...patch }
      : { id: newId(), projectId: project.id, key, updatedAt: nowIso(), ...patch };
    await get().commit([{ table: "estimateLines", before, after }], false);
  },
  async removeEstimateOverride(key) {
    const before = get().estimateLines.find((l) => l.key === key);
    if (before) await get().commit([{ table: "estimateLines", before, after: { ...before, deleted: true } }], false);
  },
  async autoHomeRuns(sheetId, markerId) {
    const s = get();
    const changes: Change[] = [];
    const typeOf = (id: string) => s.catalog.find((d) => d.id === id);
    for (const m of s.markers) {
      if (sheetId && m.sheetId !== sheetId) continue;
      if (markerId && m.id !== markerId) continue;
      if (m.wireType === "None" || typeOf(m.deviceTypeId)?.kind === "led") continue;
      let closet = s.closets.find((c) => c.id === m.closetId);
      if (!closet) {
        // Unassigned: home-run to the equipment closet (same floor first), else any closet.
        closet = defaultCloset(s.closets, m.sheetId);
        if (!closet) continue;
        changes.push({ table: "markers", before: m, after: { ...m, closetId: closet.id } });
      }
      const existing = s.runs.find((r) => r.kind === "wire" && r.markerId === m.id) ?? null;
      changes.push({ table: "runs", before: existing, after: buildHomeRun(s, { ...m, closetId: closet.id }, closet, existing) });
    }
    if (changes.length) await get().commit(changes);
    return changes.filter((c) => c.table === "runs").length;
  },
}));

function defaultCloset(closets: Closet[], sheetId: string): Closet | undefined {
  return (
    closets.find((c) => c.kind === "equipment" && c.sheetId === sheetId) ??
    closets.find((c) => c.kind === "equipment") ??
    closets.find((c) => c.sheetId === sheetId) ??
    closets[0]
  );
}

function buildHomeRun(s: EditorState, m: Marker, closet: Closet, existing: Run | null): Run {
  const pricing = { ...(s.settings!.pricing), ...(s.project?.pricing ?? {}) };
  // A closet on another floor is drawn as a line to the same position on the device's floor (the riser).
  const pts = homeRunPoints(m, closet);
  return {
    ...(existing ?? {
      id: newId(),
      projectId: m.projectId,
      createdAt: nowIso(),
      updatedAt: nowIso(),
      kind: "wire" as const,
      typedFt: null,
    }),
    sheetId: m.sheetId,
    kind: "wire",
    points: pts,
    markerId: m.id,
    closetId: closet.id,
    wireType: m.wireType,
    tentative: m.tentative,
    measuredFt: estimateHomeRunFt(m, closet, s.sheets, pricing),
    deleted: false,
  };
}
