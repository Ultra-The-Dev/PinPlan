"use client";
import { AlertTriangle, CalendarDays, Check, FileUp, Layers, Move, Plus } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { newId, nowIso, put, saveImage } from "@/lib/db";
import { findScale } from "@/lib/geometry";
import { canvasToBlob, guessFloorName, loadPhoto, renderPdf } from "@/lib/importPlans";
import { matchPagesToSheets, nextRevisionLabel, type ScaleOutcome } from "@/lib/revisions";
import { useEditor } from "@/lib/store";
import { useRole } from "@/lib/team";
import { toast } from "@/lib/toast";
import type { Sheet } from "@/lib/types";
import AlignRevision from "./AlignRevision";
import { uploadRevision } from "./revisionActions";
import SheetCompare from "./SheetCompare";
import { Screen } from "./ui";

interface Page {
  pageNumber: number;
  blob: Blob;
  url: string;
  width: number;
  height: number;
  pxPerInch: number | null;
  text: string;
  /** Sheet id, "new" or "skip". */
  target: string;
  confidence: number;
  sheetNumber: string | null;
  label: string;
}

interface Done {
  sheetId: string;
  name: string;
  label: string;
  isNew: boolean;
  scale?: ScaleOutcome;
  resized?: boolean;
}

const SCALE_TEXT: Record<ScaleOutcome, string> = {
  kept: "Scale kept",
  recomputed: "Scale recomputed from the paper size",
  printed: "Scale read from the new page",
  cleared: "Scale reset — calibrate again (or align)",
  none: "No scale yet",
};

/** Upload a re-issued drawing (or a whole re-issued set) as new revisions of existing sheets. Office only. */
export default function RevisionUpload({ targetSheetId, onClose }: { targetSheetId?: string; onClose: () => void }) {
  const { project, sheets, load } = useEditor();
  const role = useRole();
  const fileRef = useRef<HTMLInputElement>(null);
  const [pages, setPages] = useState<Page[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Done[] | null>(null);
  const [align, setAlign] = useState<string | null>(null);
  const [compare, setCompare] = useState<string | null>(null);
  const target = sheets.find((s) => s.id === targetSheetId);

  // Page thumbnails: freed when the dialog closes.
  const urls = useRef<string[]>([]);
  useEffect(() => () => urls.current.forEach((u) => URL.revokeObjectURL(u)), []);

  const sheetById = useMemo(() => new Map(sheets.map((s) => [s.id, s])), [sheets]);
  const labelFor = (id: string) => {
    const s = sheetById.get(id);
    return s ? nextRevisionLabel(s) : "";
  };

  if (!project) return null;
  if (role === "tech")
    return (
      <Screen label="Upload revision" title="Upload new revision" onClose={onClose}>
        <p className="p-6 text-sm text-slate-600">Only the office can upload new revisions. You always see the current drawing on the plan.</p>
      </Screen>
    );

  async function onFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    try {
      let raw: Omit<Page, "target" | "confidence" | "sheetNumber" | "label" | "url">[] = [];
      if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
        setBusy(`Rendering ${file.name}`);
        setProgress(0);
        const rendered = await renderPdf(file, (d, t) => {
          setBusy(`Rendering ${file.name} — page ${d} of ${t}`);
          setProgress(d / t);
        });
        raw = rendered.map((p) => ({ pageNumber: p.pageNumber, blob: p.blob, width: p.width, height: p.height, pxPerInch: p.pxPerInch, text: p.text }));
      } else {
        setBusy(`Loading ${file.name}`);
        const img = await loadPhoto(file);
        const c = document.createElement("canvas");
        c.width = img.naturalWidth;
        c.height = img.naturalHeight;
        const ctx = c.getContext("2d")!;
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(img, 0, 0);
        URL.revokeObjectURL(img.src);
        const blob = await canvasToBlob(c, "image/jpeg", 0.9);
        raw = [{ pageNumber: 1, blob, width: c.width, height: c.height, pxPerInch: null, text: "" }];
        c.width = c.height = 0;
      }
      const matches = matchPagesToSheets(raw, sheets);
      const next: Page[] = raw.map((p, i) => {
        let t = matches[i].sheetId ?? "new";
        // Opened from a sheet: a single page replaces that sheet.
        if (target && raw.length === 1) t = target.id;
        const url = URL.createObjectURL(p.blob);
        urls.current.push(url);
        return { ...p, url, target: t, confidence: target && raw.length === 1 ? 1 : matches[i].confidence, sheetNumber: matches[i].sheetNumber, label: t === "new" ? "" : labelFor(t) };
      });
      if (target && raw.length > 1 && !next.some((p) => p.target === target.id)) {
        const free = next.find((p) => p.target === "new");
        if (free) Object.assign(free, { target: target.id, confidence: 0.2, label: labelFor(target.id) });
      }
      setPages(next);
    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
      setProgress(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const setPage = (i: number, patch: Partial<Page>) => setPages((ps) => ps.map((p, k) => (k === i ? { ...p, ...patch } : p)));
  const chosen = pages.filter((p) => p.target !== "skip");
  const dupes = new Set(chosen.filter((p, i) => p.target !== "new" && chosen.findIndex((q) => q.target === p.target) !== i).map((p) => p.target));

  async function confirm() {
    if (!project) return;
    setBusy("Saving");
    setError(null);
    const results: Done[] = [];
    try {
      let order = sheets.length ? Math.max(...sheets.map((s) => s.order)) + 1 : 0;
      for (const p of chosen) {
        const imageId = await saveImage(p.blob, p.width, p.height);
        const printedScale = p.pxPerInch ? findScale(p.text) : null;
        if (p.target === "new") {
          const name = guessFloorName(p.text, p.sheetNumber ?? `Sheet ${order + 1}`);
          const sheet: Sheet = {
            id: newId(), projectId: project.id, name, pageNumber: p.pageNumber, order: order++, imageId, width: p.width, height: p.height,
            pxPerFt: printedScale && p.pxPerInch ? printedScale.inchesPerFoot * p.pxPerInch : null, scaleLabel: printedScale?.label ?? null,
            pxPerInch: p.pxPerInch, createdAt: nowIso(), updatedAt: nowIso(), revisionLabel: p.label.trim() || null,
          };
          await put("sheets", sheet);
          results.push({ sheetId: sheet.id, name, label: p.label, isNew: true });
        } else {
          const label = p.label.trim() || labelFor(p.target);
          const r = await uploadRevision(p.target, { imageId, width: p.width, height: p.height, pxPerInch: p.pxPerInch, printedScale }, label);
          if (r) results.push({ sheetId: r.sheet.id, name: r.sheet.name, label, isNew: false, scale: r.scale, resized: r.resized });
        }
      }
      await load(project.id);
      setDone(results);
      const revs = results.filter((r) => !r.isNew).length;
      toast(`${revs} revision${revs === 1 ? "" : "s"} uploaded${results.length > revs ? `, ${results.length - revs} new sheet${results.length - revs === 1 ? "" : "s"}` : ""} — devices kept`);
      // One sheet that changed size: go straight to aligning it.
      const one = results.filter((r) => !r.isNew);
      if (one.length === 1 && one[0].resized) setAlign(one[0].sheetId);
    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  const alignSheet = align ? sheetById.get(align) : null;
  const compareSheet = compare ? sheetById.get(compare) : null;
  if (alignSheet) return <AlignRevision sheet={alignSheet} onClose={() => setAlign(null)} />;
  if (compareSheet) return <SheetCompare sheet={compareSheet} onClose={() => setCompare(null)} />;

  const today = () => new Date().toISOString().slice(0, 10);

  return (
    <Screen
      label="Upload revision"
      title={target ? `New revision of ${target.name}` : "Upload revised drawings"}
      subtitle="Devices, runs, photos and tasks stay on their sheets. Old drawings are kept in the history."
      onClose={onClose}
      actions={
        done ? (
          <button className="btn btn-brand" onClick={onClose}>
            <Check /> Done
          </button>
        ) : pages.length ? (
          <button className="btn btn-brand" onClick={confirm} disabled={!!busy || !chosen.length || dupes.size > 0} data-testid="revision-confirm">
            <Check /> {busy ?? `Upload ${chosen.length}`}
          </button>
        ) : null
      }
    >
      <div className="h-full overflow-auto">
        <div className="mx-auto max-w-4xl space-y-4 px-3 py-4 sm:px-6">
          {error && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
          <input ref={fileRef} type="file" accept="application/pdf,.pdf,image/*,.heic,.heif" className="hidden" data-testid="revision-file" onChange={(e) => onFile(e.target.files?.[0])} />

          {done ? (
            <ul className="space-y-2" data-testid="revision-results">
              {done.map((r) => (
                <li key={r.sheetId} className="card flex flex-wrap items-center gap-2 p-3">
                  <div className="mr-auto min-w-0">
                    <p className="truncate font-medium">
                      {r.name} <span className="chip bg-ink text-white">{r.label || (r.isNew ? "New sheet" : "")}</span>
                    </p>
                    {!r.isNew && r.scale && (
                      <p className={`mt-1 text-xs ${r.scale === "cleared" ? "text-amber-700" : "text-slate-500"}`}>
                        {r.scale === "cleared" && <AlertTriangle className="mr-1 inline h-3.5 w-3.5" />}
                        {SCALE_TEXT[r.scale]}
                        {r.resized ? " · page size changed — align to move the devices" : ""}
                      </p>
                    )}
                    {r.isNew && <p className="mt-1 text-xs text-slate-500">Added as a new sheet</p>}
                  </div>
                  {!r.isNew && (
                    <>
                      <button className="btn btn-sm" onClick={() => setCompare(r.sheetId)}>
                        <Layers /> Compare
                      </button>
                      <button className={`btn btn-sm ${r.resized ? "btn-brand" : ""}`} onClick={() => setAlign(r.sheetId)}>
                        <Move /> Align
                      </button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          ) : !pages.length ? (
            <button
              type="button"
              onClick={() => !busy && fileRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                onFile(e.dataTransfer.files?.[0]);
              }}
              className="flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 bg-white/60 px-6 py-14 text-center hover:border-slate-400 hover:bg-white"
            >
              {busy ? (
                <>
                  <span className="text-sm font-medium text-slate-700">{busy}…</span>
                  {progress != null && (
                    <span className="h-1.5 w-64 overflow-hidden rounded-full bg-slate-200">
                      <span className="block h-full rounded-full bg-brand-600 transition-all" style={{ width: `${Math.round(progress * 100)}%` }} />
                    </span>
                  )}
                </>
              ) : (
                <>
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                    <FileUp className="h-5 w-5" />
                  </span>
                  <span className="text-sm font-medium text-slate-800">Choose the re-issued PDF or a photo of the new sheet</span>
                  <span className="text-xs text-slate-500">Multi-page sets are matched to your sheets by sheet number and floor name</span>
                </>
              )}
            </button>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="mr-auto text-slate-600">
                  {pages.length} page{pages.length === 1 ? "" : "s"} · check where each one goes
                </span>
                <button
                  className="btn btn-sm"
                  onClick={() => setPages((ps) => ps.map((p) => (p.target === "skip" ? p : { ...p, label: `Issued ${today()}` })))}
                  title="Label every page with today's date"
                >
                  <CalendarDays /> Date label
                </button>
                <button className="btn btn-sm btn-ghost" onClick={() => setPages([])}>
                  Choose another file
                </button>
              </div>
              <ul className="space-y-2" data-testid="revision-pages">
                {pages.map((p, i) => {
                  const s = sheetById.get(p.target);
                  const sizeChanged = s && (Math.abs(p.width / s.width - 1) > 0.01 || Math.abs(p.height / s.height - 1) > 0.01);
                  return (
                    <li key={p.pageNumber} className={`card flex gap-3 p-2.5 ${p.target === "skip" ? "opacity-60" : ""}`}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={p.url} alt={`Page ${p.pageNumber}`} className="h-20 w-28 shrink-0 rounded-md bg-white object-contain ring-1 ring-slate-200 sm:h-24 sm:w-36" />
                      <div className="min-w-0 flex-1 space-y-2">
                        <div className="flex flex-wrap items-center gap-1.5 text-xs">
                          <span className="font-semibold text-slate-700">Page {p.pageNumber}</span>
                          {p.sheetNumber && <span className="chip bg-slate-100 text-slate-600">{p.sheetNumber}</span>}
                          {p.target !== "new" && p.target !== "skip" && p.confidence < 0.5 && <span className="chip bg-amber-50 text-amber-700">check match</span>}
                          {sizeChanged && <span className="chip bg-amber-50 text-amber-700">size changed</span>}
                          {dupes.has(p.target) && <span className="chip bg-red-50 text-red-700">two pages → one sheet</span>}
                        </div>
                        <div className="grid gap-2 sm:grid-cols-[1fr_10rem]">
                          <select
                            className="input"
                            value={p.target}
                            aria-label={`Sheet for page ${p.pageNumber}`}
                            onChange={(e) => {
                              const t = e.target.value;
                              setPage(i, { target: t, confidence: 1, label: t === "new" || t === "skip" ? p.label : p.label || labelFor(t) });
                            }}
                          >
                            {sheets.map((sh) => (
                              <option key={sh.id} value={sh.id}>
                                Replace {sh.name}
                                {sh.revisionLabel ? ` (${sh.revisionLabel})` : ""}
                              </option>
                            ))}
                            <option value="new">＋ New sheet</option>
                            <option value="skip">Skip this page</option>
                          </select>
                          <input
                            className="input"
                            value={p.label}
                            placeholder={p.target === "new" ? "Label (optional)" : labelFor(p.target)}
                            aria-label={`Revision label for page ${p.pageNumber}`}
                            onChange={(e) => setPage(i, { label: e.target.value })}
                            disabled={p.target === "skip"}
                          />
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
              <p className="flex items-center gap-1.5 text-xs text-slate-500">
                <Plus className="h-3.5 w-3.5" /> New sheets are added after your current ones. You can align a revision afterwards if the drawing moved.
              </p>
            </>
          )}
        </div>
      </div>
    </Screen>
  );
}
