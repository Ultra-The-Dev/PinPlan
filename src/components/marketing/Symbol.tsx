// A device symbol as the app draws it on the plan: a solid badge in the device's shape with its letters.
import type { Shape } from "@/lib/types";

/** The badge outline for `shape`, centred at (0,0) with radius r (SVG path data). */
export function shapePath(shape: Shape | string, r: number): string | null {
  switch (shape) {
    case "square":
      return null; // drawn as a rounded rect
    case "diamond":
      return `M0 ${-r * 1.18}L${r * 1.18} 0L0 ${r * 1.18}L${-r * 1.18} 0Z`;
    case "hexagon": {
      const p = Array.from({ length: 6 }, (_, i) => {
        const a = (Math.PI / 3) * i;
        return `${(Math.cos(a) * r * 1.08).toFixed(2)} ${(Math.sin(a) * r * 1.08).toFixed(2)}`;
      });
      return `M${p.join("L")}Z`;
    }
    case "triangle":
      return `M0 ${-r * 1.2}L${r * 1.15} ${r * 0.8}L${-r * 1.15} ${r * 0.8}Z`;
    default:
      return "circle";
  }
}

/** The badge itself, for use inside an <svg>. */
export function SymbolMark({ symbol, color, shape, r = 10, ring = true }: { symbol: string; color: string; shape: Shape | string; r?: number; ring?: boolean }) {
  const path = shapePath(shape, r);
  const fs = symbol.length >= 3 ? r * 0.8 : symbol.length === 2 ? r * 0.95 : r * 1.1;
  const stroke = ring ? { stroke: "#fff", strokeWidth: Math.max(1.2, r * 0.16) } : {};
  return (
    <g>
      {path === "circle" ? (
        <circle r={r} fill={color} {...stroke} />
      ) : path === null ? (
        <rect x={-r} y={-r} width={r * 2} height={r * 2} rx={r * 0.25} fill={color} {...stroke} />
      ) : (
        <path d={path} fill={color} {...stroke} strokeLinejoin="round" />
      )}
      <text y={fs * 0.36} textAnchor="middle" fill="#fff" fontSize={fs} fontWeight={700} style={{ fontStretch: "75%" }}>
        {symbol}
      </text>
    </g>
  );
}

/** A standalone badge (inline in HTML). */
export function Symbol({ symbol, color, shape, size = 26, className = "" }: { symbol: string; color: string; shape: Shape | string; size?: number; className?: string }) {
  const r = 10;
  const pad = 1;
  const box = (r * 1.2 + pad) * 2;
  return (
    <svg viewBox={`${-box / 2} ${-box / 2} ${box} ${box}`} width={size} height={size} className={className} aria-hidden="true">
      <SymbolMark symbol={symbol} color={color} shape={shape} r={r} ring={false} />
    </svg>
  );
}
