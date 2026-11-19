"use client";
// Device badges pre-rendered once per look (shape, colour, letters/icon, tentative) into small canvases, so drawing a
// thousand devices is a thousand drawImage calls — the drop shadow, dashed outline and lettering cost nothing per
// frame. Same artwork as before (symbols.ts): a solid badge in the type's colour, hollow + dashed when tentative.
import { drawSymbolContent, symbolPath } from "@/lib/symbols";
import type { Shape } from "@/lib/types";

/** Badge radius in screen px at size factor 1 (was R in PlanCanvas). */
export const MARKER_R = 14;
/** Sprite half-size in badge px: room for the shadow, the ring and the tentative "?". */
const HALF = 27;

export interface Sprite {
  canvas: HTMLCanvasElement;
  /** Sprite pixels per badge px. */
  res: number;
  half: number;
}

const cache = new Map<string, Sprite>();

export function spriteRes(): number {
  // Same cap as the stage's pixel ratio (PlanCanvas).
  const dpr = Math.min(2, typeof window === "undefined" ? 1 : window.devicePixelRatio || 1);
  // Drawn at up to 1.15× (markerSizeFactor), so render a little larger than 1:1.
  return Math.min(4, Math.ceil(dpr * 1.2 * 4) / 4);
}

export function markerSprite(look: { shape: Shape; color: string; symbol: string; icon: string | null; tentative: boolean }, res = spriteRes()): Sprite {
  const key = `${look.shape}|${look.color}|${look.symbol}|${look.icon ?? ""}|${look.tentative ? 1 : 0}|${res}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = Math.ceil(HALF * 2 * res);
  const ctx = canvas.getContext("2d")!;
  ctx.scale(res, res);
  ctx.translate(HALF, HALF);
  const R = MARKER_R;
  // Badge with a soft shadow (fill only, so the outline stays crisp).
  ctx.save();
  symbolPath(ctx, look.shape, R);
  ctx.shadowColor = "rgba(0,0,0,0.3)";
  ctx.shadowBlur = 3 * res;
  ctx.shadowOffsetY = 1 * res;
  ctx.fillStyle = look.tentative ? "#fff" : look.color;
  ctx.fill();
  ctx.restore();
  symbolPath(ctx, look.shape, R);
  ctx.lineWidth = look.tentative ? 2.5 : 2;
  ctx.strokeStyle = look.tentative ? look.color : "#fff";
  if (look.tentative) ctx.setLineDash([5, 4]);
  ctx.stroke();
  ctx.setLineDash([]);
  drawSymbolContent(ctx, look.shape, R, look.tentative ? look.color : "#fff", look.symbol, look.icon);
  if (look.tentative) {
    ctx.fillStyle = "#b91c1c";
    ctx.font = "bold 15px sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText("?", R, -R - 6);
  }
  const s = { canvas, res, half: HALF };
  if (cache.size > 400) cache.clear();
  cache.set(key, s);
  return s;
}
