// Tasks pinned on the plan (Fieldwire-style punch / issues). Pure: no browser, database or React, so the web screens,
// the PDF and the tests share it; the iPad app mirrors it in PinPlanCore (Tasks.swift, same fixtures in TaskTests.swift).
// Tasks never affect the takeoff or the estimate, and never carry prices.
import { taskBucket, type TaskBucket } from "./fieldDocs";
import { TONE_HEX } from "./statusStyle";
import type { TeamRole } from "./teamLogic";
import type { Checklist, ChecklistItem, Marker, Photo, PhotoComment, PlanTask, TaskEvent, TaskPriority, TaskStatus } from "./types";

export const STATUSES: { id: TaskStatus; label: string; short: string; color: string }[] = [
  { id: "open", label: "Open", short: "Open", color: "#dc2626" },
  { id: "in_progress", label: "In progress", short: "In progress", color: TONE_HEX.warn },
  { id: "ready", label: "Ready for review", short: "Review", color: "#7c3aed" },
  { id: "done", label: "Completed", short: "Completed", color: "#16a34a" },
  { id: "verified", label: "Verified", short: "Verified", color: "#2563eb" },
];

export const PRIORITIES: { id: TaskPriority; label: string; name: string; color: string }[] = [
  { id: 1, label: "P1", name: "High", color: "#dc2626" },
  { id: 2, label: "P2", name: "Medium", color: "#d97706" },
  { id: 3, label: "P3", name: "Low", color: "#64748b" },
];

export const statusInfo = (s: TaskStatus | string | null | undefined) => STATUSES.find((x) => x.id === s) ?? STATUSES[0];
export const priorityInfo = (p: number | null | undefined) => PRIORITIES.find((x) => x.id === p) ?? null;
/** Completed or verified: no longer on anyone's list. */
export const isClosed = (s: TaskStatus | string | null | undefined) => s === "done" || s === "verified";
export const taskLabel = (t: Pick<PlanTask, "number">) => `#${t.number}`;

/** Grey for deleted tasks and pins greyed out by a filter. */
export const PIN_GREY = "#94a3b8";

/** Colour of the task's pin on the plan: its status colour. */
export function taskPinColor(t: Pick<PlanTask, "status" | "deleted">): string {
  return t.deleted ? PIN_GREY : statusInfo(t.status).color;
}

/** Where the task is: pinned (sheet + spot), on a sheet with no spot (drawn as a diamond in the sheet list), or general. */
export function taskPlacement(t: Pick<PlanTask, "sheetId" | "x" | "y">): "pin" | "sheet" | "general" {
  if (!t.sheetId) return "general";
  return t.x != null && t.y != null && Number.isFinite(t.x) && Number.isFinite(t.y) ? "pin" : "sheet";
}

/** Next number in a job: highest so far (deleted ones included, so a number is never reused on this device) + 1. */
export function nextTaskNumber(tasks: Pick<PlanTask, "number">[]): number {
  let max = 0;
  for (const t of tasks) if (Number.isFinite(t.number) && t.number > max) max = t.number;
  return max + 1;
}

// ---------------- quick entry ----------------

export interface QuickEntry {
  title: string;
  category?: string;
  priority?: TaskPriority;
  assignee?: string;
  tags: string[];
}

/**
 * "Fix ceiling @Electrical @P1 @Mike #level2" → title "Fix ceiling", category Electrical, priority 1, assignee Mike, tags [level2].
 * @P1–@P3 set the priority; another @word picks the first category, else the first person, whose name (or any word of it)
 * starts with it, case-insensitive (exact matches first). An @word that matches nothing stays in the title.
 */
export function parseQuickEntry(text: string, opts: { categories?: string[]; people?: string[] } = {}): QuickEntry {
  const categories = (opts.categories ?? []).filter((c) => c.trim());
  const people = (opts.people ?? []).filter((p) => p.trim());
  const out: QuickEntry = { title: "", tags: [] };
  const keep: string[] = [];
  for (const tok of text.split(/\s+/).filter(Boolean)) {
    if (tok.length > 1 && tok.startsWith("#")) {
      const tag = tok.slice(1).replace(/[.,;:!?]+$/, "");
      if (tag && !out.tags.some((t) => t.toLowerCase() === tag.toLowerCase())) out.tags.push(tag);
      continue;
    }
    if (tok.length > 1 && tok.startsWith("@")) {
      const word = tok.slice(1).replace(/[.,;:!?]+$/, "");
      const pm = /^p([1-3])$/i.exec(word);
      if (pm) {
        out.priority ??= Number(pm[1]) as TaskPriority;
        continue;
      }
      const cat = matchName(word, categories);
      if (cat) {
        out.category ??= cat;
        continue;
      }
      const who = matchName(word, people);
      if (who) {
        out.assignee ??= who;
        continue;
      }
    }
    keep.push(tok);
  }
  out.title = keep.join(" ").trim();
  return out;
}

/** The first name that equals `word`, else whose text or any word of it starts with `word` (case-insensitive). */
function matchName(word: string, names: string[]): string | undefined {
  const w = word.toLowerCase();
  if (!w) return undefined;
  const norm = (s: string) => s.trim().toLowerCase();
  return (
    names.find((n) => norm(n) === w) ??
    names.find((n) => norm(n).replace(/\s+/g, "").startsWith(w) || norm(n).split(/[\s/&-]+/).some((part) => part.startsWith(w)))
  );
}

// ---------------- changes and history ----------------

/** What can be changed through applyTaskChange (id, project, number and history are managed here). */
export type TaskPatch = Partial<Omit<PlanTask, "id" | "projectId" | "number" | "activity" | "createdAt" | "updatedAt">>;

let evSeq = 0;
const defaultEventId = () => `ev${Date.now().toString(36)}${(evSeq++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

const FIELD_NAMES: Partial<Record<keyof PlanTask, string>> = {
  title: "title",
  description: "description",
  due: "due date",
  startDate: "start date",
  priority: "priority",
  category: "category",
  room: "room",
  tags: "tags",
  watchers: "watchers",
  markerId: "device",
};

const show = (k: keyof PlanTask, v: unknown): string => {
  if (v == null || v === "" || (Array.isArray(v) && !v.length)) return "";
  if (k === "priority") return priorityInfo(v as number)?.label ?? String(v);
  if (k === "status") return statusInfo(v as string).label;
  return Array.isArray(v) ? v.join(", ") : String(v);
};
const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/**
 * Apply a change and append one history line per changed attribute (status, assignee, due, priority, category,
 * checklist, photos, position…). Entering Completed sets closedAt; entering Verified sets verifiedBy/At (and closedAt if
 * missing); reopening clears them. Returns the task unchanged (same object) when nothing differs.
 */
export function applyTaskChange(task: PlanTask, patch: TaskPatch, by: string, at: string, newId: () => string = defaultEventId): PlanTask {
  const events: TaskEvent[] = [];
  const ev = (e: Omit<TaskEvent, "id" | "at" | "by">) => events.push({ id: newId(), at, by, ...e });
  const next: PlanTask = { ...task };
  let changed = false;
  let moved = false;

  for (const key of Object.keys(patch) as (keyof TaskPatch)[]) {
    const before = task[key];
    const after = patch[key];
    if (same(before, after)) continue;
    (next as unknown as Record<string, unknown>)[key] = after;
    changed = true;
    if (key === "status") ev({ kind: "status", from: String(before ?? ""), to: String(after ?? "") });
    else if (key === "assignee") ev({ kind: "assign", from: show(key, before), to: show(key, after) });
    else if (key === "checklist") ev({ kind: "checklist", text: checklistChangeText((before as ChecklistItem[] | null) ?? [], (after as ChecklistItem[] | null) ?? []) });
    else if (key === "photoIds") {
      const a = new Set((before as string[] | null) ?? []);
      const b = new Set((after as string[] | null) ?? []);
      const added = [...b].filter((x) => !a.has(x)).length;
      const removed = [...a].filter((x) => !b.has(x)).length;
      ev({ kind: "photo", text: [added ? `Added ${added} photo${added === 1 ? "" : "s"}` : "", removed ? `Removed ${removed} photo${removed === 1 ? "" : "s"}` : ""].filter(Boolean).join(", ") || "Reordered photos" });
    } else if (key === "x" || key === "y" || key === "sheetId") moved = true;
    else if (FIELD_NAMES[key]) ev({ kind: "field", text: FIELD_NAMES[key], from: show(key, before), to: show(key, after) });
    // Other keys (closedAt, verifiedBy…) change silently.
  }
  if (moved) ev({ kind: "field", text: task.x == null && next.x != null ? "placed on the plan" : next.x == null ? "removed from the plan" : "moved the pin" });
  if (!changed) return task;

  if (next.status !== task.status) {
    if (next.status === "done" && !task.closedAt) next.closedAt = at;
    if (next.status === "verified") {
      next.verifiedBy = by;
      next.verifiedAt = at;
      next.closedAt = task.closedAt ?? at;
    } else {
      if (task.status === "verified") {
        next.verifiedBy = null;
        next.verifiedAt = null;
      }
      if (!isClosed(next.status)) next.closedAt = null;
    }
  }
  next.activity = [...(task.activity ?? []), ...events];
  next.updatedAt = at;
  return next;
}

function checklistChangeText(before: ChecklistItem[], after: ChecklistItem[]): string {
  const old = new Map(before.map((i) => [i.id, i]));
  const checked = after.filter((i) => i.done && old.has(i.id) && !old.get(i.id)!.done);
  const unchecked = after.filter((i) => !i.done && old.get(i.id)?.done);
  const added = after.filter((i) => !old.has(i.id)).length;
  const removed = before.filter((i) => !after.some((a) => a.id === i.id)).length;
  const parts: string[] = [];
  if (checked.length === 1) parts.push(`Checked “${checked[0].text}”`);
  else if (checked.length) parts.push(`Checked ${checked.length} items`);
  if (unchecked.length === 1) parts.push(`Unchecked “${unchecked[0].text}”`);
  else if (unchecked.length) parts.push(`Unchecked ${unchecked.length} items`);
  if (added) parts.push(`Added ${added} item${added === 1 ? "" : "s"}`);
  if (removed) parts.push(`Removed ${removed} item${removed === 1 ? "" : "s"}`);
  return parts.join(", ") || "Edited the checklist";
}

/** Add a comment to the task's history. Blank comments are ignored. */
export function addTaskComment(task: PlanTask, text: string, by: string, at: string, newId: () => string = defaultEventId): PlanTask {
  const t = text.trim();
  if (!t) return task;
  return { ...task, activity: [...(task.activity ?? []), { id: newId(), at, by, kind: "comment", text: t }], updatedAt: at };
}

/** A new task (number from nextTaskNumber), with its "created" history line. */
export function newTask(
  input: Partial<PlanTask> & { id: string; projectId: string; number: number; title: string },
  by: string,
  at: string,
  newId: () => string = defaultEventId,
): PlanTask {
  return {
    status: "open",
    ...input,
    title: input.title.trim(),
    createdBy: input.createdBy ?? by,
    createdAt: at,
    updatedAt: at,
    activity: [...(input.activity ?? []), { id: newId(), at, by, kind: "created" }],
  };
}

// ---------------- permissions ----------------

/** Techs move tasks between open / in progress / ready / completed. Only the office (owner, admin, or no team) verifies or reopens a verified task. */
export function canSetStatus(role: TeamRole | null | undefined, from: TaskStatus, to: TaskStatus): boolean {
  if (from === to) return true;
  if (role !== "tech") return true;
  return from !== "verified" && to !== "verified";
}

/** Techs delete only tasks they made; the office deletes any task. */
export function canDeleteTask(role: TeamRole | null | undefined, task: Pick<PlanTask, "createdBy">, me: string): boolean {
  if (role !== "tech") return true;
  return !!task.createdBy && task.createdBy.trim().toLowerCase() === me.trim().toLowerCase();
}

// ---------------- filters ----------------

export type TaskDueFilter = "overdue" | "today" | "week" | "none";

export interface TaskFilter {
  status?: TaskStatus[];
  priority?: TaskPriority[];
  /** Category names (case-insensitive). */
  category?: string[];
  /** People (case-insensitive); "" means unassigned. */
  assignee?: string[];
  /** One sheet; "" = general tasks (no sheet). */
  sheetId?: string | null;
  due?: TaskDueFilter | null;
  text?: string;
  tags?: string[];
}

/** True when the filter hides nothing. */
export function filterIsEmpty(f: TaskFilter): boolean {
  return !f.status?.length && !f.priority?.length && !f.category?.length && !f.assignee?.length && f.sheetId == null && !f.due && !f.text?.trim() && !f.tags?.length;
}

const lc = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();

/** Does this task pass the filter? (Deleted tasks never do.) `today` is YYYY-MM-DD, for the due buckets. */
export function taskMatches(t: PlanTask, f: TaskFilter, today: string): boolean {
  if (t.deleted) return false;
  if (f.status?.length && !f.status.includes(t.status)) return false;
  if (f.priority?.length && !f.priority.includes((t.priority ?? 0) as TaskPriority)) return false;
  if (f.category?.length && !f.category.some((c) => lc(c) === lc(t.category))) return false;
  if (f.assignee?.length && !f.assignee.some((a) => lc(a) === lc(t.assignee))) return false;
  if (f.sheetId != null && (f.sheetId === "" ? !!t.sheetId : t.sheetId !== f.sheetId)) return false;
  if (f.tags?.length && !f.tags.some((g) => (t.tags ?? []).some((x) => lc(x) === lc(g)))) return false;
  if (f.due) {
    const b = taskBucket(t.due, today);
    if (f.due === "none" && b !== "none") return false;
    // Overdue means still open past its date; a finished task isn't late.
    if (f.due === "overdue" && (b !== "overdue" || isClosed(t.status))) return false;
    if (f.due === "today" && b !== "today") return false;
    if (f.due === "week" && b !== "today" && b !== "week") return false;
  }
  const q = lc(f.text);
  if (q) {
    const num = /^#?(\d+)$/.exec(q);
    if (num) return t.number === Number(num[1]);
    const hay = [t.title, t.description, t.room, t.category, t.assignee, ...(t.tags ?? [])].map(lc).join(" ");
    if (!q.split(/\s+/).every((w) => hay.includes(w))) return false;
  }
  return true;
}

export function filterTasks(tasks: PlanTask[], f: TaskFilter, today: string): PlanTask[] {
  return tasks.filter((t) => taskMatches(t, f, today));
}

/** Overdue: an open task whose due date has passed. */
export const isOverdue = (t: Pick<PlanTask, "due" | "status">, today: string) => !isClosed(t.status) && taskBucket(t.due, today) === "overdue";

// The filter in the page address (`&tf=`), so it survives a reload: "s=open,ready;p=1;a=Mike;d=overdue;q=cover".
const KEYS: [keyof TaskFilter, string][] = [
  ["status", "s"],
  ["priority", "p"],
  ["category", "c"],
  ["assignee", "a"],
  ["sheetId", "sh"],
  ["due", "d"],
  ["text", "q"],
  ["tags", "t"],
];
const enc = (s: string) => encodeURIComponent(s).replace(/%20/g, "+");
const dec = (s: string) => {
  try {
    return decodeURIComponent(s.replace(/\+/g, " "));
  } catch {
    return s;
  }
};

export function encodeTaskFilter(f: TaskFilter): string {
  const parts: string[] = [];
  for (const [k, short] of KEYS) {
    const v = f[k];
    if (v == null || (Array.isArray(v) && !v.length) || (typeof v === "string" && !v.trim() && k !== "sheetId")) continue;
    parts.push(`${short}:${Array.isArray(v) ? v.map((x) => enc(String(x)).replace(/,/g, "%2C")).join(",") : enc(String(v))}`);
  }
  return parts.join(";");
}

export function decodeTaskFilter(raw: string | null | undefined): TaskFilter {
  const f: TaskFilter = {};
  for (const part of (raw ?? "").split(";")) {
    const i = part.indexOf(":");
    if (i < 1) continue;
    const short = part.slice(0, i);
    const val = part.slice(i + 1);
    const list = () => val.split(",").filter(Boolean).map(dec);
    switch (short) {
      case "s":
        f.status = list().filter((x): x is TaskStatus => STATUSES.some((s) => s.id === x));
        break;
      case "p":
        f.priority = list().map(Number).filter((x): x is TaskPriority => x === 1 || x === 2 || x === 3);
        break;
      case "c":
        f.category = list();
        break;
      case "a":
        f.assignee = val.split(",").map(dec);
        break;
      case "sh":
        f.sheetId = dec(val);
        break;
      case "d":
        if (val === "overdue" || val === "today" || val === "week" || val === "none") f.due = val;
        break;
      case "q":
        f.text = dec(val);
        break;
      case "t":
        f.tags = list();
        break;
    }
  }
  return f;
}

// ---------------- sorting, copying, lists ----------------

export type TaskSort = "number" | "due" | "priority" | "status";

export function sortTasks(tasks: PlanTask[], by: TaskSort): PlanTask[] {
  const byNum = (a: PlanTask, b: PlanTask) => a.number - b.number || a.createdAt.localeCompare(b.createdAt);
  const rank = (s: TaskStatus) => STATUSES.findIndex((x) => x.id === s);
  const cmp: Record<TaskSort, (a: PlanTask, b: PlanTask) => number> = {
    number: byNum,
    due: (a, b) => (a.due ?? "9999").localeCompare(b.due ?? "9999") || byNum(a, b),
    priority: (a, b) => (a.priority ?? 9) - (b.priority ?? 9) || byNum(a, b),
    status: (a, b) => rank(a.status) - rank(b.status) || byNum(a, b),
  };
  return [...tasks].sort(cmp[by]);
}

/**
 * A copy to drop somewhere else: title, description, category, priority, assignee, tags and the checklist (ticks reset).
 * No history, photos or position; the caller gives it a number and drops it on the plan.
 */
export function duplicateTask(task: PlanTask, at: string, opts: { id: string; number: number; by?: string; newItemId?: () => string }): PlanTask {
  const itemId = opts.newItemId ?? (() => `i${Math.random().toString(36).slice(2, 10)}`);
  return {
    id: opts.id,
    projectId: task.projectId,
    number: opts.number,
    title: task.title,
    description: task.description ?? null,
    status: "open",
    priority: task.priority ?? null,
    category: task.category ?? null,
    assignee: task.assignee ?? null,
    tags: task.tags ? [...task.tags] : [],
    checklist: (task.checklist ?? []).map((i) => ({ id: itemId(), text: i.text, ...(i.requiresPhoto ? { requiresPhoto: true } : {}), done: false })),
    sheetId: null,
    x: null,
    y: null,
    photoIds: [],
    activity: [],
    createdBy: opts.by ?? task.createdBy ?? null,
    createdAt: at,
    updatedAt: at,
  };
}

/** Lines pasted into a checklist ("- item", "1. item", "[ ] item"), one item each. */
export function checklistLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*(?:[-*•–]|\d+[.)]|\[[ xX]?\])\s*/, "").trim())
    .filter(Boolean);
}

export interface OpenPlanTask {
  task: PlanTask;
  bucket: TaskBucket;
}

/**
 * Open plan tasks (not completed / verified) for My Tasks, bucketed like checklist tasks (TASK_BUCKETS in fieldDocs).
 * `person` keeps that person's tasks (case-insensitive; a list = any of those names, e.g. myNames()); null keeps
 * everyone's assigned tasks. Sorted by due date then number.
 */
export function openPlanTasksFor(person: string | string[] | null | undefined, tasks: PlanTask[], today: string): OpenPlanTask[] {
  const who = new Set((Array.isArray(person) ? person : [person]).map(lc).filter(Boolean));
  return tasks
    .filter((t) => !t.deleted && !isClosed(t.status) && (who.size ? who.has(lc(t.assignee)) : !!t.assignee?.trim()))
    .map((task) => ({ task, bucket: taskBucket(task.due, today) }))
    .sort((a, b) => (a.task.due ?? "9999").localeCompare(b.task.due ?? "9999") || a.task.number - b.task.number || a.task.createdAt.localeCompare(b.task.createdAt));
}

/** The room of the closest device on the sheet (within `maxDist`, relative units), for a task dropped near it. */
export function nearestRoom(markers: Pick<Marker, "sheetId" | "x" | "y" | "room" | "deleted">[], sheetId: string, x: number, y: number, maxDist = 0.08): string | null {
  let best: { d: number; room: string } | null = null;
  for (const m of markers) {
    if (m.deleted || m.sheetId !== sheetId || !m.room?.trim()) continue;
    const d = Math.hypot(m.x - x, m.y - y);
    if (d <= maxDist && (!best || d < best.d)) best = { d, room: m.room.trim() };
  }
  return best?.room ?? null;
}

/** Category names to offer: the trades' names and categories, then ones already used on the job's tasks. */
export function taskCategoryOptions(fromTrades: string[], tasks: Pick<PlanTask, "category" | "deleted">[]): string[] {
  const out = new Map<string, string>();
  for (const c of [...fromTrades, ...tasks.filter((t) => !t.deleted).map((t) => t.category ?? "")]) {
    const v = c.trim();
    if (v && !out.has(v.toLowerCase())) out.set(v.toLowerCase(), v);
  }
  return [...out.values()];
}

/** Counts per status (live tasks), for the list header and the toolbar badge. */
export function statusCounts(tasks: PlanTask[]): Record<TaskStatus, number> {
  const out: Record<TaskStatus, number> = { open: 0, in_progress: 0, ready: 0, done: 0, verified: 0 };
  for (const t of tasks) if (!t.deleted && out[t.status] != null) out[t.status]++;
  return out;
}

/** A history line in words: "Mike changed status Open → Completed". */
export function eventText(e: TaskEvent): string {
  switch (e.kind) {
    case "created":
      return e.text || "created the task";
    case "comment":
      return e.text ?? "";
    case "status":
      return `changed status ${statusInfo(e.from).label} → ${statusInfo(e.to).label}`;
    case "assign":
      return e.to ? `assigned ${e.to}` : `unassigned ${e.from || ""}`.trim();
    case "field":
      if (e.from === undefined && e.to === undefined) return e.text ?? "edited";
      return e.to ? `set ${e.text} to ${e.to}` : `cleared ${e.text}`;
    default:
      return e.text ?? "";
  }
}

// ---------------- who am I, Mine, Today ----------------

/** Statuses that are still on someone's list (not Completed / Verified). */
export const OPEN_STATUSES: TaskStatus[] = STATUSES.filter((s) => !isClosed(s.id)).map((s) => s.id);

/**
 * Every name the signed-in person goes by, so "Mine" finds tasks assigned under any of them: the name on this device
 * (getAuthor), their team member label (matched by user id) and their email's first part. One entry per name
 * (case-insensitive), in that order; the first is the name to show and to stamp on new work.
 */
export function myNames(input: {
  author?: string | null;
  email?: string | null;
  userId?: string | null;
  members?: { userId?: string | null; name?: string | null; email?: string | null }[];
}): string[] {
  const out = new Map<string, string>();
  const add = (n?: string | null) => {
    const t = n?.trim();
    if (t && !out.has(t.toLowerCase())) out.set(t.toLowerCase(), t);
  };
  add(input.author);
  const m = input.userId ? input.members?.find((x) => x.userId === input.userId) : undefined;
  if (m) add(m.name?.trim() || m.email?.split("@")[0]);
  add(input.email?.split("@")[0]);
  return [...out.values()];
}

/** Is this name one of mine (case-insensitive)? */
export const isMyName = (name: string | null | undefined, names: string[]) => !!lc(name) && names.some((n) => lc(n) === lc(name));

/** The job list's "Mine" filter: open tasks assigned to any of my names. Same count as openPlanTasksFor(names) on /tasks. */
export const mineOpenFilter = (names: string[]): TaskFilter => ({ assignee: [...names], status: [...OPEN_STATUSES] });

/** Is the filter's person exactly me (all of my names and nobody else)? */
export function isMineFilter(f: TaskFilter, names: string[]): boolean {
  const a = f.assignee ?? [];
  return a.length > 0 && a.every((x) => isMyName(x, names)) && names.every((n) => isMyName(n, a));
}

/** My open tasks that are overdue or due today, overdue first (the Today card). */
export function myTasksDueNow(tasks: PlanTask[], names: string[], today: string): OpenPlanTask[] {
  if (!names.length) return [];
  return openPlanTasksFor(names, tasks, today).filter((t) => t.bucket === "overdue" || t.bucket === "today");
}

/** Office view of /tasks: overdue first, then by due date (no date last), then number. */
export function sortOverdueFirst(list: OpenPlanTask[]): OpenPlanTask[] {
  const order: TaskBucket[] = ["overdue", "today", "week", "later", "none"];
  return [...list].sort(
    (a, b) => order.indexOf(a.bucket) - order.indexOf(b.bucket) || (a.task.due ?? "9999").localeCompare(b.task.due ?? "9999") || a.task.number - b.task.number,
  );
}

// ---------------- one task model: tasks made from photos, forms, checklists and devices ----------------

/** History text on a task made from a photo comment; the comment id rides in `to`, so the comment shows "Task #n". */
const FROM_COMMENT = "made it from a photo comment";

/** A new task's fields from a photo comment: its text (or an edit), the photo attached, the photo's sheet, room and device. */
export function taskFromComment(
  comment: Pick<PhotoComment, "text" | "author" | "photoId">,
  photo: Pick<Photo, "sheetId" | "room" | "markerId"> | null | undefined,
  opts: { text?: string | null; assignee?: string | null; due?: string | null } = {},
): Pick<PlanTask, "title" | "description" | "assignee" | "due" | "photoIds" | "sheetId" | "room" | "markerId"> {
  return {
    title: (opts.text ?? "").trim() || comment.text.trim(),
    description: comment.author?.trim() ? `From ${comment.author.trim()}’s photo comment` : "From a photo comment",
    assignee: opts.assignee?.trim() || null,
    due: opts.due && /^\d{4}-\d{2}-\d{2}$/.test(opts.due) ? opts.due : null,
    photoIds: [comment.photoId],
    sheetId: photo?.sheetId ?? null,
    room: photo?.room?.trim() || null,
    markerId: photo?.markerId ?? null,
  };
}

/** The "created" history line for a task made from a photo comment (pass it as `activity` to newTask). */
export const createdFromComment = (commentId: string, by: string, at: string, id: string): TaskEvent => ({ id, at, by, kind: "created", text: FROM_COMMENT, to: commentId });

/** The live task a photo comment was already turned into, if any. */
export function commentPlanTask(tasks: PlanTask[], comment: Pick<PhotoComment, "id">): PlanTask | undefined {
  return tasks.find((t) => !t.deleted && (t.activity ?? []).some((e) => e.kind === "created" && e.to === comment.id));
}

/** Description on tasks made from a form's "No" answers (also how a second tap skips the ones already made). */
export const formTaskNote = (formName: string) => `From form “${formName.trim()}”`;

/**
 * New tasks for a form's "No" answers (failedItems in forms/forms.ts): one per answer, skipping answers that already
 * have a live task from this form. The caller numbers and saves them.
 */
export function formTaskDrafts(
  tasks: PlanTask[],
  form: { name: string; sheetId?: string | null; markerId?: string | null },
  failed: { text: string }[],
): Pick<PlanTask, "title" | "description" | "sheetId" | "markerId">[] {
  const note = formTaskNote(form.name);
  const have = new Set(tasks.filter((t) => !t.deleted && t.description === note).map((t) => lc(t.title)));
  const out: Pick<PlanTask, "title" | "description" | "sheetId" | "markerId">[] = [];
  for (const f of failed) {
    const title = f.text.trim();
    if (!title || have.has(lc(title))) continue;
    have.add(lc(title));
    out.push({ title, description: note, sheetId: form.sheetId ?? null, markerId: form.markerId ?? null });
  }
  return out;
}

/** A task's fields from a checklist item ("Make task"): its text, due date and the photos taken for it. */
export function taskFromChecklistItem(
  checklist: Pick<Checklist, "name">,
  item: Pick<ChecklistItem, "text" | "due" | "photoId">,
  photoIds: string[] = [],
): Pick<PlanTask, "title" | "description" | "due" | "photoIds"> {
  return {
    title: item.text.trim(),
    description: `From checklist “${checklist.name.trim()}”`,
    due: item.due ?? null,
    photoIds: [...new Set([...(item.photoId ? [item.photoId] : []), ...photoIds])],
  };
}

/** A task's fields for a device set to Issue ("Create task for this"), pinned where the device is. */
export function taskFromDevice(
  device: Pick<Marker, "id" | "sheetId" | "x" | "y" | "room">,
  label: string,
  note?: string | null,
): Pick<PlanTask, "title" | "description" | "sheetId" | "x" | "y" | "room" | "markerId"> {
  return {
    title: `Fix ${label.trim() || "device"}`,
    description: note?.trim() || null,
    sheetId: device.sheetId,
    x: device.x,
    y: device.y,
    room: device.room?.trim() || null,
    markerId: device.id,
  };
}
