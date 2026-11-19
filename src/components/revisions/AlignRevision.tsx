"use client";
import { Check, RotateCw, Undo2 } from "lucide-react";
import { useMemo, useState } from "react";
import { db, saveImage } from "@/lib/db";
import { canvasToBlob } from "@/lib/importPlans";
import { applyTransform, clampWarning, invertTransform, similarityFromPairs, type Affine, type Pt } from "@/lib/revisions";
import { useEditor } from "@/lib/store";
import { toast } from "@/lib/toast";
import type { Sheet } from "@/lib/types";
import { alignToPrevious, replaceCurrentImage, type CarryReport } from "./revisionActions";
import { Dots, ImageState, Pin, Screen, useStoredImage, ZoomPane } from "./ui";

export interface AlignSide {
  imageId: string;
  width: number;
  height: number;
  label: string;
  /** Relative positions to show (devices). */
  dots?: { x: number; y: number; key: string; color?: string }[];
}

const COLORS = ["#2563eb", "#ea580c"];

/** Two drawings side by side; tap the same 2 spots on each. Reports the transform A → B once both have 2 points. */
export function TwoPointAlign(props: { projectId: string; a: AlignSide; b: AlignSide; onTransform: (T: Affine | null) => void; preview?: boolean; fitKey?: string }) {
  const { a, b } = props;
  const [pts, setPts] = useState<{ a: Pt[]; b: Pt[] }>({ a: [], b: [] });
  const imgA = useStoredImage(a.imageId, props.projectId, a.width, a.height);
  const imgB = useStoredImage(b.imageId, props.projectId, b.width, b.height);
  const T = useMemo(() => (pts.a.length === 2 && pts.b.length === 2 ? similarityFromPairs([[pts.a[0], pts.b[0]], [pts.a[1], pts.b[1]]], a, b) : null), [pts, a, b]);

  const tap = (side: "a" | "b", x: number, y: number) => {
    const cur = pts[side];
    let next: Pt[];
    if (cur.length < 2) next = [...cur, [x, y]];
    else {
      // Both set: move the nearer one.
      const d = (p: Pt) => Math.hypot(p[0] - x, p[1] - y);
      next = d(cur[0]) <= d(cur[1]) ? [[x, y], cur[1]] : [cur[0], [x, y]];
    }
    const all = { ...pts, [side]: next };
    setPts(all);
    const t = all.a.length === 2 && all.b.length === 2 ? similarityFromPairs([[all.a[0], all.b[0]], [all.a[1], all.b[1]]], a, b) : null;
    props.onTransform(t);
  };
  const reset = () => {
    setPts({ a: [], b: [] });
    props.onTransform(null);
  };
  const step =
    pts.a.length < 1 ? `Tap a sharp corner or column on ${a.label}` :
    pts.b.length < 1 ? `Tap the same spot on ${b.label}` :
    pts.a.length < 2 ? `Tap a second spot far from the first on ${a.label}` :
    pts.b.length < 2 ? `Tap the same second spot on ${b.label}` :
    T ? "Aligned. Drag to check, tap again to adjust a point." : "Pick two different spots.";
  const moved = props.preview && T && a.dots ? a.dots.map((d) => { const [x, y] = applyTransform(T, d.x, d.y); return { ...d, x, y }; }) : null;

  const pane = (side: "a" | "b", s: AlignSide, img: ReturnType<typeof useStoredImage>, dots: AlignSide["dots"] | null) => (
    <div className="relative flex min-h-0 flex-col border-slate-200 bg-slate-100">
      <div className="pointer-events-none absolute top-2 left-2 z-10 rounded-md bg-white/95 px-2 py-1 text-xs font-semibold shadow-soft ring-1 ring-slate-200">
        {s.label} <span className="font-normal text-slate-500">· {pts[side].length}/2</span>
      </div>
      <ZoomPane width={s.width} height={s.height} onTap={(x, y) => tap(side, x, y)} className="min-h-0 flex-1" fitKey={props.fitKey} testId={`align-${side}`}>
        {(scale) => (
          <>
            {img.state === "ready" && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={img.url} alt={s.label} draggable={false} className="pointer-events-none absolute inset-0 h-full w-full bg-white" />
            )}
            {dots && <Dots points={dots.map((d) => ({ ...d, x: d.x * s.width, y: d.y * s.height }))} scale={scale} color={side === "a" ? "#64748b" : "#16a34a"} />}
            {pts[side].map((p, i) => (
              <Pin key={i} x={p[0] * s.width} y={p[1] * s.height} n={i + 1} scale={scale} color={COLORS[i]} />
            ))}
          </>
        )}
      </ZoomPane>
      <ImageState img={img} />
    </div>
  );

  return (
    <div className="absolute inset-0 flex flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-slate-200 bg-white px-3 py-2 text-sm">
        <span className={`h-2 w-2 shrink-0 rounded-full ${T ? "bg-emerald-500" : "animate-pulse bg-amber-500"}`} />
        <span className="mr-auto min-w-0 truncate" data-testid="align-step">{step}</span>
        <button className="btn btn-sm btn-ghost" onClick={reset} disabled={!pts.a.length && !pts.b.length}>
          <Undo2 /> Reset points
        </button>
      </div>
      <div className="grid min-h-0 flex-1 grid-rows-2 gap-px bg-slate-300 landscape:grid-cols-2 landscape:grid-rows-1 md:grid-cols-2 md:grid-rows-1">
        {pane("a", a, imgA, a.dots ?? null)}
        {pane("b", b, imgB, moved ?? b.dots ?? null)}
      </div>
    </div>
  );
}

/** Align a sheet's new drawing to the previous one and move the carried markup. Office only (the caller checks). */
export default function AlignRevision({ sheet, onClose }: { sheet: Sheet; onClose: () => void }) {
  const { markers, catalog } = useEditor();
  const live = useEditor((s) => s.sheets.find((x) => x.id === sheet.id)) ?? sheet;
  const prev = live.revisions?.[0];
  const [T, setT] = useState<Affine | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [report, setReport] = useState<CarryReport | null>(null);
  const colors = useMemo(() => new Map(catalog.map((d) => [d.id, d.color])), [catalog]);

  // Devices as they sit on the previous drawing: undo any earlier alignment of this link.
  const oldDots = useMemo(() => {
    if (!prev) return [];
    const inv = prev.transformToNext ? invertTransform(prev.transformToNext) : null;
    const since = prev.replacedAt ? Date.parse(prev.replacedAt) : Infinity;
    return markers
      .filter((m) => m.sheetId === live.id && !m.deleted && Date.parse(m.createdAt) <= since)
      .map((m) => {
        const [x, y] = inv ? applyTransform(inv, m.x, m.y) : [m.x, m.y];
        return { x, y, key: m.id, color: colors.get(m.deviceTypeId) };
      });
  }, [markers, live.id, prev, colors]);

  if (!prev) return null;

  async function rotateNew() {
    setBusy("Rotating");
    try {
      const rec = await db().images.get(live.imageId);
      if (!rec) throw new Error("The new drawing isn't on this device yet");
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
      await replaceCurrentImage(live.id, imageId, c.width, c.height);
      c.width = c.height = 0;
      setT(null);
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), "error");
    } finally {
      setBusy(null);
    }
  }

  async function apply() {
    if (!T) return;
    setBusy("Moving devices");
    try {
      const r = await alignToPrevious(live.id, T);
      setReport(r);
      toast(`Aligned — ${r.moved} item${r.moved === 1 ? "" : "s"} moved`);
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), "error");
    } finally {
      setBusy(null);
    }
  }

  const warning = report ? clampWarning({ devices: report.offDevices.length, runs: report.offRuns, other: report.offOther }) : null;

  return (
    <Screen
      label="Align revision"
      title={`Align ${live.revisionLabel || "new drawing"} to ${prev.label}`}
      subtitle={`${live.name} · tap the same 2 spots on each drawing; devices follow`}
      onClose={onClose}
      actions={
        report ? (
          <button className="btn btn-brand" onClick={onClose}>
            <Check /> Done
          </button>
        ) : (
          <>
            <button className="btn btn-sm" onClick={rotateNew} disabled={!!busy} title="The new drawing came in sideways: rotate it (devices don't move)">
              <RotateCw /> <span className="hidden sm:inline">Rotate new</span>
            </button>
            <button className="btn btn-brand" onClick={apply} disabled={!T || !!busy} data-testid="align-apply">
              <Check /> {busy ?? "Apply"}
            </button>
          </>
        )
      }
    >
      {report ? (
        <div className="mx-auto max-w-lg space-y-3 p-5">
          <div className="card space-y-2 p-4 text-sm">
            <p className="font-semibold">
              {report.moved} item{report.moved === 1 ? "" : "s"} moved onto {live.revisionLabel || "the new drawing"}.
            </p>
            {report.scaleFromAlignment && <p className="text-emerald-700">The plan scale was carried over from {prev.label} through the alignment.</p>}
            {warning && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-800" data-testid="align-warning">
                <p>{warning}</p>
                {report.offDevices.length > 0 && <p className="mt-1 text-xs">{report.offDevices.slice(0, 12).join(", ")}{report.offDevices.length > 12 ? "…" : ""}</p>}
              </div>
            )}
            <p className="text-slate-500">Undo from the Plan toolbar if it doesn&apos;t look right.</p>
          </div>
        </div>
      ) : (
        <TwoPointAlign
          key={live.imageId}
          projectId={live.projectId}
          fitKey={`${live.imageId}`}
          a={{ imageId: prev.imageId, width: prev.width, height: prev.height, label: prev.label, dots: oldDots }}
          b={{ imageId: live.imageId, width: live.width, height: live.height, label: live.revisionLabel || "New drawing" }}
          onTransform={setT}
          preview
        />
      )}
    </Screen>
  );
}
