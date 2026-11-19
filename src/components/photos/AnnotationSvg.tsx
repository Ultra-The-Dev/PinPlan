"use client";
// Photo mark-up drawn as SVG over the photo (same look as drawAnnotations on canvas). Letterboxed like an
// object-contain image, so it stays on the photo even when the box is not the photo's shape.
import { useId } from "react";
import type { PhotoShape } from "@/lib/types";

export default function AnnotationSvg({ shapes, w, h, className = "" }: { shapes: PhotoShape[]; w: number; h: number; className?: string }) {
  const side = Math.max(w, h);
  // One filter per drawing (ids are page-wide), so each photo gets a halo sized to it.
  const halo = `halo-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="xMidYMid meet" className={`pointer-events-none absolute inset-0 h-full w-full ${className}`} aria-hidden>
      <defs>
        <filter id={halo} x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="0" stdDeviation={side * 0.003} floodColor="#000" floodOpacity="0.5" />
        </filter>
      </defs>
      {shapes.map((s, i) => {
        const lw = Math.max(1, s.width * side);
        const p = s.points.map((v, j) => (j % 2 ? v * h : v * w));
        const common = { stroke: s.color, strokeWidth: lw, fill: "none", strokeLinecap: "round" as const, strokeLinejoin: "round" as const, filter: `url(#${halo})` };
        if (s.kind === "pen") return <polyline key={i} points={p.join(" ")} {...common} />;
        if (s.kind === "rect")
          return <rect key={i} x={Math.min(p[0], p[2])} y={Math.min(p[1], p[3])} width={Math.abs(p[2] - p[0])} height={Math.abs(p[3] - p[1])} {...common} />;
        if (s.kind === "circle")
          return <ellipse key={i} cx={(p[0] + p[2]) / 2} cy={(p[1] + p[3]) / 2} rx={Math.abs(p[2] - p[0]) / 2} ry={Math.abs(p[3] - p[1]) / 2} {...common} />;
        if (s.kind === "arrow") {
          const a = Math.atan2(p[3] - p[1], p[2] - p[0]);
          const head = lw * 4.5;
          const tip = `${p[2]},${p[3]} ${p[2] - head * Math.cos(a - 0.45)},${p[3] - head * Math.sin(a - 0.45)} ${p[2] - head * Math.cos(a + 0.45)},${p[3] - head * Math.sin(a + 0.45)}`;
          return (
            <g key={i} filter={`url(#${halo})`}>
              <line x1={p[0]} y1={p[1]} x2={p[2] - Math.cos(a) * head * 0.6} y2={p[3] - Math.sin(a) * head * 0.6} stroke={s.color} strokeWidth={lw} strokeLinecap="round" />
              <polygon points={tip} fill={s.color} />
            </g>
          );
        }
        if (s.kind === "text" && s.text) {
          const size = Math.max(12, lw * 6);
          return (
            <g key={i}>
              <rect x={p[0] - size * 0.25} y={p[1] - size * 0.15} width={s.text.length * size * 0.6 + size * 0.5} height={size * 1.3} fill="rgba(0,0,0,0.55)" rx={size * 0.15} />
              <text x={p[0]} y={p[1] + size * 0.85} fill={s.color} fontSize={size} fontWeight={700} fontFamily="system-ui, sans-serif">
                {s.text}
              </text>
            </g>
          );
        }
        return null;
      })}
    </svg>
  );
}
