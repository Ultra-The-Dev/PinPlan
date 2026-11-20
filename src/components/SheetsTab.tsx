"use client";
import { ArrowDown, ArrowUp, FileUp, MapPin, RotateCw, Ruler, Trash, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { db, newId, nowIso, put, saveImage } from "@/lib/db";
import { canvasToBlob, guessFloorName, loadPhoto, renderPdf } from "@/lib/importPlans";
import { findScale } from "@/lib/geometry";
import { useSheetLinks } from "@/lib/sheetLinks";
import { useEditor } from "@/lib/store";
import { useRole } from "@/lib/team";
import { toast } from "@/lib/toast";
import { useSheetImage } from "@/lib/useImage";
import type { Sheet } from "@/lib/types";
import { useT } from "@/lib/i18n";
import PhotoStraighten from "./PhotoStraighten";
import { SheetIndexButton, SheetMetaChips } from "./sheetIndex/SheetIndexPanel";
import SheetNamesReview, { hasProposals, type ReviewPage } from "./sheetIndex/SheetNamesReview";
import { rotateSheetMarkups } from "./markups/useMarkups";
import { RevisionBadge, UploadRevisedSetButton, UploadRevisionButton } from "./revisions/SheetRevisionControls";

export default function SheetsTab({ onOpenSheet }: { onOpenSheet: () => void }) {
  const t = useT();
  const { project, sheets, load, updateSheet, setActiveSheet, markers, runs, rotateSheetCW } = useEditor();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [photoQueue, setPhotoQueue] = useState<{ file: File; img: HTMLImageElement }[]>([]);
  // Sheet numbers / titles read from the PDF text, for the office to confirm (docs/sheet-index-links.md).
  const [review, setReview] = useState<ReviewPage[] | null>(null);
  const office = useRole() !== "tech";

  if (!project) return null;
  const nextOrder = () => (sheets.length ? Math.max(...sheets.map((s) => s.order)) + 1 : 0);

  async function addSheet(blob: Blob, width: number, height: number, name: string, pageNumber: number, pxPerInch: number | null, order: number, text = "") {
    const imageId = await saveImage(blob, width, height);
    // A printed scale on a PDF page gives an exact scale (the paper size is known).
    const found = pxPerInch ? findScale(text) : null;
    const sheet: Sheet = {
      id: newId(), projectId: project!.id, name, pageNumber, order, imageId, width, height,
      pxPerFt: found ? found.inchesPerFoot * pxPerInch! : null, scaleLabel: found?.label ?? null,
      pxPerInch, createdAt: nowIso(), updatedAt: nowIso(),
    };
    await put("sheets", sheet);
    return sheet.id;
  }

  async function onFiles(files: FileList | null) {
    if (!files?.length) return;
    setError(null);
    const photos: { file: File; img: HTMLImageElement }[] = [];
    let order = nextOrder();
    let added = 0;
    const imported: ReviewPage[] = [];
    try {
      for (const file of Array.from(files)) {
        if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
          setBusy(t("Rendering {file}", { file: file.name }));
          setProgress(0);
          const pages = await renderPdf(file, (d, total) => {
            setBusy(t("Rendering {file} — page {page} of {total}", { file: file.name, page: d, total }));
            setProgress(d / total);
          });
          for (const p of pages) {
            const sheetId = await addSheet(p.blob, p.width, p.height, guessFloorName(p.text, t("Sheet {n}", { n: order + 1 })), p.pageNumber, p.pxPerInch, order++, p.text);
            imported.push({ sheetId, pageNumber: p.pageNumber, items: p.items ?? [], text: p.text });
            added++;
          }
        } else {
          setBusy(t("Loading {file}", { file: file.name }));
          photos.push({ file, img: await loadPhoto(file) });
        }
      }
      await load(project!.id);
      if (added) toast(t.tn("Added {n} sheet", "Added {n} sheets", added));
      if (photos.length) setPhotoQueue((q) => [...q, ...photos]);
      if (office && hasProposals(imported)) setReview(imported);
    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
      setProgress(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function finishPhoto(canvas: HTMLCanvasElement | null) {
    const [cur, ...rest] = photoQueue;
    if (canvas && cur) {
      setBusy(t("Saving photo"));
      const blob = await canvasToBlob(canvas, "image/jpeg", 0.9);
      const order = nextOrder();
      await addSheet(blob, canvas.width, canvas.height, cur.file.name.replace(/\.[^.]+$/, "") || t("Sheet {n}", { n: order + 1 }), 1, null, order);
      URL.revokeObjectURL(cur.img.src);
      await load(project!.id);
      setBusy(null);
      toast(t("Photo added as a sheet"));
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

  async function rotate(sheet: Sheet) {
    setBusy(t("Rotating {name}", { name: sheet.name }));
    try {
      const rec = await db().images.get(sheet.imageId);
      if (!rec) throw new Error(t("Image not available on this device yet"));
      const bmp = await createImageBitmap(rec.blob);
      const c = document.createElement("canvas");
      c.width = bmp.height;
      c.height = bmp.width;
      const ctx = c.getContext("2d")!;
      ctx.translate(c.width, 0);
      ctx.rotate(Math.PI / 2);
      ctx.drawImage(bmp, 0, 0);
      bmp.close();
      const blob = await canvasToBlob(c, "image/jpeg", 0.9);
      const imageId = await saveImage(blob, c.width, c.height);
      await rotateSheetCW(sheet.id, imageId, c.width, c.height);
      await useSheetLinks.getState().rotateSheetCW(sheet.projectId, sheet.id);
      await rotateSheetMarkups(sheet.id, sheet.width, c.width);
      c.width = c.height = 0;
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), "error");
    } finally {
      setBusy(null);
    }
  }

  async function del(sheet: Sheet) {
    const n = markers.filter((m) => m.sheetId === sheet.id).length;
    if (!confirm(n ? t.tn("Delete sheet “{name}” and its {n} device?", "Delete sheet “{name}” and its {n} devices?", n, { name: sheet.name }) : t("Delete sheet “{name}”?", { name: sheet.name }))) return;
    await updateSheet(sheet.id, { deleted: true });
    toast(t("Sheet deleted — undo from the Plan toolbar"));
  }

  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <div className="mb-5 flex flex-wrap items-end gap-3">
          <div className="mr-auto">
            <h2 className="page-title">{t("Manage sheets")}</h2>
            <p className="mt-1 text-sm text-slate-500">{t("One sheet per floor. PDFs split into pages; phone photos get straightened. Floor names are read from the title block.")}</p>
          </div>
          <input ref={fileRef} type="file" multiple accept="application/pdf,.pdf,image/*,.heic,.heif" className="hidden" onChange={(e) => onFiles(e.target.files)} />
          <SheetIndexButton disabled={!!busy || !sheets.length} />
          <UploadRevisedSetButton disabled={!!busy} />
          <button className="btn btn-brand" disabled={!!busy} onClick={() => fileRef.current?.click()}>
            <FileUp /> {t("Upload PDF or photos")}
          </button>
        </div>

        {error && <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

        <button
          type="button"
          onClick={() => !busy && fileRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            onFiles(e.dataTransfer.files);
          }}
          className={`mb-6 flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 text-center transition ${
            sheets.length ? "py-6" : "py-14"
          } ${dragOver ? "border-brand-500 bg-brand-50" : "border-slate-300 bg-white/60 hover:border-slate-400 hover:bg-white"}`}
        >
          {busy ? (
            <>
              <span className="text-sm font-medium text-slate-700">{busy}…</span>
              {progress != null && (
                <span className="h-1.5 w-64 max-w-full overflow-hidden rounded-full bg-slate-200">
                  <span className="block h-full rounded-full bg-brand-600 transition-all" style={{ width: `${Math.round(progress * 100)}%` }} />
                </span>
              )}
            </>
          ) : (
            <>
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                <FileUp className="h-5 w-5" />
              </span>
              <span className="text-sm font-medium text-slate-800">{t("Drop the plan set here, or tap to choose")}</span>
              <span className="text-xs text-slate-500">{t("PDF (multi-page), JPG, PNG or HEIC from an iPhone scan")}</span>
            </>
          )}
        </button>

        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sheets.map((s, i) => (
            <SheetCard
              key={s.id}
              sheet={s}
              index={i}
              count={markers.filter((m) => m.sheetId === s.id).length}
              runCount={runs.filter((r) => r.sheetId === s.id && r.kind !== "wire").length}
              first={i === 0}
              last={i === sheets.length - 1}
              busy={!!busy}
              onRename={(name) => updateSheet(s.id, { name })}
              onMove={(d) => move(s, d)}
              onRotate={() => rotate(s)}
              onDelete={() => del(s)}
              onOpen={() => {
                setActiveSheet(s.id);
                onOpenSheet();
              }}
            />
          ))}
        </ul>
      </div>
      {review && <SheetNamesReview pages={review} onClose={() => setReview(null)} />}
      {photoQueue[0] && <PhotoStraighten key={photoQueue[0].img.src} image={photoQueue[0].img} name={photoQueue[0].file.name} onDone={finishPhoto} />}
    </div>
  );
}

function SheetCard(props: {
  sheet: Sheet;
  index: number;
  count: number;
  runCount: number;
  first: boolean;
  last: boolean;
  busy: boolean;
  onRename: (n: string) => void;
  onMove: (d: -1 | 1) => void;
  onRotate: () => void;
  onDelete: () => void;
  onOpen: () => void;
}) {
  const t = useT();
  const { sheet } = props;
  const img = useSheetImage(sheet.imageId);
  const [name, setName] = useState(sheet.name);
  return (
    <li className="card group overflow-hidden">
      <button className="relative block aspect-[4/3] w-full overflow-hidden border-b border-slate-100 bg-slate-50" onClick={props.onOpen} aria-label={t("Open {name}", { name: sheet.name })}>
        {img ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={img.url} alt={sheet.name} className="h-full w-full object-contain p-2 transition group-hover:scale-[1.02]" />
        ) : (
          <span className="text-xs text-slate-400">{sheet.imageUrl ? t("Downloading…") : t("Loading…")}</span>
        )}
        <span className="chip absolute top-3 left-3 bg-white/90 text-slate-600 ring-1 ring-slate-200 backdrop-blur">{t("Floor {n}", { n: props.index + 1 })}</span>
        <span className="absolute inset-0 flex items-center justify-center bg-slate-900/0 opacity-0 transition group-hover:bg-slate-900/10 group-hover:opacity-100">
          <span className="btn btn-sm shadow-pop">
            <MapPin /> {t("Open plan")}
          </span>
        </span>
      </button>
      <div className="space-y-3 p-3">
        <input
          className="input font-medium"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => name.trim() && name !== sheet.name && props.onRename(name.trim())}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
          aria-label={t("Sheet name")}
        />
        <SheetMetaChips sheet={sheet} />
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="chip bg-slate-100 text-slate-600">{t.tn("{n} device", "{n} devices", props.count)}</span>
          {props.runCount > 0 && <span className="chip bg-amber-50 text-amber-700">{t.tn("{n} LED run", "{n} LED runs", props.runCount)}</span>}
          <span className={`chip ${sheet.pxPerFt ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
            <Ruler className="h-3 w-3" />
            {sheet.pxPerFt ? (sheet.scaleLabel?.startsWith("line") ? t("calibrated") : sheet.scaleLabel || t("scale set")) : t("no scale")}
          </span>
          <RevisionBadge sheet={sheet} />
        </div>
        <div className="flex items-center gap-1">
          <button className="btn btn-sm btn-icon" disabled={props.first} onClick={() => props.onMove(-1)} title={t("Move up")} aria-label={t("Move up")}>
            <ArrowUp />
          </button>
          <button className="btn btn-sm btn-icon" disabled={props.last} onClick={() => props.onMove(1)} title={t("Move down")} aria-label={t("Move down")}>
            <ArrowDown />
          </button>
          <button className="btn btn-sm" disabled={props.busy} onClick={props.onRotate} title={t("Rotate 90° (markup rotates with it)")}>
            <RotateCw /> {t("Rotate")}
          </button>
          <UploadRevisionButton sheet={sheet} />
          <div className="flex-1" />
          <button className="btn btn-sm btn-icon btn-ghost text-red-600 hover:bg-red-50" onClick={props.onDelete} title={t("Delete sheet")} aria-label={t("Delete sheet")}>
            <Trash />
          </button>
        </div>
      </div>
    </li>
  );
}

/**
 * Manage sheets as a drawer over the plan (upload, rename, reorder, scale, revisions). The plan opens it with
 * `?tab=plan&manage=1` (old `?tab=sheets` links land here too); full screen on phones, a wide side panel from md up.
 */
export function ManageSheetsDrawer({ onClose, onOpenSheet }: { onClose: () => void; onOpenSheet: () => void }) {
  const t = useT();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !document.querySelector('[role="dialog"][aria-modal="true"]') && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="absolute inset-0 z-40 flex justify-end bg-slate-900/30 backdrop-blur-[2px]" onClick={onClose}>
      <div role="dialog" aria-label={t("Manage sheets")} className="animate-in flex h-full w-full flex-col bg-slate-50 shadow-pop md:max-w-4xl" onClick={(e) => e.stopPropagation()} data-testid="manage-sheets">
        <div className="flex h-12 shrink-0 items-center border-b border-slate-200 bg-white px-2">
          <button type="button" className="btn btn-sm btn-ghost" onClick={onClose}>
            ‹ {t("Back to plan")}
          </button>
          <button type="button" className="btn btn-sm btn-icon btn-ghost ml-auto" onClick={onClose} aria-label={t("Close")}>
            <X />
          </button>
        </div>
        <div className="min-h-0 flex-1">
          <SheetsTab onOpenSheet={onOpenSheet} />
        </div>
      </div>
    </div>
  );
}
