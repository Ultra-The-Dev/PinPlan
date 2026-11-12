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

/** Draw a complete device symbol on a 2D canvas (used for exports). */
export function drawSymbol(
  ctx: CanvasRenderingContext2D,
  shape: Shape,
  x: number,
  y: number,
  r: number,
  color: string,
  text: string,
  opts: { tentative?: boolean; label?: string } = {},
) {
  ctx.save();
  ctx.translate(x, y);
  symbolPath(ctx, shape, r);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.lineWidth = r * 0.22;
  ctx.strokeStyle = color;
  if (opts.tentative) ctx.setLineDash([r * 0.4, r * 0.3]);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = color;
  ctx.font = `bold ${r * (text.length > 2 ? 0.62 : text.length > 1 ? 0.8 : 1.0)}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 0, shape === "triangle" ? r * 0.2 : 0);
  if (opts.tentative) {
    ctx.font = `bold ${r * 0.9}px sans-serif`;
    ctx.fillStyle = "#b91c1c";
    ctx.fillText("?", r * 1.25, -r * 0.9);
  }
  if (opts.label) {
    ctx.font = `${r * 0.55}px sans-serif`;
    ctx.fillStyle = "#0f172a";
    ctx.textBaseline = "top";
    ctx.fillText(opts.label, 0, r * 1.3);
  }
  ctx.restore();
}

export const WIRE_COLORS: Record<string, string> = {
  Cat6: "#2563eb",
  "16/4 speaker": "#7c3aed",
  "HDMI + Cat6": "#0891b2",
  "18/2": "#ca8a04",
  "LV per driver": "#d97706",
  "LV per manufacturer": "#db2777",
  Coax: "#475569",
  Fiber: "#16a34a",
};
export const wireColor = (w?: string) => WIRE_COLORS[w ?? ""] ?? "#64748b";
