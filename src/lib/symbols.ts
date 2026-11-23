import { DEVICE_ICONS } from "./deviceIcons";
import type { Shape } from "./types";

/** Minimal path API shared by CanvasRenderingContext2D and Konva.Context. */
export interface PathCtx {
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  arc(x: number, y: number, r: number, a0: number, a1: number): void;
  closePath(): void;
}

/** Trace a device symbol outline centered at (0,0) with radius r. */
export function symbolPath(ctx: PathCtx, shape: Shape, r: number) {
  ctx.beginPath();
  const poly = (n: number, rot: number, rad = r) => {
    for (let i = 0; i < n; i++) {
      const a = rot + (i * 2 * Math.PI) / n;
      const x = Math.cos(a) * rad;
      const y = Math.sin(a) * rad;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
  };
  switch (shape) {
    case "circle":
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.closePath();
      break;
    case "square": {
      const s = r * 0.88;
      ctx.moveTo(-s, -s);
      ctx.lineTo(s, -s);
      ctx.lineTo(s, s);
      ctx.lineTo(-s, s);
      ctx.closePath();
      break;
    }
    case "triangle":
      poly(3, -Math.PI / 2, r * 1.2);
      break;
    case "diamond":
      poly(4, -Math.PI / 2, r * 1.15);
      break;
    case "hexagon":
      poly(6, 0, r * 1.05);
      break;
    case "star": {
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const rad = i % 2 === 0 ? r * 1.2 : r * 0.55;
        const x = Math.cos(a) * rad;
        const y = Math.sin(a) * rad;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      break;
    }
  }
}

/** Starting device types draw their letters (C, W, S, TV…). An icon only shows when one is picked in the catalog. */
export const DEFAULT_ICONS: Record<string, string> = {};

/** The pictogram key a device type draws with, or null to draw its letters. */
export function iconFor(t: { id: string; icon?: string | null }): string | null {
  if (t.icon === "letters") return null;
  const k = t.icon || DEFAULT_ICONS[t.id];
  return k && DEVICE_ICONS[k] ? k : null;
}

/** Stroke a 24×24 pictogram centred at (0,0), `size` px wide. */
export function drawIcon(ctx: CanvasRenderingContext2D, key: string, size: number, color: string, weight = 2.25) {
  const icon = DEVICE_ICONS[key];
  if (!icon) return;
  ctx.save();
  const k = size / 24;
  ctx.scale(k, k);
  ctx.translate(-12, -12);
  ctx.strokeStyle = color;
  ctx.lineWidth = weight;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.setLineDash([]);
  const n = (v: string | number | undefined, d = 0) => (v == null ? d : Number(v));
  for (const [tag, a] of icon.node) {
    if (tag === "path") ctx.stroke(new Path2D(String(a.d)));
    else if (tag === "circle") {
      ctx.beginPath();
      ctx.arc(n(a.cx), n(a.cy), n(a.r), 0, Math.PI * 2);
      ctx.stroke();
    } else if (tag === "line") {
      ctx.beginPath();
      ctx.moveTo(n(a.x1), n(a.y1));
      ctx.lineTo(n(a.x2), n(a.y2));
      ctx.stroke();
    } else if (tag === "rect") {
      ctx.beginPath();
      ctx.roundRect(n(a.x), n(a.y), n(a.width), n(a.height), n(a.rx));
      ctx.stroke();
    }
  }
  ctx.restore();
}

/** Draw the inside of a symbol (pictogram or letters) centred at (0,0). */
export function drawSymbolContent(ctx: CanvasRenderingContext2D, shape: Shape, r: number, ink: string, text: string, icon: string | null) {
  const dy = shape === "triangle" ? r * 0.22 : 0;
  if (icon) {
    ctx.save();
    ctx.translate(0, dy);
    drawIcon(ctx, icon, r * (shape === "triangle" ? 1.0 : shape === "star" ? 0.95 : 1.22), ink);
    ctx.restore();
    return;
  }
  ctx.fillStyle = ink;
  ctx.font = `bold ${r * (text.length > 2 ? 0.62 : text.length > 1 ? 0.8 : 1.0)}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 0, dy);
}

/**
 * The "×12" pill of a count pin ("Add by count"), to the lower right of a symbol of radius `r` centred on (x, y):
 * dark ink on white text, white outline, so it reads on any plan. Same look on the plan and in exports.
 */
export function drawCountBadge(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, count: number) {
  const text = `×${count}`;
  const h = Math.max(8, r * 0.95);
  ctx.save();
  ctx.font = `bold ${h * 0.78}px ui-sans-serif, system-ui, sans-serif`;
  const w = Math.max(h, ctx.measureText(text).width + h * 0.55);
  const left = x + r * 0.35;
  const top = y + r * 0.3;
  ctx.beginPath();
  if (typeof ctx.roundRect === "function") ctx.roundRect(left, top, w, h, h / 2);
  else ctx.rect(left, top, w, h);
  ctx.fillStyle = "#0f172a";
  ctx.fill();
  ctx.lineWidth = Math.max(1, h * 0.14);
  ctx.strokeStyle = "#ffffff";
  ctx.stroke();
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, left + w / 2, top + h / 2 + h * 0.04);
  ctx.restore();
}

/** Draw a complete device symbol on a 2D canvas (palette, legends, exports): a solid badge with a white pictogram.
 * Tentative (?) devices are hollow with a dashed outline. A count pin (`count` ≥ 2) gets its "×12" pill. */
export function drawSymbol(
  ctx: CanvasRenderingContext2D,
  shape: Shape,
  x: number,
  y: number,
  r: number,
  color: string,
  text: string,
  opts: { tentative?: boolean; label?: string; icon?: string | null; count?: number } = {},
) {
  ctx.save();
  ctx.translate(x, y);
  symbolPath(ctx, shape, r);
  ctx.fillStyle = opts.tentative ? "#ffffff" : color;
  ctx.fill();
  ctx.lineWidth = r * 0.16;
  ctx.strokeStyle = opts.tentative ? color : "rgba(255,255,255,0.9)";
  if (opts.tentative) ctx.setLineDash([r * 0.4, r * 0.3]);
  ctx.stroke();
  ctx.setLineDash([]);
  drawSymbolContent(ctx, shape, r, opts.tentative ? color : "#ffffff", text, opts.icon ?? null);
  if (opts.tentative) {
    ctx.font = `bold ${r * 0.9}px sans-serif`;
    ctx.fillStyle = "#b91c1c";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("?", r * 1.25, -r * 0.9);
  }
  if (opts.label) {
    ctx.font = `${r * 0.55}px sans-serif`;
    ctx.fillStyle = "#0f172a";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText(opts.label, 0, r * (opts.count && opts.count > 1 ? 1.45 : 1.3));
  }
  ctx.restore();
  if (opts.count && opts.count > 1) drawCountBadge(ctx, x, y, r, opts.count);
}

export const WIRE_COLORS: Record<string, string> = {
  Cat6: "#2563eb",
  "16/4 speaker": "#7c3aed",
  HDMI: "#c026d3",
  "HDMI + Cat6": "#0891b2",
  "18/2": "#ca8a04",
  "LV per driver": "#d97706",
  "LV per manufacturer": "#db2777",
  Coax: "#ea580c",
  Fiber: "#16a34a",
  "22/4 alarm": "#be123c",
  // Other trades (trades.ts). NM-B follows the jacket colours where they show on a white plan (12 yellow, 10 orange…).
  "14/2 NM-B": "#64748b",
  "14/3 NM-B": "#475569",
  "12/2 NM-B": "#ca8a04",
  "12/3 NM-B": "#a16207",
  "10/2 NM-B": "#ea580c",
  "10/3 NM-B": "#c2410c",
  "8/3 NM-B": "#1f2937",
  "6/3 NM-B": "#111827",
  "14/2 MC": "#78716c",
  "12/2 MC": "#57534e",
  'EMT 1/2"': "#0f766e",
  'EMT 3/4"': "#115e59",
  'PVC 3/4"': "#6b7280",
  'PVC 1"': "#4b5563",
  "18/2 FPLR": "#dc2626",
  "18/4 FPLR": "#b91c1c",
  "16/2 FPLR": "#e11d48",
  "16/4 FPLR": "#be123c",
  "14/2 FPLP": "#9f1239",
  "14/2 FPLR": "#881337",
  'Line set 1/4"×1/2"': "#b45309",
  'Line set 3/8"×3/4"': "#92400e",
  "Thermostat 18/5": "#0284c7",
  "Thermostat 18/8": "#0369a1",
  'Condensate 3/4" PVC': "#65a30d",
  'Flex duct 6"': "#94a3b8",
  'Flex duct 8"': "#64748b",
  'PEX 1/2"': "#2563eb",
  'PEX 3/4"': "#1d4ed8",
  'PEX 1"': "#1e40af",
  'Copper 1/2"': "#b45309",
  'Copper 3/4"': "#92400e",
  'Drain 1-1/2"': "#57534e",
  'Drain 2"': "#44403c",
  'Drain 3"': "#292524",
  'Drain 4"': "#1c1917",
  'Gas 1/2" CSST': "#eab308",
  "PV wire 10 AWG": "#ca8a04",
  "THHN 10 AWG": "#dc2626",
  "THHN 8 AWG": "#1f2937",
  "THHN 6 AWG": "#111827",
};
export const wireColor = (w?: string) => WIRE_COLORS[w ?? ""] ?? "#64748b";
