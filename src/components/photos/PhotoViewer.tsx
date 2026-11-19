"use client";
// One photo, big: mark-up, caption, tags, where it is on the plan, before/after, who/when/where, comments.
import { ChevronLeft, ChevronRight, Columns2, Download, MapPin, MessageSquare, PenLine, Sparkles, Trash, X } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { toast } from "@/lib/toast";
import { useEffect, useMemo, useState } from "react";
import { db, newId, nowIso } from "@/lib/db";
import { downloadBlob } from "@/lib/download";
import { tagOptions } from "@/lib/fieldDocs";
import { getAuthor, mapsLink, renderPhoto } from "@/lib/photos";
import { useEditor } from "@/lib/store";
import { useSyncStatus } from "@/lib/sync";
import type { Photo } from "@/lib/types";
import { useBlobUrl } from "@/lib/useImage";
import AnnotationSvg from "./AnnotationSvg";
import Annotator from "./Annotator";

const when = (iso: string) => new Date(iso).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });

export function PhotoImage({ photo, className = "" }: { photo: Photo; className?: string }) {
  const url = useBlobUrl(photo.imageId);
  return (
    <div className={`relative ${className}`} style={{ aspectRatio: `${photo.width || 4} / ${photo.height || 3}` }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {url ? <img src={url} alt={photo.caption ?? "Job photo"} className="h-full w-full object-contain" /> : <div className="h-full w-full animate-pulse bg-white/5" />}
      {!!photo.annotations?.length && <AnnotationSvg shapes={photo.annotations} w={photo.width} h={photo.height} />}
    </div>
  );
}

export default function PhotoViewer({ photos, startId, onClose }: { photos: Photo[]; startId: string; onClose: () => void }) {
  const { markers, photoComments, saveRow, removeRows, catalog } = useEditor();
  const all = useEditor((s) => s.photos);
  const { email } = useSyncStatus();
  const [id, setId] = useState(startId);
  const [marking, setMarking] = useState(false);
  const [compare, setCompare] = useState(false);
  const [comment, setComment] = useState("");
  const [tagDraft, setTagDraft] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const i = Math.max(0, photos.findIndex((p) => p.id === id));
  const p = all.find((x) => x.id === photos[i]?.id) ?? photos[i];
  const comments = useMemo(() => photoComments.filter((c) => c.photoId === p?.id && !c.deleted), [photoComments, p?.id]);
  const options = useMemo(() => tagOptions(all), [all]);
  const before = p?.beforeId ? all.find((x) => x.id === p.beforeId && !x.deleted) : undefined;
  const after = p ? all.find((x) => x.beforeId === p.id && !x.deleted) : undefined;
  const pair = before ? { before, after: p } : after ? { before: p, after } : null;

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest("input,textarea,select")) return;
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") setId(photos[Math.min(photos.length - 1, i + 1)]?.id ?? id);
      if (e.key === "ArrowLeft") setId(photos[Math.max(0, i - 1)]?.id ?? id);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [i, id, photos, onClose]);

  if (!p) return null;
  const save = (patch: Partial<Photo>) => saveRow("photos", { ...p, ...patch });
  const addTag = (t: string) => {
    const tag = t.trim();
    if (tag && !(p.tags ?? []).includes(tag)) void save({ tags: [...(p.tags ?? []), tag] });
    setTagDraft("");
  };
  const typeName = (deviceTypeId: string) => catalog.find((d) => d.id === deviceTypeId)?.name ?? "";
  const others = all.filter((x) => x.id !== p.id && !x.deleted);

  /** AI caption + tags; anything worth flagging is posted as a comment. */
  async function aiCaption() {
    setAiBusy(true);
    try {
      const rec = await db().images.get(p.imageId);
      if (!rec) throw new Error("Photo not on this device yet");
      const small = await renderPhoto(rec.blob, null, 1024);
      const b64 = await new Promise<string>((r) => {
        const fr = new FileReader();
        fr.onload = () => r(String(fr.result).split(",")[1]);
        fr.readAsDataURL(small);
      });
      const m = markers.find((x) => x.id === p.markerId);
      const res = await apiFetch("/api/photos/describe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: b64, room: p.room ?? m?.room, device: m ? `${m.label} ${typeName(m.deviceTypeId)}` : undefined, existingTags: options.slice(0, 20) }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || `Server returned ${res.status}`);
      await save({ caption: p.caption?.trim() ? p.caption : j.caption, tags: [...new Set([...(p.tags ?? []), ...(j.tags as string[])])] });
      if ((j.issues as string[]).length) {
        const now = nowIso();
        await saveRow("photoComments", { id: newId(), projectId: p.projectId, photoId: p.id, author: "AI check", text: `Worth a look: ${(j.issues as string[]).join("; ")}`, createdAt: now, updatedAt: now });
      }
    } catch (e) {
      toast(`AI caption: ${(e as Error).message}`, "error");
    } finally {
      setAiBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-950/95 lg:flex-row" role="dialog" aria-label="Photo">
      <div className="relative flex min-h-0 flex-1 items-center justify-center p-3 sm:p-6">
        <button className="absolute top-3 left-3 z-10 rounded-full bg-black/40 p-2 text-white hover:bg-black/60" onClick={onClose} aria-label="Close">
          <X className="h-5 w-5" />
        </button>
        {i > 0 && (
          <button className="absolute left-3 z-10 rounded-full bg-black/40 p-2 text-white hover:bg-black/60" onClick={() => setId(photos[i - 1].id)} aria-label="Previous photo">
            <ChevronLeft className="h-6 w-6" />
          </button>
        )}
        {i < photos.length - 1 && (
          <button className="absolute right-3 z-10 rounded-full bg-black/40 p-2 text-white hover:bg-black/60" onClick={() => setId(photos[i + 1].id)} aria-label="Next photo">
            <ChevronRight className="h-6 w-6" />
          </button>
        )}
        {compare && pair ? (
          <div className="grid h-full w-full grid-cols-2 items-center gap-3">
            {[pair.before, pair.after].map((x, k) => (
              <div key={x.id} className="flex h-full flex-col items-center justify-center">
                <span className="mb-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold tracking-wide text-white uppercase">{k ? "After" : "Before"}</span>
                <PhotoImage photo={x} className="max-h-[80vh] w-full" />
              </div>
            ))}
          </div>
        ) : (
          <PhotoImage photo={p} className="max-h-full w-full max-w-full" />
        )}
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/50 px-3 py-1 text-xs text-white/80 tabular-nums">
          {i + 1} / {photos.length}
        </div>
      </div>

      <aside className="max-h-[48vh] w-full shrink-0 space-y-4 overflow-y-auto bg-white p-4 lg:max-h-none lg:w-[360px]">
        <div className="flex flex-wrap gap-2">
          <button className="btn btn-sm btn-brand" onClick={() => setMarking(true)}>
            <PenLine /> Mark up
          </button>
          <button className="btn btn-sm" disabled={aiBusy} onClick={() => void aiCaption()} title="Write a caption and tags with AI">
            <Sparkles /> {aiBusy ? "Looking…" : "AI caption"}
          </button>
          {pair && (
            <button className={`btn btn-sm ${compare ? "btn-on" : ""}`} onClick={() => setCompare((c) => !c)}>
              <Columns2 /> Before / after
            </button>
          )}
          <button
            className="btn btn-sm"
            onClick={async () => {
              const rec = await db().images.get(p.imageId);
              if (rec) downloadBlob(await renderPhoto(rec.blob, p.annotations, 4096), `photo-${p.takenAt.slice(0, 10)}.jpg`);
            }}
          >
            <Download /> Save
          </button>
          <button
            className="btn btn-sm btn-ghost text-slate-500 hover:text-red-600"
            onClick={async () => {
              if (!confirm("Delete this photo?")) return;
              const next = photos[i + 1] ?? photos[i - 1];
              await removeRows("photos", [p.id]);
              if (next) setId(next.id);
              else onClose();
            }}
          >
            <Trash /> Delete
          </button>
        </div>

        <div className="text-sm text-slate-600">
          <div className="font-medium text-slate-900">{when(p.takenAt)}</div>
          <div>{p.takenBy ? `by ${p.takenBy}` : ""}</div>
          {p.lat != null && p.lng != null && (
            <a className="mt-0.5 inline-flex items-center gap-1 text-brand-600 hover:underline" href={mapsLink(p.lat, p.lng)} target="_blank" rel="noreferrer">
              <MapPin className="h-3.5 w-3.5" /> {p.lat.toFixed(5)}, {p.lng.toFixed(5)}
            </a>
          )}
        </div>

        <label className="block text-sm">
          <span className="label">Caption</span>
          <textarea key={`cap${p.id}`} className="input min-h-16" defaultValue={p.caption ?? ""} placeholder="What does this show?" onBlur={(e) => e.target.value !== (p.caption ?? "") && void save({ caption: e.target.value.trim() || null })} />
        </label>

        <div>
          <span className="label">Tags</span>
          <div className="flex flex-wrap gap-1.5">
            {(p.tags ?? []).map((t) => (
              <button key={t} className="chip bg-brand-50 text-brand-700 hover:bg-red-50 hover:text-red-700" title="Remove tag" onClick={() => void save({ tags: (p.tags ?? []).filter((x) => x !== t) })}>
                {t} ×
              </button>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-1">
            {options
              .filter((t) => !(p.tags ?? []).includes(t))
              .slice(0, 10)
              .map((t) => (
                <button key={t} className="chip bg-slate-100 text-slate-600 hover:bg-slate-200" onClick={() => addTag(t)}>
                  + {t}
                </button>
              ))}
          </div>
          <form
            className="mt-2 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              addTag(tagDraft);
            }}
          >
            <input className="input h-9" placeholder="New tag" value={tagDraft} onChange={(e) => setTagDraft(e.target.value)} />
            <button className="btn btn-sm" disabled={!tagDraft.trim()}>
              Add
            </button>
          </form>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <label className="text-sm">
            <span className="label">Device</span>
            <select className="input h-9" value={p.markerId ?? ""} onChange={(e) => {
              const m = markers.find((x) => x.id === e.target.value);
              void save({ markerId: m?.id ?? null, sheetId: m?.sheetId ?? p.sheetId ?? null, room: m?.room || p.room || null });
            }}>
              <option value="">—</option>
              {[...markers].sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true })).map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label} · {typeName(m.deviceTypeId)}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="label">Room</span>
            <input key={`room${p.id}`} className="input h-9" defaultValue={p.room ?? ""} placeholder="e.g. Kitchen" onBlur={(e) => e.target.value !== (p.room ?? "") && void save({ room: e.target.value.trim() || null })} />
          </label>
        </div>

        <label className="block text-sm">
          <span className="label">After photo of…</span>
          <select className="input h-9" value={p.beforeId ?? ""} onChange={(e) => void save({ beforeId: e.target.value || null })}>
            <option value="">— not a before/after pair —</option>
            {others.map((x) => (
              <option key={x.id} value={x.id}>
                {new Date(x.takenAt).toLocaleDateString()} · {x.caption || x.room || (x.tags ?? []).join(", ") || "photo"}
              </option>
            ))}
          </select>
          {after && <span className="mt-1 block text-xs text-slate-500">This is the “before” of a later photo.</span>}
        </label>

        <div>
          <span className="label flex items-center gap-1.5">
            <MessageSquare className="h-3.5 w-3.5" /> Comments
          </span>
          <ul className="space-y-2">
            {comments.map((c) => (
              <li key={c.id} className="rounded-lg bg-slate-50 px-3 py-2 text-sm">
                <div className="text-xs text-slate-500">
                  <span className="font-medium text-slate-700">{c.author || "—"}</span> · {new Date(c.createdAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                </div>
                <div className="whitespace-pre-line">{c.text}</div>
              </li>
            ))}
          </ul>
          <form
            className="mt-2 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!comment.trim()) return;
              const now = nowIso();
              void saveRow("photoComments", { id: newId(), projectId: p.projectId, photoId: p.id, author: getAuthor(email), text: comment.trim(), createdAt: now, updatedAt: now });
              setComment("");
            }}
          >
            <input className="input h-9" placeholder="Add a comment" value={comment} onChange={(e) => setComment(e.target.value)} />
            <button className="btn btn-sm" disabled={!comment.trim()}>
              Post
            </button>
          </form>
        </div>
      </aside>

      {marking && (
        <Annotator
          imageId={p.imageId}
          width={p.width}
          height={p.height}
          shapes={p.annotations ?? []}
          onCancel={() => setMarking(false)}
          onSave={(shapes) => {
            void save({ annotations: shapes.length ? shapes : null });
            setMarking(false);
          }}
        />
      )}
    </div>
  );
}
