"use client";
// Tasks across every job: open checklist / punch-list items that are assigned to someone, have a due date or came from a photo comment.
import { CalendarDays, Camera, Check, ClipboardList, MapPin, UserRound } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { db, newId, nowIso, put } from "@/lib/db";
import { localDay, openTasks, TASK_BUCKETS, teamNames, type OpenTask } from "@/lib/fieldDocs";
import { getAuthor } from "@/lib/photos";
import { useSyncStatus } from "@/lib/sync";
import { useTeam } from "@/lib/team";
import { toast } from "@/lib/toast";
import { applyTaskChange, openPlanTasksFor, priorityInfo, statusInfo, type OpenPlanTask } from "@/lib/tasks";
import type { Checklist, Photo, PlanTask, Project } from "@/lib/types";
import { useBlobUrl } from "@/lib/useImage";

const dueText = (due: string) => new Date(`${due}T12:00:00`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
const BUCKET_STYLE: Record<OpenTask["bucket"], string> = {
  overdue: "text-red-600",
  today: "text-amber-700",
  week: "text-slate-700",
  later: "text-slate-500",
  none: "text-slate-500",
};

/** Thumbnail of the photo a task was made from; opens the job's photos. */
function TaskPhoto({ photo, href }: { photo: Photo; href: string }) {
  const url = useBlobUrl(photo.imageId);
  return (
    <Link href={href} className="block h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-slate-100 ring-1 ring-slate-200" aria-label="Open the job's photos" title={photo.caption ?? "Photo this task came from"}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {url && <img src={url} alt="" className="h-full w-full object-cover" />}
    </Link>
  );
}

export default function TasksBoard() {
  const { email } = useSyncStatus();
  const members = useTeam((s) => s.members);
  const me = getAuthor(email);
  const [projects, setProjects] = useState<Project[]>([]);
  const [checklists, setChecklists] = useState<Checklist[] | null>(null);
  // Tasks pinned on plans (src/lib/tasks.ts), shown next to the checklist tasks.
  const [planTasks, setPlanTasks] = useState<PlanTask[]>([]);
  const [photos, setPhotos] = useState<Map<string, Photo>>(new Map());
  const [who, setWho] = useState<string>("__me");
  const [today, setToday] = useState("");

  const load = useCallback(async () => {
    setToday(localDay(new Date().toISOString()));
    setProjects((await db().projects.toArray()).filter((p) => !p.deleted));
    const cs = (await db().checklists.toArray()).filter((c) => !c.deleted);
    // Only the photos tasks were made from (comment → task), for their thumbnails.
    const ids = [...new Set(cs.flatMap((c) => c.items.map((i) => i.photoId).filter((x): x is string => !!x)))];
    const ps = ids.length ? await db().photos.bulkGet(ids) : [];
    setPhotos(new Map(ps.filter((p): p is Photo => !!p && !p.deleted).map((p) => [p.id, p])));
    setPlanTasks((await db().tasks.toArray()).filter((t) => !t.deleted));
    setChecklists(cs);
  }, []);
  useEffect(() => {
    const t = window.setTimeout(() => void load(), 0);
    // Pick up synced changes, and roll "today" over when the tab comes back after midnight.
    const reload = () => void load();
    const onVisible = () => document.visibilityState === "visible" && reload();
    window.addEventListener("pinplan:synced", reload);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("pinplan:synced", reload);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);

  const filter = who === "__me" ? me : who === "__all" ? null : who;
  const tasks = useMemo(() => (checklists && today ? openTasks({ projects, checklists }, { today, who: filter }) : []), [projects, checklists, today, filter]);
  const jobs = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);
  const planOpen = useMemo(
    () => (today ? openPlanTasksFor(filter, planTasks.filter((t) => jobs.has(t.projectId)), today) : []),
    [planTasks, jobs, today, filter],
  );
  const names = useMemo(() => {
    const ns = teamNames({ checklists: checklists ?? [], members }, me);
    for (const t of planTasks) if (t.assignee?.trim() && !ns.some((n) => n.toLowerCase() === t.assignee!.trim().toLowerCase())) ns.push(t.assignee.trim());
    return ns.sort((a, b) => a.localeCompare(b));
  }, [checklists, members, me, planTasks]);
  const mineCount = useMemo(
    () => (checklists && today ? openTasks({ projects, checklists }, { today, who: me }).length + openPlanTasksFor(me, planTasks.filter((t) => jobs.has(t.projectId)), today).length : 0),
    [projects, checklists, today, me, planTasks, jobs],
  );

  async function completePlanTask(t: OpenPlanTask) {
    // Fresh copy, so a quick second tick doesn't overwrite the first.
    const cur = (await db().tasks.get(t.task.id)) ?? t.task;
    await put("tasks", applyTaskChange(cur, { status: "done" }, me, nowIso(), newId));
    toast(`Completed: #${t.task.number} ${t.task.title}`, "success");
    await load();
  }

  async function complete(t: OpenTask) {
    // Read the checklist fresh: ticking two items quickly must not overwrite the first with a stale copy.
    const c = (await db().checklists.get(t.checklist.id)) ?? t.checklist;
    await put("checklists", { ...c, items: c.items.map((i) => (i.id === t.item.id ? { ...i, done: true, doneBy: me, doneAt: nowIso() } : i)) });
    toast(`Done: ${t.item.text}`, "success");
    await load();
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4 px-4 py-6 sm:px-6 sm:py-8">
      <div className="flex flex-wrap items-end gap-3">
        <div className="mr-auto">
          <h1 className="page-title">Tasks</h1>
          <p className="mt-1 text-sm text-slate-500">Open plan tasks, and checklist and punch-list items with someone assigned or a due date, across every job.</p>
        </div>
        <select className="input h-9 w-auto" value={who} onChange={(e) => setWho(e.target.value)} aria-label="Whose tasks">
          <option value="__me">Mine ({me}) · {mineCount}</option>
          <option value="__all">Everyone</option>
          {names
            .filter((n) => n.toLowerCase() !== me.toLowerCase())
            .map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
        </select>
      </div>

      {checklists && tasks.length === 0 && planOpen.length === 0 && (
        <div className="card flex flex-col items-center gap-2 p-10 text-center">
          <ClipboardList className="h-8 w-8 text-slate-300" />
          <div className="font-medium">No open tasks{filter ? ` for ${filter}` : ""}</div>
          <p className="max-w-md text-sm text-slate-500">
            On a job’s <strong>Field → Checklists</strong>, start a <strong>Punch list</strong> (or any checklist) and tap the person icon on an item to assign it and set a due date.
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
              {b.name} · {list.length + plan.length}
            </h2>
            <ul className="card divide-y divide-slate-100">
              {list.map((t) => (
                <li key={`${t.checklist.id}:${t.item.id}`} className="flex items-start gap-3 px-4 py-3">
                  {t.item.requiresPhoto ? (
                    // Needs a photo: ticking it here would leave it "done" without the proof, so open the job instead.
                    <Link
                      className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-white text-amber-600 ring-1 ring-amber-300 hover:bg-amber-50"
                      href={`/project?id=${t.project.id}&tab=field`}
                      aria-label={`Open the job to add a photo and tick: ${t.item.text}`}
                      title="Needs a photo — tick it on the job so you can add one"
                    >
                      <Camera className="h-3.5 w-3.5" />
                    </Link>
                  ) : (
                    <button
                      className="group mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-white ring-1 ring-slate-300 hover:bg-emerald-50 hover:ring-emerald-500 focus-visible:ring-emerald-500"
                      onClick={() => void complete(t)}
                      aria-label={`Mark done: ${t.item.text}`}
                      title="Mark done"
                    >
                      <Check className="h-4 w-4 text-transparent group-hover:text-emerald-600 group-focus-visible:text-emerald-600" />
                    </button>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">{t.item.text}</div>
                    <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-slate-500">
                      <Link className="font-medium text-brand-600 hover:underline" href={`/project?id=${t.project.id}&tab=field`}>
                        {t.project.address || t.project.clientName || "Job"}
                      </Link>
                      <span>{t.checklist.name}</span>
                      {t.item.assignee && (
                        <span className="inline-flex items-center gap-1">
                          <UserRound className="h-3 w-3" /> {t.item.assignee}
                        </span>
                      )}
                      {t.item.due && (
                        <span className={`inline-flex items-center gap-1 ${BUCKET_STYLE[t.bucket]}`}>
                          <CalendarDays className="h-3 w-3" /> {dueText(t.item.due)}
                        </span>
                      )}
                      {t.item.requiresPhoto && <span className="text-amber-700">Photo required</span>}
                    </div>
                  </div>
                  {t.item.photoId && photos.get(t.item.photoId) && <TaskPhoto photo={photos.get(t.item.photoId)!} href={`/project?id=${t.project.id}&tab=photos`} />}
                </li>
              ))}
              {plan.map((t) => (
                <PlanTaskRow key={t.task.id} t={t} project={jobs.get(t.task.projectId)!} onComplete={() => void completePlanTask(t)} />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

/** A task pinned on a plan: tick to mark it Completed (the office verifies it); the title opens it on the job. */
function PlanTaskRow({ t, project, onComplete }: { t: OpenPlanTask; project: Project; onComplete: () => void }) {
  const s = statusInfo(t.task.status);
  const p = priorityInfo(t.task.priority);
  const href = `/project?id=${project.id}&tab=field&tf=&task=${t.task.id}`;
  return (
    <li className="flex items-start gap-3 px-4 py-3">
      <button
        className="group mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-white ring-1 ring-slate-300 hover:bg-emerald-50 hover:ring-emerald-500 focus-visible:ring-emerald-500"
        onClick={onComplete}
        aria-label={`Mark completed: #${t.task.number} ${t.task.title}`}
        title="Mark completed"
      >
        <Check className="h-4 w-4 text-transparent group-hover:text-emerald-600 group-focus-visible:text-emerald-600" />
      </button>
      <div className="min-w-0 flex-1">
        <Link href={href} className="text-sm font-medium hover:underline">
          <span className="mr-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] font-bold text-white tabular-nums" style={{ background: s.color }}>
            {t.task.number}
          </span>
          {t.task.title}
        </Link>
        <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-slate-500">
          <Link className="font-medium text-brand-600 hover:underline" href={`/project?id=${project.id}&tab=field`}>
            {project.address || project.clientName || "Job"}
          </Link>
          <span className="inline-flex items-center gap-1">
            <MapPin className="h-3 w-3" /> {s.label}
            {t.task.room ? ` · ${t.task.room}` : ""}
          </span>
          {p && <span style={{ color: p.color }}>{p.label}</span>}
          {t.task.assignee && (
            <span className="inline-flex items-center gap-1">
              <UserRound className="h-3 w-3" /> {t.task.assignee}
            </span>
          )}
          {t.task.due && (
            <span className={`inline-flex items-center gap-1 ${BUCKET_STYLE[t.bucket]}`}>
              <CalendarDays className="h-3 w-3" /> {dueText(t.task.due)}
            </span>
          )}
        </div>
      </div>
    </li>
  );
}
