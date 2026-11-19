"use client";
// Tasks on the plan: "+ Task" (Shift+T) arms a drop, the eye shows/hides pins (red while filters hide some), filter
// chips, and the sheet's task drawer. Also hosts the quick-create sheet and the task detail for the plan.
import { Eye, EyeOff, ListTodo, MapPinPlus, SlidersHorizontal, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { localDay } from "@/lib/fieldDocs";
import { newId, nowIso } from "@/lib/db";
import { useEditor } from "@/lib/store";
import { duplicateTask, filterIsEmpty, isClosed, isOverdue, nearestRoom, STATUSES, taskMatches, taskPlacement } from "@/lib/tasks";
import { toast } from "@/lib/toast";
import type { PlanTask } from "@/lib/types";
import type { PlanOverlayCtx } from "../editor/overlays/registry";
import TaskDetail from "./TaskDetail";
import TaskQuickCreate from "./TaskQuickCreate";
import { Chip, DueText, TaskBadge, useTaskOptions } from "./TaskUi";
import { useProjectTasks, useTasks } from "./taskStore";

export default function TaskToolbar({ sheet, projectId }: PlanOverlayCtx) {
  const tasks = useProjectTasks(projectId);
  const { filter, setFilter, showPins, greyOthers, drop, arm, quick, detailId, selectedId, set } = useTasks();
  const { me, categories } = useTaskOptions(tasks);
  const [panel, setPanel] = useState<"filter" | "list" | null>(null);
  const [today] = useState(() => localDay(new Date().toISOString()));
  const sheetTasks = useMemo(() => tasks.filter((t) => t.sheetId === sheet.id), [tasks, sheet.id]);
  const pinned = sheetTasks.filter((t) => taskPlacement(t) === "pin");
  const active = !filterIsEmpty(filter);
  const hidden = !showPins || (active && !greyOthers && pinned.some((t) => !taskMatches(t, filter, today)));
  const openOnSheet = sheetTasks.filter((t) => !isClosed(t.status)).length;

  // Shift+T: drop a task; Escape: stop dropping.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el?.closest?.("input,textarea,select,[contenteditable=true]")) return;
      if (e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey && e.key.toLowerCase() === "t") {
        e.preventDefault();
        startDrop();
      } else if (e.key === "Escape" && useTasks.getState().drop) {
        useTasks.getState().arm(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  // Leaving the plan (or the job) mid-drop must not leave the canvas captured.
  useEffect(() => () => useTasks.getState().arm(null), []);

  function startDrop() {
    useEditor.getState().setTool({ kind: "select" });
    useTasks.getState().arm(useTasks.getState().drop?.kind === "new" ? null : { kind: "new" });
  }

  const toggle = <T,>(list: T[] | undefined, v: T) => (list?.includes(v) ? list.filter((x) => x !== v) : [...(list ?? []), v]);
  const mine = filter.assignee?.length === 1 && filter.assignee[0].toLowerCase() === me.toLowerCase();

  const btn = "relative flex h-10 w-10 items-center justify-center rounded-xl bg-white text-slate-700 shadow-soft ring-1 ring-slate-200 hover:bg-slate-50";
  return (
    <>
      <button className={`${btn} ${drop ? "!bg-brand-600 !text-white !ring-brand-600" : ""}`} onClick={startDrop} title="Add a task (Shift+T)" aria-label="Add a task" aria-pressed={!!drop}>
        <MapPinPlus className="h-5 w-5" />
      </button>
      <button
        className={`${btn} ${hidden ? "!text-red-600 !ring-red-300" : ""}`}
        onClick={() => set({ showPins: !showPins })}
        title={!showPins ? "Show task pins" : hidden ? "Some task pins are hidden by filters" : "Hide task pins"}
        aria-label={showPins ? "Hide task pins" : "Show task pins"}
        aria-pressed={!showPins}
      >
        {showPins ? <Eye className="h-5 w-5" /> : <EyeOff className="h-5 w-5" />}
      </button>
      <button className={`${btn} ${panel === "filter" ? "!bg-slate-100" : ""}`} onClick={() => setPanel(panel === "filter" ? null : "filter")} title="Filter task pins" aria-label="Filter task pins" aria-expanded={panel === "filter"}>
        <SlidersHorizontal className="h-5 w-5" />
        {active && <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-brand-600 ring-2 ring-white" />}
      </button>
      <button className={`${btn} ${panel === "list" ? "!bg-slate-100" : ""}`} onClick={() => setPanel(panel === "list" ? null : "list")} title="Tasks on this sheet" aria-label="Tasks on this sheet" aria-expanded={panel === "list"}>
        <ListTodo className="h-5 w-5" />
        {openOnSheet > 0 && <span className="absolute -top-1.5 -right-1.5 min-w-5 rounded-full bg-red-600 px-1 text-center text-[11px] leading-5 font-semibold text-white ring-2 ring-white">{openOnSheet}</span>}
      </button>

      {drop && (
        <div className="absolute top-3 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2 rounded-full bg-ink/90 py-1.5 pr-1.5 pl-4 text-[13px] whitespace-nowrap text-white shadow-pop backdrop-blur">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400" />
          {drop.kind === "new" ? "Tap the plan to drop a task" : drop.kind === "duplicate" ? `Tap where the copy of #${drop.source.number} goes` : "Tap the new spot for the task"}
          <button className="flex h-7 w-7 items-center justify-center rounded-full bg-white/15 hover:bg-white/25" onClick={() => arm(null)} aria-label="Cancel">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {panel === "filter" && (
        <div className="card animate-in absolute top-12 left-16 z-30 w-[min(20rem,calc(100vw-5rem))] space-y-3 p-3 shadow-pop">
          <div className="flex items-center">
            <span className="mr-auto text-sm font-semibold">Show tasks</span>
            {active && (
              <button className="btn btn-sm btn-ghost" onClick={() => setFilter({})}>
                Clear
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {STATUSES.map((s) => (
              <Chip small key={s.id} on={!!filter.status?.includes(s.id)} color={s.color} onClick={() => setFilter({ ...filter, status: toggle(filter.status, s.id) })}>
                {s.short}
              </Chip>
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Chip small on={mine} onClick={() => setFilter({ ...filter, assignee: mine ? [] : [me] })}>
              Mine
            </Chip>
            <Chip small on={filter.due === "overdue"} color="#dc2626" onClick={() => setFilter({ ...filter, due: filter.due === "overdue" ? null : "overdue" })}>
              Overdue
            </Chip>
          </div>
          {categories.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {categories.map((c) => (
                <Chip small key={c} on={!!filter.category?.includes(c)} onClick={() => setFilter({ ...filter, category: toggle(filter.category, c) })}>
                  {c}
                </Chip>
              ))}
            </div>
          )}
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" checked={greyOthers} onChange={(e) => set({ greyOthers: e.target.checked })} />
            Grey out the others instead of hiding them
          </label>
        </div>
      )}

      {panel === "list" && (
        <aside className="card animate-in absolute top-12 left-16 z-30 flex max-h-[calc(100dvh-220px)] w-[min(22rem,calc(100vw-5rem))] flex-col overflow-hidden shadow-pop">
          <div className="flex items-center border-b border-slate-100 px-3 py-2">
            <span className="mr-auto text-sm font-semibold">
              {sheet.name} · {sheetTasks.length} task{sheetTasks.length === 1 ? "" : "s"}
            </span>
            <button className="btn btn-sm btn-icon btn-ghost" onClick={() => setPanel(null)} aria-label="Close">
              <X />
            </button>
          </div>
          {sheetTasks.length === 0 ? (
            <p className="p-4 text-sm text-slate-500">No tasks on this sheet yet. Tap the pin button, then tap the plan.</p>
          ) : (
            <ul className="scroll-thin divide-y divide-slate-100 overflow-y-auto">
              {sheetTasks.map((t) => (
                <li key={t.id}>
                  <button
                    className={`flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-slate-50 ${t.id === selectedId ? "bg-blue-50" : ""}`}
                    onClick={() => set({ selectedId: t.id, showPins: true, ...(taskPlacement(t) === "pin" ? {} : { detailId: t.id }) })}
                    onDoubleClick={() => set({ detailId: t.id })}
                  >
                    <TaskBadge task={t} size={26} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{t.title}</span>
                      <span className="flex flex-wrap gap-x-2 text-xs text-slate-500">
                        <span>{STATUSES.find((s) => s.id === t.status)?.short}</span>
                        {t.assignee && <span>{t.assignee}</span>}
                        <DueText task={t} today={today} />
                        {taskPlacement(t) === "sheet" && <span className="text-amber-700">no spot</span>}
                      </span>
                    </span>
                    {isOverdue(t, today) && <span className="h-2 w-2 rounded-full bg-red-600" title="Overdue" />}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>
      )}

      {quick && <TaskQuickCreate projectId={projectId} draft={quick} onClose={() => set({ quick: null })} onCreated={(t) => set({ selectedId: t.id })} />}
      {detailId && (
        <TaskDetail
          taskId={detailId}
          onClose={() => set({ detailId: null })}
          onPlace={(t) => {
            set({ detailId: null, selectedId: t.id });
            arm({ kind: "move", id: t.id });
          }}
          onDuplicate={(t) => {
            set({ detailId: null });
            arm({ kind: "duplicate", source: t });
          }}
        />
      )}
    </>
  );
}

/** What a tap on the plan does while a drop is armed (registered as the overlay's onTap). */
export function handleTaskTap(ctx: PlanOverlayCtx & { x: number; y: number }, author: string): boolean {
  const st = useTasks.getState();
  const drop = st.drop;
  if (!drop) return false;
  const { sheet, x, y } = ctx;
  st.arm(null);
  if (drop.kind === "new") {
    st.set({ quick: { sheetId: sheet.id, x, y, room: nearestRoomAt(sheet.id, x, y) } });
  } else if (drop.kind === "duplicate") {
    const at = nowIso();
    const copy = { ...duplicateTask(drop.source, at, { id: newId(), number: st.nextNumber(), by: author, newItemId: newId }), sheetId: sheet.id, x, y, room: nearestRoomAt(sheet.id, x, y) ?? drop.source.room ?? null };
    const withHistory: PlanTask = { ...copy, activity: [{ id: newId(), at, by: author, kind: "created", text: `copied from #${drop.source.number}` }] };
    void st.save(withHistory).then((t) => {
      st.set({ selectedId: t.id, detailId: t.id });
      toast(`Task #${t.number} added`, "success");
    });
  } else {
    void st.change(drop.id, { sheetId: sheet.id, x, y }, author).then((t) => t && st.set({ selectedId: t.id }));
  }
  return true;
}

function nearestRoomAt(sheetId: string, x: number, y: number): string | null {
  // Read-only: the room of the nearest device on the sheet.
  return nearestRoom(useEditor.getState().markers, sheetId, x, y);
}
