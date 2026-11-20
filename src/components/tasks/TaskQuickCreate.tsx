"use client";
// New task in one tap after dropping a pin: a title with quick entry ("Loose cover @P1 @Mike #lobby") and big chips.
import { Camera, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { newId, nowIso } from "@/lib/db";
import { useEditor } from "@/lib/store";
import { canSetStatus, newTask, parseQuickEntry, PRIORITIES, STATUSES } from "@/lib/tasks";
import { toast } from "@/lib/toast";
import type { PlanTask, TaskPriority, TaskStatus } from "@/lib/types";
import { Chip, Portal, saveTaskPhotos, useTaskOptions } from "./TaskUi";
import { useProjectTasks, useTasks, type QuickDraft } from "./taskStore";

export default function TaskQuickCreate({ projectId, draft, onClose, onCreated }: { projectId: string; draft: QuickDraft; onClose: () => void; onCreated?: (t: PlanTask) => void }) {
  const tasks = useProjectTasks(projectId);
  const { me, role, people, categories } = useTaskOptions(tasks);
  const sheets = useEditor((s) => s.sheets);
  const [text, setText] = useState(draft.title ?? "");
  const [due, setDue] = useState("");
  const [status, setStatus] = useState<TaskStatus>("open");
  // Explicit picks win over what the title says; undefined = follow the title.
  const [priority, setPriority] = useState<TaskPriority | null | undefined>(undefined);
  const [category, setCategory] = useState<string | null | undefined>(undefined);
  const [assignee, setAssignee] = useState<string | null | undefined>(undefined);
  const [files, setFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const parsed = useMemo(() => parseQuickEntry(text, { categories, people }), [text, categories, people]);
  const pr = priority === undefined ? (parsed.priority ?? null) : priority;
  const cat = category === undefined ? (parsed.category ?? null) : category;
  const who = assignee === undefined ? (parsed.assignee ?? null) : assignee;
  const sheet = sheets.find((s) => s.id === draft.sheetId);
  const previews = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files]);
  useEffect(() => () => previews.forEach((u) => URL.revokeObjectURL(u)), [previews]);

  async function save() {
    if (saving) return;
    const title = parsed.title || (text.trim() ? text.trim() : "");
    if (!title && !files.length) return toast("Give the task a title", "error");
    setSaving(true);
    try {
      const st = useTasks.getState();
      const at = nowIso();
      let task = newTask(
        {
          id: newId(),
          projectId,
          number: st.nextNumber(),
          title: title || "Photo task",
          status,
          priority: pr,
          category: cat,
          assignee: who,
          tags: parsed.tags,
          sheetId: draft.sheetId,
          x: draft.x,
          y: draft.y,
          room: draft.room ?? null,
          markerId: draft.markerId ?? null,
          description: draft.description ?? null,
          due: due || null,
          checklist: [],
          photoIds: [],
          closedAt: status === "done" ? at : null,
        },
        me,
        at,
        newId,
      );
      task = await st.save(task);
      if (files.length) {
        const ps = await saveTaskPhotos(files, task, me);
        task = (await st.change(task.id, { photoIds: ps.map((p) => p.id) }, me)) ?? task;
      }
      toast(`Task #${task.number} added`, "success");
      onCreated?.(task);
      onClose();
    } catch (e) {
      toast(`Couldn't save the task: ${(e as Error).message}`, "error");
      setSaving(false);
    }
  }

  return (
    <Portal>
    <div
      className="fixed inset-0 z-[75] flex items-end justify-center bg-slate-900/30 backdrop-blur-[2px] sm:items-center sm:p-4"
      onClick={onClose}
      onKeyDown={(e) => {
        // Keep keys away from the plan's shortcuts behind; Escape closes.
        e.stopPropagation();
        if (e.key === "Escape") onClose();
      }}
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-label="New task"
        className="card animate-in w-full max-w-lg space-y-4 rounded-b-none p-4 shadow-pop sm:rounded-b-xl sm:p-5"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold">New task</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              {sheet ? `${sheet.name}${draft.x == null ? "" : " · pinned"}` : "General (not on a sheet)"}
              {draft.room ? ` · ${draft.room}` : ""}
            </p>
          </div>
          <button type="button" className="btn btn-icon btn-ghost -mt-1 -mr-1" onClick={onClose} aria-label="Close">
            <X />
          </button>
        </div>

        <div>
          <input
            className="input h-12 text-base"
            autoFocus
            placeholder="What's wrong?  @P1 @Mike @Electrical #lobby"
            value={text}
            onChange={(e) => setText(e.target.value)}
            aria-label="Title"
            enterKeyHint="done"
          />
          {(parsed.tags.length > 0 || parsed.priority || parsed.category || parsed.assignee) && (
            <p className="mt-1 text-xs text-slate-500">
              “{parsed.title || "…"}”{parsed.tags.length ? ` · ${parsed.tags.map((t) => `#${t}`).join(" ")}` : ""}
            </p>
          )}
        </div>

        <ChipRow label="Status">
          {STATUSES.filter((s) => s.id !== "verified" || canSetStatus(role, "open", "verified")).map((s) => (
            <Chip key={s.id} on={status === s.id} color={s.color} onClick={() => setStatus(s.id)}>
              {s.short}
            </Chip>
          ))}
        </ChipRow>
        <ChipRow label="Priority">
          {PRIORITIES.map((p) => (
            <Chip key={p.id} on={pr === p.id} color={p.color} onClick={() => setPriority(pr === p.id ? null : p.id)} title={p.name}>
              {p.label}
            </Chip>
          ))}
        </ChipRow>
        <ChipRow label="Assign">
          {people.map((p) => (
            <Chip key={p} on={who === p} onClick={() => setAssignee(who === p ? null : p)}>
              {p === me ? "Me" : p}
            </Chip>
          ))}
        </ChipRow>
        <label className="block">
          <span className="label">Due</span>
          <input type="date" className="input h-11 w-auto" value={due} onChange={(e) => setDue(e.target.value)} />
        </label>
        <ChipRow label="Category">
          {categories.map((c) => (
            <Chip key={c} on={cat === c} onClick={() => setCategory(cat === c ? null : c)}>
              {c}
            </Chip>
          ))}
        </ChipRow>

        <div className="flex items-center gap-2 pt-1">
          <button type="button" className="btn h-12 px-4" onClick={() => fileRef.current?.click()} aria-label="Add photos">
            <Camera className="!h-5 !w-5" />
            {files.length ? files.length : ""}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            className="hidden"
            onChange={(e) => {
              const picked = [...(e.target.files ?? [])];
              if (picked.length) setFiles((f) => [...f, ...picked]);
              e.target.value = "";
            }}
          />
          <div className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto">
            {previews.map((u, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={i} src={u} alt="" className="h-12 w-12 shrink-0 rounded-md object-cover ring-1 ring-slate-200" />
            ))}
          </div>
          <button className="btn btn-brand h-12 px-6 text-base" disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
    </div>
    </Portal>
  );
}

function ChipRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="label">{label}</div>
      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">{children}</div>
    </div>
  );
}
