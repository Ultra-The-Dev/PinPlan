"use client";
// Documents: permits, spec sheets, contracts, drawings — any file attached to the job (synced with the job).
import { Download, FileText, Trash, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { db, newId, nowIso, saveImage } from "@/lib/db";
import { downloadBlob } from "@/lib/download";
import { useEditor } from "@/lib/store";
import { toast } from "@/lib/toast";

const MAX_MB = 25;
const size = (n: number) => (n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1e3))} KB`);

export default function Documents() {
  const { project, documents, saveRow, removeRows } = useEditor();
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  if (!project) return null;
  const live = documents.filter((d) => !d.deleted);

  async function add(files: FileList | File[] | null) {
    const list = [...(files ?? [])];
    if (!list.length) return;
    setBusy(true);
    for (const f of list) {
      if (f.size > MAX_MB * 1e6) {
        toast(`${f.name} is over ${MAX_MB} MB`, "error");
        continue;
      }
      const fileId = await saveImage(f, 0, 0);
      const now = nowIso();
      await saveRow("documents", { id: newId(), projectId: project!.id, name: f.name, mime: f.type || "application/octet-stream", size: f.size, fileId, createdAt: now, updatedAt: now });
    }
    setBusy(false);
  }

  return (
    <div
      className={`space-y-3 ${drag ? "rounded-xl ring-2 ring-brand-500" : ""}`}
      onDragOver={(e) => {
        e.preventDefault();
        setDrag(true);
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        void add(e.dataTransfer.files);
      }}
    >
      <div className="flex flex-wrap items-center gap-3">
        <p className="mr-auto text-sm text-slate-500">Permits, spec sheets, contracts, drawings… Drop files here or upload (up to {MAX_MB} MB each).</p>
        <input ref={ref} type="file" multiple className="hidden" onChange={(e) => void add(e.target.files).then(() => (e.target.value = ""))} />
        <button className="btn btn-brand" disabled={busy} onClick={() => ref.current?.click()}>
          <Upload /> {busy ? "Uploading…" : "Add documents"}
        </button>
      </div>
      {live.length === 0 ? (
        <p className="card p-8 text-center text-sm text-slate-500">No documents yet.</p>
      ) : (
        <ul className="card divide-y divide-slate-100">
          {live.map((d) => (
            <li key={d.id} className="flex items-center gap-3 px-4 py-3">
              <FileText className="h-5 w-5 shrink-0 text-slate-400" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{d.name}</div>
                <div className="text-xs text-slate-500">
                  {size(d.size)} · {new Date(d.createdAt).toLocaleDateString()}
                </div>
              </div>
              <button
                className="btn btn-sm"
                onClick={async () => {
                  const rec = await db().images.get(d.fileId);
                  if (!rec) return toast("This file hasn't downloaded to this device yet — try again after sync.", "info");
                  if (d.mime === "application/pdf" || d.mime.startsWith("image/")) window.open(URL.createObjectURL(rec.blob), "_blank");
                  else downloadBlob(rec.blob, d.name);
                }}
              >
                <Download /> Open
              </button>
              <button className="btn btn-sm btn-icon btn-ghost text-slate-400 hover:text-red-600" aria-label={`Delete ${d.name}`} onClick={() => confirm(`Delete ${d.name}?`) && void removeRows("documents", [d.id])}>
                <Trash />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
