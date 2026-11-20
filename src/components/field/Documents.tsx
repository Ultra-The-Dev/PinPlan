"use client";
// Documents: permits, spec sheets, contracts, drawings — any file attached to the job (synced with the job).
import { Download, FileText, Trash, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { db, newId, nowIso, saveImage } from "@/lib/db";
import { downloadBlob } from "@/lib/download";
import { useEditor } from "@/lib/store";
import { toast } from "@/lib/toast";
import { fmtDate, fmtNumber, t, useT } from "@/lib/i18n";
import DocumentBacklinks from "../sheetIndex/DocumentBacklinks";
import UploadStatus from "../UploadStatus";

const MAX_MB = 25;
const size = (n: number) => (n > 1e6 ? t("{n} MB", { n: fmtNumber(n / 1e6, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) }) : t("{n} KB", { n: fmtNumber(Math.max(1, Math.round(n / 1e3))) }));

export default function Documents() {
  const { project, documents, saveRow, removeRows } = useEditor();
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  const t = useT();
  if (!project) return null;
  const live = documents.filter((d) => !d.deleted);

  async function add(files: FileList | File[] | null) {
    const list = [...(files ?? [])];
    if (!list.length) return;
    setBusy(true);
    try {
      for (const f of list) {
        if (f.size > MAX_MB * 1e6) {
          toast(t("{name} is over {max} MB", { name: f.name, max: MAX_MB }), "error");
          continue;
        }
        const fileId = await saveImage(f, 0, 0);
        const now = nowIso();
        await saveRow("documents", { id: newId(), projectId: project!.id, name: f.name, mime: f.type || "application/octet-stream", size: f.size, fileId, createdAt: now, updatedAt: now });
      }
    } catch (e) {
      // e.g. storage full — don't leave the button stuck on "Uploading…".
      toast(t("Couldn't add the document: {error}", { error: (e as Error).message }), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className={`space-y-3 ${drag ? "rounded-xl ring-2 ring-brand-500" : ""}`}
      onDragOver={(e) => {
        e.preventDefault();
        setDrag(true);
      }}
      onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget as Node | null) && setDrag(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        void add(e.dataTransfer.files);
      }}
    >
      <div className="flex flex-wrap items-center gap-3">
        <p className="mr-auto text-sm text-slate-500">{t("Permits, spec sheets, contracts, drawings… Drop files here or upload (up to {max} MB each).", { max: MAX_MB })}</p>
        <input ref={ref} type="file" multiple className="hidden" onChange={(e) => void add(e.target.files).then(() => (e.target.value = ""))} />
        <button className="btn btn-brand" disabled={busy} onClick={() => ref.current?.click()}>
          <Upload /> {busy ? t("Uploading…") : t("Add documents")}
        </button>
      </div>
      <UploadStatus fileIds={live.map((d) => d.fileId)} noun="file" />
      {live.length === 0 ? (
        <p className="card p-8 text-center text-sm text-slate-500">{t("No documents yet.")}</p>
      ) : (
        <ul className="card divide-y divide-slate-100">
          {live.map((d) => (
            <li key={d.id} className="flex items-center gap-3 px-4 py-3">
              <FileText className="h-5 w-5 shrink-0 text-slate-400" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{d.name}</div>
                <div className="text-xs text-slate-500">
                  {size(d.size)} · {fmtDate(d.createdAt)}
                </div>
                <DocumentBacklinks documentId={d.id} />
              </div>
              <button
                className="btn btn-sm"
                aria-label={t("Open {name}", { name: d.name })}
                onClick={async () => {
                  // Open the tab inside the click (Safari/iPad block windows opened after an await), then fill it in.
                  const viewable = d.mime === "application/pdf" || d.mime.startsWith("image/");
                  const win = viewable ? window.open("", "_blank") : null;
                  const rec = await db().images.get(d.fileId);
                  if (!rec) {
                    win?.close();
                    return toast(t("This file hasn't downloaded to this device yet — try again after sync."), "info");
                  }
                  if (win) {
                    const url = URL.createObjectURL(rec.blob);
                    win.location.href = url;
                    setTimeout(() => URL.revokeObjectURL(url), 60_000);
                  } else downloadBlob(rec.blob, d.name);
                }}
              >
                <Download /> {t("Open file")}
              </button>
              <button className="btn btn-sm btn-icon btn-ghost text-slate-400 hover:text-red-600" aria-label={t("Delete {name}", { name: d.name })} onClick={() => confirm(t("Delete {name}?", { name: d.name })) && void removeRows("documents", [d.id])}>
                <Trash />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
