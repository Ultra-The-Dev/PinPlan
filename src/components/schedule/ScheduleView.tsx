"use client";
// Job schedule (Field → Schedule): phases on a Gantt with finish-to-start dependencies, a 3-week look-ahead, a phone
// agenda and an .ics export. Moving a phase pushes the phases that wait on it (never pulls them earlier); every move
// can be undone from the bar at the bottom. See docs/schedule-lookahead.md.
import { AlertTriangle, CalendarDays, CalendarRange, CalendarPlus, Download, LayoutTemplate, Plus, Undo2, Users, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { db, newId, nowIso, putMany } from "@/lib/db";
import { downloadText, slug } from "@/lib/download";
import { localDay, teamNames } from "@/lib/fieldDocs";
import { useMe } from "@/lib/useMe";
import {
  addDays,
  addWorkdays,
  applyAndCascade,
  canEditSchedule,
  crewUpdate,
  criticalPath,
  dayNum,
  deleteItem,
  groupByWeek,
  itemStatus,
  itemsFromTemplate,
  lookahead,
  lookaheadWindow,
  mergeRows,
  normalizeItem,
  phaseNames,
  phaseTemplates,
  rollToWorkday,
  schedulePercent,
  toIcs,
  validateDeps,
  weekStart,
} from "@/lib/schedule";
import { useEditor } from "@/lib/store";
import { useRole, useTeam } from "@/lib/team";
import { toast } from "@/lib/toast";
import type { ScheduleItem } from "@/lib/types";
import { useMedia } from "@/lib/useMedia";
import { useTrades } from "@/lib/useTrades";
import Gantt, { type Zoom } from "./Gantt";
import ScheduleItemEditor from "./ScheduleItemEditor";
import { CrewAvatars, DEFAULT_BAR, fmtDay, fmtRange, ProgressBar } from "./shared";

const sortItems = (xs: ScheduleItem[]) => [...xs].sort((a, b) => a.start.localeCompare(b.start) || (a.sort ?? 0) - (b.sort ?? 0) || a.createdAt.localeCompare(b.createdAt));

const STATUS: Record<ReturnType<typeof itemStatus>, { label: string; cls: string }> = {
  done: { label: "Done", cls: "bg-emerald-50 text-emerald-700" },
  late: { label: "Late", cls: "bg-red-50 text-red-700" },
  behind: { label: "Behind", cls: "bg-amber-50 text-amber-800" },
  active: { label: "Under way", cls: "bg-sky-50 text-sky-700" },
  upcoming: { label: "Upcoming", cls: "bg-slate-100 text-slate-600" },
};

export default function ScheduleView() {
  const project = useEditor((s) => s.project)!;
  const sheets = useEditor((s) => s.sheets);
  const photos = useEditor((s) => s.photos);
  const jobLogs = useEditor((s) => s.jobLogs);
  const checklists = useEditor((s) => s.checklists);
  const members = useTeam((s) => s.members);
  const role = useRole();
  const trades = useTrades();
  const narrow = useMedia("(max-width: 639px)");

  const [stored, setStored] = useState<ScheduleItem[] | null>(null);
  const [today, setToday] = useState("");
  const { me, names: myNames } = useMe();
  const [view, setView] = useState<"all" | "lookahead">("all");
  const [zoom, setZoom] = useState<Zoom>("day");
  const [todaySignal, setTodaySignal] = useState(0);
  const [editing, setEditing] = useState<{ item: ScheduleItem; isNew: boolean } | null>(null);
  const [undo, setUndo] = useState<{ text: string; prev: ScheduleItem[]; id: number } | null>(null);
  const [showTpl, setShowTpl] = useState(false);
  const [tplIdx, setTplIdx] = useState(0);
  const [tplStart, setTplStart] = useState("");

  const pid = project.id;
  const load = useCallback(async () => {
    const rows = await db().scheduleItems.where("projectId").equals(pid).toArray();
    setStored(rows.map(normalizeItem));
  }, [pid]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      const d = localDay(new Date().toISOString());
      setToday(d);
      setTplStart((s) => s || rollToWorkday(d));
      void load();
    }, 0);
    const reload = () => void load();
    window.addEventListener("pinplan:synced", reload);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("pinplan:synced", reload);
    };
  }, [load]);

  // The undo bar goes away on its own after a while.
  useEffect(() => {
    if (!undo) return;
    const t = window.setTimeout(() => setUndo((u) => (u?.id === undo.id ? null : u)), 9000);
    return () => window.clearTimeout(t);
  }, [undo]);

  const items = useMemo(() => sortItems((stored ?? []).filter((i) => !i.deleted)), [stored]);
  const office = canEditSchedule(role, null, me) === "all";
  const critical = useMemo(() => {
    // Only worth showing when some work runs alongside it (in a single chain everything is critical).
    const path = criticalPath(items);
    return new Set(path.length > 1 && path.length < items.length ? path : []);
  }, [items]);
  const problems = useMemo(() => validateDeps(stored ?? []), [stored]);
  const percent = useMemo(() => schedulePercent(items), [items]);
  const finish = items.reduce((m, i) => (i.end > m ? i.end : m), "");
  const names = useMemo(() => teamNames({ photos, jobLogs, checklists, members }, me || undefined), [photos, jobLogs, checklists, members, me]);
  const phases = useMemo(() => phaseNames(trades), [trades]);
  const templates = useMemo(() => phaseTemplates(trades), [trades]);

  const shownItems = useMemo(() => (view === "lookahead" && today ? lookahead(items, today, 3) : items), [view, items, today]);
  const range = useMemo(() => {
    if (!today) return null;
    if (view === "lookahead") return lookaheadWindow(today, 3);
    const first = items.reduce((m, i) => (i.start < m ? i.start : m), today);
    const last = items.reduce((m, i) => (i.end > m ? i.end : m), today);
    return { from: addDays(weekStart(first), -7), to: addDays(weekStart(last), 27) };
  }, [view, items, today]);

  /** Save changed rows; offer Undo with the rows as they were. */
  async function save(rows: ScheduleItem[], prev: ScheduleItem[], text?: string) {
    if (!rows.length) return;
    const saved = await putMany("scheduleItems", rows);
    setStored((cur) => mergeRows(cur ?? [], saved));
    if (text && prev.length) setUndo({ text, prev, id: Date.now() });
  }
  async function restore() {
    if (!undo) return;
    const prev = undo.prev;
    setUndo(null);
    const saved = await putMany("scheduleItems", prev);
    setStored((cur) => mergeRows(cur ?? [], saved));
    toast("Schedule restored", "info");
  }

  function moved(rows: ScheduleItem[], prev: ScheduleItem[]) {
    const n = rows.length - 1;
    const first = rows[0];
    const text = n > 0 ? `Moved ${n} dependent phase${n === 1 ? "" : "s"}` : `${first.name}: ${fmtRange(first.start, first.end)}`;
    void save(rows, prev, text);
  }

  async function saveEdit(item: ScheduleItem, isNew: boolean) {
    setEditing(null);
    const before = stored ?? [];
    // A tech on the crew saves progress and notes only, onto the latest row, and never moves other phases.
    if (!isNew && canEditSchedule(role, item, myNames) === "progress") {
      const latest = (await db().scheduleItems.get(item.id)) ?? before.find((b) => b.id === item.id);
      if (!latest || latest.deleted) return;
      await save([crewUpdate(normalizeItem(latest), item)], []);
      return;
    }
    const rows = applyAndCascade(before.filter((i) => !i.deleted), item);
    const prev = rows.map((r) => before.find((b) => b.id === r.id)).filter((x): x is ScheduleItem => !!x);
    const pushed = rows.length - 1;
    await save(rows, prev, pushed > 0 ? `Moved ${pushed} dependent phase${pushed === 1 ? "" : "s"}` : undefined);
    if (isNew) toast(`Added ${item.name}`);
  }

  async function del(item: ScheduleItem) {
    if (!window.confirm(`Delete “${item.name}” from the schedule?`)) return;
    setEditing(null);
    // Also drop the links that waited on it (Undo puts them back).
    const before = stored ?? [];
    const rows = deleteItem(before, item.id);
    const prev = rows.map((r) => before.find((b) => b.id === r.id)).filter((x): x is ScheduleItem => !!x);
    await save(rows, prev.map((r) => ({ ...r, deleted: false })), `Deleted ${item.name}`);
  }

  async function cleanMissing() {
    const bad = new Set(problems.missing.map((m) => m.id));
    const live = new Set(items.map((i) => i.id));
    const rows = items.filter((i) => bad.has(i.id)).map((i) => ({ ...i, dependsOn: (i.dependsOn ?? []).filter((d) => live.has(d.id)) }));
    await save(rows, items.filter((i) => bad.has(i.id)), "Removed links to deleted phases");
  }

  async function fromTemplate() {
    const tpl = templates[Math.min(tplIdx, templates.length - 1)];
    if (!tpl) return;
    const rows = itemsFromTemplate(tpl, { projectId: pid, start: tplStart || today, now: nowIso(), newId });
    const saved = await putMany("scheduleItems", rows);
    setStored((cur) => mergeRows(cur ?? [], saved));
    setShowTpl(false);
    toast(`Added ${rows.length} phases`);
  }

  function addPhase() {
    const last = items[items.length - 1];
    const start = last ? addWorkdays(last.end, 1) : rollToWorkday(today);
    const now = nowIso();
    setEditing({
      isNew: true,
      item: { id: newId(), projectId: pid, name: "", start, end: addWorkdays(start, 1), crew: [], progress: 0, dependsOn: last ? [{ id: last.id }] : [], sheetIds: [], sort: items.length, workdaysOnly: true, createdAt: now, updatedAt: now },
    });
  }

  function exportIcs() {
    downloadText(toIcs(items, project), `${slug(project.address || project.clientName || "job")}-schedule.ics`, "text/calendar;charset=utf-8");
  }

  if (!stored || !today || !range) return <div className="p-6 text-sm text-slate-500">Loading schedule…</div>;

  const empty = items.length === 0;
  const tplOpen = office && (showTpl || empty);

  return (
    <div className="space-y-4">
      {/* Summary + toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        {!empty && (
          <div className="mr-auto flex min-w-0 items-center gap-3">
            <div className="w-28">
              <div className="flex items-baseline justify-between text-xs text-slate-500">
                <span>Complete</span>
                <span className="font-semibold text-slate-800 tabular-nums">{percent}%</span>
              </div>
              <ProgressBar value={percent} />
            </div>
            <div className="text-xs text-slate-500">
              <div>
                {items.length} phase{items.length === 1 ? "" : "s"}
              </div>
              <div>
                Finish <span className="font-medium text-slate-700">{finish ? fmtDay(finish) : "—"}</span>
              </div>
            </div>
          </div>
        )}
        {empty && <div className="mr-auto" />}
        {office && (
          <button className="btn btn-brand btn-sm" onClick={addPhase}>
            <Plus /> Add phase
          </button>
        )}
        {office && empty && !tplOpen && (
          <button className="btn btn-sm" onClick={() => setShowTpl(true)}>
            <LayoutTemplate /> Start from template
          </button>
        )}
        {!empty && (
          <>
            <div className="seg" role="group" aria-label="Range">
              <button className={`tab h-7 px-2 text-xs ${view === "lookahead" ? "tab-active" : ""}`} aria-pressed={view === "lookahead"} onClick={() => setView("lookahead")}>
                <CalendarRange className="h-3.5 w-3.5" /> 3 weeks
              </button>
              <button className={`tab h-7 px-2 text-xs ${view === "all" ? "tab-active" : ""}`} aria-pressed={view === "all"} onClick={() => setView("all")}>
                All
              </button>
            </div>
            {!narrow && (
              <>
                <button className="btn btn-sm" onClick={() => setTodaySignal((n) => n + 1)}>
                  <CalendarDays /> Today
                </button>
                <div className="seg" role="group" aria-label="Zoom">
                  <button className={`tab h-7 px-2 text-xs ${zoom === "day" ? "tab-active" : ""}`} aria-pressed={zoom === "day"} onClick={() => setZoom("day")}>
                    Days
                  </button>
                  <button className={`tab h-7 px-2 text-xs ${zoom === "week" ? "tab-active" : ""}`} aria-pressed={zoom === "week"} onClick={() => setZoom("week")}>
                    Weeks
                  </button>
                </div>
              </>
            )}
            <button className="btn btn-sm btn-icon" onClick={exportIcs} title="Export to calendar (.ics)" aria-label="Export to calendar (.ics)">
              <Download />
            </button>
            <Link className="btn btn-sm btn-icon" href="/schedule" title="Crew board — who is where, across jobs" aria-label="Crew board">
              <Users />
            </Link>
          </>
        )}
      </div>

      {tplOpen && (
        <div className="card space-y-3 p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
              <CalendarPlus className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-medium">{empty ? "Plan this job’s schedule" : "Start from template"}</div>
              <p className="text-sm text-slate-500">Lay out the usual phases with typical lengths and waits — then drag them to fit. Each one waits for the one before it.</p>
            </div>
            {!empty && (
              <button className="btn btn-sm btn-icon btn-ghost" onClick={() => setShowTpl(false)} aria-label="Close">
                <X />
              </button>
            )}
          </div>
          {templates.length > 1 && (
            <div className="seg flex-wrap" role="group" aria-label="Template">
              {templates.map((t, i) => (
                <button key={t.trade} className={`tab h-7 px-2 text-xs ${tplIdx === i ? "tab-active" : ""}`} onClick={() => setTplIdx(i)} aria-pressed={tplIdx === i}>
                  {t.name}
                </button>
              ))}
            </div>
          )}
          <ol className="flex flex-wrap items-center gap-1.5 text-xs text-slate-600">
            {templates[Math.min(tplIdx, templates.length - 1)]?.phases.map((p, i) => (
              <li key={p.phase} className="flex items-center gap-1.5">
                {i > 0 && <span className="text-slate-300">→</span>}
                <span className="chip bg-slate-50 ring-1 ring-slate-200">
                  <span className="h-2 w-2 rounded-sm" style={{ background: p.color }} />
                  {p.name} · {p.days}d
                </span>
              </li>
            ))}
          </ol>
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-xs">
              <span className="label">Starts</span>
              <input type="date" className="input h-9 w-44" value={tplStart} onChange={(e) => setTplStart(e.target.value)} />
            </label>
            <button className="btn btn-brand" onClick={() => void fromTemplate()} disabled={!tplStart}>
              <LayoutTemplate /> Start from template
            </button>
          </div>
        </div>
      )}

      {empty && !office && (
        <div className="card flex flex-col items-center gap-2 p-10 text-center">
          <CalendarRange className="h-8 w-8 text-slate-300" />
          <div className="font-medium">No schedule yet</div>
          <p className="max-w-sm text-sm text-slate-500">The office plans the phases for this job. They’ll show up here — with you on the crew — once they’re set.</p>
        </div>
      )}

      {(problems.missing.length > 0 || problems.cycle.length > 0) && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl bg-amber-50 px-4 py-2.5 text-sm text-amber-900 ring-1 ring-amber-200" role="status">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span className="min-w-0 flex-1">
            {problems.cycle.length > 0 && <>Some phases wait on each other in a loop, so they aren’t pushed automatically. </>}
            {problems.missing.length > 0 && <>{problems.missing.length === 1 ? "A phase waits" : `${problems.missing.length} links wait`} on a phase that was deleted — ignored.</>}
          </span>
          {office && problems.missing.length > 0 && (
            <button className="btn btn-sm" onClick={() => void cleanMissing()}>
              Clean up
            </button>
          )}
        </div>
      )}

      {!empty && shownItems.length === 0 && (
        <div className="card p-6 text-center text-sm text-slate-500">
          Nothing scheduled in the next 3 weeks.{" "}
          <button className="font-medium text-brand-600 underline" onClick={() => setView("all")}>
            Show all
          </button>
        </div>
      )}

      {!empty && shownItems.length > 0 &&
        (narrow ? (
          <Agenda items={shownItems} today={today} critical={critical} me={me} onOpen={(i) => setEditing({ item: i, isNew: false })} />
        ) : (
          <>
            <Gantt
              items={shownItems}
              all={items}
              from={range.from}
              to={range.to}
              today={today}
              zoom={zoom}
              critical={critical}
              todaySignal={todaySignal}
              canDrag={() => office}
              onOpen={(i) => setEditing({ item: i, isNew: false })}
              onCommit={moved}
            />
            <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
              {office && <span>Drag a bar to move it, its right edge to change its length. Phases that wait on it move too.</span>}
              {critical.size > 0 && (
                <span className="inline-flex items-center gap-1">
                  <span className="h-2.5 w-4 rounded-sm ring-2 ring-red-500/70" /> Critical path — a slip here moves the finish
                </span>
              )}
            </p>
          </>
        ))}

      {editing && (
        <ScheduleItemEditor
          item={editing.item}
          isNew={editing.isNew}
          all={stored}
          names={names}
          sheets={sheets}
          phases={phases}
          access={canEditSchedule(role, editing.isNew ? null : editing.item, myNames)}
          onSave={(i) => void saveEdit(i, editing.isNew)}
          onDelete={() => void del(editing.item)}
          onClose={() => setEditing(null)}
        />
      )}

      {undo && (
        <div className="fixed inset-x-0 bottom-4 z-[55] flex justify-center px-4 pb-[env(safe-area-inset-bottom)]" role="status">
          <div className="animate-in flex max-w-md items-center gap-3 rounded-xl bg-ink/95 py-2 pr-2 pl-4 text-sm text-white shadow-pop">
            <span className="min-w-0 truncate">{undo.text}</span>
            <button className="inline-flex h-8 items-center gap-1 rounded-lg bg-white/10 px-3 text-sm font-medium hover:bg-white/20" onClick={() => void restore()}>
              <Undo2 className="h-4 w-4" /> Undo
            </button>
            <button className="rounded-md p-1 text-white/60 hover:bg-white/10 hover:text-white" onClick={() => setUndo(null)} aria-label="Dismiss">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Phones: a list grouped by week instead of the chart. */
function Agenda({ items, today, critical, me, onOpen }: { items: ScheduleItem[]; today: string; critical: Set<string>; me: string; onOpen: (i: ScheduleItem) => void }) {
  const weeks = groupByWeek(items, today);
  const thisWeek = weekStart(today);
  return (
    <div className="space-y-4" data-testid="schedule-agenda">
      {weeks.map((w) => (
        <section key={w.week}>
          <h3 className="mb-1.5 px-1 text-xs font-semibold tracking-wide text-slate-500 uppercase">
            {w.week === thisWeek ? "This week" : dayNum(w.week) - dayNum(thisWeek) === 7 ? "Next week" : `Week of ${fmtDay(w.week, { month: "short", day: "numeric" })}`}
          </h3>
          <ul className="card divide-y divide-slate-100">
            {w.items.map((i) => {
              const st = STATUS[itemStatus(i, today)];
              const mine = me && (i.crew ?? []).some((c) => c.toLowerCase() === me.toLowerCase());
              return (
                <li key={i.id}>
                  <button className="flex w-full items-start gap-3 px-4 py-3 text-left active:bg-slate-50" onClick={() => onOpen(i)}>
                    <span className="mt-1 h-8 w-1.5 shrink-0 rounded-full" style={{ background: i.color || DEFAULT_BAR }} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium">{i.name}</span>
                        <span className={`chip shrink-0 ${st.cls}`}>{st.label}</span>
                        {critical.has(i.id) && <span className="chip shrink-0 bg-red-50 text-red-700">Critical</span>}
                      </span>
                      <span className="mt-0.5 flex items-center gap-2 text-xs text-slate-500">
                        <span>{fmtRange(i.start, i.end)}</span>
                        {mine && <span className="font-medium text-brand-700">You’re on it</span>}
                      </span>
                      <span className="mt-2 flex items-center gap-2">
                        <span className="flex-1">
                          <ProgressBar value={i.progress ?? 0} color={i.color || DEFAULT_BAR} />
                        </span>
                        <span className="w-8 text-right text-xs text-slate-500 tabular-nums">{Math.round(i.progress ?? 0)}%</span>
                        <CrewAvatars crew={i.crew} />
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
