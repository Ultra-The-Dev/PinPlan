"use client";
// Job photos: take or upload, grouped by day, filter by tag / person / device, select many to tag, report or delete.
import { Camera, CheckSquare, Columns2, FileText, ImagePlus, MapPin, MessageSquare, PenLine, Search, Square, Tag, Trash, X } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { filterPhotos, photosByDay, tagOptions } from "@/lib/fieldDocs";
import { currentPosition, getAuthor, importPhoto } from "@/lib/photos";
import { useEditor } from "@/lib/store";
import { useSyncStatus } from "@/lib/sync";
import { toast } from "@/lib/toast";
import type { Photo } from "@/lib/types";
import { useBlobUrl } from "@/lib/useImage";
import PhotoViewer from "./PhotoViewer";
import PhotoReport from "./PhotoReport";

const GPS_KEY = "pinplan.photoLocation";
const dayLabel = (day: string) =>
  new Date(`${day}T12:00:00`).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: new Date().getFullYear() === +day.slice(0, 4) ? undefined : "numeric" });

function Thumb({ photo, comments, selected, selecting, onOpen, onToggle }: { photo: Photo; comments: number; selected: boolean; selecting: boolean; onOpen: () => void; onToggle: () => void }) {
  const url = useBlobUrl(photo.imageId);
  return (
    <button
      className={`group relative aspect-square overflow-hidden rounded-xl bg-slate-100 ring-offset-2 transition ${selected ? "ring-2 ring-brand-500" : "hover:ring-2 hover:ring-slate-300"}`}
      onClick={selecting ? onToggle : onOpen}
      aria-label={photo.caption || "Open photo"}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {url && <img src={url} alt="" loading="lazy" className="h-full w-full object-cover" />}
      <div className="absolute inset-x-0 bottom-0 flex items-center gap-1 bg-gradient-to-t from-black/60 to-transparent px-1.5 pt-5 pb-1 text-[11px] text-white">
        {!!photo.annotations?.length && <PenLine className="h-3 w-3" />}
        {comments > 0 && (
          <span className="inline-flex items-center gap-0.5">
            <MessageSquare className="h-3 w-3" />
            {comments}
          </span>
        )}
        {photo.beforeId && <Columns2 className="h-3 w-3" />}
        {photo.lat != null && <MapPin className="h-3 w-3" />}
        <span className="ml-auto truncate">{photo.tags?.[0] ?? ""}</span>
      </div>
      {selecting && (
        <span className="absolute top-1.5 left-1.5 rounded-md bg-white/90 text-brand-600">{selected ? <CheckSquare className="h-5 w-5" /> : <Square className="h-5 w-5 text-slate-400" />}</span>
      )}
    </button>
  );
}

export default function PhotosTab() {
  const { project, photos, photoComments, markers, saveRow, removeRows } = useEditor();
  const { email } = useSyncStatus();
  const [openId, setOpenId] = useState<string | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [person, setPerson] = useState("");
  const [text, setText] = useState("");
  const [selecting, setSelecting] = useState(false);
  const [sel, setSel] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [report, setReport] = useState(false);
  const [drag, setDrag] = useState(false);
  const [withGps, setWithGps] = useState(() => {
    try {
      return localStorage.getItem(GPS_KEY) !== "off";
    } catch {
      return true;
    }
  });
  const fileRef = useRef<HTMLInputElement>(null);
  const camRef = useRef<HTMLInputElement>(null);

  const live = useMemo(() => photos.filter((p) => !p.deleted), [photos]);
  const shown = useMemo(() => filterPhotos(live, { tags, takenBy: person || null, text }), [live, tags, person, text]);
  const groups = useMemo(() => photosByDay(shown), [shown]);
  const options = useMemo(() => tagOptions(live), [live]);
  const people = useMemo(() => [...new Set(live.map((p) => p.takenBy).filter((x): x is string => !!x))].sort(), [live]);
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of photoComments) if (!c.deleted) m.set(c.photoId, (m.get(c.photoId) ?? 0) + 1);
    return m;
  }, [photoComments]);
  if (!project) return null;

  async function addFiles(files: FileList | File[] | null, justTaken = false) {
    const list = [...(files ?? [])].filter((f) => f.type.startsWith("image/"));
    if (!list.length) return;
    // Location: each photo's own GPS when it has it; for photos taken just now, the device's location (if allowed).
    const pos = withGps ? await currentPosition() : null;
    const author = getAuthor(email);
    let n = 0;
    for (const [k, f] of list.entries()) {
      setBusy(`Adding photo ${k + 1} of ${list.length}…`);
      try {
        const recent = justTaken || Date.now() - f.lastModified < 5 * 60_000;
        const photo = await importPhoto(f, { projectId: project!.id, author, position: recent ? pos : null });
        await saveRow("photos", photo);
        n++;
      } catch (e) {
        toast(`${f.name}: ${(e as Error).message}`, "error");
      }
    }
    setBusy(null);
    if (n) toast(`${n} photo${n === 1 ? "" : "s"} added`, "success");
  }

  const toggleTag = (t: string) => setTags((ts) => (ts.includes(t) ? ts.filter((x) => x !== t) : [...ts, t]));
  const toggleSel = (id: string) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const selected = live.filter((p) => sel.includes(p.id));

  return (
    <div
      className="h-full overflow-auto"
      onDragOver={(e) => {
        e.preventDefault();
        setDrag(true);
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        void addFiles(e.dataTransfer.files);
      }}
    >
      <div className="mx-auto max-w-6xl space-y-4 px-4 py-6 sm:px-6">
        <div className="flex flex-wrap items-end gap-3">
          <div className="mr-auto">
            <h2 className="page-title">Photos</h2>
            <p className="mt-1 text-sm text-slate-500">
              {live.length} photo{live.length === 1 ? "" : "s"} · each one keeps who took it, when and where. Drop photos anywhere on this page.
            </p>
          </div>
          <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => void addFiles(e.target.files).then(() => (e.target.value = ""))} />
          <input ref={camRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => void addFiles(e.target.files, true).then(() => (e.target.value = ""))} />
          <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600" title="Add the device's location to photos taken now (photos with their own GPS keep it)">
            <input
              type="checkbox"
              className="accent-brand-600"
              checked={withGps}
              onChange={(e) => {
                setWithGps(e.target.checked);
                try {
                  localStorage.setItem(GPS_KEY, e.target.checked ? "on" : "off");
                } catch {
                  /* ignore */
                }
              }}
            />
            <MapPin className="h-4 w-4" /> Location
          </label>
          <button className="btn" onClick={() => camRef.current?.click()} disabled={!!busy}>
            <Camera /> Take photo
          </button>
          <button className="btn btn-brand" onClick={() => fileRef.current?.click()} disabled={!!busy}>
            <ImagePlus /> {busy ?? "Add photos"}
          </button>
        </div>

        {live.length > 0 && (
          <div className="card space-y-3 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-48 flex-1">
                <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input className="input h-9 pl-9" placeholder="Search captions, rooms, tags" value={text} onChange={(e) => setText(e.target.value)} />
              </div>
              {people.length > 1 && (
                <select className="input h-9 w-auto" value={person} onChange={(e) => setPerson(e.target.value)} aria-label="Taken by">
                  <option value="">Everyone</option>
                  {people.map((p) => (
                    <option key={p}>{p}</option>
                  ))}
                </select>
              )}
              <button className={`btn btn-sm ${selecting ? "btn-on" : ""}`} onClick={() => (setSelecting((s) => !s), setSel([]))}>
                <CheckSquare /> {selecting ? "Done" : "Select"}
              </button>
              <button className="btn btn-sm" onClick={() => setReport(true)}>
                <FileText /> Photo report
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <Tag className="mt-1 h-4 w-4 text-slate-400" />
              {options.slice(0, 16).map((t) => (
                <button key={t} className={`chip ${tags.includes(t) ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`} onClick={() => toggleTag(t)}>
                  {t}
                </button>
              ))}
              {(tags.length > 0 || person || text) && (
                <button className="chip bg-white text-slate-500 ring-1 ring-slate-200" onClick={() => (setTags([]), setPerson(""), setText(""))}>
                  Clear filters
                </button>
              )}
            </div>
          </div>
        )}

        {selecting && sel.length > 0 && (
          <div className="sticky top-2 z-20 flex flex-wrap items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm text-white shadow-pop">
            <span className="mr-auto font-medium">{sel.length} selected</span>
            <select
              className="h-8 rounded-lg bg-white/10 px-2 text-sm"
              value=""
              onChange={async (e) => {
                const t = e.target.value;
                if (!t) return;
                for (const p of selected) if (!(p.tags ?? []).includes(t)) await saveRow("photos", { ...p, tags: [...(p.tags ?? []), t] });
                toast(`Tagged ${sel.length} “${t}”`, "success");
              }}
            >
              <option value="">Add tag…</option>
              {options.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
            <button className="btn btn-sm" onClick={() => setReport(true)}>
              <FileText /> Report
            </button>
            <button
              className="btn btn-sm btn-danger"
              onClick={async () => {
                if (!confirm(`Delete ${sel.length} photo${sel.length === 1 ? "" : "s"}?`)) return;
                await removeRows("photos", sel);
                setSel([]);
              }}
            >
              <Trash /> Delete
            </button>
            <button className="btn btn-sm btn-ghost text-white" onClick={() => setSel([])} aria-label="Clear selection">
              <X />
            </button>
          </div>
        )}

        {live.length === 0 ? (
          <div className={`card flex flex-col items-center px-6 py-16 text-center ${drag ? "ring-2 ring-brand-500" : ""}`}>
            <Camera className="h-10 w-10 text-slate-300" />
            <p className="mt-3 font-medium">No photos yet</p>
            <p className="mt-1 max-w-md text-sm text-slate-500">
              Document the job: pre-wire before drywall, rack and closet, every device installed. Tag them, mark them up, link them to devices on the plan and send a photo report.
            </p>
            <div className="mt-5 flex gap-2">
              <button className="btn" onClick={() => camRef.current?.click()}>
                <Camera /> Take photo
              </button>
              <button className="btn btn-brand" onClick={() => fileRef.current?.click()}>
                <ImagePlus /> Add photos
              </button>
            </div>
          </div>
        ) : shown.length === 0 ? (
          <p className="card p-8 text-center text-sm text-slate-500">No photos match these filters.</p>
        ) : (
          groups.map((g) => (
            <section key={g.day}>
              <div className="mb-2 flex items-baseline gap-2 px-1">
                <h3 className="font-semibold">{dayLabel(g.day)}</h3>
                <span className="text-xs text-slate-400">{g.photos.length}</span>
                {selecting && (
                  <button className="ml-auto text-xs font-medium text-brand-600" onClick={() => setSel((s) => [...new Set([...s, ...g.photos.map((p) => p.id)])])}>
                    Select day
                  </button>
                )}
              </div>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
                {g.photos.map((p) => (
                  <Thumb key={p.id} photo={p} comments={counts.get(p.id) ?? 0} selected={sel.includes(p.id)} selecting={selecting} onOpen={() => setOpenId(p.id)} onToggle={() => toggleSel(p.id)} />
                ))}
              </div>
            </section>
          ))
        )}
        {markers.length > 0 && live.length > 0 && <p className="text-center text-xs text-slate-400">Tip: open a photo and pick its device to see it from that device on the plan.</p>}
      </div>
      {openId && <PhotoViewer photos={shown} startId={openId} onClose={() => setOpenId(null)} />}
      {report && <PhotoReport photos={selected.length ? selected : shown} onClose={() => setReport(false)} />}
    </div>
  );
}
