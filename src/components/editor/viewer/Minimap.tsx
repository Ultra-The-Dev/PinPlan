"use client";
// Minimap: the sheet's thumbnail with the visible area outlined. Tap or drag on it to move the view there.
import { X } from "lucide-react";
import { useRef } from "react";
import { useT } from "@/lib/i18n";
import { useViewTransform } from "@/lib/planOverlays";
import type { PlanViewport } from "@/lib/planViewport";
import { useSheetThumb } from "@/lib/tiles/tileClient";
import { visibleSheetRect } from "@/lib/viewport";

export default function Minimap({ viewport, imageId, onClose, max = 168 }: { viewport: PlanViewport; imageId: string; onClose: () => void; max?: number }) {
  const t = useT();
  const snap = useViewTransform(viewport);
  const thumb = useSheetThumb(imageId);
  const boxRef = useRef<HTMLDivElement>(null);
  const { width: W, height: H } = snap.sheet;
  const k = max / Math.max(W, H);
  const w = Math.round(W * k);
  const h = Math.round(H * k);
  const r = visibleSheetRect(snap.t, snap.size);
  // The view rectangle, clipped to the sheet.
  const x0 = Math.max(0, r.x);
  const y0 = Math.max(0, r.y);
  const x1 = Math.min(W, r.x + r.w);
  const y1 = Math.min(H, r.y + r.h);
  const whole = r.x <= 0 && r.y <= 0 && r.x + r.w >= W && r.y + r.h >= H;

  const go = (e: React.PointerEvent, animate: boolean) => {
    const b = boxRef.current?.getBoundingClientRect();
    if (!b) return;
    viewport.centerRel({ x: Math.max(0, Math.min(1, (e.clientX - b.left) / b.width)), y: Math.max(0, Math.min(1, (e.clientY - b.top) / b.height)) }, animate);
  };

  if (!W || !H || !snap.size.w) return null;
  return (
    <div className="group relative rounded-xl bg-white/90 p-1.5 shadow-pop ring-1 ring-black/5 backdrop-blur-md" data-plan-ui data-testid="minimap">
      <div
        ref={boxRef}
        className="relative cursor-pointer touch-none overflow-hidden rounded-md bg-white ring-1 ring-slate-200"
        style={{ width: w, height: h }}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          viewport.beginInteraction();
          go(e, true);
        }}
        onPointerMove={(e) => e.buttons && go(e, false)}
        onPointerUp={() => viewport.endInteraction()}
        onPointerCancel={() => viewport.endInteraction()}
        role="slider"
        aria-label={t("Minimap: drag to move around the sheet")}
        aria-valuenow={Math.round(((x0 + x1) / 2 / W) * 100)}
        aria-valuetext={t("{x}% across, {y}% down", { x: Math.round(((x0 + x1) / 2 / W) * 100), y: Math.round(((y0 + y1) / 2 / H) * 100) })}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {thumb && <img src={thumb} alt="" className="pointer-events-none absolute inset-0 h-full w-full" draggable={false} />}
        {!whole && x1 > x0 && y1 > y0 && (
          <div
            className="pointer-events-none absolute rounded-[3px] border-2 border-brand-500 bg-brand-500/10 shadow-[0_0_0_9999px_rgb(28_26_24/0.18)]"
            style={{ left: x0 * k, top: y0 * k, width: Math.max(4, (x1 - x0) * k), height: Math.max(4, (y1 - y0) * k) }}
          />
        )}
      </div>
      <button
        className="absolute -top-2 -right-2 hidden h-6 w-6 items-center justify-center rounded-full bg-white text-slate-500 shadow-soft ring-1 ring-slate-200 group-hover:flex hover:text-slate-900"
        onClick={onClose}
        aria-label={t("Hide minimap")}
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
