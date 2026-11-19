"use client";
// Saved measurements: the job's rows in a small zustand store, read from and written to Dexie (local-first, synced
// like every other job table). Kept apart from the editor store on purpose (docs/saved-measurements.md).
import { create } from "zustand";
import { db, newId, nowIso, put, putMany } from "./db";
import { cleanPoints, rotatePointsCW } from "./measure";
import type { Measurement, MeasurementKind } from "./types";

// Same as sync.ts SYNCED_EVENT (not imported, so the editor store doesn't pull in the sync engine).
const SYNCED_EVENT = "pinplan:synced";

interface MeasurementsState {
  projectId: string | null;
  rows: Measurement[];
  loaded: boolean;
  /** Load (or reload) a job's measurements. Cheap to call repeatedly for the same job. */
  load(projectId: string, force?: boolean): Promise<void>;
  /** Save a new measurement; returns null when it has too few points. */
  add(m: { projectId: string; sheetId: string; kind: MeasurementKind; points: number[]; label?: string | null; color?: string | null; author?: string | null }): Promise<Measurement | null>;
  update(id: string, patch: Partial<Omit<Measurement, "id" | "projectId" | "createdAt">>): Promise<void>;
  remove(id: string): Promise<void>;
  /** Put a deleted measurement back (undo). */
  restore(row: Measurement): Promise<void>;
}

let loadSeq = 0;

export const useMeasurements = create<MeasurementsState>((set, get) => ({
  projectId: null,
  rows: [],
  loaded: false,
  async load(projectId, force = false) {
    if (!force && get().projectId === projectId && get().loaded) return;
    const seq = ++loadSeq;
    if (get().projectId !== projectId) set({ projectId, rows: [], loaded: false });
    const rows = (await db().measurements.where("projectId").equals(projectId).toArray()).filter((m) => !m.deleted).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    if (seq === loadSeq) set({ projectId, rows, loaded: true });
  },
  async add(m) {
    const points = cleanPoints(m.kind, m.points);
    if (!points) return null;
    const now = nowIso();
    const row = await put<Measurement>("measurements", {
      id: newId(),
      projectId: m.projectId,
      sheetId: m.sheetId,
      kind: m.kind,
      points,
      label: m.label?.trim() || null,
      color: m.color ?? null,
      extraFt: null,
      wastePct: null,
      notes: null,
      author: m.author ?? null,
      createdAt: now,
      updatedAt: now,
      deleted: false,
    });
    loadSeq++;
    if (get().projectId === m.projectId) set({ rows: [...get().rows, row] });
    return row;
  },
  async update(id, patch) {
    const cur = get().rows.find((r) => r.id === id) ?? (await db().measurements.get(id));
    if (!cur) return;
    const row = await put<Measurement>("measurements", { ...cur, ...patch });
    loadSeq++;
    set({ rows: row.deleted ? get().rows.filter((r) => r.id !== id) : get().rows.map((r) => (r.id === id ? row : r)) });
  },
  async remove(id) {
    await get().update(id, { deleted: true });
  },
  async restore(row) {
    const r = await put<Measurement>("measurements", { ...row, deleted: false });
    loadSeq++;
    if (get().projectId === r.projectId) set({ rows: [...get().rows.filter((x) => x.id !== r.id), r].sort((a, b) => a.createdAt.localeCompare(b.createdAt)) });
  },
}));

// Rows pulled from the cloud: reload the open job.
if (typeof window !== "undefined") {
  window.addEventListener(SYNCED_EVENT, (e) => {
    const d = (e as CustomEvent<{ tables?: string[]; projectIds?: string[] }>).detail;
    const pid = useMeasurements.getState().projectId;
    if (pid && (!d?.tables || d.tables.includes("measurements"))) void useMeasurements.getState().load(pid, true);
  });
}

/** The sheet image was rotated 90° clockwise: turn its measurements with it (called from the editor's rotateSheetCW). */
export async function rotateSheetMeasurements(sheetId: string): Promise<void> {
  const rows = (await db().measurements.where("sheetId").equals(sheetId).toArray()).filter((m) => !m.deleted);
  if (!rows.length) return;
  const saved = await putMany<Measurement>("measurements", rows.map((m) => ({ ...m, points: rotatePointsCW(m.points) })));
  const byId = new Map(saved.map((r) => [r.id, r]));
  loadSeq++;
  useMeasurements.setState((s) => ({ rows: s.rows.map((r) => byId.get(r.id) ?? r) }));
}
