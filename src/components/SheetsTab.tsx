"use client";
import { useRef, useState } from "react";
import { newId, nowIso, put, saveImage } from "@/lib/db";
import { canvasToBlob, guessFloorName, loadPhoto, renderPdf } from "@/lib/importPlans";
import { useEditor } from "@/lib/store";
import { useSheetImage } from "@/lib/useImage";
import type { Sheet } from "@/lib/types";
import PhotoStraighten from "./PhotoStraighten";

export default function SheetsTab({ onOpenSheet }: { onOpenSheet: () => void }) {
  const { project, sheets, load, updateSheet, setActiveSheet, markers } = useEditor();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [photoQueue, setPhotoQueue] = useState<{ file: File; img: HTMLImageElement }[]>([]);

  if (!project) return null;
  const nextOrder = () => (sheets.length ? Math.max(...sheets.map((s) => s.order)) + 1 : 0);

  async function addSheet(blob: Blob, width: number, height: number, name: string, pageNumber: number, pxPerInch: number | null, order: number) {
    const imageId = await saveImage(blob, width, height);
    const sheet: Sheet = {
      id: newId(),
      projectId: project!.id,
      name,
      pageNumber,
      order,
      imageId,
      width,
      height,
      pxPerFt: null,
      pxPerInch,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    await put("sheets", sheet);
  }

  async function onFiles(files: FileList | null) {
    if (!files?.length) return;
    setError(null);
    const photos: { file: File; img: HTMLImageElement }[] = [];
    let order = nextOrder();
    try {
      for (const file of Array.from(files)) {
        if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
          setBusy(`Rendering ${file.name}…`);
          const pages = await renderPdf(file, (d, t) => setBusy(`Rendering ${file.name}: page ${d} of ${t}`));
          for (const p of pages) {
            await addSheet(p.blob, p.width, p.height, guessFloorName(p.text, `Sheet ${order + 1}`), p.pageNumber, p.pxPerInch, order++);
          }
        } else {
          setBusy(`Loading ${file.name}…`);
          photos.push({ file, img: await loadPhoto(file) });
        }
      }
      await load(project!.id);
      if (photos.length) setPhotoQueue((q) => [...q, ...photos]);
    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function finishPhoto(canvas: HTMLCanvasElement | null) {
    const [cur, ...rest] = photoQueue;
    if (canvas && cur) {
      setBusy("Saving photo…");
      const blob = await canvasToBlob(canvas, "image/jpeg", 0.9);
      const order = nextOrder();
      await addSheet(blob, canvas.width, canvas.height, cur.file.name.replace(/\.[^.]+$/, "") || `Sheet ${order + 1}`, 1, null, order);
      URL.revokeObjectURL(cur.img.src);
      await load(project!.id);
      setBusy(null);
    }
    setPhotoQueue(rest);
  }

  async function move(sheet: Sheet, dir: -1 | 1) {
    const idx = sheets.findIndex((s) => s.id === sheet.id);
    const other = sheets[idx + dir];
    if (!other) return;
    await updateSheet(sheet.id, { order: other.order });
    await updateSheet(other.id, { order: sheet.order });
  }

  async function del(sheet: Sheet) {
    const n = markers.filter((m) => m.sheetId === sheet.id).length;
    if (!confirm(`Delete sheet “${sheet.name}”${n ? ` and its ${n} devices` : ""}?`)) return;
    await updateSheet(sheet.id, { deleted: true });
  }

  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto max-w-5xl p-4 sm:p-6">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <h2 className="text-xl font-semibold">Plan sheets</h2>
          <p className="text-sm text-slate-500">One sheet per floor. PDFs are split into pages; phone photos are straightened.</p>
          <div className="flex-1" />
          <input
            ref={fileRef}
            type="file"
            multiple
            accept="application/pdf,.pdf,image/*,.heic,.heif"
            className="hidden"
            onChange={(e) => onFiles(e.target.files)}
          />
          <button className="btn btn-primary" disabled={!!busy} onClick={() => fileRef.current?.click()}>
            Upload PDF or photos
          </button>
        </div>
        {busy && <div className="card mb-4 p-3 text-sm text-slate-600">{busy}</div>}
        {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

        <div
          className="mb-4 rounded-xl border-2 border-dashed border-slate-300 p-6 text-center text-sm text-slate-500"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            onFiles(e.dataTransfer.files);
          }}
        >
          Drop the plan set here (PDF, JPG, PNG, HEIC)
        </div>

        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {sheets.map((s, i) => (
            <SheetCard
              key={s.id}
              sheet={s}
              count={markers.filter((m) => m.sheetId === s.id).length}
              first={i === 0}
              last={i === sheets.length - 1}
              onRename={(name) => updateSheet(s.id, { name })}
              onMove={(d) => move(s, d)}
              onDelete={() => del(s)}
              onOpen={() => {
                setActiveSheet(s.id);
                onOpenSheet();
              }}
            />
          ))}
        </ul>
      </div>
      {photoQueue[0] && <PhotoStraighten key={photoQueue[0].img.src} image={photoQueue[0].img} name={photoQueue[0].file.name} onDone={finishPhoto} />}
    </div>
  );
}

function SheetCard(props: {
  sheet: Sheet;
  count: number;
  first: boolean;
  last: boolean;
  onRename: (n: string) => void;
  onMove: (d: -1 | 1) => void;
  onDelete: () => void;
  onOpen: () => void;
}) {
  const { sheet } = props;
  const img = useSheetImage(sheet.imageId);
  const [name, setName] = useState(sheet.name);
  return (
    <li className="card overflow-hidden">
      <button className="block aspect-[4/3] w-full bg-slate-100" onClick={props.onOpen} aria-label={`Open ${sheet.name}`}>
        {img ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={img.url} alt={sheet.name} className="h-full w-full object-contain" />
        ) : (
          <span className="text-xs text-slate-400">{sheet.imageUrl ? "Downloading…" : "Loading…"}</span>
        )}
      </button>
      <div className="space-y-2 p-3">
        <input
          className="input font-medium"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => name.trim() && name !== sheet.name && props.onRename(name.trim())}
          aria-label="Sheet name"
        />
        <div className="flex items-center gap-1 text-xs text-slate-500">
          <span>
            {props.count} devices · {sheet.pxPerFt ? `scale set${sheet.scaleLabel ? ` (${sheet.scaleLabel})` : ""}` : "no scale"}
          </span>
          <div className="flex-1" />
          <button className="btn btn-sm" disabled={props.first} onClick={() => props.onMove(-1)} aria-label="Move up">
            ↑
          </button>
          <button className="btn btn-sm" disabled={props.last} onClick={() => props.onMove(1)} aria-label="Move down">
            ↓
          </button>
          <button className="btn btn-sm btn-danger" onClick={props.onDelete}>
            Delete
          </button>
        </div>
      </div>
    </li>
  );
}
