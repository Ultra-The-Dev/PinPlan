"use client";
// Sign box (client proposals and documents): draw with a finger or mouse, or type your name instead (keyboard and
// screen-reader friendly). Either way it gives the same small PNG data URL, or null when cleared.
import { Eraser, Keyboard, PenLine } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

/** Font for a typed signature: a script face where the device has one. */
export const TYPED_SIGNATURE_FONT = `"Segoe Script", "Brush Script MT", "Snell Roundhand", "Apple Chancery", cursive`;

/** Write a typed name on the signature canvas (CSS pixel size w × h), centred and shrunk to fit. */
export function drawTypedSignature(ctx: CanvasRenderingContext2D, name: string, w: number, h: number) {
  ctx.clearRect(0, 0, w, h);
  const text = name.trim();
  if (!text) return;
  let size = Math.min(48, h * 0.45);
  ctx.font = `${size}px ${TYPED_SIGNATURE_FONT}`;
  const max = w * 0.9;
  const measured = ctx.measureText(text).width;
  if (measured > max && measured > 0) {
    size = Math.max(12, size * (max / measured));
    ctx.font = `${size}px ${TYPED_SIGNATURE_FONT}`;
  }
  ctx.fillStyle = "#1c1917";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, w / 2, h / 2, max);
}

/** A small PNG is plenty for a signature (and keeps the stored answer light). */
function exportPng(src: HTMLCanvasElement): string {
  const out = document.createElement("canvas");
  const k = Math.min(1, 600 / (src.width || 1));
  out.width = Math.max(1, Math.round(src.width * k));
  out.height = Math.max(1, Math.round(src.height * k));
  out.getContext("2d")?.drawImage(src, 0, 0, out.width, out.height);
  return out.toDataURL("image/png");
}

export default function SignaturePad({ onChange, name = "" }: { onChange: (dataUrl: string | null) => void; /** Signer's name, offered when typing. */ name?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const dirty = useRef(false);
  const [mode, setMode] = useState<"draw" | "type">("draw");
  const [typed, setTyped] = useState("");
  const typedRef = useRef<string | null>(null); // the typed name while in type mode
  const id = useId();
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const size = () => {
    const c = ref.current!;
    return [c.offsetWidth || c.width, c.offsetHeight || c.height] as const;
  };
  const renderTyped = (text: string) => {
    const c = ref.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    const [w, h] = size();
    drawTypedSignature(ctx, text, w, h);
    dirty.current = !!text.trim();
    onChangeRef.current(text.trim() ? exportPng(c) : null);
  };

  useEffect(() => {
    const c = ref.current!;
    let w = 0;
    // Size the bitmap to the box, and again when the box changes (phone rotated, window resized): otherwise the
    // stretched canvas draws away from the finger. Resizing wipes the bitmap, so a drawn signature starts over
    // (a typed one is simply written again).
    const fit = () => {
      if (!c.offsetWidth || c.offsetWidth === w) return;
      const first = w === 0;
      w = c.offsetWidth;
      const dpr = window.devicePixelRatio || 1;
      c.width = c.offsetWidth * dpr;
      c.height = c.offsetHeight * dpr;
      const ctx = c.getContext("2d");
      if (!ctx) return;
      ctx.scale(dpr, dpr);
      ctx.lineWidth = 2.2;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = "#1c1917";
      if (typedRef.current != null) {
        if (!first) renderTyped(typedRef.current);
        return;
      }
      if (!first && dirty.current) {
        dirty.current = false;
        onChangeRef.current(null);
      }
    };
    fit();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(fit);
    ro.observe(c);
    return () => ro.disconnect();
    // renderTyped only reads refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pos = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top] as const;
  };
  const finish = () => {
    if (!drawing.current) return;
    drawing.current = false;
    if (!dirty.current) return;
    onChange(exportPng(ref.current!));
  };
  const clear = () => {
    const c = ref.current!;
    c.getContext("2d")?.clearRect(0, 0, c.width, c.height);
    dirty.current = false;
  };
  const switchTo = (next: "draw" | "type") => {
    clear();
    setMode(next);
    if (next === "type") {
      const start = typed || name;
      setTyped(start);
      typedRef.current = start;
      renderTyped(start);
    } else {
      typedRef.current = null;
      onChange(null);
    }
  };

  const hintId = `${id}-hint`;
  return (
    <div>
      <canvas
        ref={ref}
        role="img"
        aria-label={mode === "draw" ? "Signature box" : typed.trim() ? `Signature: ${typed.trim()}` : "Signature preview"}
        aria-describedby={hintId}
        className={`h-36 w-full touch-none rounded-xl bg-white ring-1 ring-slate-300 ${mode === "type" ? "cursor-default" : ""}`}
        onPointerDown={(e) => {
          if (mode !== "draw") return;
          drawing.current = true;
          (e.target as HTMLCanvasElement).setPointerCapture?.(e.pointerId);
          const ctx = ref.current!.getContext("2d");
          if (!ctx) return;
          const [x, y] = pos(e);
          ctx.beginPath();
          ctx.moveTo(x, y);
        }}
        onPointerMove={(e) => {
          if (!drawing.current) return;
          const ctx = ref.current!.getContext("2d");
          if (!ctx) return;
          const [x, y] = pos(e);
          ctx.lineTo(x, y);
          ctx.stroke();
          dirty.current = true;
        }}
        onPointerUp={finish}
        onPointerCancel={finish}
      />
      {mode === "type" && (
        <div className="mt-2">
          <label className="label" htmlFor={`${id}-name`}>
            Type your full name
          </label>
          <input
            id={`${id}-name`}
            className="input"
            autoComplete="name"
            autoFocus
            value={typed}
            aria-describedby={hintId}
            onChange={(e) => {
              setTyped(e.target.value);
              typedRef.current = e.target.value;
              renderTyped(e.target.value);
            }}
          />
        </div>
      )}
      <div className="mt-1.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs text-slate-500">
        <span id={hintId}>{mode === "draw" ? "Sign with your finger or mouse, or type your name instead." : "Your typed name is your signature."}</span>
        <span className="flex items-center gap-1">
          <button type="button" className="inline-flex min-h-11 items-center gap-1 rounded-lg px-2 font-medium text-brand-700 hover:bg-slate-50" onClick={() => switchTo(mode === "draw" ? "type" : "draw")}>
            {mode === "draw" ? (
              <>
                <Keyboard aria-hidden className="h-3.5 w-3.5" /> Type your name instead
              </>
            ) : (
              <>
                <PenLine aria-hidden className="h-3.5 w-3.5" /> Draw instead
              </>
            )}
          </button>
          <button
            type="button"
            className="inline-flex min-h-11 items-center gap-1 rounded-lg px-2 font-medium text-slate-600 hover:bg-slate-50"
            onClick={() => {
              clear();
              if (mode === "type") {
                setTyped("");
                typedRef.current = "";
              }
              onChange(null);
            }}
          >
            <Eraser aria-hidden className="h-3.5 w-3.5" /> Clear
          </button>
        </span>
      </div>
    </div>
  );
}
