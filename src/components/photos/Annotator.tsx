"use client";
// Mark up a photo: pen, arrow, box, circle and text in a few colours. The original photo is never changed.
import { ArrowUpRight, Circle, Pencil, Square, Type, Undo2, X } from "lucide-react";
import { useRef, useState } from "react";
import { ANNOTATION_COLORS } from "@/lib/photos";
import type { PhotoShape } from "@/lib/types";
import { useBlobUrl } from "@/lib/useImage";
import AnnotationSvg from "./AnnotationSvg";

const TOOLS: { id: PhotoShape["kind"]; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "arrow", label: "Arrow", icon: ArrowUpRight },
  { id: "pen", label: "Draw", icon: Pencil },
  { id: "rect", label: "Box", icon: Square },
  { id: "circle", label: "Circle", icon: Circle },
  { id: "text", label: "Text", icon: Type },
];
const WIDTHS = [0.004, 0.007, 0.012];

export default function Annotator(props: { imageId: string; width: number; height: number; shapes: PhotoShape[]; onSave: (s: PhotoShape[]) => void; onCancel: () => void }) {
  const url = useBlobUrl(props.imageId);
  const [shapes, setShapes] = useState<PhotoShape[]>(props.shapes);
  const [tool, setTool] = useState<PhotoShape["kind"]>("arrow");
  const [color, setColor] = useState(ANNOTATION_COLORS[0]);
  const [width, setWidth] = useState(WIDTHS[1]);
  const [draft, setDraft] = useState<PhotoShape | null>(null);
  const box = useRef<HTMLDivElement>(null);

  const rel = (e: React.PointerEvent) => {
    const r = box.current!.getBoundingClientRect();
    return [Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))] as const;
  };
  const down = (e: React.PointerEvent) => {
    const [x, y] = rel(e);
    if (tool === "text") {
      const text = window.prompt("Text on the photo")?.trim();
      if (text) setShapes((s) => [...s, { kind: "text", color, width, points: [x, y], text }]);
      return;
    }
    (e.target as Element).setPointerCapture(e.pointerId);
    setDraft({ kind: tool, color, width, points: [x, y, x, y] });
  };
  const move = (e: React.PointerEvent) => {
    if (!draft) return;
    const [x, y] = rel(e);
    setDraft((d) => (d ? { ...d, points: d.kind === "pen" ? [...d.points, x, y] : [d.points[0], d.points[1], x, y] } : d));
  };
  const up = () => {
    if (draft) {
      const [x0, y0] = draft.points;
      const [x1, y1] = draft.points.slice(-2);
      if (Math.hypot(x1 - x0, y1 - y0) > 0.005 || draft.points.length > 6) setShapes((s) => [...s, draft]);
    }
    setDraft(null);
  };

  // Fit the photo to the screen, keeping its shape.
  const aspect = props.width / props.height;
  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-slate-950/95 text-white">
      <div className="flex flex-wrap items-center gap-2 px-3 py-2">
        <button className="btn btn-sm btn-ghost text-white hover:bg-white/10" onClick={props.onCancel} aria-label="Cancel">
          <X />
        </button>
        <div className="flex gap-1 rounded-xl bg-white/10 p-1">
          {TOOLS.map((t) => (
            <button key={t.id} title={t.label} aria-label={t.label} aria-pressed={tool === t.id} onClick={() => setTool(t.id)} className={`flex h-9 w-9 items-center justify-center rounded-lg ${tool === t.id ? "bg-white text-slate-900" : "hover:bg-white/10"}`}>
              <t.icon className="h-4 w-4" />
            </button>
          ))}
        </div>
        <div className="flex gap-1.5">
          {ANNOTATION_COLORS.map((c) => (
            <button key={c} aria-label={`Colour ${c}`} onClick={() => setColor(c)} className={`h-7 w-7 rounded-full ring-2 ${color === c ? "ring-white" : "ring-white/20"}`} style={{ background: c }} />
          ))}
        </div>
        <div className="flex gap-1">
          {WIDTHS.map((w) => (
            <button key={w} aria-label="Line width" onClick={() => setWidth(w)} className={`flex h-8 w-8 items-center justify-center rounded-lg ${width === w ? "bg-white/20" : "hover:bg-white/10"}`}>
              <span className="block rounded-full bg-white" style={{ width: 4 + w * 900, height: 4 + w * 900 }} />
            </button>
          ))}
        </div>
        <button className="btn btn-sm btn-ghost text-white hover:bg-white/10" disabled={!shapes.length} onClick={() => setShapes((s) => s.slice(0, -1))}>
          <Undo2 /> Undo
        </button>
        <button className="btn btn-sm btn-ghost text-white hover:bg-white/10" disabled={!shapes.length} onClick={() => setShapes([])}>
          Clear
        </button>
        <div className="flex-1" />
        <button className="btn btn-brand" onClick={() => props.onSave(shapes)}>
          Save mark-up
        </button>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center p-3">
        <div ref={box} className="relative max-h-full max-w-full touch-none select-none" style={{ aspectRatio: `${aspect}`, height: "100%", maxWidth: "100%" }} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {url && <img src={url} alt="" className="h-full w-full object-contain" draggable={false} />}
          <AnnotationSvg shapes={draft ? [...shapes, draft] : shapes} w={props.width} h={props.height} />
        </div>
      </div>
      <p className="pb-3 text-center text-xs text-white/60">{tool === "text" ? "Tap where the text goes" : "Drag on the photo"} · the original photo is kept</p>
    </div>
  );
}
