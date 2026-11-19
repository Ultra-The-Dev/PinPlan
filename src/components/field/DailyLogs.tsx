"use client";
// Daily logs: what happened on site each day, with photos from that day.
import { ImagePlus, Pencil, Plus, Sparkles, Trash } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { db, newId, nowIso } from "@/lib/db";
import { localDay } from "@/lib/fieldDocs";
import { getAuthor, importPhoto } from "@/lib/photos";
import { useEditor } from "@/lib/store";
import { useSyncStatus } from "@/lib/sync";
import { toast } from "@/lib/toast";
import type { JobLog, Photo } from "@/lib/types";
import { useBlobUrl } from "@/lib/useImage";
import PhotoViewer from "../photos/PhotoViewer";

const today = () => localDay(new Date().toISOString());
const dayText = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" });

function Thumb({ photo, onClick, selected }: { photo: Photo; onClick: () => void; selected?: boolean }) {
  const url = useBlobUrl(photo.imageId);
  return (
    <button onClick={onClick} className={`relative h-16 w-16 overflow-hidden rounded-lg bg-slate-100 ${selected === undefined ? "ring-1 ring-slate-200" : selected ? "ring-2 ring-brand-500" : "opacity-60 ring-1 ring-slate-200"}`} aria-label="Photo">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {url && <img src={url} alt="" className="h-full w-full object-cover" />}
    </button>
  );
}

/** Small JPEGs of photos for the AI summary (keeps the request light). */
async function photoPayload(photos: Photo[]) {
  const out: { data: string; caption: string }[] = [];
  for (const p of photos.slice(0, 8)) {
    const rec = await db().images.get(p.imageId);
    if (!rec) continue;
    const bmp = await createImageBitmap(rec.blob);
    const k = Math.min(1, 768 / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * k);
    c.height = Math.round(bmp.height * k);
    c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
    bmp.close();
    out.push({ data: c.toDataURL("image/jpeg", 0.7).split(",")[1], caption: [p.caption, p.room, ...(p.tags ?? [])].filter(Boolean).join(" · ") });
  }
  return out;
}

function Editor({ log, onDone }: { log: JobLog; onDone: () => void }) {
  const { saveRow, photos, project } = useEditor();
  const { email } = useSyncStatus();
  const [l, setL] = useState(log);
  const [busy, setBusy] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  // This day's photos, plus any already linked to the log from another day.
  const dayPhotos = useMemo(() => photos.filter((p) => !p.deleted && (localDay(p.takenAt) === l.date || (l.photoIds ?? []).includes(p.id))), [photos, l.date, l.photoIds]);
  const chosen = new Set(l.photoIds ?? []);
  const toggle = (id: string) => setL((x) => ({ ...x, photoIds: chosen.has(id) ? (x.photoIds ?? []).filter((y) => y !== id) : [...(x.photoIds ?? []), id] }));

  async function aiDraft() {
    const list = dayPhotos.filter((p) => chosen.size === 0 || chosen.has(p.id));
    if (!list.length) return toast("Add photos from this day first", "info");
    setBusy("Writing…");
    try {
      const r = await apiFetch("/api/photos/summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: l.date, address: project?.address, photos: await photoPayload(list), notes: l.body }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || `Server returned ${r.status}`);
      setL((x) => ({ ...x, title: x.title || j.title, body: j.body }));
    } catch (e) {
      toast(`AI summary: ${(e as Error).message}`, "error");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="card space-y-3 p-4">
      <div className="grid gap-3 sm:grid-cols-[160px_1fr]">
        <label className="text-sm">
          <span className="label">Day</span>
          <input type="date" className="input" value={l.date} onChange={(e) => setL({ ...l, date: e.target.value })} />
        </label>
        <label className="text-sm">
          <span className="label">Title</span>
          <input className="input" placeholder="e.g. Rough-in, 2nd floor" value={l.title ?? ""} onChange={(e) => setL({ ...l, title: e.target.value })} />
        </label>
      </div>
      <label className="block text-sm">
        <span className="label">What happened</span>
        <textarea className="input min-h-32" placeholder="Crew on site, work done, issues, what's next…" value={l.body} onChange={(e) => setL({ ...l, body: e.target.value })} />
      </label>
      <div>
        <div className="mb-1.5 flex items-center gap-2">
          <span className="label mb-0">Photos from this day</span>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={async (e) => {
              if (!project || !e.target.files) return;
              for (const f of [...e.target.files]) {
                const p = await importPhoto(f, { projectId: project.id, author: getAuthor(email) });
                await saveRow("photos", p);
                // Keep the log's day; the photo is linked even if it was taken on another day.
                setL((x) => ({ ...x, photoIds: [...(x.photoIds ?? []), p.id] }));
              }
              e.target.value = "";
            }}
          />
          <button className="btn btn-sm btn-ghost text-brand-600" onClick={() => fileRef.current?.click()}>
            <ImagePlus /> Add
          </button>
        </div>
        {dayPhotos.length ? (
          <div className="flex flex-wrap gap-1.5">
            {dayPhotos.map((p) => (
              <Thumb key={p.id} photo={p} selected={chosen.has(p.id)} onClick={() => toggle(p.id)} />
            ))}
          </div>
        ) : (
          <p className="text-xs text-slate-500">No photos taken on this day yet.</p>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <button className="btn btn-sm" disabled={!!busy} onClick={() => void aiDraft()} title="Draft the log from this day's photos (AI)">
          <Sparkles /> {busy ?? "Draft from photos"}
        </button>
        <div className="flex-1" />
        <button className="btn btn-sm" onClick={onDone}>
          Cancel
        </button>
        <button
          className="btn btn-sm btn-brand"
          disabled={!l.body.trim() && !l.title?.trim()}
          onClick={async () => {
            await saveRow("jobLogs", { ...l, title: l.title?.trim() || null, body: l.body.trim(), author: l.author || getAuthor(email) });
            onDone();
          }}
        >
          Save log
        </button>
      </div>
    </div>
  );
}

export default function DailyLogs() {
  const { project, jobLogs, photos, removeRows } = useEditor();
  const [editing, setEditing] = useState<JobLog | null>(null);
  const [viewer, setViewer] = useState<{ list: Photo[]; id: string } | null>(null);
  if (!project) return null;
  const live = jobLogs.filter((l) => !l.deleted);
  const startNew = () => {
    const now = nowIso();
    setEditing({ id: newId(), projectId: project.id, date: today(), title: "", body: "", photoIds: [], createdAt: now, updatedAt: now });
  };
  return (
    <div className="space-y-4">
      {editing ? (
        <Editor log={editing} onDone={() => setEditing(null)} />
      ) : (
        <button className="btn btn-brand" onClick={startNew}>
          <Plus /> New daily log
        </button>
      )}
      {live.length === 0 && !editing && <p className="text-sm text-slate-500">Keep a short record of each day on site — the crew, what got done, issues and next steps — with that day’s photos.</p>}
      {live
        .filter((l) => l.id !== editing?.id)
        .map((l) => {
          const ps = (l.photoIds ?? []).map((id) => photos.find((p) => p.id === id && !p.deleted)).filter((p): p is Photo => !!p);
          return (
            <article key={l.id} className="card p-4">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-medium text-slate-500">
                    {dayText(l.date)}
                    {l.author ? ` · ${l.author}` : ""}
                  </div>
                  {l.title && <h3 className="mt-0.5 font-semibold">{l.title}</h3>}
                </div>
                <button className="btn btn-sm btn-icon btn-ghost" aria-label="Edit log" onClick={() => setEditing(l)}>
                  <Pencil />
                </button>
                <button className="btn btn-sm btn-icon btn-ghost text-slate-400 hover:text-red-600" aria-label="Delete log" onClick={() => confirm("Delete this log?") && void removeRows("jobLogs", [l.id])}>
                  <Trash />
                </button>
              </div>
              {l.body && <p className="mt-2 text-sm leading-relaxed whitespace-pre-line text-slate-700">{l.body}</p>}
              {ps.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {ps.map((p) => (
                    <Thumb key={p.id} photo={p} onClick={() => setViewer({ list: ps, id: p.id })} />
                  ))}
                </div>
              )}
            </article>
          );
        })}
      {viewer && <PhotoViewer photos={viewer.list} startId={viewer.id} onClose={() => setViewer(null)} />}
    </div>
  );
}
