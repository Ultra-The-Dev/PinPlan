"use client";
// The open job's plan tasks and the task screens' shared UI state (selection, drop mode, filters).
// Kept out of the editor store (src/lib/store.ts) on purpose: tasks never change counts or undo history.
import { useEffect, useMemo } from "react";
import { create } from "zustand";
import { db, newId, nowIso, put, putMany } from "@/lib/db";
import { letterShortcutsOn, planKeyBlocked } from "@/lib/planOverlays";
import { applyTaskChange, nextTaskNumber, type TaskFilter, type TaskPatch } from "@/lib/tasks";
import type { PlanTask } from "@/lib/types";

/** Waiting for a tap on the plan: a new task, a duplicate to place, or a task to (re)place. */
export type DropMode = { kind: "new" } | { kind: "duplicate"; source: PlanTask } | { kind: "move"; id: string } | null;

/** A spot picked on the plan, waiting for the quick-create sheet (sheetId null = general task). */
export interface QuickDraft {
  sheetId: string | null;
  x: number | null;
  y: number | null;
  room?: string | null;
  /** Prefilled from where the task was started (e.g. a device set to Issue). */
  title?: string;
  description?: string | null;
  markerId?: string | null;
}

interface TaskState {
  projectId: string | null;
  tasks: PlanTask[];
  loaded: boolean;
  /** Filter for the pins on the plan (the Field → Tasks list keeps its own in the address). */
  filter: TaskFilter;
  showPins: boolean;
  greyOthers: boolean;
  selectedId: string | null;
  detailId: string | null;
  drop: DropMode;
  quick: QuickDraft | null;

  load(projectId: string): Promise<void>;
  /** Save a new or changed task (local-first; queued for sync). */
  save(task: PlanTask): Promise<PlanTask>;
  /** Apply a change with its history lines (applyTaskChange), reading the latest copy first. */
  change(id: string, patch: TaskPatch, by: string): Promise<PlanTask | null>;
  /** The same change on several tasks (bulk edit). */
  changeMany(ids: string[], patch: (t: PlanTask) => TaskPatch, by: string): Promise<number>;
  softDelete(ids: string[]): Promise<void>;
  nextNumber(): number;
  setFilter(f: TaskFilter): void;
  set(p: Partial<Pick<TaskState, "showPins" | "greyOthers" | "selectedId" | "detailId" | "quick">>): void;
  arm(drop: DropMode): void;
}

let loadSeq = 0;

/** Fired after tasks are saved here or on /tasks, so the Today card and the board refresh. */
export const TASKS_EVENT = "pinplan:tasks";
export const tasksChanged = () => {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(TASKS_EVENT));
};

export const useTasks = create<TaskState>((set, get) => ({
  projectId: null,
  tasks: [],
  loaded: false,
  filter: {},
  showPins: true,
  greyOthers: false,
  selectedId: null,
  detailId: null,
  drop: null,
  quick: null,

  async load(projectId) {
    const seq = ++loadSeq;
    const rows = await db().tasks.where("projectId").equals(projectId).toArray();
    if (seq !== loadSeq) return;
    const same = get().projectId === projectId;
    set({
      projectId,
      tasks: rows.sort((a, b) => a.number - b.number || a.createdAt.localeCompare(b.createdAt)),
      loaded: true,
      ...(same ? {} : { selectedId: null, detailId: null, quick: null, filter: {} }),
    });
  },
  async save(task) {
    const saved = await put("tasks", task);
    set({ tasks: upsert(get().tasks, saved) });
    tasksChanged();
    return saved;
  },
  async change(id, patch, by) {
    const cur = (await db().tasks.get(id)) ?? get().tasks.find((t) => t.id === id);
    if (!cur) return null;
    const next = applyTaskChange(cur, patch, by, nowIso(), newId);
    if (next === cur) return cur;
    return get().save(next);
  },
  async changeMany(ids, patch, by) {
    const now = nowIso();
    const rows = (await db().tasks.bulkGet(ids)).filter((t): t is PlanTask => !!t && !t.deleted);
    const changed = rows.map((t) => applyTaskChange(t, patch(t), by, now, newId)).filter((t, i) => t !== rows[i]);
    if (!changed.length) return 0;
    const saved = await putMany("tasks", changed);
    let list = get().tasks;
    for (const t of saved) list = upsert(list, t);
    set({ tasks: list });
    tasksChanged();
    return saved.length;
  },
  async softDelete(ids) {
    const rows = (await db().tasks.bulkGet(ids)).filter((t): t is PlanTask => !!t);
    if (!rows.length) return;
    const saved = await putMany("tasks", rows.map((t) => ({ ...t, deleted: true })));
    let list = get().tasks;
    for (const t of saved) list = upsert(list, t);
    const gone = new Set(ids);
    set({ tasks: list, selectedId: gone.has(get().selectedId ?? "") ? null : get().selectedId, detailId: gone.has(get().detailId ?? "") ? null : get().detailId });
  },
  nextNumber() {
    return nextTaskNumber(get().tasks);
  },
  setFilter(filter) {
    set({ filter });
  },
  set(p) {
    set(p);
  },
  arm(drop) {
    set({ drop, ...(drop ? { quick: null } : {}) });
  },
}));

/**
 * Shift+T drops a task. The plan's shared rules decide when shortcuts are off (planKeyBlocked: a modal or dialog is
 * open, or the key is in a text field; letters switched off on "?"); holding the key down doesn't toggle it over and over.
 */
export function isTaskDropKey(e: Pick<KeyboardEvent, "key" | "shiftKey" | "metaKey" | "ctrlKey" | "altKey" | "repeat"> & { target: EventTarget | null }): boolean {
  if (!e.shiftKey || e.metaKey || e.ctrlKey || e.altKey || e.repeat || e.key.toLowerCase() !== "t") return false;
  return !planKeyBlocked(e) && letterShortcutsOn();
}

/** A pin being dragged on the plan (relative position), drawn there until the move is saved. */
export const useTaskDrag = create<{ drag: { id: string; x: number; y: number } | null }>(() => ({ drag: null }));

function upsert(list: PlanTask[], t: PlanTask): PlanTask[] {
  const i = list.findIndex((x) => x.id === t.id);
  const next = i < 0 ? [...list, t] : list.map((x) => (x.id === t.id ? t : x));
  return next.sort((a, b) => a.number - b.number || a.createdAt.localeCompare(b.createdAt));
}

/** Live (not deleted) tasks of the open job, loaded on mount and after each sync. */
export function useProjectTasks(projectId: string | null | undefined): PlanTask[] {
  const all = useTasks((s) => (s.projectId === projectId ? s.tasks : EMPTY));
  const tasks = useMemo(() => all.filter((t) => !t.deleted), [all]);
  useEffect(() => {
    if (!projectId) return;
    const reload = () => void useTasks.getState().load(projectId);
    reload();
    window.addEventListener("pinplan:synced", reload);
    return () => window.removeEventListener("pinplan:synced", reload);
  }, [projectId]);
  return tasks;
}
const EMPTY: PlanTask[] = [];
