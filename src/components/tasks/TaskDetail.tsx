"use client";
// One task, everything editable in place: status (two-step close-out: tech → Completed, office → Verified), priority,
// category, assignee, dates, room, tags, checklist, photos, comments and the history. Changes save as you go.
import { Camera, Check, Copy, MapPin, MessageSquare, Plus, Send, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { newId, nowIso } from "@/lib/db";
import { roomOptions } from "@/lib/fieldDocs";
import { useEditor } from "@/lib/store";
import { addTaskComment, canDeleteTask, canSetStatus, checklistLines, eventText, PRIORITIES, STATUSES, taskPlacement } from "@/lib/tasks";
import { toast } from "@/lib/toast";
import type { ChecklistItem, Photo, PlanTask, TaskStatus } from "@/lib/types";
import { useBlobUrl } from "@/lib/useImage";
import Dialog from "../Dialog";
import PhotoViewer from "../photos/PhotoViewer";
import { Chip, Portal, saveTaskPhotos, TaskBadge, useTaskOptions } from "./TaskUi";
import { useProjectTasks, useTasks } from "./taskStore";
import { fmtDate, useT } from "@/lib/i18n";

export default function TaskDetail(props: {
  taskId: string;
  onClose: () => void;
  /** Plan: arm "tap a spot" for a copy / for this task. List: handled there. */
  onDuplicate: (tk: PlanTask) => void;
  onPlace: (tk: PlanTask) => void;
  placeLabel?: string;
}) {
  const projectId = useTasks((s) => s.projectId);
  const tasks = useProjectTasks(projectId);
  const task = tasks.find((tk) => tk.id === props.taskId);
  if (!task) return null;
  // Keyed by id so the text drafts start fresh for each task.
  return <TaskDetailBody key={task.id} task={task} tasks={tasks} {...props} />;
}

function TaskDetailBody({ task, tasks, onClose, onDuplicate, onPlace, placeLabel }: { task: PlanTask; tasks: PlanTask[] } & Omit<Parameters<typeof TaskDetail>[0], "taskId">) {
  const { me, role, people, categories } = useTaskOptions(tasks);
  const { sheets, photos, markers } = useEditor();
  const change = useTasks((s) => s.change);
  const t = useT();
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description ?? "");
  const [room, setRoom] = useState(task.room ?? "");
  const [tags, setTags] = useState((task.tags ?? []).join(", "));
  const [comment, setComment] = useState("");
  const [newItem, setNewItem] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [viewer, setViewer] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  // Focus the sheet so keys (Escape, Delete…) go to it rather than the plan behind.
  useEffect(() => {
    if (!dialogRef.current?.contains(document.activeElement)) dialogRef.current?.focus({ preventScroll: true });
  }, []);
  const rooms = useMemo(() => roomOptions(photos, markers), [photos, markers]);
  const taskPhotos = useMemo(() => (task.photoIds ?? []).map((id) => photos.find((p) => p.id === id && !p.deleted)).filter((p): p is Photo => !!p), [task.photoIds, photos]);
  const sheet = sheets.find((s) => s.id === task.sheetId);
  const place = taskPlacement(task);
  const set = (patch: Parameters<typeof change>[1]) => void change(task.id, patch, me);

  const setStatus = (s: TaskStatus) => {
    if (!canSetStatus(role, task.status, s)) return toast(t("Only the office can verify or reopen a verified task"), "error");
    set({ status: s });
  };
  const checklist = task.checklist ?? [];
  const setChecklist = (items: ChecklistItem[]) => set({ checklist: items });
  const addItems = (lines: string[]) => {
    if (!lines.length) return;
    setChecklist([...checklist, ...lines.map((text) => ({ id: newId(), text, done: false }))]);
    setNewItem("");
  };

  async function addPhotos(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    try {
      const ps = await saveTaskPhotos(files, task, me);
      const cur = useTasks.getState().tasks.find((tk) => tk.id === task.id) ?? task;
      await change(task.id, { photoIds: [...(cur.photoIds ?? []), ...ps.map((p) => p.id)] }, me);
      toast(t.tn("{n} photo added", "{n} photos added", ps.length), "success");
    } catch (e) {
      toast(t("Couldn't add the photo: {error}", { error: (e as Error).message }), "error");
    } finally {
      setBusy(false);
    }
  }

  async function sendComment() {
    const tk = comment.trim();
    if (!tk) return;
    const cur = useTasks.getState().tasks.find((x) => x.id === task.id) ?? task;
    await useTasks.getState().save(addTaskComment(cur, tk, me, nowIso(), newId));
    setComment("");
  }

  const history = [...(task.activity ?? [])].reverse();

  return (
    <Portal>
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/30 backdrop-blur-[2px] sm:items-center sm:p-4"
      onClick={onClose}
      onKeyDown={(e) => {
        // The photo viewer handles its own keys. Otherwise keep keys away from the plan's shortcuts (Delete would remove
        // the selected device), and Escape closes.
        if (viewer) return;
        e.stopPropagation();
        if (e.key === "Escape") {
          if (confirmDelete) setConfirmDelete(false);
          else onClose();
        }
      }}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={t("Task #{number}", { number: task.number })}
        className="card animate-in flex max-h-[94dvh] w-full max-w-xl flex-col overflow-hidden rounded-b-none shadow-pop outline-none sm:rounded-b-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start gap-3 border-b border-slate-100 px-4 pt-4 pb-3">
          <TaskBadge task={task} size={34} />
          <div className="min-w-0 flex-1">
            <input
              className="w-full rounded-md bg-transparent px-1 py-0.5 text-lg font-semibold outline-none focus:bg-slate-50 focus:ring-2 focus:ring-brand-100"
              value={title}
              aria-label={t("Title")}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => title.trim() && title.trim() !== task.title && set({ title: title.trim() })}
              onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
            />
            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 px-1 text-xs text-slate-500">
              <span>#{task.number}</span>
              <span>·</span>
              <span>{place === "general" ? t("General task") : place === "sheet" ? t("{sheet} (no spot)", { sheet: sheet?.name ?? t("Sheet") }) : (sheet?.name ?? t("Sheet"))}</span>
              {task.createdBy && <span>· {t("by {name}", { name: task.createdBy })}</span>}
            </div>
          </div>
          <button className="btn btn-icon btn-ghost -mt-1 -mr-1" onClick={onClose} aria-label={t("Close")}>
            <X />
          </button>
        </div>

        <div className="scroll-thin min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4">
          {/* Status */}
          <section>
            <div className="label">{t("Status")}</div>
            <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
              {STATUSES.map((s) => (
                <Chip key={s.id} on={task.status === s.id} color={s.color} disabled={!canSetStatus(role, task.status, s.id)} onClick={() => setStatus(s.id)} title={t(s.label)}>
                  {task.status === s.id && <Check className="h-4 w-4" />}
                  {t(s.label)}
                </Chip>
              ))}
            </div>
            {task.status === "verified" && task.verifiedBy && <p className="mt-1 text-xs text-blue-700">{t("Verified by {name}", { name: task.verifiedBy })}{task.verifiedAt ? ` · ${fmtDate(task.verifiedAt)}` : ""}</p>}
            {role === "tech" && task.status === "done" && <p className="mt-1 text-xs text-slate-500">{t("The office verifies completed tasks.")}</p>}
          </section>

          {/* Priority + assignee */}
          <section className="grid gap-4 sm:grid-cols-2">
            <div>
              <div className="label">{t("Priority")}</div>
              <div className="flex gap-1.5">
                {PRIORITIES.map((p) => (
                  <Chip key={p.id} on={task.priority === p.id} color={p.color} onClick={() => set({ priority: task.priority === p.id ? null : p.id })} title={`${p.label} · ${t(p.name)}`}>
                    {p.label}
                  </Chip>
                ))}
              </div>
            </div>
            <div>
              <label className="label" htmlFor="task-assignee">
                {t("Assignee")}
              </label>
              <select id="task-assignee" className="input" value={task.assignee ?? ""} onChange={(e) => set({ assignee: e.target.value || null })}>
                <option value="">{t("Unassigned")}</option>
                {people.map((p) => (
                  <option key={p} value={p}>
                    {p === me ? t("{name} (me)", { name: p }) : p}
                  </option>
                ))}
              </select>
            </div>
          </section>

          <section>
            <div className="label">{t("Category")}</div>
            <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
              {categories.map((c) => (
                <Chip key={c} small on={(task.category ?? "").toLowerCase() === c.toLowerCase()} onClick={() => set({ category: (task.category ?? "").toLowerCase() === c.toLowerCase() ? null : c })}>
                  {c}
                </Chip>
              ))}
            </div>
          </section>

          <section className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="task-due">
                {t("Due")}
              </label>
              <input id="task-due" type="date" className="input" value={task.due ?? ""} onChange={(e) => set({ due: e.target.value || null })} />
            </div>
            <div>
              <label className="label" htmlFor="task-start">
                {t("Start")}
              </label>
              <input id="task-start" type="date" className="input" value={task.startDate ?? ""} onChange={(e) => set({ startDate: e.target.value || null })} />
            </div>
            <div>
              <label className="label" htmlFor="task-room">
                {t("Room")}
              </label>
              <input id="task-room" className="input" list="task-rooms" value={room} onChange={(e) => setRoom(e.target.value)} onBlur={() => room.trim() !== (task.room ?? "") && set({ room: room.trim() || null })} />
              <datalist id="task-rooms">
                {rooms.map((r) => (
                  <option key={r} value={r} />
                ))}
              </datalist>
            </div>
            <div>
              <label className="label" htmlFor="task-tags">
                {t("Tags")}
              </label>
              <input
                id="task-tags"
                className="input"
                placeholder={t("lobby, level2")}
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                onBlur={() => {
                  const next = [...new Set(tags.split(",").map((tk) => tk.trim().replace(/^#/, "")).filter(Boolean))];
                  if (JSON.stringify(next) !== JSON.stringify(task.tags ?? [])) set({ tags: next });
                }}
              />
            </div>
          </section>

          <section>
            <label className="label" htmlFor="task-desc">
              {t("Description")}
            </label>
            <textarea
              id="task-desc"
              className="input min-h-[72px]"
              rows={3}
              placeholder={t("What needs doing, and where exactly")}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onBlur={() => description.trim() !== (task.description ?? "") && set({ description: description.trim() || null })}
            />
          </section>

          {/* Checklist */}
          <section>
            <div className="label flex items-center">
              <span className="mr-auto">{t("Checklist")}</span>
              {checklist.length > 0 && (
                <span className="tabular-nums">
                  {checklist.filter((i) => i.done).length}/{checklist.length}
                </span>
              )}
            </div>
            {checklist.length > 0 && (
              <ul className="mb-2 divide-y divide-slate-100 rounded-lg ring-1 ring-slate-200">
                {checklist.map((i) => (
                  <li key={i.id} className="flex items-center gap-3 px-3 py-2">
                    <button
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ring-1 ${i.done ? "bg-emerald-600 text-white ring-emerald-600" : "bg-white ring-slate-300"}`}
                      onClick={() => setChecklist(checklist.map((x) => (x.id === i.id ? { ...x, done: !x.done, doneBy: !x.done ? me : null, doneAt: !x.done ? nowIso() : null } : x)))}
                      aria-label={i.done ? t("Untick: {item}", { item: i.text }) : t("Tick: {item}", { item: i.text })}
                    >
                      {i.done && <Check className="h-4 w-4" />}
                    </button>
                    <span className={`min-w-0 flex-1 text-sm ${i.done ? "text-slate-400 line-through" : ""}`}>{i.text}</span>
                    <button className="btn btn-sm btn-icon btn-ghost text-slate-400" onClick={() => setChecklist(checklist.filter((x) => x.id !== i.id))} aria-label={t("Remove {name}", { name: i.text })}>
                      <X />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                addItems(checklistLines(newItem));
              }}
            >
              <input
                className="input"
                placeholder={t("Add an item (paste several lines to add them all)")}
                value={newItem}
                onChange={(e) => setNewItem(e.target.value)}
                onPaste={(e) => {
                  const text = e.clipboardData.getData("text");
                  if (/\n/.test(text)) {
                    e.preventDefault();
                    addItems(checklistLines(text));
                  }
                }}
              />
              <button className="btn btn-icon" disabled={!newItem.trim()} aria-label={t("Add item")}>
                <Plus />
              </button>
            </form>
          </section>

          {/* Photos */}
          <section>
            <div className="label">{t("Photos")}</div>
            <div className="flex flex-wrap gap-2">
              {taskPhotos.map((p) => (
                <Thumb key={p.id} photo={p} onOpen={() => setViewer(p.id)} onRemove={() => set({ photoIds: (task.photoIds ?? []).filter((x) => x !== p.id) })} />
              ))}
              <button
                className="flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-slate-300 text-xs font-medium text-slate-500 hover:border-brand-500 hover:text-brand-600 disabled:opacity-50"
                onClick={() => fileRef.current?.click()}
                disabled={busy}
              >
                <Camera className="h-6 w-6" />
                {busy ? t("Saving…") : t("Add")}
              </button>
              <input ref={fileRef} type="file" accept="image/*" capture="environment" multiple className="hidden" onChange={(e) => void addPhotos(e.target.files).then(() => (e.target.value = ""))} />
            </div>
          </section>

          {/* Comments + history */}
          <section>
            <div className="label">{t("Activity")}</div>
            <div className="flex gap-2">
              <textarea
                className="input min-h-[42px]"
                rows={1}
                placeholder={t("Add a comment")}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void sendComment();
                  }
                }}
              />
              <button className="btn btn-brand btn-icon h-10 w-10" onClick={() => void sendComment()} disabled={!comment.trim()} aria-label={t("Send comment")}>
                <Send />
              </button>
            </div>
            <ol className="mt-3 space-y-2.5">
              {history.map((e) => (
                <li key={e.id} className="flex gap-2.5 text-sm">
                  <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${e.kind === "comment" ? "bg-brand-50 text-brand-600" : "bg-slate-100 text-slate-500"}`}>
                    {e.kind === "comment" ? <MessageSquare className="h-3.5 w-3.5" /> : <span className="h-1.5 w-1.5 rounded-full bg-current" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    {e.kind === "comment" ? (
                      <>
                        <div className="text-xs text-slate-500">
                          <strong className="font-semibold text-slate-700">{e.by}</strong> · {when(e.at)}
                        </div>
                        <div className="mt-0.5 rounded-lg bg-slate-50 px-3 py-2 whitespace-pre-wrap">{e.text}</div>
                      </>
                    ) : (
                      <div className="text-slate-600">
                        <strong className="font-semibold text-slate-800">{e.by}</strong> {eventText(e)} <span className="text-xs text-slate-400">· {when(e.at)}</span>
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </section>
        </div>

        {/* Footer */}
        <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <button className="btn" onClick={() => onPlace(task)}>
            <MapPin /> {placeLabel ?? (place === "pin" ? t("Move pin") : t("Place on plan"))}
          </button>
          <button className="btn" onClick={() => onDuplicate(task)}>
            <Copy /> {t("Duplicate")}
          </button>
          {canDeleteTask(role, task, me) && (
            <button className="btn btn-danger ml-auto" onClick={() => setConfirmDelete(true)}>
              <Trash2 /> {t("Delete")}
            </button>
          )}
        </div>
      </div>
      {confirmDelete && (
        // Its backdrop click cancels the delete only, not the task sheet behind it.
        <div onClick={(e) => e.stopPropagation()}>
        <Dialog
          title={t("Delete task #{number}?", { number: task.number })}
          description={t("It disappears from the plan and the task list for everyone on the job.")}
          fields={[]}
          submitLabel={t("Delete")}
          onCancel={() => setConfirmDelete(false)}
          onSubmit={() => {
            void useTasks.getState().softDelete([task.id]);
            setConfirmDelete(false);
            onClose();
            toast(t("Deleted #{number}", { number: task.number }));
          }}
        />
        </div>
      )}
      {viewer && (
        <div onClick={(e) => e.stopPropagation()}>
          <PhotoViewer photos={taskPhotos} startId={viewer} onClose={() => setViewer(null)} />
        </div>
      )}
    </div>
    </Portal>
  );
}

const when = (iso: string) => fmtDate(iso, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

function Thumb({ photo, onOpen, onRemove }: { photo: Photo; onOpen: () => void; onRemove: () => void }) {
  const url = useBlobUrl(photo.imageId);
  const t = useT();
  return (
    <div className="group relative h-20 w-20 overflow-hidden rounded-lg bg-slate-100 ring-1 ring-slate-200">
      <button className="h-full w-full" onClick={onOpen} aria-label={t("Open photo")}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {url && <img src={url} alt="" className="h-full w-full object-cover" />}
      </button>
      <button className="absolute top-1 right-1 flex h-6 w-6 items-center justify-center rounded-full bg-slate-900/70 text-white" onClick={onRemove} aria-label={t("Remove photo from task")}>
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
