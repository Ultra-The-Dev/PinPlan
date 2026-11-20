"use client";
// Shared bits for the revision screens: a full-screen shell, a stored-image loader that can fetch older drawings,
// and a touch pan/zoom pane (plain CSS transforms — the plan canvas is not reused here).
import { X } from "lucide-react";
import { type ReactNode, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { db } from "@/lib/db";
import { fetchProjectImage } from "@/lib/sync";

export function Screen(props: { title: ReactNode; subtitle?: ReactNode; onClose: () => void; actions?: ReactNode; children: ReactNode; label: string }) {
  // Only ever opened by a tap, so the document exists.
  const host = typeof document === "undefined" ? null : document.body;
  const onClose = useRef(props.onClose);
  useEffect(() => {
    onClose.current = props.onClose;
  });
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Keys stop here (after React's own handlers, which listen on the document root): the plan's window shortcuts
    // (Delete removes the selected device, Ctrl+Z undoes) must not act behind this screen.
    const onKey = (e: KeyboardEvent) => {
      e.stopPropagation();
      if (e.key === "Escape") onClose.current();
    };
    document.addEventListener("keydown", onKey);
    const back = document.activeElement as HTMLElement | null;
    box.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      if (back?.isConnected) back.focus?.();
    };
  }, []);
  if (!host) return null;
  return createPortal(
    <div ref={box} tabIndex={-1} role="dialog" aria-modal="true" aria-label={props.label} className="fixed inset-0 z-50 flex flex-col bg-slate-50 outline-none" style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}>
      <header className="flex shrink-0 flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-3 py-2 sm:px-4">
        <div className="mr-auto min-w-0">
          <h2 className="truncate text-base font-semibold">{props.title}</h2>
          {props.subtitle && <p className="truncate text-xs text-slate-500">{props.subtitle}</p>}
        </div>
        {props.actions}
        <button className="btn btn-icon btn-ghost" onClick={props.onClose} aria-label="Close" title="Close">
          <X />
        </button>
      </header>
      <div className="relative min-h-0 flex-1">{props.children}</div>
    </div>,
    host,
  );
}

export type StoredImage = { state: "loading" } | { state: "missing" } | { state: "ready"; url: string; bitmap: ImageBitmap; width: number; height: number };

/** A stored drawing: local copy, else downloaded from the cloud when online; "missing" when neither works. */
export function useStoredImage(imageId: string | null | undefined, projectId: string, width: number, height: number): StoredImage {
  const [state, setState] = useState<{ id: string; img: StoredImage } | null>(null);
  useEffect(() => {
    if (!imageId) return;
    let cancelled = false;
    let url = "";
    let bmp: ImageBitmap | null = null;
    (async () => {
      let rec = await db().images.get(imageId);
      if (!rec && (await fetchProjectImage(projectId, imageId, width, height))) rec = await db().images.get(imageId);
      if (cancelled) return;
      if (!rec) return setState({ id: imageId, img: { state: "missing" } });
      try {
        bmp = await createImageBitmap(rec.blob);
      } catch {
        return !cancelled && setState({ id: imageId, img: { state: "missing" } });
      }
      if (cancelled) return bmp.close();
      url = URL.createObjectURL(rec.blob);
      setState({ id: imageId, img: { state: "ready", url, bitmap: bmp, width: bmp.width, height: bmp.height } });
    })();
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
      bmp?.close();
    };
  }, [imageId, projectId, width, height]);
  return state && state.id === imageId ? state.img : { state: "loading" };
}

export function ImageState({ img }: { img: StoredImage }) {
  if (img.state === "ready") return null;
  return (
    <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-slate-500">
      {img.state === "loading" ? "Loading drawing…" : "Not downloaded yet — connect to the internet once to fetch this drawing."}
    </div>
  );
}

interface View {
  s: number;
  x: number;
  y: number;
}

/**
 * Pan (drag) and zoom (pinch, wheel, buttons) a `width`×`height` content box with CSS transforms. A tap reports
 * relative (0–1) coordinates. `children(scale)` lets markers keep a constant on-screen size.
 */
export function ZoomPane(props: {
  width: number;
  height: number;
  onTap?: (x: number, y: number) => void;
  children: (scale: number) => ReactNode;
  className?: string;
  /** Changing it refits the content. */
  fitKey?: string;
  testId?: string;
}) {
  const { width, height, onTap } = props;
  const ref = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View>({ s: 0, x: 0, y: 0 });
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ startX: number; startY: number; moved: boolean; pinch?: { d: number; cx: number; cy: number; v: View } } | null>(null);

  const fit = useCallback(() => {
    const el = ref.current;
    if (!el || !width || !height) return;
    const s = Math.min(el.clientWidth / width, el.clientHeight / height) * 0.96;
    setView({ s, x: (el.clientWidth - width * s) / 2, y: (el.clientHeight - height * s) / 2 });
  }, [width, height]);
  useLayoutEffect(() => {
    fit();
  }, [fit, props.fitKey]);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => fit());
    ro.observe(el);
    return () => ro.disconnect();
  }, [fit]);

  const zoomAt = (cx: number, cy: number, k: number, base?: View) =>
    setView((v0) => {
      const v = base ?? v0;
      const s = Math.max(0.02, Math.min(v.s * k, 40));
      const r = s / v.s;
      return { s, x: cx - (cx - v.x) * r, y: cy - (cy - v.y) * r };
    });
  const local = (e: { clientX: number; clientY: number }) => {
    const r = ref.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const p = local(e);
      zoomAt(p.x, p.y, Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  });

  return (
    <div
      ref={ref}
      data-testid={props.testId}
      className={`relative touch-none overflow-hidden select-none ${props.className ?? ""}`}
      onPointerDown={(e) => {
        (e.target as Element).setPointerCapture?.(e.pointerId);
        const p = local(e);
        pointers.current.set(e.pointerId, p);
        if (pointers.current.size === 1) gesture.current = { startX: p.x, startY: p.y, moved: false };
        else if (pointers.current.size === 2) {
          const [a, b] = [...pointers.current.values()];
          gesture.current = { startX: p.x, startY: p.y, moved: true, pinch: { d: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, v: view } };
        }
      }}
      onPointerMove={(e) => {
        const prev = pointers.current.get(e.pointerId);
        if (!prev || !gesture.current) return;
        const p = local(e);
        pointers.current.set(e.pointerId, p);
        const g = gesture.current;
        if (g.pinch && pointers.current.size >= 2) {
          const [a, b] = [...pointers.current.values()];
          const d = Math.hypot(a.x - b.x, a.y - b.y);
          const cx = (a.x + b.x) / 2;
          const cy = (a.y + b.y) / 2;
          const base = { ...g.pinch.v, x: g.pinch.v.x + (cx - g.pinch.cx), y: g.pinch.v.y + (cy - g.pinch.cy) };
          zoomAt(cx, cy, d / g.pinch.d, base);
          return;
        }
        if (!g.moved && Math.hypot(p.x - g.startX, p.y - g.startY) > 6) g.moved = true;
        if (g.moved) setView((v) => ({ ...v, x: v.x + (p.x - prev.x), y: v.y + (p.y - prev.y) }));
      }}
      onPointerUp={(e) => {
        const g = gesture.current;
        const p = local(e);
        pointers.current.delete(e.pointerId);
        if (pointers.current.size === 0) {
          if (g && !g.moved && onTap && view.s > 0) {
            const x = (p.x - view.x) / view.s / width;
            const y = (p.y - view.y) / view.s / height;
            if (x >= 0 && y >= 0 && x <= 1 && y <= 1) onTap(x, y);
          }
          gesture.current = null;
        } else if (g) g.pinch = undefined;
      }}
      onPointerCancel={(e) => {
        pointers.current.delete(e.pointerId);
        if (!pointers.current.size) gesture.current = null;
      }}
    >
      <div className="absolute top-0 left-0 origin-top-left" style={{ width, height, transform: `translate(${view.x}px, ${view.y}px) scale(${view.s || 1})`, visibility: view.s > 0 ? "visible" : "hidden" }}>
        {props.children(view.s || 1)}
      </div>
      <div className="absolute right-2 bottom-2 flex overflow-hidden rounded-lg bg-white/95 shadow-soft ring-1 ring-slate-200" onPointerDown={(e) => e.stopPropagation()}>
        <button className="h-10 w-10 text-lg text-slate-600 hover:bg-slate-50" onClick={() => zoomAt((ref.current?.clientWidth ?? 0) / 2, (ref.current?.clientHeight ?? 0) / 2, 1.5)} aria-label="Zoom in">
          +
        </button>
        <button className="h-10 w-10 text-lg text-slate-600 hover:bg-slate-50" onClick={() => zoomAt((ref.current?.clientWidth ?? 0) / 2, (ref.current?.clientHeight ?? 0) / 2, 1 / 1.5)} aria-label="Zoom out">
          −
        </button>
        <button className="h-10 px-2 text-xs font-medium text-slate-600 hover:bg-slate-50" onClick={fit} aria-label="Fit">
          Fit
        </button>
      </div>
    </div>
  );
}

/** A numbered alignment pin, constant size on screen. */
export function Pin({ x, y, n, scale, color }: { x: number; y: number; n: number; scale: number; color: string }) {
  const r = 13 / scale;
  return (
    <div
      className="pointer-events-none absolute flex items-center justify-center rounded-full font-bold text-white"
      style={{ left: x - r, top: y - r, width: 2 * r, height: 2 * r, background: color, fontSize: 12 / scale, border: `${2 / scale}px solid white`, boxShadow: `0 ${1 / scale}px ${4 / scale}px rgba(0,0,0,.4)` }}
    >
      {n}
    </div>
  );
}

/** Small device dots (constant size on screen). */
export function Dots({ points, scale, color }: { points: { x: number; y: number; color?: string; key: string }[]; scale: number; color?: string }) {
  const r = 5 / scale;
  return (
    <>
      {points.map((p) => (
        <div
          key={p.key}
          className="pointer-events-none absolute rounded-full"
          style={{ left: p.x - r, top: p.y - r, width: 2 * r, height: 2 * r, background: p.color ?? color ?? "#0B6FE0", border: `${1.5 / scale}px solid white`, boxShadow: `0 0 ${2 / scale}px rgba(0,0,0,.5)` }}
        />
      ))}
    </>
  );
}

export const fmtDate = (iso: string | null | undefined) => {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
};
