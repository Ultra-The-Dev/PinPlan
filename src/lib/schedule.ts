// Job schedule: phases with dates, crew, planned hours, % complete and finish-to-start dependencies (with lag).
// Pure (no browser, no Dexie) so it runs in tests and mirrors cleanly to the iPad app. See docs/schedule-lookahead.md.
//
// Days are local calendar days as "YYYY-MM-DD" strings; `end` is inclusive. Day math is done on whole UTC days so
// daylight-saving changes can't shift a date. Items with `workdaysOnly` (the default) skip Saturdays and Sundays.
// Holidays are out of scope.
import type { TeamRole } from "./teamLogic";
import { normalizeTrades } from "./trades";
import type { ScheduleItem, TradeId } from "./types";

const DAY_MS = 86_400_000;
const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** "2026-11-23" → days since 1970-01-01 (NaN when malformed). */
export function dayNum(day: string): number {
  const m = DAY_RE.exec(day);
  if (!m) return NaN;
  return Math.round(Date.UTC(+m[1], +m[2] - 1, +m[3]) / DAY_MS);
}

/** Days since 1970-01-01 → "2026-11-23". */
export function dayStr(n: number): string {
  return new Date(n * DAY_MS).toISOString().slice(0, 10);
}

export const isDay = (s: unknown): s is string => typeof s === "string" && Number.isFinite(dayNum(s));

/** 0 = Sunday … 6 = Saturday. */
export const weekday = (day: string | number): number => new Date((typeof day === "number" ? day : dayNum(day)) * DAY_MS).getUTCDay();
export const isWeekend = (day: string | number): boolean => {
  const w = weekday(day);
  return w === 0 || w === 6;
};

/** Calendar days between two days (b − a). */
export const daysBetween = (a: string, b: string): number => dayNum(b) - dayNum(a);
export const addDays = (day: string, n: number): string => dayStr(dayNum(day) + n);

/** The day itself, or the next Monday when it falls on a weekend (only when `workdaysOnly`). */
export function rollToWorkday(day: string, workdaysOnly = true): string {
  if (!workdaysOnly) return day;
  let n = dayNum(day);
  while (isWeekend(n)) n++;
  return dayStr(n);
}

/**
 * `n` working days after `day` (negative: before). With `workdaysOnly` false it's plain calendar days.
 * Starting on a weekend counts from that weekend: addWorkdays(Sat, 1) is Monday.
 */
export function addWorkdays(day: string, n: number, workdaysOnly = true): string {
  if (!workdaysOnly) return addDays(day, n);
  let d = dayNum(day);
  const step = n < 0 ? -1 : 1;
  let left = Math.abs(Math.trunc(n));
  while (left > 0) {
    d += step;
    if (!isWeekend(d)) left--;
  }
  return dayStr(d);
}

/** Working days from `a` to `b`, both included (0 when b < a). Calendar days when `workdaysOnly` is false. */
export function workdaysBetween(a: string, b: string, workdaysOnly = true): number {
  const x = dayNum(a);
  const y = dayNum(b);
  if (!Number.isFinite(x) || !Number.isFinite(y) || y < x) return 0;
  if (!workdaysOnly) return y - x + 1;
  const total = y - x + 1;
  const full = Math.floor(total / 7);
  let n = full * 5;
  for (let d = x + full * 7; d <= y; d++) if (!isWeekend(d)) n++;
  return n;
}

const wd = (i: Pick<ScheduleItem, "workdaysOnly">) => i.workdaysOnly !== false;

/** How long an item takes, in its own days (workdays unless `workdaysOnly` is false). At least 1. */
export function durationDays(item: Pick<ScheduleItem, "start" | "end" | "workdaysOnly">): number {
  return Math.max(1, workdaysBetween(item.start, item.end, wd(item)));
}

/** The calendar days an item covers that count as working days (what it books on the crew board). */
export function itemDays(item: Pick<ScheduleItem, "start" | "end" | "workdaysOnly">): string[] {
  const out: string[] = [];
  const a = dayNum(item.start);
  const b = dayNum(item.end);
  for (let d = a; d <= b && out.length < 3660; d++) if (!wd(item) || !isWeekend(d)) out.push(dayStr(d));
  return out;
}

/** Keep the item's duration and start it on `start` (rolled to a workday). */
export function withStart<T extends ScheduleItem>(item: T, start: string): T {
  const s = rollToWorkday(start, wd(item));
  return { ...item, start: s, end: addWorkdays(s, durationDays(item) - 1, wd(item)) };
}

const live = <T extends { deleted?: boolean }>(xs: T[]) => xs.filter((x) => !x.deleted);

// ---------- dependencies ----------

export interface DepProblems {
  /** Ids of items that sit on a dependency cycle. */
  cycle: string[];
  /** Dependencies that point at a missing or deleted item (ignored everywhere, but worth a warning). */
  missing: { id: string; dep: string }[];
}

/** Predecessor ids of each live item, restricted to live items. */
function predMap(items: ScheduleItem[]): Map<string, { id: string; lag: number }[]> {
  const ids = new Set(items.map((i) => i.id));
  const m = new Map<string, { id: string; lag: number }[]>();
  for (const i of items) m.set(i.id, (i.dependsOn ?? []).filter((d) => d && ids.has(d.id) && d.id !== i.id).map((d) => ({ id: d.id, lag: Number(d.lagDays) || 0 })));
  return m;
}

function succMap(items: ScheduleItem[]): Map<string, string[]> {
  const m = new Map<string, string[]>(items.map((i) => [i.id, []]));
  for (const [id, preds] of predMap(items)) for (const p of preds) m.get(p.id)?.push(id);
  return m;
}

/** Kahn's algorithm over live items: a topological order, and whatever couldn't be ordered (cycles). */
function topo(items: ScheduleItem[]): { order: string[]; stuck: string[] } {
  const preds = predMap(items);
  const succ = succMap(items);
  const indeg = new Map<string, number>();
  for (const i of items) indeg.set(i.id, new Set((preds.get(i.id) ?? []).map((p) => p.id)).size);
  const byStart = [...items].sort((a, b) => a.start.localeCompare(b.start) || (a.sort ?? 0) - (b.sort ?? 0));
  const queue = byStart.filter((i) => indeg.get(i.id) === 0).map((i) => i.id);
  const order: string[] = [];
  const seenEdge = new Set<string>();
  while (queue.length) {
    const id = queue.shift()!;
    order.push(id);
    for (const s of succ.get(id) ?? []) {
      const k = `${id}>${s}`;
      if (seenEdge.has(k)) continue;
      seenEdge.add(k);
      const n = (indeg.get(s) ?? 0) - 1;
      indeg.set(s, n);
      if (n === 0) queue.push(s);
    }
  }
  const done = new Set(order);
  return { order, stuck: items.filter((i) => !done.has(i.id)).map((i) => i.id) };
}

/** Cycles and dangling dependencies among the live items. */
export function validateDeps(items: ScheduleItem[]): DepProblems {
  const all = new Map(items.map((i) => [i.id, i]));
  const xs = live(items);
  const missing: DepProblems["missing"] = [];
  for (const i of xs) for (const d of i.dependsOn ?? []) if (!d?.id || !all.get(d.id) || all.get(d.id)!.deleted) missing.push({ id: i.id, dep: d?.id ?? "" });
  // Items left over by Kahn's algorithm are on a cycle or downstream of one; keep only those on a cycle.
  const stuck = new Set(topo(xs).stuck);
  const preds = predMap(xs.filter((i) => stuck.has(i.id)));
  const onCycle = [...stuck].filter((id) => reaches(preds, id, id));
  return { cycle: onCycle, missing };
}

/** True when following predecessors from `from` reaches `target` (one step at least). */
function reaches(preds: Map<string, { id: string }[]>, from: string, target: string): boolean {
  const seen = new Set<string>();
  const stack = [...(preds.get(from) ?? []).map((p) => p.id)];
  while (stack.length) {
    const id = stack.pop()!;
    if (id === target) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    for (const p of preds.get(id) ?? []) stack.push(p.id);
  }
  return false;
}

/** Would making `id` depend on `depId` create a cycle (including depending on itself)? */
export function wouldCycle(items: ScheduleItem[], id: string, depId: string): boolean {
  if (id === depId) return true;
  return reaches(predMap(live(items)), depId, id);
}

/** Items `id` may depend on without creating a cycle (for the editor's picker). */
export function allowedDeps(items: ScheduleItem[], id: string): ScheduleItem[] {
  return live(items).filter((i) => !wouldCycle(items, id, i.id));
}

/** The earliest day an item may start given one predecessor (finish-to-start + lag, in the item's own days). */
export function earliestAfter(pred: Pick<ScheduleItem, "end" | "workdaysOnly">, lagDays: number, item: Pick<ScheduleItem, "workdaysOnly">): string {
  const lag = Number(lagDays) || 0;
  if (wd(item)) return rollToWorkday(addWorkdays(rollToWorkdayBack(pred.end), 1 + lag, true), true);
  return addDays(pred.end, 1 + lag);
}

/** A weekend end counts from the Friday before (so "ends Sat" + 1 workday is Monday, not Tuesday). */
function rollToWorkdayBack(day: string): string {
  let n = dayNum(day);
  while (isWeekend(n)) n--;
  return dayStr(n);
}

/** All items reachable from `id` through dependents. */
function descendants(items: ScheduleItem[], id: string): Set<string> {
  const succ = succMap(items);
  const out = new Set<string>();
  const stack = [...(succ.get(id) ?? [])];
  while (stack.length) {
    const s = stack.pop()!;
    if (out.has(s)) continue;
    out.add(s);
    stack.push(...(succ.get(s) ?? []));
  }
  return out;
}

/**
 * After `changedId` moved or changed length: push every dependent that now starts too early (before its
 * predecessor's end + 1 + lag) later, keeping its duration. Dependents are never pulled earlier. Returns the rows
 * that changed (new objects); items on a cycle are left alone.
 */
export function cascade(items: ScheduleItem[], changedId: string): ScheduleItem[] {
  const xs = live(items);
  const cur = new Map(xs.map((i) => [i.id, i]));
  if (!cur.has(changedId)) return [];
  const down = descendants(xs, changedId);
  if (!down.size) return [];
  const preds = predMap(xs);
  const changed = new Map<string, ScheduleItem>();
  for (const id of topo(xs).order) {
    if (!down.has(id)) continue;
    const item = cur.get(id)!;
    let need: string | null = null;
    for (const p of preds.get(id) ?? []) {
      const e = earliestAfter(cur.get(p.id)!, p.lag, item);
      if (!need || e > need) need = e;
    }
    if (need && item.start < need) {
      const moved = withStart(item, need);
      cur.set(id, moved);
      changed.set(id, moved);
    }
  }
  return [...changed.values()];
}

/** Move an item by `deltaDays` calendar days (keeping its duration), then cascade. Returns every changed row. */
export function moveItem(items: ScheduleItem[], id: string, deltaDays: number): ScheduleItem[] {
  const item = items.find((i) => i.id === id && !i.deleted);
  if (!item || !deltaDays) return [];
  const raw = addDays(item.start, Math.round(deltaDays));
  // Snap off weekends in the direction of travel, so a 1-day nudge back from Monday lands on Friday.
  let start = raw;
  if (wd(item)) start = deltaDays < 0 ? rollToWorkdayBack(raw) : rollToWorkday(raw);
  if (start === item.start) return [];
  return applyAndCascade(items, withStart(item, start));
}

/** Change an item's end day (rejected — null — when it would end before it starts), then cascade. */
export function resizeItem(items: ScheduleItem[], id: string, newEnd: string): ScheduleItem[] | null {
  const item = items.find((i) => i.id === id && !i.deleted);
  if (!item || !isDay(newEnd) || newEnd < item.start) return null;
  if (newEnd === item.end) return [];
  return applyAndCascade(items, { ...item, end: newEnd });
}

/** Save `next` (an edited copy of one item) and push its dependents: every changed row, `next` first. */
export function applyAndCascade(items: ScheduleItem[], next: ScheduleItem): ScheduleItem[] {
  const list = items.some((i) => i.id === next.id) ? items.map((i) => (i.id === next.id ? next : i)) : [...items, next];
  return [next, ...cascade(list, next.id)];
}

/**
 * Soft-delete `id` and drop the links other live items have to it (so deleting a phase doesn't leave a "waits on a
 * deleted phase" warning behind). Returns the changed rows, the deleted one first; dependents keep their dates.
 */
export function deleteItem(items: ScheduleItem[], id: string): ScheduleItem[] {
  const item = items.find((i) => i.id === id && !i.deleted);
  if (!item) return [];
  const linked = live(items)
    .filter((i) => i.id !== id && (i.dependsOn ?? []).some((d) => d?.id === id))
    .map((i) => ({ ...i, dependsOn: (i.dependsOn ?? []).filter((d) => d?.id !== id) }));
  return [{ ...item, deleted: true }, ...linked];
}

/**
 * What a crew tech may save (canEditSchedule → "progress"): only progress and notes from their edit, applied to the
 * latest copy of the row, so a stale dialog can't overwrite dates, crew or links the office changed meanwhile.
 */
export function crewUpdate(latest: ScheduleItem, edited: Pick<ScheduleItem, "progress" | "notes">): ScheduleItem {
  return { ...latest, progress: pct(edited.progress), notes: edited.notes?.trim() ? edited.notes : null };
}

/** Replace rows in a list by id (for applying a change set). */
export function mergeRows(items: ScheduleItem[], rows: ScheduleItem[]): ScheduleItem[] {
  const m = new Map(rows.map((r) => [r.id, r]));
  const out = items.map((i) => m.get(i.id) ?? i);
  for (const r of rows) if (!items.some((i) => i.id === r.id)) out.push(r);
  return out;
}

/**
 * The longest chain through the dependencies, by working days (plus lags): the phases that push the finish date
 * when they slip. Ids in order. Items on a cycle are ignored.
 */
export function criticalPath(items: ScheduleItem[]): string[] {
  const xs = live(items);
  const preds = predMap(xs);
  const byId = new Map(xs.map((i) => [i.id, i]));
  const best = new Map<string, { len: number; prev: string | null }>();
  for (const id of topo(xs).order) {
    const item = byId.get(id)!;
    let len = 0;
    let prev: string | null = null;
    for (const p of preds.get(id) ?? []) {
      const b = best.get(p.id);
      if (!b) continue;
      const l = b.len + Math.max(0, p.lag);
      if (l > len) {
        len = l;
        prev = p.id;
      }
    }
    best.set(id, { len: len + durationDays(item), prev });
  }
  let end: string | null = null;
  let max = -1;
  for (const [id, b] of best) if (b.len > max || (b.len === max && end && byId.get(id)!.end > byId.get(end)!.end)) [end, max] = [id, b.len];
  const path: string[] = [];
  for (let id = end; id; id = best.get(id)?.prev ?? null) path.unshift(id);
  return path;
}

// ---------- look-ahead, crew board ----------

/** Monday of the week `day` is in. */
export function weekStart(day: string): string {
  const w = weekday(day);
  return addDays(day, w === 0 ? -6 : 1 - w);
}

/** The look-ahead window: Monday of this week through the Sunday `weeks` weeks later. */
export function lookaheadWindow(today: string, weeks = 3): { from: string; to: string } {
  const from = weekStart(today);
  return { from, to: addDays(from, Math.max(1, Math.round(weeks)) * 7 - 1) };
}

/** Live items that touch the look-ahead window (including ones already under way), by start date. */
export function lookahead(items: ScheduleItem[], today: string, weeks = 3): ScheduleItem[] {
  const { from, to } = lookaheadWindow(today, weeks);
  return live(items)
    .filter((i) => i.start <= to && i.end >= from)
    .sort((a, b) => a.start.localeCompare(b.start) || (a.sort ?? 0) - (b.sort ?? 0));
}

/** Items grouped by the Monday of the week they start (or this week, when under way), for the phone agenda. */
export function groupByWeek(items: ScheduleItem[], today?: string): { week: string; items: ScheduleItem[] }[] {
  const thisWeek = today ? weekStart(today) : null;
  const m = new Map<string, ScheduleItem[]>();
  for (const i of [...live(items)].sort((a, b) => a.start.localeCompare(b.start) || (a.sort ?? 0) - (b.sort ?? 0))) {
    let w = weekStart(i.start);
    if (thisWeek && w < thisWeek && i.end >= thisWeek) w = thisWeek;
    (m.get(w) ?? m.set(w, []).get(w)!).push(i);
  }
  return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([week, items]) => ({ week, items }));
}

export const HOURS_PER_DAY = 8;

export interface CrewJob {
  projectId: string;
  itemId: string;
  name: string;
  /** This person's share of the item's planned hours on this day (0 when the item has no hours). */
  hours: number;
}
export interface CrewDay {
  jobs: CrewJob[];
  hours: number;
  /** More than 8 hours, or on more than one job that day. */
  overbooked: boolean;
}
export interface CrewLoad {
  days: string[];
  /** Display names, sorted. */
  people: string[];
  /** cells[person][day]; missing when the person has nothing that day. */
  cells: Record<string, Record<string, CrewDay>>;
}

const personKey = (n: string) => n.trim().toLowerCase();

/**
 * Who works where, per person per day, across jobs (`itemsByJob`: projectId → that job's items). An item's planned
 * hours are spread evenly over its working days and its crew. Names match whatever the capitalisation.
 */
export function crewLoad(itemsByJob: Record<string, ScheduleItem[]>, from: string, to: string): CrewLoad {
  const days: string[] = [];
  for (let d = dayNum(from); d <= dayNum(to) && days.length < 400; d++) days.push(dayStr(d));
  const names = new Map<string, string>();
  const cells: Record<string, Record<string, CrewDay>> = {};
  for (const [projectId, items] of Object.entries(itemsByJob)) {
    for (const i of live(items)) {
      const crew = [...new Map((i.crew ?? []).filter((c) => c?.trim()).map((c) => [personKey(c), c.trim()])).entries()];
      if (!crew.length || i.end < from || i.start > to) continue;
      const on = itemDays(i);
      const perDay = i.hoursPlanned && i.hoursPlanned > 0 ? i.hoursPlanned / on.length / crew.length : 0;
      for (const [k, label] of crew) {
        if (!names.has(k)) names.set(k, label);
        const name = names.get(k)!;
        for (const day of on) {
          if (day < from || day > to) continue;
          const row = (cells[name] ??= {});
          const cell = (row[day] ??= { jobs: [], hours: 0, overbooked: false });
          cell.jobs.push({ projectId, itemId: i.id, name: i.name, hours: perDay });
          cell.hours += perDay;
        }
      }
    }
  }
  for (const row of Object.values(cells))
    for (const cell of Object.values(row)) {
      cell.hours = Math.round(cell.hours * 100) / 100;
      cell.overbooked = cell.hours > HOURS_PER_DAY || new Set(cell.jobs.map((j) => j.projectId)).size > 1;
    }
  return { days, people: [...names.values()].sort((a, b) => a.localeCompare(b)), cells };
}

// ---------- progress ----------

const pct = (p: unknown) => Math.min(100, Math.max(0, Number(p) || 0));

/** Overall % complete: each item's progress weighted by its planned hours (when every item has hours) or duration. */
export function schedulePercent(items: ScheduleItem[]): number {
  const xs = live(items);
  if (!xs.length) return 0;
  const byHours = xs.every((i) => (i.hoursPlanned ?? 0) > 0);
  let w = 0;
  let done = 0;
  for (const i of xs) {
    const weight = byHours ? i.hoursPlanned! : durationDays(i);
    w += weight;
    done += (weight * pct(i.progress)) / 100;
  }
  return w ? Math.round((done / w) * 100) : 0;
}

/** Behind: past its end and not finished, or under way and progress trails elapsed time by more than 25 points. */
export function itemStatus(item: ScheduleItem, today: string): "done" | "late" | "behind" | "active" | "upcoming" {
  const p = pct(item.progress);
  if (p >= 100) return "done";
  if (today > item.end) return "late";
  if (today < item.start) return "upcoming";
  const elapsed = (workdaysBetween(item.start, today, wd(item)) / durationDays(item)) * 100;
  return elapsed - p > 25 ? "behind" : "active";
}

// ---------- templates ----------

export interface PhaseTemplate {
  /** Stable key stored in `ScheduleItem.phase`. */
  phase: string;
  name: string;
  /** Typical working days. */
  days: number;
  /** Typical crew hours for the phase (a starting point; 0 = none). */
  hours: number;
  /** Workdays to wait after the previous phase (e.g. scheduling an inspection). */
  lagDays?: number;
  color: string;
}

export interface ScheduleTemplate {
  trade: TradeId;
  name: string;
  phases: PhaseTemplate[];
}

const C = { blue: "#2563eb", amber: "#d97706", violet: "#7c3aed", teal: "#0d9488", green: "#16a34a", rose: "#e11d48", slate: "#57524c", orange: "#ea580c" };

const TEMPLATES: Record<TradeId, ScheduleTemplate> = {
  lowvoltage: {
    trade: "lowvoltage",
    name: "Low voltage",
    phases: [
      { phase: "prewire", name: "Pre-wire", days: 3, hours: 48, color: C.blue },
      { phase: "rough-inspection", name: "Rough inspection", days: 1, hours: 2, lagDays: 1, color: C.amber },
      { phase: "trim", name: "Trim", days: 2, hours: 32, lagDays: 5, color: C.violet },
      { phase: "programming", name: "Programming", days: 1, hours: 8, color: C.teal },
      { phase: "final", name: "Final / walkthrough", days: 1, hours: 4, color: C.green },
    ],
  },
  electrical: {
    trade: "electrical",
    name: "Electrical",
    phases: [
      { phase: "service", name: "Temp service", days: 1, hours: 8, color: C.slate },
      { phase: "rough-in", name: "Rough-in", days: 5, hours: 80, color: C.blue },
      { phase: "rough-inspection", name: "Rough inspection", days: 1, hours: 2, lagDays: 1, color: C.amber },
      { phase: "trim", name: "Trim", days: 3, hours: 48, lagDays: 5, color: C.violet },
      { phase: "final", name: "Final inspection", days: 1, hours: 4, color: C.green },
    ],
  },
  fire: {
    trade: "fire",
    name: "Fire alarm",
    phases: [
      { phase: "rough-in", name: "Rough-in", days: 4, hours: 64, color: C.blue },
      { phase: "rough-inspection", name: "Rough inspection", days: 1, hours: 2, lagDays: 1, color: C.amber },
      { phase: "devices", name: "Devices + panel", days: 3, hours: 48, lagDays: 5, color: C.violet },
      { phase: "programming", name: "Programming", days: 1, hours: 8, color: C.teal },
      { phase: "acceptance", name: "Acceptance test", days: 1, hours: 8, lagDays: 2, color: C.green },
    ],
  },
  hvac: {
    trade: "hvac",
    name: "HVAC",
    phases: [
      { phase: "rough-in", name: "Duct rough-in", days: 5, hours: 80, color: C.blue },
      { phase: "rough-inspection", name: "Rough inspection", days: 1, hours: 2, lagDays: 1, color: C.amber },
      { phase: "set", name: "Set equipment", days: 2, hours: 32, lagDays: 5, color: C.violet },
      { phase: "startup", name: "Start-up", days: 1, hours: 8, color: C.teal },
      { phase: "final", name: "Final inspection", days: 1, hours: 4, color: C.green },
    ],
  },
  plumbing: {
    trade: "plumbing",
    name: "Plumbing",
    phases: [
      { phase: "underground", name: "Underground", days: 2, hours: 32, color: C.slate },
      { phase: "rough-in", name: "Rough-in", days: 4, hours: 64, color: C.blue },
      { phase: "rough-inspection", name: "Rough inspection", days: 1, hours: 2, lagDays: 1, color: C.amber },
      { phase: "trim", name: "Trim / set fixtures", days: 3, hours: 48, lagDays: 5, color: C.violet },
      { phase: "final", name: "Final inspection", days: 1, hours: 4, color: C.green },
    ],
  },
  solar: {
    trade: "solar",
    name: "Solar & EV",
    phases: [
      { phase: "site-survey", name: "Site survey", days: 1, hours: 4, color: C.slate },
      { phase: "racking", name: "Racking + panels", days: 2, hours: 32, lagDays: 3, color: C.blue },
      { phase: "electrical", name: "Electrical / BOS", days: 2, hours: 32, color: C.orange },
      { phase: "inspection", name: "Inspection", days: 1, hours: 2, lagDays: 2, color: C.amber },
      { phase: "pto", name: "PTO + commissioning", days: 1, hours: 4, lagDays: 5, color: C.green },
    ],
  },
  general: {
    trade: "general",
    name: "General",
    phases: [
      { phase: "rough-in", name: "Rough-in", days: 3, hours: 48, color: C.blue },
      { phase: "inspection", name: "Inspection", days: 1, hours: 2, lagDays: 1, color: C.amber },
      { phase: "trim", name: "Trim", days: 2, hours: 32, lagDays: 3, color: C.violet },
      { phase: "final", name: "Final", days: 1, hours: 4, color: C.green },
    ],
  },
};

/** Default phase sequences for the company's trades (first trade first). */
export function phaseTemplates(trades: TradeId[]): ScheduleTemplate[] {
  return normalizeTrades(trades).map((t) => TEMPLATES[t] ?? TEMPLATES.general);
}

/** Every known phase name (for the editor's phase list), de-duplicated. */
export function phaseNames(trades: TradeId[]): { phase: string; name: string; color: string }[] {
  const m = new Map<string, { phase: string; name: string; color: string }>();
  for (const t of phaseTemplates(trades)) for (const p of t.phases) if (!m.has(p.phase)) m.set(p.phase, { phase: p.phase, name: p.name, color: p.color });
  return [...m.values()];
}

/** Lay a template out as a chain starting on `start` (each phase depends on the one before it). */
export function itemsFromTemplate(tpl: ScheduleTemplate, opts: { projectId: string; start: string; now: string; newId: () => string; crew?: string[] }): ScheduleItem[] {
  const out: ScheduleItem[] = [];
  let prev: ScheduleItem | null = null;
  tpl.phases.forEach((p, i) => {
    const lag = p.lagDays ?? 0;
    const start: string = prev ? earliestAfter(prev, lag, {}) : rollToWorkday(opts.start);
    const item: ScheduleItem = {
      id: opts.newId(),
      projectId: opts.projectId,
      name: p.name,
      phase: p.phase,
      start,
      end: addWorkdays(start, Math.max(1, p.days) - 1),
      crew: opts.crew?.length ? [...opts.crew] : [],
      hoursPlanned: p.hours || null,
      progress: 0,
      color: p.color,
      dependsOn: prev ? [{ id: prev.id, ...(lag ? { lagDays: lag } : {}) }] : [],
      sheetIds: [],
      notes: null,
      sort: i,
      workdaysOnly: true,
      createdAt: opts.now,
      updatedAt: opts.now,
    };
    out.push(item);
    prev = item;
  });
  return out;
}

// ---------- permissions ----------

/** "all": office (create, move, delete). "progress": a tech on the crew (progress % and notes). "none": view only. */
export type ScheduleAccess = "all" | "progress" | "none";

export function canEditSchedule(role: TeamRole | null | undefined, item: Pick<ScheduleItem, "crew"> | null, me: string | null | undefined): ScheduleAccess {
  if (role !== "tech") return "all";
  if (!item || !me?.trim()) return "none";
  const k = personKey(me);
  return (item.crew ?? []).some((c) => personKey(c) === k) ? "progress" : "none";
}

export const onCrew = (item: Pick<ScheduleItem, "crew">, me: string | null | undefined): boolean =>
  !!me?.trim() && (item.crew ?? []).some((c) => personKey(c) === personKey(me));

// ---------- normalising rows from sync / older devices ----------

/** Fill defaults and drop junk so a row from another device (or an older app) is safe to draw. */
export function normalizeItem(raw: ScheduleItem): ScheduleItem {
  const start = isDay(raw.start) ? raw.start : isDay(raw.end) ? raw.end : "1970-01-01";
  const end = isDay(raw.end) && raw.end >= start ? raw.end : start;
  return {
    ...raw,
    name: typeof raw.name === "string" ? raw.name : "",
    start,
    end,
    crew: Array.isArray(raw.crew) ? raw.crew.filter((c): c is string => typeof c === "string" && !!c.trim()) : [],
    dependsOn: Array.isArray(raw.dependsOn) ? raw.dependsOn.filter((d) => d && typeof d.id === "string") : [],
    sheetIds: Array.isArray(raw.sheetIds) ? raw.sheetIds.filter((s): s is string => typeof s === "string") : [],
    progress: pct(raw.progress),
  };
}

// ---------- calendar export ----------

const icsDate = (day: string) => day.replaceAll("-", "");
const icsStamp = (iso: string) => {
  const t = Date.parse(iso);
  return (Number.isFinite(t) ? new Date(t) : new Date(0)).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
};
const icsText = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

/** Fold lines longer than 75 octets (RFC 5545 §3.1). */
function fold(line: string): string {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const parts: string[] = [];
  let cur = "";
  let len = 0;
  for (const ch of line) {
    const n = new TextEncoder().encode(ch).length;
    if (len + n > (parts.length ? 74 : 75)) {
      parts.push(cur);
      cur = "";
      len = 0;
    }
    cur += ch;
    len += n;
  }
  parts.push(cur);
  return parts.join("\r\n ");
}

/** An .ics calendar with one all-day event per live item (DTEND is the day after `end`, as the format wants). */
export function toIcs(items: ScheduleItem[], project: { id: string; clientName?: string; address?: string }): string {
  const job = [project.clientName, project.address].filter((x) => x?.trim()).join(" · ");
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//PinPlan//Schedule//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", `X-WR-CALNAME:${icsText(job || "PinPlan schedule")}`];
  for (const i of live(items).sort((a, b) => a.start.localeCompare(b.start))) {
    const desc = [
      i.crew?.length ? `Crew: ${i.crew.join(", ")}` : "",
      i.hoursPlanned ? `Planned: ${i.hoursPlanned} h` : "",
      `Progress: ${pct(i.progress)}%`,
      i.notes?.trim() ?? "",
    ].filter(Boolean);
    lines.push(
      "BEGIN:VEVENT",
      `UID:${i.id}@pinplan`,
      `DTSTAMP:${icsStamp(i.updatedAt)}`,
      `DTSTART;VALUE=DATE:${icsDate(i.start)}`,
      `DTEND;VALUE=DATE:${icsDate(addDays(i.end, 1))}`,
      `SUMMARY:${icsText(job ? `${i.name} — ${job}` : i.name)}`,
      ...(project.address?.trim() ? [`LOCATION:${icsText(project.address.trim())}`] : []),
      `DESCRIPTION:${icsText(desc.join("\n"))}`,
      "TRANSP:TRANSPARENT",
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}
