"use client";
// Job → Tasks: every task on the job. Filters live in the address (&tf=) so they survive a reload; sort; select
// several for bulk changes (status, assignee, due, category, priority, delete); download a filtered task / punch PDF.
import { CheckSquare, FileDown, ListTodo, Plus, Search, SlidersHorizontal, Square, Trash2, X } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { db, newId, nowIso } from "@/lib/db";
import { downloadBlob, slug } from "@/lib/download";
import { localDay } from "@/lib/fieldDocs";
import { renderPhoto } from "@/lib/photos";
import { useEditor } from "@/lib/store";
import {
  canDeleteTask,
  canSetStatus,
  decodeTaskFilter,
  duplicateTask,
  encodeTaskFilter,
  filterIsEmpty,
  filterTasks,
  isMineFilter,
  isOverdue,
  mineOpenFilter,
  PRIORITIES,
  priorityInfo,
  statusCounts,
  STATUSES,
  sortTasks,
  statusInfo,
  taskPlacement,
  type TaskFilter,
  type TaskSort,
} from "@/lib/tasks";
import { cropPlanAroundPin } from "@/lib/tasks/planCrop";
import { toast } from "@/lib/toast";
import type { PlanTask, TaskPriority, TaskStatus } from "@/lib/types";
import Dialog from "../Dialog";
import TaskDetail from "./TaskDetail";
import TaskQuickCreate from "./TaskQuickCreate";
import type { TaskPdfData, TaskPdfEntry } from "./TaskReportPdf";
import { Chip, DueText, PriorityPill, TaskBadge, useTaskOptions } from "./TaskUi";
import { useProjectTasks, useTasks, type QuickDraft } from "./taskStore";
import { useT } from "@/lib/i18n";

const toDataUrl = (b: Blob) =>
  new Promise<string>((r, j) => {
    const fr = new FileReader();
    fr.onload = () => r(String(fr.result));
    fr.onerror = () => j(fr.error);
    fr.readAsDataURL(b);
  });

export default function TaskList() {
  const { project, sheets, photos, settings, setActiveSheet, markers, catalog } = useEditor();
  const params = useSearchParams();
  const router = useRouter();
  const t = useT();
  const tasks = useProjectTasks(project?.id);
  const { me, myNames, role, people, categories } = useTaskOptions(tasks);
  const filter = useMemo(() => decodeTaskFilter(params.get("tf")), [params]);
  // Due date first: overdue and due-soon tasks at the top, no date last.
  const [sort, setSort] = useState<TaskSort>("due");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [quick, setQuick] = useState<QuickDraft | null>(null);
  const [confirm, setConfirm] = useState<"delete" | "category" | null>(null);
  const [pdfBusy, setPdfBusy] = useState<string | null>(null);
  const [pdfOpen, setPdfOpen] = useState(false);
  const [today] = useState(() => localDay(new Date().toISOString()));
  // A link straight to a task (My Tasks) opens it.
  const [detailId, setDetailId] = useState<string | null>(() => params.get("task"));
  const [text, setText] = useState(filter.text ?? "");

  const setFilter = (f: TaskFilter) => {
    const q = new URLSearchParams(params.toString());
    q.set("tf", encodeTaskFilter(f));
    q.delete("task");
    router.replace(`/project?${q.toString()}`, { scroll: false });
  };
  const shown = useMemo(() => sortTasks(filterTasks(tasks, filter, today), sort), [tasks, filter, today, sort]);
  const counts = useMemo(() => statusCounts(tasks), [tasks]);
  const sheetName = (id: string | null | undefined) => sheets.find((s) => s.id === id)?.name;
  // The device the list is narrowed to (the device card's "N tasks" on the plan).
  const device = filter.markerId ? markers.find((m) => m.id === filter.markerId) : undefined;
  const deviceName = device ? [device.label, catalog.find((d) => d.id === device.deviceTypeId)?.name].filter(Boolean).join(" · ") : "";
  const picked = shown.filter((tk) => selected.has(tk.id));
  const toggle = <T,>(list: T[] | undefined, v: T) => (list?.includes(v) ? list.filter((x) => x !== v) : [...(list ?? []), v]);
  const mine = isMineFilter(filter, myNames);
  const mineCount = useMemo(() => filterTasks(tasks, mineOpenFilter(myNames), today).length, [tasks, myNames, today]);
  // Filters other than the quick chips (Mine, Overdue): shown as a count on the "Filter" button.
  const moreFilters = [filter.priority?.length, !mine && filter.assignee?.length, filter.category?.length, filter.sheetId != null, filter.due && filter.due !== "overdue", filter.text?.trim(), filter.tags?.length].filter(Boolean).length;

  // Technicians open on their own open tasks (once, when the address has no filter yet).
  const techDefault = useRef(false);
  useEffect(() => {
    if (techDefault.current || role !== "tech" || params.has("tf") || !project) return;
    techDefault.current = true;
    const q = new URLSearchParams(params.toString());
    q.set("tf", encodeTaskFilter(mineOpenFilter(myNames)));
    router.replace(`/project?${q.toString()}`, { scroll: false });
  }, [role, params, project, myNames, router]);
  // My names can grow after the first render (the team loads, the device name is read): a "Mine" filter made with the
  // earlier names follows, so tasks assigned under the new name show and the chip stays on.
  const prevNames = useRef(myNames);
  useEffect(() => {
    const before = prevNames.current;
    prevNames.current = myNames;
    if (before === myNames || !isMineFilter(filter, before) || isMineFilter(filter, myNames)) return;
    const q = new URLSearchParams(params.toString());
    q.set("tf", encodeTaskFilter({ ...filter, assignee: [...myNames] }));
    router.replace(`/project?${q.toString()}`, { scroll: false });
  }, [myNames, filter, params, router]);

  if (!project) return null;

  async function bulk(label: string, patch: (tk: PlanTask) => Partial<PlanTask>, allowed: (tk: PlanTask) => boolean = () => true) {
    const ok = picked.filter(allowed);
    const n = await useTasks.getState().changeMany(
      ok.map((tk) => tk.id),
      patch,
      me,
    );
    const skipped = picked.length - ok.length;
    toast(`${t.tn("{label}: {n} task", "{label}: {n} tasks", n, { label })}${skipped ? ` ${t.tn("({n} not allowed)", "({n} not allowed)", skipped)}` : ""}`, "success");
  }

  async function bulkDelete() {
    const ok = picked.filter((tk) => canDeleteTask(role, tk, me));
    await useTasks.getState().softDelete(ok.map((tk) => tk.id));
    setSelected(new Set());
    toast(`${t.tn("Deleted {n} task", "Deleted {n} tasks", ok.length)}${picked.length - ok.length ? ` ${t.tn("({n} made by others kept)", "({n} made by others kept)", picked.length - ok.length)}` : ""}`);
  }

  function showOnPlan(tk: PlanTask, move: boolean) {
    const sheetId = tk.sheetId ?? useEditor.getState().activeSheetId ?? sheets[0]?.id;
    if (!sheetId) return toast(t("Add a plan sheet first"), "error");
    setActiveSheet(sheetId);
    useTasks.getState().set({ selectedId: tk.id, showPins: true, detailId: null });
    if (move || taskPlacement(tk) !== "pin") useTasks.getState().arm({ kind: "move", id: tk.id });
    router.replace(`/project?id=${project!.id}&tab=plan`);
  }

  async function duplicate(tk: PlanTask) {
    const at = nowIso();
    const st = useTasks.getState();
    const copy = { ...duplicateTask(tk, at, { id: newId(), number: st.nextNumber(), by: me, newItemId: newId }), sheetId: tk.sheetId ?? null, room: tk.room ?? null };
    const saved = await st.save({ ...copy, activity: [{ id: newId(), at, by: me, kind: "created", text: `copied from #${tk.number}` }] });
    toast(saved.sheetId ? t("Task #{number} added — place it on the plan", { number: saved.number }) : t("Task #{number} added", { number: saved.number }), "success");
    setDetailId(saved.id);
  }

  async function exportPdf(groupBy: "sheet" | "assignee") {
    if (!settings || pdfBusy) return;
    setPdfOpen(false);
    try {
      const list = shown;
      if (!list.length) return toast(t("No tasks to export"), "error");
      const entries: { tk: PlanTask; e: TaskPdfEntry }[] = [];
      const sheetImages = new Map<string, Blob | null>();
      let i = 0;
      for (const tk of list) {
        setPdfBusy(t("Preparing task {n} of {total}…", { n: ++i, total: list.length }));
        let crop: string | null = null;
        const sheet = sheets.find((s) => s.id === tk.sheetId);
        if (sheet && taskPlacement(tk) === "pin") {
          if (!sheetImages.has(sheet.id)) sheetImages.set(sheet.id, (await db().images.get(sheet.imageId))?.blob ?? null);
          const blob = sheetImages.get(sheet.id);
          if (blob) crop = await cropPlanAroundPin(blob, tk.x!, tk.y!, { color: statusInfo(tk.status).color, label: String(tk.number) }).catch(() => null);
        }
        let photo: TaskPdfEntry["photo"] = null;
        const p = photos.find((x) => x.id === tk.photoIds?.[0] && !x.deleted);
        const rec = p ? await db().images.get(p.imageId) : null;
        if (p && rec) photo = { src: await toDataUrl(await renderPhoto(rec.blob, p.annotations, 900)), width: p.width, height: p.height };
        const cl = tk.checklist ?? [];
        entries.push({
          tk,
          e: {
            number: tk.number,
            title: tk.title,
            status: statusInfo(tk.status).label,
            statusColor: statusInfo(tk.status).color,
            priority: priorityInfo(tk.priority)?.label ?? null,
            category: tk.category,
            assignee: tk.assignee,
            due: tk.due ? new Date(`${tk.due}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : null,
            overdue: isOverdue(tk, today),
            where: [sheet?.name ?? "General", tk.room].filter(Boolean).join(" · "),
            description: tk.description,
            checklist: cl.length ? { done: cl.filter((c) => c.done).length, total: cl.length, items: cl.slice(0, 8).map((c) => ({ text: c.text, done: !!c.done })) } : null,
            tags: tk.tags ?? [],
            meta: [
              tk.createdBy ? `Opened by ${tk.createdBy}` : "Opened",
              new Date(tk.createdAt).toLocaleDateString(),
              tk.closedAt ? `completed ${new Date(tk.closedAt).toLocaleDateString()}` : "",
              tk.verifiedBy ? `verified by ${tk.verifiedBy}` : "",
              (tk.photoIds?.length ?? 0) > 1 ? `${tk.photoIds!.length} photos` : "",
            ]
              .filter(Boolean)
              .join(" · "),
            crop,
            photo,
          },
        });
      }
      setPdfBusy(t("Building the PDF…"));
      const groups = new Map<string, TaskPdfEntry[]>();
      const order = groupBy === "sheet" ? [...sheets.map((s) => s.name), "General"] : [];
      for (const { tk, e } of entries) {
        const key = groupBy === "sheet" ? (sheetName(tk.sheetId) ?? "General") : tk.assignee?.trim() || "Unassigned";
        groups.set(key, [...(groups.get(key) ?? []), e]);
      }
      const names = [...groups.keys()].sort((a, b) =>
        groupBy === "sheet" ? order.indexOf(a) - order.indexOf(b) : a === "Unassigned" ? 1 : b === "Unassigned" ? -1 : a.localeCompare(b),
      );
      const c = statusCounts(list);
      const data: TaskPdfData = {
        title: "Task report",
        business: settings.business,
        clientName: project!.clientName,
        address: project!.address,
        filterText: filterSummary(filter, sheetName) || "All tasks",
        generated: new Date().toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }),
        counts: STATUSES.map((s) => ({ label: s.label, color: s.color, n: c[s.id] })),
        groups: names.map((name) => ({ name, tasks: groups.get(name)! })),
      };
      const { renderTaskReportPdf } = await import("./TaskReportPdf");
      const out = await renderTaskReportPdf(data);
      downloadBlob(out, `${slug(project!.address || project!.clientName || "job")}-tasks-${today}.pdf`);
    } catch (e) {
      toast(t("PDF failed: {error}", { error: (e as Error).message }), "error");
    } finally {
      setPdfBusy(null);
    }
  }

  const allPicked = shown.length > 0 && shown.every((tk) => selected.has(tk.id));

  return (
    <div className="space-y-4">
      {/* Summary + actions. Phones: Add task first, the status counts in one row that scrolls sideways. */}
      <div className="flex flex-wrap items-center gap-2 max-sm:justify-end">
        <div className="scroll-thin mr-auto flex flex-wrap gap-1.5 max-sm:order-last max-sm:w-full max-sm:flex-nowrap max-sm:overflow-x-auto max-sm:py-1.5">
          {STATUSES.map((s) => (
            <Chip small key={s.id} on={!!filter.status?.includes(s.id)} color={s.color} onClick={() => setFilter({ ...filter, status: toggle(filter.status, s.id) })}>
              {t(s.short)} <span className="tabular-nums opacity-80">{counts[s.id]}</span>
            </Chip>
          ))}
        </div>
        <div className="relative">
          <button className="btn" onClick={() => setPdfOpen((o) => !o)} disabled={!!pdfBusy || !shown.length} aria-expanded={pdfOpen}>
            <FileDown /> {pdfBusy ?? "PDF"}
          </button>
          {pdfOpen && (
            <div className="card animate-in absolute top-10 right-0 z-30 w-56 p-1.5 shadow-pop">
              <div className="px-2 py-1 text-xs text-slate-500">{t.tn("{n} task (the current filter), grouped by", "{n} tasks (the current filter), grouped by", shown.length)}</div>
              <button className="btn btn-ghost w-full justify-start" onClick={() => void exportPdf("sheet")}>
                {t("Sheet")}
              </button>
              <button className="btn btn-ghost w-full justify-start" onClick={() => void exportPdf("assignee")}>
                {t("Assignee")}
              </button>
            </div>
          )}
        </div>
        <button
          className="btn btn-brand"
          onClick={() => setQuick(device ? { sheetId: device.sheetId, x: device.x, y: device.y, room: device.room || null, markerId: device.id } : { sheetId: filter.sheetId || null, x: null, y: null })}
        >
          <Plus /> {t("Add task")}
        </button>
      </div>

      {/* Quick filters; the rest behind "Filter" */}
      <div className="flex flex-wrap items-center gap-1.5">
        {filter.markerId && (
          <button type="button" className="chip h-10 gap-1.5 bg-brand-600 px-3 text-white" onClick={() => setFilter({ ...filter, markerId: null })} aria-label={t("Show tasks for every device")} data-testid="task-device-filter">
            {t("Device: {name}", { name: deviceName || "—" })}
            <X className="h-4 w-4" />
          </button>
        )}
        <Chip on={mine} onClick={() => setFilter(mine ? { ...filter, assignee: [], status: [] } : { ...filter, ...mineOpenFilter(myNames) })} title={t("Open tasks assigned to {name}", { name: me })}>
          {t("Mine")} <span className="tabular-nums opacity-80">{mineCount}</span>
        </Chip>
        <Chip on={filter.due === "overdue"} color="#dc2626" onClick={() => setFilter({ ...filter, due: filter.due === "overdue" ? null : "overdue" })}>
          {t("Overdue")}
        </Chip>
        <button className={`btn h-10 ${filtersOpen || moreFilters ? "btn-on" : ""}`} onClick={() => setFiltersOpen((o) => !o)} aria-expanded={filtersOpen} aria-controls="task-filters">
          <SlidersHorizontal /> {t("Filter")}{moreFilters ? ` · ${moreFilters}` : ""}
        </button>
        <select className="input ml-auto h-10 w-auto" value={sort} onChange={(e) => setSort(e.target.value as TaskSort)} aria-label={t("Sort")}>
          <option value="due">{t("Sort: due date")}</option>
          <option value="number">{t("Sort: number")}</option>
          <option value="priority">{t("Sort: priority")}</option>
          <option value="status">{t("Sort: status")}</option>
        </select>
      </div>

      {/* Filters */}
      {filtersOpen && (
      <div className="card space-y-3 p-3" id="task-filters">
        <form
          className="relative"
          onSubmit={(e) => {
            e.preventDefault();
            setFilter({ ...filter, text });
          }}
        >
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input className="input pl-9" placeholder={t("Search tasks or #number")} value={text} onChange={(e) => setText(e.target.value)} onBlur={() => text !== (filter.text ?? "") && setFilter({ ...filter, text })} aria-label={t("Search tasks")} />
        </form>
        <div className="flex flex-wrap items-center gap-1.5">
          {PRIORITIES.map((p) => (
            <Chip small key={p.id} on={!!filter.priority?.includes(p.id)} color={p.color} onClick={() => setFilter({ ...filter, priority: toggle(filter.priority, p.id) })}>
              {p.label}
            </Chip>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <select className="input h-9" value={filter.assignee?.length === 1 ? filter.assignee[0] : ""} onChange={(e) => setFilter({ ...filter, assignee: e.target.value === "" ? [] : e.target.value === "__none" ? [""] : [e.target.value] })} aria-label={t("Assigned to")}>
            <option value="">{t("Anyone")}</option>
            <option value="__none">{t("Unassigned")}</option>
            {people.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          <select className="input h-9" value={filter.category?.[0] ?? ""} onChange={(e) => setFilter({ ...filter, category: e.target.value ? [e.target.value] : [] })} aria-label={t("Category")}>
            <option value="">{t("Any category")}</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <select className="input h-9" value={filter.sheetId ?? "__all"} onChange={(e) => setFilter({ ...filter, sheetId: e.target.value === "__all" ? null : e.target.value })} aria-label={t("Sheet")}>
            <option value="__all">{t("All sheets")}</option>
            <option value="">{t("General (no sheet)")}</option>
            {sheets.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <select className="input h-9" value={filter.due ?? ""} onChange={(e) => setFilter({ ...filter, due: (e.target.value || null) as TaskFilter["due"] })} aria-label={t("Due")}>
            <option value="">{t("Any due date")}</option>
            <option value="overdue">{t("Overdue")}</option>
            <option value="today">{t("Due today")}</option>
            <option value="week">{t("Due this week")}</option>
            <option value="none">{t("No due date")}</option>
          </select>
        </div>
      </div>
      )}
      {!filterIsEmpty(filter) && (
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span className="min-w-0 flex-1 truncate">
              {t("{shown} of {total}", { shown: shown.length, total: tasks.length })} · {filterSummary(filter, sheetName, t)}
            </span>
            <button
              className="btn btn-sm btn-ghost"
              onClick={() => {
                setText("");
                setFilter({});
              }}
            >
              <X /> {t("Clear")}
            </button>
          </div>
        )}

      {/* List */}
      {tasks.length === 0 ? (
        <div className="card flex flex-col items-center gap-2 p-10 text-center">
          <ListTodo className="h-8 w-8 text-slate-300" />
          <div className="font-medium">{t("No tasks yet")}</div>
          <p className="max-w-md text-sm text-slate-500">
            {t("Tap Add task for something to do on this job, or on the Plan tap the pin button (Shift+T) and tap the spot.")}
          </p>
        </div>
      ) : (
        <section className="card overflow-hidden">
          <div className="flex items-center gap-3 border-b border-slate-100 px-3 py-2 text-xs text-slate-500">
            <button className="tap flex h-8 w-8 items-center justify-center" onClick={() => setSelected(allPicked ? new Set() : new Set(shown.map((tk) => tk.id)))} aria-label={allPicked ? t("Select none") : t("Select all")}>
              {allPicked ? <CheckSquare className="h-5 w-5 text-brand-600" /> : <Square className="h-5 w-5" />}
            </button>
            <span>{selected.size ? t.tn("{n} selected", "{n} selected", picked.length) : t.tn("{n} task", "{n} tasks", shown.length)}</span>
          </div>
          <ul className="divide-y divide-slate-100">
            {shown.map((tk) => (
              <li key={tk.id} className={`flex items-center gap-2 px-3 py-2 ${selected.has(tk.id) ? "bg-brand-50/60" : ""}`}>
                <button
                  className="flex h-10 w-8 shrink-0 items-center justify-center pointer-coarse:h-11 pointer-coarse:w-11"
                  onClick={() => setSelected((s) => (s.has(tk.id) ? new Set([...s].filter((x) => x !== tk.id)) : new Set([...s, tk.id])))}
                  aria-label={t("Select #{number}", { number: tk.number })}
                  aria-pressed={selected.has(tk.id)}
                >
                  {selected.has(tk.id) ? <CheckSquare className="h-5 w-5 text-brand-600" /> : <Square className="h-5 w-5 text-slate-400" />}
                </button>
                <button className="flex min-w-0 flex-1 items-center gap-3 py-1 text-left" onClick={() => setDetailId(tk.id)}>
                  <TaskBadge task={tk} size={30} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium">{tk.title}</span>
                      <PriorityPill priority={tk.priority} />
                    </span>
                    <span className="mt-0.5 flex flex-wrap gap-x-2.5 text-xs text-slate-500">
                      <span style={{ color: statusInfo(tk.status).color }} className="font-medium">
                        {t(statusInfo(tk.status).short)}
                      </span>
                      <span>
                        {sheetName(tk.sheetId) ?? t("General")}
                        {tk.room ? ` · ${tk.room}` : ""}
                      </span>
                      {tk.assignee && <span>{tk.assignee}</span>}
                      {tk.category && <span>{tk.category}</span>}
                      <DueText task={tk} today={today} />
                      {(tk.photoIds?.length ?? 0) > 0 && <span>{t.tn("{n} photo", "{n} photos", tk.photoIds!.length)}</span>}
                      {(tk.checklist?.length ?? 0) > 0 && (
                        <span>
                          {tk.checklist!.filter((c) => c.done).length}/{tk.checklist!.length}
                        </span>
                      )}
                    </span>
                  </span>
                </button>
              </li>
            ))}
            {shown.length === 0 && <li className="px-4 py-8 text-center text-sm text-slate-500">{t("No tasks match the filter.")}</li>}
          </ul>
        </section>
      )}

      {/* Bulk actions */}
      {picked.length > 0 && (
        <div className="sticky bottom-3 z-20">
          <div className="card flex flex-wrap items-center gap-2 p-2 shadow-pop ring-1 ring-slate-200">
            <span className="px-1 text-sm font-semibold">{t.tn("{n} selected", "{n} selected", picked.length)}</span>
            <select
              className="input h-9 w-auto"
              value=""
              aria-label={t("Set status")}
              onChange={(e) => {
                const s = e.target.value as TaskStatus;
                if (s) void bulk(t("Status {status}", { status: t(statusInfo(s).label) }), () => ({ status: s }), (tk) => canSetStatus(role, tk.status, s));
              }}
            >
              <option value="">{t("Status…")}</option>
              {STATUSES.map((s) => (
                <option key={s.id} value={s.id} disabled={role === "tech" && s.id === "verified"}>
                  {t(s.label)}
                </option>
              ))}
            </select>
            <select
              className="input h-9 w-auto"
              value=""
              aria-label={t("Assign")}
              onChange={(e) => {
                const v = e.target.value;
                if (v) void bulk(v === "__none" ? t("Unassigned") : t("Assigned to {name}", { name: v }), () => ({ assignee: v === "__none" ? null : v }));
              }}
            >
              <option value="">{t("Assign…")}</option>
              <option value="__none">{t("Unassigned")}</option>
              {people.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
            <select
              className="input h-9 w-auto"
              value=""
              aria-label={t("Set priority")}
              onChange={(e) => {
                const v = e.target.value;
                if (v) void bulk(v === "0" ? t("Priority cleared") : t("Priority P{n}", { n: v }), () => ({ priority: v === "0" ? null : (Number(v) as TaskPriority) }));
              }}
            >
              <option value="">{t("Priority…")}</option>
              {PRIORITIES.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label} · {t(p.name)}
                </option>
              ))}
              <option value="0">{t("None")}</option>
            </select>
            <label className="flex items-center gap-1 text-sm text-slate-600">
              {t("Due")}
              <input type="date" className="input h-9 w-auto" value="" aria-label={t("Set due date")} onChange={(e) => e.target.value && void bulk(t("Due {date}", { date: e.target.value }), () => ({ due: e.target.value }))} />
            </label>
            <button className="btn" onClick={() => setConfirm("category")}>
              {t("Category…")}
            </button>
            <button className="btn btn-danger" onClick={() => setConfirm("delete")}>
              <Trash2 /> {t("Delete")}
            </button>
            <button className="btn btn-ghost btn-icon ml-auto" onClick={() => setSelected(new Set())} aria-label={t("Clear selection")}>
              <X />
            </button>
          </div>
        </div>
      )}

      {confirm === "delete" && (
        <Dialog
          title={t.tn("Delete {n} task?", "Delete {n} tasks?", picked.length)}
          description={role === "tech" ? t("Tasks made by other people are kept.") : t("They disappear from the plan and the list for everyone on the job.")}
          fields={[]}
          submitLabel={t("Delete")}
          onCancel={() => setConfirm(null)}
          onSubmit={() => {
            setConfirm(null);
            void bulkDelete();
          }}
        />
      )}
      {confirm === "category" && (
        <Dialog
          title={t("Set category")}
          description={categories.length ? t("For example: {list}. Leave empty to clear.", { list: categories.slice(0, 4).join(", ") }) : t("Leave empty to clear.")}
          fields={[{ name: "category", label: t("Category"), placeholder: categories[0] ?? t("Electrical") }]}
          submitLabel={t("Apply")}
          onCancel={() => setConfirm(null)}
          onSubmit={(v) => {
            setConfirm(null);
            const typed = v.category.trim();
            const c = categories.find((x) => x.toLowerCase() === typed.toLowerCase()) ?? typed;
            void bulk(c ? t("Category {name}", { name: c }) : t("Category cleared"), () => ({ category: c || null }));
          }}
        />
      )}

      {quick && <TaskQuickCreate projectId={project.id} draft={quick} onClose={() => setQuick(null)} />}
      {detailId && (
        <TaskDetail
          taskId={detailId}
          onClose={() => {
            setDetailId(null);
            // Opened from a link (My Tasks): don't open it again on reload.
            if (params.has("task")) {
              const q = new URLSearchParams(params.toString());
              q.delete("task");
              router.replace(`/project?${q.toString()}`, { scroll: false });
            }
          }}
onPlace={(tk) => showOnPlan(tk, false)} onDuplicate={(tk) => void duplicate(tk)} placeLabel={t("Show on plan")} />
      )}
    </div>
  );
}

/** "Open, Ready · Mike · Overdue · “cover”" for the list and the PDF (the PDF stays English: no `tr`). */
function filterSummary(f: TaskFilter, sheetName: (id: string) => string | undefined, tr: (s: string) => string = (s) => s): string {
  return [
    f.status?.map((s) => tr(statusInfo(s).label)).join(", "),
    f.priority?.map((p) => `P${p}`).join(", "),
    f.category?.join(", "),
    f.assignee?.map((a) => a || tr("Unassigned")).join(", "),
    f.sheetId != null ? (f.sheetId === "" ? tr("General") : (sheetName(f.sheetId) ?? tr("Sheet"))) : "",
    f.due ? tr({ overdue: "Overdue", today: "Due today", week: "Due this week", none: "No due date" }[f.due]) : "",
    f.text?.trim() ? `“${f.text.trim()}”` : "",
    f.tags?.map((tk) => `#${tk}`).join(" "),
  ]
    .filter(Boolean)
    .join(" · ");
}
