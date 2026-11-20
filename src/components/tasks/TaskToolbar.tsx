"use client";
// Tasks on the plan (HTML side of the tasks overlay, in the plan's right-hand rail): one Tasks button (open count)
// opens a panel with "+ Task" (also Shift+T: the next tap on the plan drops a task there), filters and the sheet's
// task list. Showing / hiding the pins is in Layers ("Show on plan"); the button turns red while pins are hidden.
// Also hosts the drop hint, the quick-create sheet and the task detail for the plan.
import { ListTodo, MapPinPlus, SlidersHorizontal, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { localDay } from "@/lib/fieldDocs";
import { newId, nowIso } from "@/lib/db";
import { claimPlanInput, planKeyBlocked } from "@/lib/planOverlays";
import { useEditor } from "@/lib/store";
import { duplicateTask, filterIsEmpty, isClosed, isOverdue, nearestRoom, STATUSES, taskMatches, taskPlacement } from "@/lib/tasks";
import { toast } from "@/lib/toast";
import type { PlanTask, Sheet } from "@/lib/types";
import TaskDetail from "./TaskDetail";
import TaskQuickCreate from "./TaskQuickCreate";
import { Chip, DueText, Portal, TaskBadge, useTaskOptions } from "./TaskUi";
import { isTaskDropKey, useProjectTasks, useTasks } from "./taskStore";
import { t, useT } from "@/lib/i18n";

export default function TaskToolbar({ sheet }: { sheet: Sheet }) {
  const projectId = sheet.projectId;
  const tasks = useProjectTasks(projectId);
  const { filter, setFilter, showPins, greyOthers, drop, arm, quick, detailId, selectedId, set } = useTasks();
  const { me, categories } = useTaskOptions(tasks);
  const [open, setOpen] = useState(false);
  const t = useT();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [today] = useState(() => localDay(new Date().toISOString()));
  const sheetTasks = useMemo(() => tasks.filter((tk) => tk.sheetId === sheet.id), [tasks, sheet.id]);
  const pinned = sheetTasks.filter((tk) => taskPlacement(tk) === "pin");
  const active = !filterIsEmpty(filter);
  const hidden = !showPins || (active && !greyOthers && pinned.some((tk) => !taskMatches(tk, filter, today)));
  const openOnSheet = sheetTasks.filter((tk) => !isClosed(tk.status)).length;

  // Shift+T: drop a task; Escape: stop dropping. The plan's shared key rules apply (isTaskDropKey / planKeyBlocked).
  // The plan editor's own key handler has no Shift+T, so this one stays here.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTaskDropKey(e)) {
        e.preventDefault();
        startDrop();
      } else if (e.key === "Escape" && useTasks.getState().drop && !planKeyBlocked(e)) {
        useTasks.getState().arm(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  // Leaving the plan (or the job) mid-drop must not leave a drop armed.
  useEffect(() => () => useTasks.getState().arm(null), []);

  function startDrop() {
    // Dropping a task owns the next plan tap: Measure, Markups, Walk, the Link tool and device tools close.
    if (useTasks.getState().drop?.kind !== "new") claimPlanInput("task-drop");
    useEditor.getState().setTool({ kind: "select" });
    useTasks.getState().arm(useTasks.getState().drop?.kind === "new" ? null : { kind: "new" });
    setOpen(false);
  }

  const toggle = <T,>(list: T[] | undefined, v: T) => (list?.includes(v) ? list.filter((x) => x !== v) : [...(list ?? []), v]);
  const mine = filter.assignee?.length === 1 && filter.assignee[0].toLowerCase() === me.toLowerCase();

  const btn = "pointer-events-auto relative flex h-11 w-11 items-center justify-center rounded-xl bg-white/95 text-slate-700 shadow-pop ring-1 ring-black/5 backdrop-blur-md hover:text-slate-900";
  return (
    <div className="relative">
      <button
        className={`${btn} ${drop ? "!bg-brand-600 !text-white" : open ? "!bg-slate-100" : ""} ${hidden && !drop ? "!text-red-600 !ring-red-300" : ""}`}
        onClick={() => setOpen((o) => !o)}
        title={hidden ? t("Tasks (some pins are hidden)") : t("Tasks on this sheet")}
        aria-label={t("Tasks")}
        aria-expanded={open}
        data-testid="tasks-open"
      >
        <ListTodo className="h-5 w-5" />
        {openOnSheet > 0 && <span className="absolute -top-1.5 -right-1.5 min-w-5 rounded-full bg-red-600 px-1 text-center text-[11px] leading-5 font-semibold text-white ring-2 ring-white">{openOnSheet}</span>}
      </button>

      {drop && (
        // Centred on the screen above the bottom buttons.
        <Portal>
          <div role="status" className="fixed bottom-32 left-1/2 z-40 flex max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-2 rounded-full bg-ink/90 py-1.5 pr-1.5 pl-4 text-[13px] text-white shadow-pop backdrop-blur" data-testid="task-drop-hint">
            <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-amber-400" />
            <span className="min-w-0 truncate">{drop.kind === "new" ? t("Tap the plan to drop a task") : drop.kind === "duplicate" ? t("Tap where the copy of #{number} goes", { number: drop.source.number }) : t("Tap the new spot for the task")}</span>
            <button className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/15 hover:bg-white/25" onClick={() => arm(null)} aria-label={t("Cancel dropping a task")}>
              <X className="h-4 w-4" />
            </button>
          </div>
        </Portal>
      )}

      {open && (
        <aside className="card animate-in pointer-events-auto absolute top-0 right-full z-30 mr-2 flex max-h-[calc(100dvh-260px)] min-h-40 w-[min(22rem,calc(100vw-5rem))] flex-col overflow-hidden shadow-pop" data-testid="tasks-panel">
          <div className="flex items-center gap-1.5 border-b border-slate-100 px-2 py-2">
            <button className={`btn btn-sm ${drop?.kind === "new" ? "btn-on" : "btn-brand"}`} onClick={startDrop} title={t("Add a task: tap the plan where it goes (Shift+T)")} data-testid="task-add">
              <MapPinPlus /> {t("Task")}
            </button>
            <span className="mr-auto min-w-0 truncate pl-1 text-sm font-semibold">
              {t.tn("{n} task", "{n} tasks", sheetTasks.length)}
            </span>
            <button className={`btn btn-sm btn-icon btn-ghost relative ${filtersOpen ? "bg-slate-100" : ""}`} onClick={() => setFiltersOpen((f) => !f)} title={t("Filter task pins")} aria-label={t("Filter task pins")} aria-expanded={filtersOpen}>
              <SlidersHorizontal />
              {active && <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-brand-600 ring-2 ring-white" />}
            </button>
            <button className="btn btn-sm btn-icon btn-ghost" onClick={() => setOpen(false)} aria-label={t("Close")}>
              <X />
            </button>
          </div>

          {filtersOpen && (
            <div className="space-y-3 border-b border-slate-100 p-3">
              <div className="flex items-center">
                <span className="mr-auto text-sm font-semibold">{t("Show tasks")}</span>
                {active && (
                  <button className="btn btn-sm btn-ghost" onClick={() => setFilter({})}>
                    {t("Clear")}
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {STATUSES.map((s) => (
                  <Chip small key={s.id} on={!!filter.status?.includes(s.id)} color={s.color} onClick={() => setFilter({ ...filter, status: toggle(filter.status, s.id) })}>
                    {t(s.short)}
                  </Chip>
                ))}
              </div>
              <div className="flex flex-wrap gap-1.5">
                <Chip small on={mine} onClick={() => setFilter({ ...filter, assignee: mine ? [] : [me] })}>
                  {t("Mine")}
                </Chip>
                <Chip small on={filter.due === "overdue"} color="#dc2626" onClick={() => setFilter({ ...filter, due: filter.due === "overdue" ? null : "overdue" })}>
                  {t("Overdue")}
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
                {t("Grey out the others instead of hiding them")}
              </label>
            </div>
          )}

          {sheetTasks.length === 0 ? (
            <p className="p-4 text-sm text-slate-500">{t("No tasks on this sheet yet. Tap + Task, then tap the plan.")}</p>
          ) : (
            <ul className="scroll-thin min-h-0 flex-1 divide-y divide-slate-100 overflow-y-auto">
              {sheetTasks.map((tk) => (
                <li key={tk.id}>
                  <button
                    className={`flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-slate-50 ${tk.id === selectedId ? "bg-blue-50" : ""}`}
                    onClick={() => set({ selectedId: tk.id, showPins: true, ...(taskPlacement(tk) === "pin" ? {} : { detailId: tk.id }) })}
                    onDoubleClick={() => set({ detailId: tk.id })}
                  >
                    <TaskBadge task={tk} size={26} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{tk.title}</span>
                      <span className="flex flex-wrap gap-x-2 text-xs text-slate-500">
                        <span>{t(STATUSES.find((s) => s.id === tk.status)?.short ?? "")}</span>
                        {tk.assignee && <span>{tk.assignee}</span>}
                        <DueText task={tk} today={today} />
                        {taskPlacement(tk) === "sheet" && <span className="text-amber-700">{t("no spot")}</span>}
                      </span>
                    </span>
                    {isOverdue(tk, today) && <span className="h-2 w-2 rounded-full bg-red-600" title={t("Overdue")} />}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>
      )}

      {quick && <TaskQuickCreate projectId={projectId} draft={quick} onClose={() => set({ quick: null })} onCreated={(tk) => set({ selectedId: tk.id })} />}
      {detailId && (
        <TaskDetail
          taskId={detailId}
          onClose={() => set({ detailId: null })}
          onPlace={(tk) => {
            set({ detailId: null, selectedId: tk.id });
            claimPlanInput("task-drop");
            arm({ kind: "move", id: tk.id });
          }}
          onDuplicate={(tk) => {
            set({ detailId: null });
            claimPlanInput("task-drop");
            arm({ kind: "duplicate", source: tk });
          }}
        />
      )}
    </div>
  );
}

/** What a tap on the plan does while a drop is armed (registered as the overlay's onTap). */
export function handleTaskTap(ctx: { sheet: Sheet; x: number; y: number }, author: string): boolean {
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
    void st.save(withHistory).then((tk) => {
      st.set({ selectedId: tk.id, detailId: tk.id });
      toast(t("Task #{number} added", { number: tk.number }), "success");
    });
  } else {
    void st.change(drop.id, { sheetId: sheet.id, x, y }, author).then((tk) => tk && st.set({ selectedId: tk.id }));
  }
  return true;
}

function nearestRoomAt(sheetId: string, x: number, y: number): string | null {
  // Read-only: the room of the nearest device on the sheet.
  return nearestRoom(useEditor.getState().markers, sheetId, x, y);
}
