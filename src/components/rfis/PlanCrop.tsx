"use client";
// The part of a plan sheet around an RFI's spot, with a ring on the spot. Pure CSS crop of the full sheet image, so it
// works the same with a local blob URL (in the app) and a signed URL (on the answer page).
import { planCropRect } from "@/lib/rfis";

export default function PlanCrop({
  src,
  width,
  height,
  x,
  y,
  label,
  frac,
  className = "",
  ariaLabel,
}: {
  src: string;
  width: number;
  height: number;
  x: number;
  y: number;
  label?: string | null;
  frac?: number;
  className?: string;
  /** Overrides the English label (the team screens pass it translated; the client answer page stays English). */
  ariaLabel?: string;
}) {
  const c = planCropRect(x, y, width, height, frac);
  const pct = (v: number) => `${v * 100}%`;
  return (
    <div
      className={`relative overflow-hidden rounded-lg bg-white ring-1 ring-slate-200 ${className}`}
      style={{ aspectRatio: `${Math.max(1, c.w * width)} / ${Math.max(1, c.h * height)}` }}
      role="img"
      aria-label={ariaLabel ?? (label ? `Plan location on ${label}` : "Plan location")}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        draggable={false}
        className="pointer-events-none absolute max-w-none select-none"
        style={{ width: pct(1 / c.w), height: pct(1 / c.h), left: pct(-c.x / c.w), top: pct(-c.y / c.h) }}
      />
      <span
        className="pointer-events-none absolute h-9 w-9 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-red-600 bg-red-500/15 shadow-[0_0_0_3px_rgba(255,255,255,0.85)]"
        style={{ left: pct((x - c.x) / c.w), top: pct((y - c.y) / c.h) }}
      />
      <span className="pointer-events-none absolute h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-red-600" style={{ left: pct((x - c.x) / c.w), top: pct((y - c.y) / c.h) }} />
      {label && <span className="absolute bottom-1.5 left-1.5 rounded bg-white/90 px-1.5 py-0.5 text-[11px] font-semibold text-slate-700 shadow-sm">{label}</span>}
    </div>
  );
}
