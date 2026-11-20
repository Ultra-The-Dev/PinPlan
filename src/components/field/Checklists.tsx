"use client";
// Checklists from templates (pre-wire, trim-out, rack, final walkthrough) or from scratch. Photo-required items
// only count once they have a photo, which can be taken right from the item. Any checklist can be saved as a company
// template ("Save as template"); saved templates show first in "Start a checklist" and are managed in Settings.
// "Make task" turns an item into a task on the job (picked team member, due date); older items assigned on the
// checklist itself still show their person and date, and still appear on /tasks.
import { BookmarkPlus, CalendarDays, Camera, Check, ChevronDown, ListPlus, MessageSquare, Plus, Trash, UserRound } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { newId, nowIso, saveChecklistTemplates } from "@/lib/db";
import { addTemplate, allChecklistTemplates, checklistFromTemplate, checklistProgress, itemComplete, itemPhotos, localDay, taskBucket, teamNames, templateFromChecklist } from "@/lib/fieldDocs";
import { importPhoto } from "@/lib/photos";
import { useEditor } from "@/lib/store";
import { newTask, taskFromChecklistItem } from "@/lib/tasks";
import { useTeam } from "@/lib/team";
import { toast } from "@/lib/toast";
import { useMe } from "@/lib/useMe";
import { PersonSelect } from "../tasks/TaskUi";
import { useTasks } from "../tasks/taskStore";
import type { Checklist, ChecklistItem, Photo } from "@/lib/types";
import { useChecklistTemplates } from "@/lib/useChecklistTemplates";
import { tradeChecklists } from "@/lib/trades";
import { useTrades } from "@/lib/useTrades";
import { useBlobUrl } from "@/lib/useImage";
import Dialog from "../Dialog";
import PhotoViewer from "../photos/PhotoViewer";

function Mini({ photo, onOpen }: { photo: Photo; onOpen: () => void }) {
  const url = useBlobUrl(photo.imageId);
  return (
    <button onClick={onOpen} className="h-12 w-12 overflow-hidden rounded-lg bg-slate-100 ring-1 ring-slate-200" aria-label="Open photo">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {url && <img src={url} alt="" className="h-full w-full object-cover" />}
    </button>
  );
}

const dueText = (due: string) => new Date(`${due}T12:00:00`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });

/** "Make task": a task on the job from this item, for a team member (picked, not typed) with a due date. */
function MakeTaskFields({ c, item, photoIds, people, me, onClose }: { c: Checklist; item: ChecklistItem; photoIds: string[]; people: string[]; me: string; onClose: () => void }) {
  const [who, setWho] = useState("");
  const [due, setDue] = useState(item.due ?? "");
  const [saving, setSaving] = useState(false);
  async function make() {
    if (saving) return;
    setSaving(true);
    try {
      const st = useTasks.getState();
      if (st.projectId !== c.projectId) await st.load(c.projectId);
      const t = newTask(
        { id: newId(), projectId: c.projectId, number: useTasks.getState().nextNumber(), ...taskFromChecklistItem(c, { ...item, due: due || null }, photoIds), assignee: who || null },
        me,
        nowIso(),
        newId,
      );
      const saved = await useTasks.getState().save(t);
      toast(`Task #${saved.number} added${saved.assignee ? ` for ${saved.assignee}` : ""}`, "success");
      onClose();
    } catch (e) {
      toast(`Couldn't add the task: ${(e as Error).message}`, "error");
      setSaving(false);
    }
  }
  return (
    <div className="mt-2 flex flex-wrap items-end gap-2 rounded-lg bg-slate-50 p-2.5">
      <label className="text-xs">
        <span className="label">Assign</span>
        <PersonSelect value={who} onChange={setWho} people={people} className="input h-11 w-44" />
      </label>
      <label className="text-xs">
        <span className="label">Due</span>
        <input type="date" className="input h-11 w-40" value={due} onChange={(e) => setDue(e.target.value)} />
      </label>
      <button className="btn btn-brand h-11" disabled={saving} onClick={() => void make()}>
        <ListPlus /> {saving ? "Adding…" : "Make task"}
      </button>
      <button className="btn btn-ghost h-11" onClick={onClose}>
        Cancel
      </button>
    </div>
  );
}

/** A tick that can be taken back for a few seconds ("Undo" bar). */
export interface TickUndo {
  label: string;
  undo: () => void;
}

function ChecklistCard({ c, photos, focusItem, onTicked }: { c: Checklist; photos: Photo[]; focusItem?: string | null; onTicked: (u: TickUndo) => void }) {
  const { saveRow, removeRows, project, jobLogs, checklists } = useEditor();
  const members = useTeam((s) => s.members);
  const { me } = useMe();
  const [editing, setEditing] = useState<string | null>(null);
  const today = localDay(new Date().toISOString());
  const names = teamNames({ photos, jobLogs, checklists, members }, me);
  const people = [me, ...names.filter((n) => n.toLowerCase() !== me.toLowerCase())];
  const [open, setOpen] = useState(true);
  // A link to one item (from /tasks) scrolls to it and marks it for a moment.
  useEffect(() => {
    if (!focusItem || !c.items.some((i) => i.id === focusItem)) return;
    const t = window.setTimeout(() => document.getElementById(`cl-item-${focusItem}`)?.scrollIntoView({ block: "center", behavior: "smooth" }), 50);
    return () => window.clearTimeout(t);
  }, [focusItem, c.items]);
  const [adding, setAdding] = useState("");
  const [viewer, setViewer] = useState<{ list: Photo[]; id: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [photoFor, setPhotoFor] = useState<string | null>(null);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const prog = checklistProgress(c, photos);

  const savingRef = useRef(false);
  async function saveAsTemplate(name: string) {
    if (savingRef.current) return; // a double tap on "Save template" must not save it twice ("X" and "X (2)")
    savingRef.current = true;
    const t = templateFromChecklist(c, name, newId);
    let saved = t.name;
    try {
      await saveChecklistTemplates((cur) => {
        const next = addTemplate(cur, t);
        saved = next[next.length - 1].name;
        return next;
      });
      setSavingTemplate(false);
      toast(`Saved “${saved}” as a template`, "success");
    } catch {
      toast("Couldn't save the template", "error");
    } finally {
      savingRef.current = false;
    }
  }
  // Patch the latest copy from the store, so quick taps on two items don't overwrite each other.
  const setItem = (id: string, patch: Partial<ChecklistItem>) => {
    const cur = useEditor.getState().checklists.find((x) => x.id === c.id) ?? c;
    return saveRow("checklists", { ...cur, items: cur.items.map((i) => (i.id === id ? { ...i, ...patch } : i)) });
  };

  // Tick / untick, with a few seconds to take it back.
  const tick = (i: ChecklistItem) => {
    const before = { done: i.done ?? false, doneBy: i.doneBy ?? null, doneAt: i.doneAt ?? null };
    void setItem(i.id, i.done ? { done: false, doneBy: null, doneAt: null } : { done: true, doneBy: me, doneAt: nowIso() });
    onTicked({ label: `${i.done ? "Unticked" : "Ticked"}: ${i.text}`, undo: () => void setItem(i.id, before) });
  };

  async function addPhotos(files: FileList | null) {
    if (!files?.length || !photoFor || !project) return;
    const author = me;
    for (const f of [...files]) {
      const p = await importPhoto(f, { projectId: project.id, author, extra: { checklistId: c.id, checklistItemId: photoFor, tags: [c.name.split(" ")[0]] } });
      await saveRow("photos", p);
    }
    toast("Photo added to the checklist", "success");
    setPhotoFor(null);
  }

  return (
    <section className="card overflow-hidden">
      <button className="flex w-full items-center gap-3 px-4 py-3 text-left" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <div className="min-w-0 flex-1">
          <div className="font-semibold">{c.name}</div>
          <div className="mt-1.5 flex items-center gap-2">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${prog.pct}%` }} />
            </div>
            <span className="text-xs text-slate-500 tabular-nums">
              {prog.done}/{prog.total}
            </span>
          </div>
          {prog.missingPhotos > 0 && <div className="mt-1 text-xs text-amber-700">{prog.missingPhotos} ticked item{prog.missingPhotos > 1 ? "s need" : " needs"} a photo</div>}
        </div>
        <ChevronDown className={`h-5 w-5 text-slate-400 transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="border-t border-slate-100">
          <input ref={fileRef} type="file" accept="image/*" capture="environment" multiple className="hidden" onChange={(e) => void addPhotos(e.target.files).then(() => (e.target.value = ""))} />
          <ul className="divide-y divide-slate-100">
            {c.items.map((i) => {
              const ps = itemPhotos(photos, c.id, i.id);
              // A task made from a photo comment links back to that photo.
              const from = i.photoId ? photos.find((p) => p.id === i.photoId && !p.deleted) : undefined;
              const complete = itemComplete(i, ps.length);
              return (
                <li key={i.id} id={`cl-item-${i.id}`} className={`flex items-start gap-2 px-2 py-1.5 sm:px-3 ${focusItem === i.id ? "bg-amber-50 ring-1 ring-amber-200 ring-inset" : ""}`}>
                  {/* 44px tap area around the 24px box. */}
                  <button
                    className="group flex h-11 w-11 shrink-0 items-center justify-center rounded-lg"
                    onClick={() => tick(i)}
                    aria-label={`${i.done ? "Mark not done" : "Mark done"}: ${i.text}`}
                    aria-pressed={!!i.done}
                  >
                    <span className={`flex h-6 w-6 items-center justify-center rounded-md ring-1 transition ${i.done ? (complete ? "bg-emerald-500 text-white ring-emerald-500" : "bg-amber-400 text-white ring-amber-400") : "bg-white ring-slate-300 group-hover:ring-slate-400"}`}>
                      {i.done && <Check className="h-4 w-4" />}
                    </span>
                  </button>
                  <div className="min-w-0 flex-1 py-2.5">
                    <div className={`text-sm ${i.done ? "text-slate-500" : ""}`}>{i.text}</div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-slate-400">
                      {i.requiresPhoto && <span className={ps.length ? "text-emerald-700" : "text-amber-700"}>{ps.length ? `${ps.length} photo${ps.length > 1 ? "s" : ""}` : "Photo required"}</span>}
                      {i.assignee && (
                        <span className="inline-flex items-center gap-1 text-slate-600">
                          <UserRound className="h-3 w-3" /> {i.assignee}
                        </span>
                      )}
                      {i.due && (
                        <span className={`inline-flex items-center gap-1 ${!i.done && taskBucket(i.due, today) === "overdue" ? "font-medium text-red-600" : !i.done && taskBucket(i.due, today) === "today" ? "font-medium text-amber-700" : "text-slate-600"}`}>
                          <CalendarDays className="h-3 w-3" /> {dueText(i.due)}
                        </span>
                      )}
                      {i.done && i.doneAt && (
                        <span>
                          ✓ {i.doneBy ? `${i.doneBy}, ` : ""}
                          {new Date(i.doneAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                        </span>
                      )}
                    </div>
                    {editing === i.id && <MakeTaskFields c={c} item={i} photoIds={ps.map((p) => p.id)} people={people} me={me} onClose={() => setEditing(null)} />}
                    {(ps.length > 0 || from) && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {from && !ps.some((p) => p.id === from.id) && (
                          <span className="relative" title="Photo this task came from">
                            <Mini photo={from} onOpen={() => setViewer({ list: [from], id: from.id })} />
                            <MessageSquare className="pointer-events-none absolute -right-1 -bottom-1 h-4 w-4 rounded-full bg-white p-0.5 text-brand-600 ring-1 ring-slate-200" />
                          </span>
                        )}
                        {ps.map((p) => (
                          <Mini key={p.id} photo={p} onOpen={() => setViewer({ list: ps, id: p.id })} />
                        ))}
                      </div>
                    )}
                  </div>
                  <button
                    className="btn btn-ghost h-11 w-11 shrink-0 px-0 text-slate-500"
                    title="Make a task from this item"
                    aria-label={`Make task: ${i.text}`}
                    aria-expanded={editing === i.id}
                    onClick={() => setEditing(editing === i.id ? null : i.id)}
                  >
                    <ListPlus />
                  </button>
                  <button
                    className="btn btn-ghost h-11 w-11 shrink-0 px-0 text-slate-500"
                    title="Take or add a photo for this item"
                    aria-label={`Add a photo: ${i.text}`}
                    onClick={() => {
                      setPhotoFor(i.id);
                      setTimeout(() => fileRef.current?.click(), 0);
                    }}
                  >
                    <Camera />
                  </button>
                </li>
              );
            })}
          </ul>
          <form
            className="flex gap-2 border-t border-slate-100 px-4 py-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (!adding.trim()) return;
              // Latest copy from the store (an item ticked a moment ago must not be undone).
              const cur = useEditor.getState().checklists.find((x) => x.id === c.id) ?? c;
              void saveRow("checklists", { ...cur, items: [...cur.items, { id: newId(), text: adding.trim() }] });
              setAdding("");
            }}
          >
            <input className="input h-9" placeholder="Add an item" aria-label={`Add an item to ${c.name}`} value={adding} onChange={(e) => setAdding(e.target.value)} />
            <button className="btn btn-sm" disabled={!adding.trim()}>
              <Plus /> Add
            </button>
            <button
              type="button"
              className="btn btn-sm btn-ghost text-slate-500"
              title="Save as template"
              aria-label="Save as template"
              disabled={c.items.length === 0}
              onClick={() => setSavingTemplate(true)}
            >
              <BookmarkPlus />
            </button>
            <button
              type="button"
              className="btn btn-sm btn-ghost text-slate-400 hover:text-red-600"
              title="Delete checklist"
              aria-label="Delete checklist"
              onClick={() => confirm(`Delete “${c.name}”?`) && void removeRows("checklists", [c.id])}
            >
              <Trash />
            </button>
          </form>
        </div>
      )}
      {viewer && <PhotoViewer photos={viewer.list} startId={viewer.id} onClose={() => setViewer(null)} />}
      {savingTemplate && (
        <Dialog
          title="Save as template"
          description={`Saves the ${c.items.length} item${c.items.length === 1 ? "" : "s"} and their photo rules (not ticks, photos, assignees or due dates) so you can start this checklist on any job.`}
          fields={[{ name: "name", label: "Template name", initial: c.name }]}
          submitLabel="Save template"
          onSubmit={(v) => void saveAsTemplate(v.name ?? "")}
          onCancel={() => setSavingTemplate(false)}
        />
      )}
    </section>
  );
}

export default function Checklists() {
  const { project, checklists, photos, saveRow } = useEditor();
  const [name, setName] = useState("");
  // /tasks links to one item: &item=<id>.
  const focusItem = useSearchParams().get("item");
  const [undo, setUndo] = useState<TickUndo | null>(null);
  const undoTimer = useRef<number | null>(null);
  const showUndo = (u: TickUndo) => {
    if (undoTimer.current) window.clearTimeout(undoTimer.current);
    setUndo(u);
    undoTimer.current = window.setTimeout(() => setUndo(null), 5000);
  };
  useEffect(() => () => {
    if (undoTimer.current) window.clearTimeout(undoTimer.current);
  }, []);
  // Built-in templates follow the company's trades (low voltage: pre-wire, trim-out, rack, final, punch list).
  const templates = allChecklistTemplates(useChecklistTemplates().templates, tradeChecklists(useTrades()));
  if (!project) return null;
  const live = checklists.filter((c) => !c.deleted);
  const add = (c: Checklist) => void saveRow("checklists", c);
  return (
    <div className="space-y-4">
      <div className="card p-4">
        <div className="text-sm font-medium">Start a checklist</div>
        <div className="mt-2 flex flex-wrap gap-2">
          {templates.map((t) => (
            <button
              key={`${t.custom ? "c" : "b"}-${t.id}`}
              className={`btn btn-sm ${t.custom ? "btn-on" : ""}`}
              title={t.custom ? `Your template · ${t.items.length} item${t.items.length === 1 ? "" : "s"}` : undefined}
              onClick={() => add(checklistFromTemplate(t, project.id, newId))}
            >
              {t.custom ? <BookmarkPlus /> : <Plus />} {t.name}
            </button>
          ))}
        </div>
        <form
          className="mt-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) return;
            const now = nowIso();
            add({ id: newId(), projectId: project.id, name: name.trim(), items: [], createdAt: now, updatedAt: now });
            setName("");
          }}
        >
          <input className="input h-9" placeholder="Or name your own (e.g. Theater room)" aria-label="New checklist name" value={name} onChange={(e) => setName(e.target.value)} />
          <button className="btn btn-sm" disabled={!name.trim()}>
            Create
          </button>
        </form>
      </div>
      {live.length === 0 && <p className="text-center text-sm text-slate-500">No checklists yet. Start with a template above — photo-required items make sure the proof is there.</p>}
      {live.map((c) => (
        <ChecklistCard key={c.id} c={c} photos={photos} focusItem={focusItem} onTicked={showUndo} />
      ))}
      {undo && (
        <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-center px-4 pb-[env(safe-area-inset-bottom)]">
          <div className="pointer-events-auto flex max-w-md min-w-0 items-center gap-3 rounded-xl bg-slate-900 py-1.5 pr-1.5 pl-4 text-sm text-white shadow-pop" role="status">
            <span className="min-w-0 flex-1 truncate">{undo.label}</span>
            <button
              className="h-11 shrink-0 rounded-lg px-4 font-semibold text-amber-300 hover:bg-white/10"
              onClick={() => {
                undo.undo();
                setUndo(null);
              }}
            >
              Undo
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
