"use client";
import { create } from "zustand";
import { closetMeta, LAYERS } from "./catalog";
import { canEditJob, READ_ONLY_MESSAGE, ReadOnlyError } from "./canEdit";
import { getCatalog, getProducts, getSettings, loadProject, newId, nowIso, put, type SyncTable } from "./db";
import { estimateHomeRunFt, homeRunPoints, polylineFt } from "./geometry";
import { t } from "./i18n";
import { nextLabel } from "./labels";
import { claimPlanInput } from "./planOverlays";
import { rotateSheetMeasurements } from "./measurements";
import { markerCables } from "./products";
import { toast } from "./toast";
import type {
  AppSettings,
  Closet,
  ClosetKind,
  DeviceType,
  EstimateLine,
  Layer,
  Marker,
  Checklist,
  JobDocument,
  JobLog,
  Photo,
  PhotoComment,
  PricingSettings,
  Product,
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

type EntityTable =
  | "markers"
  | "runs"
  | "closets"
  | "sheets"
  | "projects"
  | "estimateLines"
  | "photos"
  | "photoComments"
  | "checklists"
  | "jobLogs"
  | "documents";
type AnyRow = Marker | Run | Closet | Sheet | Project | EstimateLine | Photo | PhotoComment | Checklist | JobLog | JobDocument;
type ListKey = Exclude<EntityTable, "projects">;
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
  photos: Photo[];
  photoComments: PhotoComment[];
  checklists: Checklist[];
  jobLogs: JobLog[];
  documents: JobDocument[];
  catalog: DeviceType[];
  /** Brand/model product library. */
  products: Product[];
  settings: AppSettings | null;
  activeSheetId: string | null;
  tool: Tool;
  selection: Selection;
  /** Devices selected together for bulk edits (2+ ids). */
  multi: string[];
  /** Touch-friendly "select several" mode: taps on devices add/remove them. */
  multiMode: boolean;
  hiddenLayers: Layer[];
  /** Room applied to newly placed devices. */
  room: string;
  /** Request to centre the plan on a point ("find device"); n increments per request. */
  focus: { sheetId: string; x: number; y: number; n: number } | null;
  past: Change[][];
  future: Change[][];

  load(projectId: string): Promise<void>;
  reloadCatalog(): Promise<void>;
  setActiveSheet(id: string): void;
  setTool(t: Tool): void;
  select(s: Selection): void;
  /** Add or remove a device from the multi-selection (shift-click, or a tap in "select several" mode). */
  toggleMulti(id: string): void;
  selectMany(ids: string[]): void;
  setMultiMode(on: boolean): void;
  /** Apply a change to several devices as one undo step (home runs follow). */
  updateMarkers(ids: string[], patch: (m: Marker) => Partial<Marker>): Promise<void>;
  deleteMarkers(ids: string[]): Promise<void>;
  toggleLayer(l: Layer): void;
  setRoom(room: string): void;
  /** Switch to the device's floor, select it and centre the plan on it. */
  focusOn(table: "markers" | "runs" | "closets", id: string): void;
  setOnlyLayer(l: Layer | null): void;

  commit(changes: Change[], record?: boolean): Promise<void>;
  undo(): Promise<void>;
  redo(): Promise<void>;

  pricing(): PricingSettings;
  addMarker(deviceTypeId: string, x: number, y: number, extra?: Partial<Marker>): Promise<Marker | null>;
  /** Place several devices on the active sheet as one undo step (accepting Find similar suggestions). */
  addMarkers(items: { deviceTypeId: string; x: number; y: number; extra?: Partial<Marker> }[]): Promise<Marker[]>;
  updateMarker(id: string, patch: Partial<Marker>): Promise<void>;
  addRun(run: Omit<Run, "id" | "projectId" | "sheetId" | "createdAt" | "updatedAt">): Promise<Run | null>;
  updateRun(id: string, patch: Partial<Run>): Promise<void>;
  addCloset(kind: ClosetKind, x: number, y: number): Promise<Closet | null>;
  updateCloset(id: string, patch: Partial<Closet>): Promise<void>;
  deleteSelected(): Promise<void>;
  deleteEntity(table: "markers" | "runs" | "closets", id: string): Promise<void>;
  updateSheet(id: string, patch: Partial<Sheet>): Promise<void>;
  /** Swap in a 90°-clockwise-rotated image and rotate everything drawn on the sheet with it. */
  rotateSheetCW(id: string, imageId: string, width: number, height: number): Promise<void>;
  updateProject(patch: Partial<Project>): Promise<void>;
  upsertEstimateLine(key: string, patch: Partial<EstimateLine>): Promise<void>;
  removeEstimateOverride(key: string): Promise<void>;
  /** Save a field-documentation row (photo, comment, checklist, log, document): new or changed, one undo step. */
  saveRow<T extends Photo | PhotoComment | Checklist | JobLog | JobDocument>(table: "photos" | "photoComments" | "checklists" | "jobLogs" | "documents", row: T): Promise<T>;
  /** Soft-delete field-documentation rows (one undo step). */
  removeRows(table: "photos" | "photoComments" | "checklists" | "jobLogs" | "documents", ids: string[]): Promise<void>;
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
  photos: "photos",
  photoComments: "photoComments",
  checklists: "checklists",
  jobLogs: "jobLogs",
  documents: "documents",
};

function applyToState(state: EditorState, table: EntityTable, row: AnyRow): Partial<EditorState> {
  if (table === "projects") return { project: row as Project };
  const key = tableKey[table] as ListKey;
  const list = state[key] as AnyRow[];
  const deleted = (row as { deleted?: boolean }).deleted;
  const without = list.filter((r) => r.id !== row.id);
  const next = deleted ? without : list.some((r) => r.id === row.id) ? list.map((r) => (r.id === row.id ? row : r)) : [...list, row];
  if (table === "sheets") (next as Sheet[]).sort((a, b) => a.order - b.order);
  if (table === "photos") (next as Photo[]).sort((a, b) => b.takenAt.localeCompare(a.takenAt));
  if (table === "jobLogs") (next as JobLog[]).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  // Same order as loadProject, so a new row shows where it will be after a reload.
  if (table === "photoComments" || table === "checklists") (next as (PhotoComment | Checklist)[]).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  if (table === "documents") (next as JobDocument[]).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return { [key]: next } as Partial<EditorState>;
}

/** Bumped by every commit, so a load that read the database before a commit doesn't put the old rows back. */
let commitGen = 0;
let loadSeq = 0;

export const useEditor = create<EditorState>((set, get) => ({
  loaded: false,
  project: null,
  sheets: [],
  markers: [],
  runs: [],
  closets: [],
  estimateLines: [],
  photos: [],
  photoComments: [],
  checklists: [],
  jobLogs: [],
  documents: [],
  catalog: [],
  products: [],
  settings: null,
  activeSheetId: null,
  tool: { kind: "select" },
  selection: null,
  multi: [],
  multiMode: false,
  hiddenLayers: [],
  room: "",
  focus: null,
  past: [],
  future: [],

  async load(projectId) {
    const seq = ++loadSeq;
    let bundle: Awaited<ReturnType<typeof loadProject>>, catalog: DeviceType[], products: Product[], settings: AppSettings;
    for (let attempt = 0; ; attempt++) {
      const gen = commitGen;
      [bundle, catalog, products, settings] = await Promise.all([loadProject(projectId), getCatalog(), getProducts(), getSettings()]);
      // An edit was saved while reading: read again, so it isn't undone on screen (and then overwritten by the next edit).
      if (gen === commitGen || attempt >= 4) break;
    }
    // A newer load (e.g. another sync) started meanwhile: let it win.
    if (seq !== loadSeq) return;
    if (!bundle) {
      set({ loaded: true, project: null });
      return;
    }
    const cur = get().activeSheetId;
    set({
      ...bundle,
      catalog,
      products,
      settings,
      loaded: true,
      activeSheetId: bundle.sheets.some((s) => s.id === cur) ? cur : (bundle.sheets[0]?.id ?? null),
      past: get().project?.id === projectId ? get().past : [],
      future: get().project?.id === projectId ? get().future : [],
    });
  },
  async reloadCatalog() {
    set({ catalog: await getCatalog(), products: await getProducts(), settings: await getSettings() });
  },
  setActiveSheet(id) {
    set({ activeSheetId: id, selection: null });
  },
  setTool(tool) {
    // A tool that takes plan taps closes Measure, Markups, Walk, the Link tool and a task drop (planOverlays.ts).
    if (tool.kind !== "select") claimPlanInput("editor-tool");
    set({ tool, selection: tool.kind === "select" ? get().selection : null });
  },
  select(selection) {
    set({ selection, multi: [], ...(selection ? {} : { multiMode: false }) });
  },
  toggleMulti(id) {
    const s = get();
    const base = s.multi.length ? s.multi : s.selection?.table === "markers" ? [s.selection.id] : [];
    const next = base.includes(id) ? base.filter((x) => x !== id) : [...base, id];
    if (next.length >= 2) set({ multi: next, selection: { table: "markers", id: next[next.length - 1] } });
    else set({ multi: [], selection: next[0] ? { table: "markers", id: next[0] } : null });
  },
  selectMany(ids) {
    if (ids.length >= 2) set({ multi: ids, selection: { table: "markers", id: ids[ids.length - 1] }, tool: { kind: "select" } });
    else set({ multi: [], selection: ids[0] ? { table: "markers", id: ids[0] } : null });
  },
  setMultiMode(on) {
    set({ multiMode: on, tool: { kind: "select" } });
  },
  async updateMarkers(ids, patchFn) {
    const s = get();
    const changes: Change[] = [];
    for (const id of ids) {
      const before = s.markers.find((m) => m.id === id);
      if (!before) continue;
      const patch = patchFn(before);
      const after = { ...before, ...patch };
      if (JSON.stringify(after) === JSON.stringify(before)) continue;
      changes.push({ table: "markers", before, after });
      if ("closetId" in patch || "wireType" in patch || "wires" in patch || "tentative" in patch) {
        const run = s.runs.find((r) => r.kind === "wire" && r.markerId === id);
        if (run) {
          const closet = s.closets.find((c) => c.id === after.closetId);
          changes.push({ table: "runs", before: run, after: closet ? buildHomeRun(s, after, closet, run) : { ...run, deleted: true } });
        }
      }
    }
    if (changes.length) await get().commit(changes);
  },
  async deleteMarkers(ids) {
    const s = get();
    const changes: Change[] = [];
    for (const id of ids) {
      const before = s.markers.find((m) => m.id === id);
      if (!before) continue;
      changes.push({ table: "markers", before, after: { ...before, deleted: true } });
      for (const r of s.runs.filter((rr) => rr.markerId === id)) changes.push({ table: "runs", before: r, after: { ...r, deleted: true } });
    }
    if (changes.length) await get().commit(changes);
    set({ selection: null, multi: [] });
  },
  setRoom(room) {
    set({ room });
  },
  focusOn(table, id) {
    const s = get();
    const row = (s[table] as (Marker | Run | Closet)[]).find((r) => r.id === id);
    if (!row) return;
    const [x, y] = "points" in row ? [row.points[0] ?? 0.5, row.points[1] ?? 0.5] : [row.x, row.y];
    set({
      activeSheetId: row.sheetId,
      selection: { table, id },
      tool: { kind: "select" },
      focus: { sheetId: row.sheetId, x, y, n: (s.focus?.n ?? 0) + 1 },
    });
  },
  toggleLayer(l) {
    const h = get().hiddenLayers;
    set({ hiddenLayers: h.includes(l) ? h.filter((x) => x !== l) : [...h, l] });
  },
  setOnlyLayer(l) {
    if (!l) return set({ hiddenLayers: [] });
    const all: Layer[] = LAYERS.map((x) => x.id);
    set({ hiddenLayers: all.filter((x) => x !== l) });
  },

  async commit(changes, record = true) {
    // The free trial or subscription has ended: jobs are read-only here too (the cloud would refuse the change).
    if (!canEditJob()) {
      toast(t(READ_ONLY_MESSAGE), "error");
      throw new ReadOnlyError();
    }
    commitGen++;
    // Show the change right away (before the database write finishes), so an edit made meanwhile builds on it
    // instead of on the old row: two quick edits to one row must not overwrite each other.
    const shown: { c: Change; row: AnyRow }[] = [];
    for (const c of changes) {
      if (!c.after) continue;
      const row = { ...c.after, updatedAt: nowIso() } as AnyRow;
      c.after = row;
      shown.push({ c, row });
      set((s) => applyToState(s, c.table, row));
    }
    if (record) set((s) => ({ past: [...s.past.slice(-99), changes], future: [] }));
    // Start every write now, in order, so a later commit's write to the same row can't land before this one's.
    const results = await Promise.allSettled(shown.map(({ c, row }) => put(c.table as SyncTable, row) as Promise<AnyRow>));
    let failure: unknown = null;
    shown.forEach(({ c, row }, i) => {
      const r = results[i];
      if (r.status === "fulfilled") {
        c.after = r.value;
        // Swap in the saved copy unless a newer edit of the row is already showing.
        set((s) => (currentRow(s, c.table, row.id) === row ? applyToState(s, c.table, r.value) : {}));
        return;
      }
      failure ??= r.reason;
      // Not saved (e.g. storage full): put the screen back to what is stored, unless a newer edit already replaced it.
      const back = c.before ?? { ...row, deleted: true };
      set((s) => (currentRow(s, c.table, row.id) === row ? applyToState(s, c.table, back as AnyRow) : {}));
    });
    if (failure !== null) {
      if (record) set((s) => (s.past[s.past.length - 1] === changes ? { past: s.past.slice(0, -1) } : {}));
      throw failure;
    }
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
      room: get().room.trim(),
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
  async addMarkers(items) {
    const { project, activeSheetId, sheets, catalog } = get();
    const sheet = sheets.find((s) => s.id === activeSheetId);
    if (!project || !sheet) return [];
    // Default home-run closet: the project's equipment closet (same floor first).
    const eq = defaultCloset(get().closets, sheet.id);
    // Labels number on from each other within the batch.
    const markers = [...get().markers];
    const out: Marker[] = [];
    for (const { deviceTypeId, x, y, extra } of items) {
      const type = catalog.find((d) => d.id === deviceTypeId);
      if (!type) continue;
      const m: Marker = {
        id: newId(),
        projectId: project.id,
        sheetId: sheet.id,
        deviceTypeId,
        x,
        y,
        label: nextLabel(type, sheet, sheets, markers),
        room: get().room.trim(),
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
      markers.push(m);
      out.push(m);
    }
    if (out.length) await get().commit(out.map((m) => ({ table: "markers", before: null, after: m })));
    return out;
  },
  async updateMarker(id, patch) {
    const before = get().markers.find((m) => m.id === id);
    if (!before) return;
    const after = { ...before, ...patch };
    const changes: Change[] = [{ table: "markers", before, after }];
    // Keep an attached home-run line in sync when the device moves or changes closet/wire.
    if ("x" in patch || "y" in patch || "closetId" in patch || "wireType" in patch || "wires" in patch || "tentative" in patch) {
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
    const n = closets.filter((c) => c.kind === kind).length;
    const base = closetMeta(kind).name;
    const c: Closet = {
      id: newId(),
      projectId: project.id,
      sheetId: sheet.id,
      kind,
      x,
      y,
      name: n ? `${base} ${n + 1}` : base,
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
    if (get().multi.length) return get().deleteMarkers(get().multi);
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
  async rotateSheetCW(id, imageId, width, height) {
    const before = get().sheets.find((s) => s.id === id);
    if (!before) return;
    const rot = (x: number, y: number): [number, number] => [1 - y, x];
    const changes: Change[] = [{ table: "sheets", before, after: { ...before, imageId, width, height, imageUrl: null } }];
    for (const m of get().markers.filter((mm) => mm.sheetId === id)) {
      const [x, y] = rot(m.x, m.y);
      changes.push({ table: "markers", before: m, after: { ...m, x, y } });
    }
    for (const c of get().closets.filter((cc) => cc.sheetId === id)) {
      const [x, y] = rot(c.x, c.y);
      changes.push({ table: "closets", before: c, after: { ...c, x, y } });
    }
    for (const r of get().runs.filter((rr) => rr.sheetId === id)) {
      const points: number[] = [];
      for (let i = 0; i + 1 < r.points.length; i += 2) points.push(...rot(r.points[i], r.points[i + 1]));
      changes.push({ table: "runs", before: r, after: { ...r, points } });
    }
    await get().commit(changes);
    await rotateSheetMeasurements(id, before.imageId);
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
  async saveRow(table, row) {
    const list = get()[tableKey[table] as ListKey] as AnyRow[];
    const before = list.find((r) => r.id === row.id) ?? null;
    const changes: Change[] = [{ table, before, after: row }];
    await get().commit(changes);
    return changes[0].after as typeof row;
  },
  async removeRows(table, ids) {
    const list = get()[tableKey[table] as ListKey] as AnyRow[];
    const changes: Change[] = list.filter((r) => ids.includes(r.id)).map((r) => ({ table, before: r, after: { ...r, deleted: true } }));
    // Deleting photos also deletes their comments (same as the iPad app), in the same undo step.
    if (table === "photos")
      for (const c of get().photoComments)
        if (!c.deleted && ids.includes(c.photoId)) changes.push({ table: "photoComments", before: c, after: { ...c, deleted: true } });
    if (changes.length) await get().commit(changes);
  },
  async autoHomeRuns(sheetId, markerId) {
    const s = get();
    const changes: Change[] = [];
    const typeOf = (id: string) => s.catalog.find((d) => d.id === id);
    for (const m of s.markers) {
      if (sheetId && m.sheetId !== sheetId) continue;
      if (markerId && m.id !== markerId) continue;
      if (!markerCables(m).length || typeOf(m.deviceTypeId)?.kind === "led") continue;
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

function currentRow(s: EditorState, table: EntityTable, id: string): AnyRow | undefined {
  if (table === "projects") return s.project?.id === id ? s.project : undefined;
  return (s[tableKey[table] as ListKey] as AnyRow[]).find((r) => r.id === id);
}

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
    // A device with several cables (HDMI + Cat6…) gets one home run carrying the bundle.
    wireType: markerCables(m)[0] ?? m.wireType,
    wireTypes: markerCables(m).length > 1 ? markerCables(m) : null,
    tentative: m.tentative,
    measuredFt: estimateHomeRunFt(m, closet, s.sheets, pricing),
    deleted: false,
  };
}
