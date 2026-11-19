"use client";
// Draw-to-sign box (client proposals and documents). Gives a small PNG data URL, or null when cleared.
import { Eraser } from "lucide-react";
import { useEffect, useRef } from "react";

export default function SignaturePad({ onChange }: { onChange: (dataUrl: string | null) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const dirty = useRef(false);
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);
  useEffect(() => {
    const c = ref.current!;
    let w = 0;
    // Size the bitmap to the box, and again when the box changes (phone rotated, window resized): otherwise the
    // stretched canvas draws away from the finger. Resizing wipes the bitmap, so the signature starts over.
    const fit = () => {
      if (!c.offsetWidth || c.offsetWidth === w) return;
      const first = w === 0;
      w = c.offsetWidth;
      const dpr = window.devicePixelRatio || 1;
      c.width = c.offsetWidth * dpr;
      c.height = c.offsetHeight * dpr;
      const ctx = c.getContext("2d")!;
      ctx.scale(dpr, dpr);
      ctx.lineWidth = 2.2;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = "#1c1917";
      if (!first && dirty.current) {
        dirty.current = false;
        onChangeRef.current(null);
      }
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(c);
    return () => ro.disconnect();
  }, []);
  const pos = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top] as const;
  };
  const finish = () => {
    if (!drawing.current) return;
    drawing.current = false;
    if (!dirty.current) return;
    // A small PNG is plenty for a signature (and keeps the stored answer light).
    const src = ref.current!;
    const out = document.createElement("canvas");
    const k = Math.min(1, 600 / src.width);
    out.width = Math.round(src.width * k);
    out.height = Math.round(src.height * k);
    out.getContext("2d")!.drawImage(src, 0, 0, out.width, out.height);
    onChange(out.toDataURL("image/png"));
  };
  return (
    <div>
      <canvas
        ref={ref}
        aria-label="Sign here"
        className="h-36 w-full touch-none rounded-xl bg-white ring-1 ring-slate-300"
        onPointerDown={(e) => {
          drawing.current = true;
          (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
          const ctx = ref.current!.getContext("2d")!;
          const [x, y] = pos(e);
          ctx.beginPath();
          ctx.moveTo(x, y);
        }}
        onPointerMove={(e) => {
          if (!drawing.current) return;
          const ctx = ref.current!.getContext("2d")!;
          const [x, y] = pos(e);
          ctx.lineTo(x, y);
          ctx.stroke();
          dirty.current = true;
        }}
        onPointerUp={finish}
        onPointerCancel={finish}
      />
      <div className="mt-1.5 flex items-center justify-between text-xs text-slate-500">
        <span>Sign with your finger or mouse</span>
        <button
          type="button"
          className="inline-flex items-center gap-1 font-medium text-slate-600"
          onClick={() => {
            const c = ref.current!;
            c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
            dirty.current = false;
            onChange(null);
          }}
        >
          <Eraser className="h-3.5 w-3.5" /> Clear
        </button>
      </div>
    </div>
  );
}
