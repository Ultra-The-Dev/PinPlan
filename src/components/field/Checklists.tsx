"use client";
// Checklists from templates (pre-wire, trim-out, rack, final walkthrough) or from scratch. Photo-required items
// only count once they have a photo, which can be taken right from the item.
import { CalendarDays, Camera, Check, ChevronDown, MessageSquare, Plus, Trash, UserRound } from "lucide-react";
import { useRef, useState } from "react";
import { newId, nowIso } from "@/lib/db";
import { CHECKLIST_TEMPLATES, checklistFromTemplate, checklistProgress, itemComplete, itemPhotos, localDay, taskBucket, teamNames } from "@/lib/fieldDocs";
import { getAuthor, importPhoto } from "@/lib/photos";
import { useEditor } from "@/lib/store";
import { useSyncStatus } from "@/lib/sync";
import { toast } from "@/lib/toast";
import type { Checklist, ChecklistItem, Photo } from "@/lib/types";
import { useBlobUrl } from "@/lib/useImage";
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

/** Assignee + due date for an item (turns it into a task on that person's list). */
function TaskFields({ item, names, onChange, onClose }: { item: ChecklistItem; names: string[]; onChange: (p: Partial<ChecklistItem>) => void; onClose: () => void }) {
  const [who, setWho] = useState(item.assignee ?? "");
  const [due, setDue] = useState(item.due ?? "");
  const listId = `names-${item.id}`;
  return (
    <div className="mt-2 flex flex-wrap items-end gap-2 rounded-lg bg-slate-50 p-2.5">
      <label className="text-xs">
        <span className="label">Assigned to</span>
        <input className="input h-8 w-40" list={listId} placeholder="Name" value={who} onChange={(e) => setWho(e.target.value)} />
        <datalist id={listId}>
          {names.map((n) => (
            <option key={n} value={n} />
          ))}
        </datalist>
      </label>
      <label className="text-xs">
        <span className="label">Due</span>
        <input type="date" className="input h-8 w-40" value={due} onChange={(e) => setDue(e.target.value)} />
      </label>
      <button
        className="btn btn-sm btn-brand"
        onClick={() => {
          onChange({ assignee: who.trim() || null, due: due || null });
          onClose();
        }}
      >
        Save
      </button>
      <button className="btn btn-sm btn-ghost" onClick={onClose}>
        Cancel
      </button>
    </div>
  );
}

function ChecklistCard({ c, photos }: { c: Checklist; photos: Photo[] }) {
  const { saveRow, removeRows, project, jobLogs, checklists } = useEditor();
  const { email } = useSyncStatus();
  const [editing, setEditing] = useState<string | null>(null);
  const today = localDay(new Date().toISOString());
  const names = teamNames({ photos, jobLogs, checklists }, getAuthor(email));
  const [open, setOpen] = useState(true);
  const [adding, setAdding] = useState("");
  const [viewer, setViewer] = useState<{ list: Photo[]; id: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [photoFor, setPhotoFor] = useState<string | null>(null);
  const prog = checklistProgress(c, photos);
  // Patch the latest copy from the store, so quick taps on two items don't overwrite each other.
  const setItem = (id: string, patch: Partial<ChecklistItem>) => {
    const cur = useEditor.getState().checklists.find((x) => x.id === c.id) ?? c;
    return saveRow("checklists", { ...cur, items: cur.items.map((i) => (i.id === id ? { ...i, ...patch } : i)) });
  };

  async function addPhotos(files: FileList | null) {
    if (!files?.length || !photoFor || !project) return;
    const author = getAuthor(email);
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
                <li key={i.id} className="flex items-start gap-3 px-4 py-3">
                  <button
                    className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md ring-1 transition ${i.done ? (complete ? "bg-emerald-500 text-white ring-emerald-500" : "bg-amber-400 text-white ring-amber-400") : "bg-white ring-slate-300 hover:ring-slate-400"}`}
                    onClick={() => void setItem(i.id, i.done ? { done: false, doneBy: null, doneAt: null } : { done: true, doneBy: getAuthor(email), doneAt: nowIso() })}
                    aria-label={i.done ? "Mark not done" : "Mark done"}
                  >
                    {i.done && <Check className="h-4 w-4" />}
                  </button>
                  <div className="min-w-0 flex-1">
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
                    {editing === i.id && <TaskFields item={i} names={names} onChange={(p) => void setItem(i.id, p)} onClose={() => setEditing(null)} />}
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
                    className={`btn btn-sm btn-ghost ${i.assignee || i.due ? "text-brand-600" : "text-slate-500"}`}
                    title="Assign and set a due date"
                    aria-label="Assign and set a due date"
                    onClick={() => setEditing(editing === i.id ? null : i.id)}
                  >
                    <UserRound />
                  </button>
                  <button
                    className="btn btn-sm btn-ghost text-slate-500"
                    title="Take or add a photo for this item"
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
              void saveRow("checklists", { ...c, items: [...c.items, { id: newId(), text: adding.trim() }] });
              setAdding("");
            }}
          >
            <input className="input h-9" placeholder="Add an item" value={adding} onChange={(e) => setAdding(e.target.value)} />
            <button className="btn btn-sm" disabled={!adding.trim()}>
              <Plus /> Add
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
    </section>
  );
}

export default function Checklists() {
  const { project, checklists, photos, saveRow } = useEditor();
  const [name, setName] = useState("");
  if (!project) return null;
  const live = checklists.filter((c) => !c.deleted);
  const add = (c: Checklist) => void saveRow("checklists", c);
  return (
    <div className="space-y-4">
      <div className="card p-4">
        <div className="text-sm font-medium">Start a checklist</div>
        <div className="mt-2 flex flex-wrap gap-2">
          {CHECKLIST_TEMPLATES.map((t) => (
            <button key={t.id} className="btn btn-sm" onClick={() => add(checklistFromTemplate(t, project.id, newId))}>
              <Plus /> {t.name}
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
          <input className="input h-9" placeholder="Or name your own (e.g. Theater room)" value={name} onChange={(e) => setName(e.target.value)} />
          <button className="btn btn-sm" disabled={!name.trim()}>
            Create
          </button>
        </form>
      </div>
      {live.length === 0 && <p className="text-center text-sm text-slate-500">No checklists yet. Start with a template above — photo-required items make sure the proof is there.</p>}
      {live.map((c) => (
        <ChecklistCard key={c.id} c={c} photos={photos} />
      ))}
    </div>
  );
}
