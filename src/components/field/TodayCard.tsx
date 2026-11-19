"use client";
// Today: what a technician needs this morning, on a job (Field → Today) or across jobs (/tasks). My tasks that are
// overdue or due today (big ticks), this week's schedule phases, Take photo, today's daily log (Start / Continue /
// Signed), checklists still open and draft forms. Reads IndexedDB directly so it works on /tasks without a job open.
import { BookOpen, Camera, Check, ClipboardCheck, ClipboardPen, ListTodo, Sun } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { db, newId, nowIso, put } from "@/lib/db";
import { localDay, openTasks, todayLog, unfinishedChecklists, type OpenTask } from "@/lib/fieldDocs";
import { FORMS_EVENT } from "@/lib/forms/useForms";
import { importPhoto } from "@/lib/photos";
import { useEditor } from "@/lib/store";
import { applyTaskChange, isMyName, myTasksDueNow, type OpenPlanTask } from "@/lib/tasks";
import { toast } from "@/lib/toast";
import type { Checklist, JobForm, JobLog, Photo, PlanTask, Project } from "@/lib/types";
import { useMe } from "@/lib/useMe";
import ThisWeekStrip from "../schedule/ThisWeekStrip";
import { TASKS_EVENT, tasksChanged, useTasks } from "../tasks/taskStore";

/** Field sections the card opens (FieldTab), with extra address params (log=today, form=<id>, task=<id>). */
export type OpenSection = (section: string, extra?: Record<string, string>) => void;

interface Data {
  projects: Map<string, Project>;
  tasks: PlanTask[];
  checklists: Checklist[];
  photos: Photo[];
  logs: JobLog[];
  forms: JobForm[];
}

const jobName = (p?: Project) => p?.address || p?.clientName || "Job";
const fieldHref = (projectId: string, extra: Record<string, string>) => `/project?${new URLSearchParams({ id: projectId, tab: "field", ...extra }).toString()}`;

export default function TodayCard({ projectId, onOpen }: { projectId?: string | null; onOpen?: OpenSection }) {
  const { me, names } = useMe();
  const [data, setData] = useState<Data | null>(null);
  const [today, setToday] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setToday(localDay(new Date().toISOString()));
    const d = db();
    const projects = new Map((await d.projects.toArray()).filter((p) => !p.deleted).map((p) => [p.id, p]));
    const live = <T extends { deleted?: boolean; projectId: string }>(rows: T[]) => rows.filter((r) => !r.deleted && projects.has(r.projectId));
    const scoped = projectId
      ? {
          tasks: await d.tasks.where("projectId").equals(projectId).toArray(),
          checklists: await d.checklists.where("projectId").equals(projectId).toArray(),
          photos: await d.photos.where("projectId").equals(projectId).toArray(),
          logs: await d.jobLogs.where("projectId").equals(projectId).toArray(),
          forms: await d.forms.where("projectId").equals(projectId).toArray(),
        }
      : {
          tasks: await d.tasks.toArray(),
          checklists: await d.checklists.toArray(),
          // Across jobs: no checklist progress (it needs every photo), so no photos.
          photos: [] as Photo[],
          logs: await d.jobLogs.toArray(),
          forms: await d.forms.where("status").equals("draft").toArray(),
        };
    setData({ projects, tasks: live(scoped.tasks), checklists: live(scoped.checklists), photos: scoped.photos.filter((p) => !p.deleted), logs: live(scoped.logs), forms: live(scoped.forms) });
  }, [projectId]);

  useEffect(() => {
    const t = window.setTimeout(() => void load(), 0);
    const reload = () => void load();
    const onVisible = () => document.visibilityState === "visible" && reload();
    window.addEventListener("pinplan:synced", reload);
    window.addEventListener(FORMS_EVENT, reload);
    window.addEventListener(TASKS_EVENT, reload);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("pinplan:synced", reload);
      window.removeEventListener(FORMS_EVENT, reload);
      window.removeEventListener(TASKS_EVENT, reload);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);

  const due = useMemo(() => (data && today ? myTasksDueNow(data.tasks, names, today) : []), [data, names, today]);
  const legacyDue = useMemo(
    () => (data && today ? openTasks({ projects: [...data.projects.values()], checklists: data.checklists }, { today, who: names }).filter((t) => t.bucket === "overdue" || t.bucket === "today") : []),
    [data, names, today],
  );
  const log = useMemo(() => (data && projectId && today ? todayLog(data.logs, projectId, today, names) : null), [data, projectId, today, names]);
  // Across jobs: today's logs I started and haven't signed yet.
  const myOpenLogs = useMemo(
    () => (data && !projectId && today ? data.logs.filter((l) => l.date === today && !l.report?.signature && isMyName(l.author, names)) : []),
    [data, projectId, today, names],
  );
  const open = useMemo(() => (data && projectId ? unfinishedChecklists(data.checklists, data.photos, projectId) : []), [data, projectId]);
  const drafts = useMemo(
    () => (data ? data.forms.filter((f) => f.status === "draft" && (projectId ? true : isMyName(f.createdBy, names))).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)) : []),
    [data, projectId, names],
  );

  const go = (pid: string, section: string, extra: Record<string, string> = {}) => (onOpen && pid === projectId ? { onClick: () => onOpen(section, extra) } : { href: fieldHref(pid, { section, ...extra }) });

  async function tickTask(t: OpenPlanTask) {
    const st = useTasks.getState();
    // On the job, go through the job's task store so the Tasks list updates too.
    if (st.projectId === t.task.projectId) await st.change(t.task.id, { status: "done" }, me);
    else {
      const cur = (await db().tasks.get(t.task.id)) ?? t.task;
      await put("tasks", applyTaskChange(cur, { status: "done" }, me, nowIso(), newId));
      tasksChanged();
    }
    toast(`Completed: #${t.task.number} ${t.task.title}`, "success");
    await load();
  }

  async function tickItem(t: OpenTask) {
    const fresh = (await db().checklists.get(t.checklist.id)) ?? t.checklist;
    const next = { ...fresh, items: fresh.items.map((i) => (i.id === t.item.id ? { ...i, done: true, doneBy: me, doneAt: nowIso() } : i)) };
    if (useEditor.getState().project?.id === fresh.projectId) await useEditor.getState().saveRow("checklists", next);
    else await put("checklists", next);
    tasksChanged();
    toast(`Done: ${t.item.text}`, "success");
    await load();
  }

  async function addPhotos(files: FileList | null) {
    if (!files?.length || !projectId) return;
    let n = 0;
    for (const f of [...files]) {
      try {
        const p = await importPhoto(f, { projectId, author: me });
        await useEditor.getState().saveRow("photos", p);
        n++;
      } catch (e) {
        toast(`${f.name}: ${(e as Error).message}`, "error");
      }
    }
    if (n) toast(`${n} photo${n === 1 ? "" : "s"} saved to the job`, "success");
  }

  if (!data) return <div className="card h-40 animate-pulse bg-slate-50" aria-label="Loading today" />;
  const nothingDue = !due.length && !legacyDue.length;

  return (
    <section className="space-y-4" aria-label="Today">
      <div className="card space-y-3 p-4">
        <div className="flex items-center gap-2">
          <Sun className="h-5 w-5 text-amber-500" aria-hidden />
          <h2 className="mr-auto text-base font-semibold">Today</h2>
          {projectId && (
            <>
              <input ref={fileRef} type="file" accept="image/*" capture="environment" multiple className="hidden" onChange={(e) => void addPhotos(e.target.files).then(() => (e.target.value = ""))} />
              <button className="btn btn-brand h-11" onClick={() => fileRef.current?.click()}>
                <Camera /> Take photo
              </button>
            </>
          )}
        </div>

        {/* My tasks: overdue and due today */}
        <div>
          <h3 className="section-title mb-1 flex items-center gap-1.5">
            <ListTodo className="h-3.5 w-3.5" /> My tasks due {due.length + legacyDue.length ? `· ${due.length + legacyDue.length}` : ""}
          </h3>
          {nothingDue ? (
            <p className="text-sm text-slate-500">Nothing overdue or due today{names.length ? ` for ${me}` : ""}.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {due.map((t) => (
                <li key={t.task.id} className="flex items-center gap-2 py-1">
                  <Tick label={`Mark completed: #${t.task.number} ${t.task.title}`} onClick={() => void tickTask(t)} />
                  <Wrap className="min-w-0 flex-1 py-1.5" {...go(t.task.projectId, "tasks", { task: t.task.id })}>
                    <span className="block truncate text-sm font-medium">
                      #{t.task.number} {t.task.title}
                    </span>
                    <span className="block truncate text-xs">
                      <span className={t.bucket === "overdue" ? "font-semibold text-red-600" : "font-medium text-amber-700"}>{t.bucket === "overdue" ? "Overdue" : "Due today"}</span>
                      {!projectId && <span className="text-slate-500"> · {jobName(data.projects.get(t.task.projectId))}</span>}
                      {t.task.room && <span className="text-slate-500"> · {t.task.room}</span>}
                    </span>
                  </Wrap>
                </li>
              ))}
              {legacyDue.map((t) => (
                <li key={`${t.checklist.id}:${t.item.id}`} className="flex items-center gap-2 py-1">
                  {t.item.requiresPhoto ? (
                    <Wrap className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-amber-600" aria-label={`Needs a photo — open: ${t.item.text}`} {...go(t.project.id, "checklists", { cl: t.checklist.id, item: t.item.id })}>
                      <Camera className="h-5 w-5" />
                    </Wrap>
                  ) : (
                    <Tick label={`Mark done: ${t.item.text}`} onClick={() => void tickItem(t)} />
                  )}
                  <Wrap className="min-w-0 flex-1 py-1.5" {...go(t.project.id, "checklists", { cl: t.checklist.id, item: t.item.id })}>
                    <span className="block truncate text-sm font-medium">{t.item.text}</span>
                    <span className="block truncate text-xs">
                      <span className={t.bucket === "overdue" ? "font-semibold text-red-600" : "font-medium text-amber-700"}>{t.bucket === "overdue" ? "Overdue" : "Due today"}</span>
                      <span className="text-slate-500">
                        {" "}
                        · {t.checklist.name}
                        {!projectId ? ` · ${jobName(t.project)}` : ""}
                      </span>
                    </span>
                  </Wrap>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Daily log */}
        {projectId && log && (
          <div className="flex items-center gap-3 rounded-lg bg-slate-50 px-3 py-2">
            <BookOpen className="h-5 w-5 shrink-0 text-slate-500" aria-hidden />
            <span className="min-w-0 flex-1 text-sm">
              <span className="font-medium">Today’s daily log</span>
              <span className="block text-xs text-slate-500">{log.status === "start" ? "Not started yet" : log.status === "signed" ? `Signed by ${log.log?.report?.signature?.name ?? log.log?.author ?? "—"}` : `Started${log.log?.author ? ` by ${log.log.author}` : ""} · not signed yet`}</span>
            </span>
            {log.status === "signed" ? (
              <span className="chip bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200">
                <Check className="h-3.5 w-3.5" /> Signed
              </span>
            ) : (
              <Wrap className={`btn h-11 ${log.status === "start" ? "btn-brand" : ""}`} {...go(projectId, "logs", { log: "today" })}>
                {log.status === "start" ? "Start" : "Continue"}
              </Wrap>
            )}
          </div>
        )}
        {!projectId &&
          myOpenLogs.map((l) => (
            <div key={l.id} className="flex items-center gap-3 rounded-lg bg-slate-50 px-3 py-2">
              <BookOpen className="h-5 w-5 shrink-0 text-slate-500" aria-hidden />
              <span className="min-w-0 flex-1 truncate text-sm">
                <span className="font-medium">Today’s log</span> · {jobName(data.projects.get(l.projectId))}
              </span>
              <Link className="btn h-11" href={fieldHref(l.projectId, { section: "logs", log: "today" })}>
                Continue
              </Link>
            </div>
          ))}
      </div>

      <ThisWeekStrip me={names} projectId={projectId} hideBoardLink={!!projectId} />

      {(open.length > 0 || drafts.length > 0) && (
        <div className="grid gap-3 sm:grid-cols-2">
          {open.length > 0 && (
            <div className="card p-3">
              <h3 className="section-title mb-1 flex items-center gap-1.5">
                <ClipboardCheck className="h-3.5 w-3.5" /> Open checklists · {open.length}
              </h3>
              <ul>
                {open.slice(0, 5).map((x) => (
                  <li key={x.checklist.id}>
                    <Wrap className="flex min-h-11 w-full items-center gap-2 rounded-lg px-1 text-left text-sm hover:bg-slate-50" {...go(x.checklist.projectId, "checklists", { cl: x.checklist.id })}>
                      <span className="min-w-0 flex-1 truncate">{x.checklist.name}</span>
                      <span className="text-xs text-slate-500 tabular-nums">
                        {x.done}/{x.total}
                      </span>
                    </Wrap>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {drafts.length > 0 && (
            <div className="card p-3">
              <h3 className="section-title mb-1 flex items-center gap-1.5">
                <ClipboardPen className="h-3.5 w-3.5" /> Draft forms · {drafts.length}
              </h3>
              <ul>
                {drafts.slice(0, 5).map((f) => (
                  <li key={f.id}>
                    <Wrap className="flex min-h-11 w-full items-center gap-2 rounded-lg px-1 text-left text-sm hover:bg-slate-50" {...go(f.projectId, "forms", { form: f.id })}>
                      <span className="min-w-0 flex-1 truncate">{f.name}</span>
                      {!projectId && <span className="truncate text-xs text-slate-500">{jobName(data.projects.get(f.projectId))}</span>}
                    </Wrap>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

/** A 44px tap target with a 24px box. */
function Tick({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button className="group flex h-11 w-11 shrink-0 items-center justify-center rounded-lg" onClick={onClick} aria-label={label} title="Mark done">
      <span className="flex h-6 w-6 items-center justify-center rounded-md bg-white ring-1 ring-slate-300 group-hover:bg-emerald-50 group-hover:ring-emerald-500 group-focus-visible:ring-emerald-500">
        <Check className="h-4 w-4 text-transparent group-hover:text-emerald-600 group-focus-visible:text-emerald-600" />
      </span>
    </button>
  );
}

/** A link on /tasks, a button that switches the Field section on the job. */
function Wrap({ href, onClick, className, children, ...rest }: { href?: string; onClick?: () => void; className?: string; children: React.ReactNode; "aria-label"?: string }) {
  if (href)
    return (
      <Link href={href} className={className} {...rest}>
        {children}
      </Link>
    );
  return (
    <button type="button" onClick={onClick} className={`text-left ${className ?? ""}`} {...rest}>
      {children}
    </button>
  );
}
