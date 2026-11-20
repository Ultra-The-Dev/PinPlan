"use client";
// Tasks across every job: open checklist / punch-list items that are assigned to someone, have a due date or came from a photo comment.
import { TONE_TEXT } from "@/lib/statusStyle";
import { CalendarDays, Camera, Check, ClipboardList, ExternalLink, HardHat, MapPin, Plus, UserRound, X } from "lucide-react";
// /tasks: every open task across jobs. Technicians open on their own (Mine, under any of their names); the office on
// Everyone, overdue first. The Today card on top; "+ Add task" picks a job. Older checklist items that were assigned
// on the checklist itself still show here, read-only, with a link to the item on its job.
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { db, newId, nowIso, put } from "@/lib/db";
import { fmtDate, t, useT } from "@/lib/i18n";
import { tourAnchor } from "@/lib/tour/anchors";
import { localDay, openTasks, TASK_BUCKETS, teamNames, type OpenTask } from "@/lib/fieldDocs";
import { useRole, useTeam } from "@/lib/team";
import { toast } from "@/lib/toast";
import { applyTaskChange, newTask, nextTaskNumber, openPlanTasksFor, priorityInfo, sortOverdueFirst, statusInfo, type OpenPlanTask } from "@/lib/tasks";
import type { Checklist, Photo, PlanTask, Project } from "@/lib/types";
import { useBlobUrl } from "@/lib/useImage";
import { useMe } from "@/lib/useMe";
import TodayCard from "./field/TodayCard";
import { PersonSelect } from "./tasks/TaskUi";
import { rich } from "./ui/richText";
import { TASKS_EVENT, tasksChanged } from "./tasks/taskStore";

const dueText = (due: string) => fmtDate(new Date(`${due}T12:00:00`), { weekday: "short", month: "short", day: "numeric" });
const BUCKET_STYLE: Record<OpenTask["bucket"], string> = {
  overdue: TONE_TEXT.bad,
  today: TONE_TEXT.warn,
  week: "text-slate-700",
  later: "text-slate-500",
  none: "text-slate-500",
};
const jobName = (p?: Project) => p?.address || p?.clientName || t("Job");
const itemHref = (t: OpenTask) => `/project?id=${t.project.id}&tab=field&section=checklists&cl=${t.checklist.id}&item=${t.item.id}`;

/** Thumbnail of the photo a task was made from; opens the job's photos. */
function TaskPhoto({ photo, href }: { photo: Photo; href: string }) {
  const url = useBlobUrl(photo.imageId);
  const t = useT();
  return (
    <Link href={href} className="block h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-slate-100 ring-1 ring-slate-200" aria-label={t("Open the job's photos")} title={photo.caption ?? t("Photo this task came from")}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {url && <img src={url} alt="" className="h-full w-full object-cover" />}
    </Link>
  );
}

export default function TasksBoard() {
  const { me, names: myNames } = useMe();
  const members = useTeam((s) => s.members);
  const role = useRole();
  const [projects, setProjects] = useState<Project[]>([]);
  const [checklists, setChecklists] = useState<Checklist[] | null>(null);
  // Tasks on jobs (src/lib/tasks.ts), and older assigned checklist items next to them.
  const [planTasks, setPlanTasks] = useState<PlanTask[]>([]);
  const [photos, setPhotos] = useState<Map<string, Photo>>(new Map());
  // "__auto" follows the role: Mine for technicians, Everyone for the office.
  const [who, setWho] = useState<string>("__auto");
  const [today, setToday] = useState("");
  const [adding, setAdding] = useState(false);
  const t = useT();

  const load = useCallback(async () => {
    setToday(localDay(new Date().toISOString()));
    setProjects((await db().projects.toArray()).filter((p) => !p.deleted));
    const cs = (await db().checklists.toArray()).filter((c) => !c.deleted);
    // Only the photos tasks were made from (comment → task), for their thumbnails.
    const ids = [...new Set(cs.flatMap((c) => c.items.map((i) => i.photoId).filter((x): x is string => !!x)))];
    const ps = ids.length ? await db().photos.bulkGet(ids) : [];
    setPhotos(new Map(ps.filter((p): p is Photo => !!p && !p.deleted).map((p) => [p.id, p])));
    setPlanTasks(await db().tasks.toArray());
    setChecklists(cs);
  }, []);
  useEffect(() => {
    const t = window.setTimeout(() => void load(), 0);
    // Pick up synced changes, and roll "today" over when the tab comes back after midnight.
    const reload = () => void load();
    const onVisible = () => document.visibilityState === "visible" && reload();
    window.addEventListener("pinplan:synced", reload);
    window.addEventListener(TASKS_EVENT, reload);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("pinplan:synced", reload);
      window.removeEventListener(TASKS_EVENT, reload);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);

  // "__all" = Everyone (assigned or not), "__none" = tasks nobody has yet.
  const mode = who === "__auto" ? (role === "tech" ? "__me" : "__all") : who;
  const filter: string[] | string | null = mode === "__me" ? myNames : mode === "__all" || mode === "__none" ? null : mode;
  const unassigned = mode === "__none" ? "only" : mode === "__all" ? "include" : undefined;
  const jobs = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);
  const liveTasks = useMemo(() => planTasks.filter((t) => !t.deleted && jobs.has(t.projectId)), [planTasks, jobs]);
  const tasks = useMemo(
    () => (checklists && today ? openTasks({ projects, checklists }, { today, who: filter }).filter((it) => unassigned !== "only" || !it.item.assignee?.trim()) : []),
    [projects, checklists, today, filter, unassigned],
  );
  const planOpen = useMemo(() => (today ? sortOverdueFirst(openPlanTasksFor(filter, liveTasks, today, { unassigned })) : []), [liveTasks, today, filter, unassigned]);
  // Open tasks nobody has yet (the "Unassigned" chip's count).
  const unassignedCount = useMemo(
    () =>
      checklists && today
        ? openTasks({ projects, checklists }, { today }).filter((it) => !it.item.assignee?.trim()).length + openPlanTasksFor(null, liveTasks, today, { unassigned: "only" }).length
        : 0,
    [projects, checklists, today, liveTasks],
  );
  const names = useMemo(() => {
    const ns = teamNames({ checklists: checklists ?? [], members }, me);
    for (const t of liveTasks) if (t.assignee?.trim() && !ns.some((n) => n.toLowerCase() === t.assignee!.trim().toLowerCase())) ns.push(t.assignee.trim());
    return ns.sort((a, b) => a.localeCompare(b));
  }, [checklists, members, me, liveTasks]);
  // Same count as the job's "Mine" chip (mineOpenFilter), plus older assigned checklist items.
  const mineCount = useMemo(
    () => (checklists && today ? openTasks({ projects, checklists }, { today, who: myNames }).length + openPlanTasksFor(myNames, liveTasks, today).length : 0),
    [projects, checklists, today, myNames, liveTasks],
  );

  async function completePlanTask(pt: OpenPlanTask) {
    // Fresh copy, so a quick second tick doesn't overwrite the first.
    const cur = (await db().tasks.get(pt.task.id)) ?? pt.task;
    await put("tasks", applyTaskChange(cur, { status: "done" }, me, nowIso(), newId));
    toast(t("Completed: #{number} {title}", { number: pt.task.number, title: pt.task.title }), "success");
    tasksChanged();
  }

  const whoLabel = mode === "__me" || mode === "__none" ? mode : mode === "__all" ? "" : mode;
  return (
    <div className="mx-auto max-w-4xl space-y-4 px-4 py-6 sm:px-6 sm:py-8">
      <div className="flex flex-wrap items-end gap-3">
        <div className="mr-auto">
          <h1 className="page-title">{t("Tasks")}</h1>
          <p className="mt-1 text-sm text-slate-500">{t("Open tasks on every job, overdue first.")}</p>
        </div>
        <Link href="/schedule" className="btn h-10" title={t("Crew board: who is on which job each day")}>
          <HardHat /> {t("Crew")}
        </Link>
        <select className="input h-10 w-auto" value={mode} onChange={(e) => setWho(e.target.value)} aria-label={t("Whose tasks")}>
          <option value="__me">{t("Mine · {n}", { n: mineCount })}</option>
          <option value="__all">{t("Everyone")}</option>
          <option value="__none">{t("Unassigned · {n}", { n: unassignedCount })}</option>
          {names
            .filter((n) => !myNames.some((m) => m.toLowerCase() === n.toLowerCase()))
            .map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
        </select>
        {unassignedCount > 0 && (
          <button
            type="button"
            className={`chip h-10 px-3 text-sm ${mode === "__none" ? "bg-brand-600 text-white" : "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"}`}
            aria-pressed={mode === "__none"}
            onClick={() => setWho(mode === "__none" ? "__all" : "__none")}
            title={t("Open tasks nobody is assigned to yet")}
            data-testid="tasks-unassigned"
          >
            {t("Unassigned")} <span className="tabular-nums opacity-80">{unassignedCount}</span>
          </button>
        )}
        <button className="btn btn-brand h-10" onClick={() => setAdding(true)} {...tourAnchor("tasks-add")} disabled={!projects.length} title={projects.length ? undefined : t("Add a job first")}>
          <Plus /> {t("Add task")}
        </button>
      </div>

      <TodayCard />

      {checklists && tasks.length === 0 && planOpen.length === 0 && (
        <div className="card flex flex-col items-center gap-2 p-10 text-center">
          <ClipboardList className="h-8 w-8 text-slate-300" />
          <div className="font-medium">{whoLabel === "__me" ? t("No open tasks for you") : whoLabel === "__none" ? t("No unassigned open tasks") : whoLabel ? t("No open tasks for {name}", { name: whoLabel }) : t("No open tasks")}</div>
          <p className="max-w-md text-sm text-slate-500">
            {rich(t("Tap {button} to give someone something to do on a job. Tasks also come from the plan, photo comments, checklists and forms."), { button: <strong>{t("Add task")}</strong> })}
          </p>
        </div>
      )}

      {TASK_BUCKETS.map((b) => {
        const list = tasks.filter((t) => t.bucket === b.id);
        const plan = planOpen.filter((t) => t.bucket === b.id);
        if (!list.length && !plan.length) return null;
        return (
          <section key={b.id}>
            <h2 className={`mb-2 px-1 text-xs font-semibold tracking-wide uppercase ${BUCKET_STYLE[b.id]}`}>
              {t(b.name)} · {list.length + plan.length}
            </h2>
            <ul className="card divide-y divide-slate-100">
              {plan.map((t) => (
                <PlanTaskRow key={t.task.id} t={t} project={jobs.get(t.task.projectId)!} onComplete={() => void completePlanTask(t)} />
              ))}
              {list.map((ot) => (
                // Older checklist item assigned on the checklist: read-only here, opens the item on its job.
                <li key={`${ot.checklist.id}:${ot.item.id}`} className="flex items-start gap-2 px-2 py-1.5 sm:px-3">
                  <Link
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-50"
                    href={itemHref(ot)}
                    aria-label={t("Open on the job's checklist: {item}", { item: ot.item.text })}
                    title={ot.item.requiresPhoto ? t("Needs a photo — tick it on the job's checklist") : t("Tick it on the job's checklist")}
                  >
                    {ot.item.requiresPhoto ? <Camera className="h-5 w-5 text-amber-600" /> : <ExternalLink className="h-5 w-5" />}
                  </Link>
                  <div className="min-w-0 flex-1 py-2">
                    <Link href={itemHref(ot)} className="text-sm font-medium hover:underline">
                      {ot.item.text}
                    </Link>
                    <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-slate-500">
                      <Link className="font-medium text-brand-600 hover:underline" href={`/project?id=${ot.project.id}&tab=field`}>
                        {jobName(ot.project)}
                      </Link>
                      <span>{t("On checklist “{name}”", { name: ot.checklist.name })}</span>
                      {ot.item.assignee && (
                        <span className="inline-flex items-center gap-1">
                          <UserRound className="h-3 w-3" /> {ot.item.assignee}
                        </span>
                      )}
                      {ot.item.due && (
                        <span className={`inline-flex items-center gap-1 ${BUCKET_STYLE[ot.bucket]}`}>
                          <CalendarDays className="h-3 w-3" /> {dueText(ot.item.due)}
                        </span>
                      )}
                      {ot.item.requiresPhoto && <span className="text-amber-700">{t("Photo required")}</span>}
                    </div>
                  </div>
                  {ot.item.photoId && photos.get(ot.item.photoId) && <TaskPhoto photo={photos.get(ot.item.photoId)!} href={`/project?id=${ot.project.id}&tab=photos`} />}
                </li>
              ))}
            </ul>
          </section>
        );
      })}

      {adding && <AddTask projects={projects} people={[me, ...names.filter((n) => n.toLowerCase() !== me.toLowerCase())]} me={me} defaultWho={mode === "__me" ? me : mode === "__all" || mode === "__none" ? "" : mode} onClose={() => setAdding(false)} />}
    </div>
  );
}

/** A task ticks to Completed (the office verifies it); the title opens it on the job. */
function PlanTaskRow({ t: pt, project, onComplete }: { t: OpenPlanTask; project: Project; onComplete: () => void }) {
  const s = statusInfo(pt.task.status);
  const p = priorityInfo(pt.task.priority);
  const href = `/project?id=${project.id}&tab=tasks&tf=&task=${pt.task.id}`;
  const t = useT();
  return (
    <li className="flex items-start gap-2 px-2 py-1.5 sm:px-3">
      <button className="group flex h-11 w-11 shrink-0 items-center justify-center rounded-lg" onClick={onComplete} aria-label={t("Mark completed: #{number} {title}", { number: pt.task.number, title: pt.task.title })} title={t("Mark completed")}>
        <span className="flex h-6 w-6 items-center justify-center rounded-md bg-white ring-1 ring-slate-300 group-hover:bg-emerald-50 group-hover:ring-emerald-500 group-focus-visible:ring-emerald-500">
          <Check className="h-4 w-4 text-transparent group-hover:text-emerald-600 group-focus-visible:text-emerald-600" />
        </span>
      </button>
      <div className="min-w-0 flex-1 py-2">
        <Link href={href} className="text-sm font-medium hover:underline">
          <span className="mr-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] font-bold text-white tabular-nums" style={{ background: s.color }}>
            {pt.task.number}
          </span>
          {pt.task.title}
        </Link>
        <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-slate-500">
          <Link className="font-medium text-brand-600 hover:underline" href={`/project?id=${project.id}&tab=field`}>
            {jobName(project)}
          </Link>
          <span className="inline-flex items-center gap-1">
            <MapPin className="h-3 w-3" /> {t(s.label)}
            {pt.task.room ? ` · ${pt.task.room}` : ""}
          </span>
          {p && <span style={{ color: p.color }}>{t(p.label)}</span>}
          {pt.task.assignee?.trim() ? (
            <span className="inline-flex items-center gap-1">
              <UserRound className="h-3 w-3" /> {pt.task.assignee}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-amber-700">
              <UserRound className="h-3 w-3" /> {t("Unassigned")}
            </span>
          )}
          {pt.task.due && (
            <span className={`inline-flex items-center gap-1 ${BUCKET_STYLE[pt.bucket]}`}>
              <CalendarDays className="h-3 w-3" /> {dueText(pt.task.due)}
            </span>
          )}
        </div>
      </div>
    </li>
  );
}

/** "+ Add task" on /tasks: pick the job, say what to do, assign a team member and a due date. */
function AddTask({ projects, people, me, defaultWho, onClose }: { projects: Project[]; people: string[]; me: string; defaultWho: string; onClose: () => void }) {
  const sorted = useMemo(() => [...projects].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)), [projects]);
  const [projectId, setProjectId] = useState(sorted[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [assignee, setAssignee] = useState(defaultWho);
  const [due, setDue] = useState("");
  const [saving, setSaving] = useState(false);
  const t = useT();
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);

  async function save() {
    if (saving || !title.trim() || !projectId) return;
    setSaving(true);
    try {
      // Number after every task on that job on this device (deleted ones too, so a number isn't reused).
      const all = await db().tasks.where("projectId").equals(projectId).toArray();
      const task = newTask({ id: newId(), projectId, number: nextTaskNumber(all), title, assignee: assignee || null, due: due || null, checklist: [], photoIds: [] }, me, nowIso(), newId);
      await put("tasks", task);
      tasksChanged();
      toast(task.assignee ? t("Task #{number} added for {name}", { number: task.number, name: task.assignee }) : t("Task #{number} added", { number: task.number }), "success");
      onClose();
    } catch (e) {
      toast(t("Couldn't add the task: {error}", { error: (e as Error).message }), "error");
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/30 backdrop-blur-[2px] sm:items-center sm:p-4" onClick={onClose}>
      <form
        role="dialog"
        aria-modal="true"
        aria-label={t("Add task")}
        className="card animate-in w-full max-w-md space-y-3 rounded-b-none p-4 shadow-pop sm:rounded-b-xl sm:p-5"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <div className="flex items-start gap-3">
          <h2 className="min-w-0 flex-1 text-base font-semibold">{t("Add task")}</h2>
          <button type="button" className="btn btn-icon btn-ghost -mt-1 -mr-1" onClick={onClose} aria-label={t("Close")}>
            <X />
          </button>
        </div>
        <label className="block">
          <span className="label">{t("Job")}</span>
          <select className="input h-11" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            {sorted.map((p) => (
              <option key={p.id} value={p.id}>
                {jobName(p)}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="label">{t("What needs doing")}</span>
          <input className="input h-11" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("e.g. Replace cracked cover plate in kitchen")} />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="label">{t("Assign")}</span>
            <PersonSelect value={assignee} onChange={setAssignee} people={people} />
          </label>
          <label className="block">
            <span className="label">{t("Due")}</span>
            <input type="date" className="input h-11" value={due} onChange={(e) => setDue(e.target.value)} />
          </label>
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className="btn h-11" onClick={onClose}>
            {t("Cancel")}
          </button>
          <button className="btn btn-brand h-11 px-5" disabled={!title.trim() || !projectId || saving}>
            {saving ? t("Saving…") : t("Add task")}
          </button>
        </div>
      </form>
    </div>
  );
}
