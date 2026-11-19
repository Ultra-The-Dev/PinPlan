"use client";
// Every device on the sheet drawn by ONE Konva shape: sprites at a constant screen size, only those on screen, labels
// with a white halo. No per-device Konva nodes (and no hit canvas — hit testing is planHit.ts), so pan/zoom stays at
// 60 fps with thousands of devices.
import type Konva from "konva";
import { Shape } from "react-konva";
import { SELECT_HALO, SELECT_HALO_FILL, SELECT_INK } from "@/lib/canvasColors";
import type { PlanViewport } from "@/lib/planViewport";
import type { Shape as SymbolShape } from "@/lib/types";
import { MARKER_R, markerSprite, spriteRes } from "./markerSprites";

export interface MarkerItem {
  id: string;
  /** Sheet px. */
  x: number;
  y: number;
  shape: SymbolShape;
  color: string;
  symbol: string;
  icon: string | null;
  tentative: boolean;
  label: string;
  photos: number;
  selected: boolean;
  dim: boolean;
}

export interface MarkerDrag {
  id: string;
  x: number;
  y: number;
}

/** Last frame's numbers, for the perf readout (window.__pinplanViewer). */
export const markerStats = { total: 0, drawn: 0, ms: 0 };

export default function MarkersShape({ items, viewport, showLabels, drag }: { items: MarkerItem[]; viewport: PlanViewport; showLabels: boolean; drag: { current: MarkerDrag | null } }) {
  const sceneFunc = (kctx: Konva.Context, shape: Konva.Shape) => {
    const ctx = (kctx as unknown as { _context: CanvasRenderingContext2D })._context;
    const t0 = performance.now();
    let drawn = 0;
    const t = viewport.transform;
    const { w, h } = viewport.viewSize;
    const k = viewport.sizeFactor;
    const pr = shape.getLayer()?.getCanvas().getPixelRatio() ?? 1;
    const res = spriteRes();
    const d = drag.current;
    ctx.save();
    // Draw in screen px: positions are transformed by hand so sizes don't depend on the zoom.
    ctx.setTransform(pr, 0, 0, pr, 0, 0);
    const margin = 40 * k;
    const font = `${Math.round(10 * k * 10) / 10}px ui-sans-serif, system-ui, sans-serif`;
    const labels: { x: number; y: number; text: string; dim: boolean }[] = [];
    let dragged: MarkerItem | null = null;
    for (const m of items) {
      if (d && d.id === m.id) {
        dragged = m;
        continue;
      }
      const sx = m.x * t.scale + t.x;
      const sy = m.y * t.scale + t.y;
      if (sx < -margin || sy < -margin || sx > w + margin || sy > h + margin) continue;
      drawOne(ctx, m, sx, sy, k, res);
      drawn++;
      if (showLabels && m.label) labels.push({ x: sx, y: sy + (MARKER_R + 3) * k, text: m.label, dim: m.dim });
    }
    if (labels.length) {
      ctx.font = font;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.lineJoin = "round";
      ctx.lineWidth = 3;
      ctx.strokeStyle = "rgba(255,255,255,0.92)";
      for (const l of labels) {
        ctx.globalAlpha = l.dim ? 0.3 : 1;
        ctx.strokeText(l.text, l.x, l.y, 80 * k);
      }
      ctx.fillStyle = "#0f172a";
      for (const l of labels) {
        ctx.globalAlpha = l.dim ? 0.3 : 1;
        ctx.fillText(l.text, l.x, l.y, 80 * k);
      }
      ctx.globalAlpha = 1;
    }
    if (dragged && d) {
      // The device being dragged: lifted a little, on top of everything.
      const sx = d.x * t.scale + t.x;
      const sy = d.y * t.scale + t.y;
      ctx.beginPath();
      ctx.arc(sx, sy + 3, MARKER_R * k * 1.25, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(15,23,42,0.18)";
      ctx.fill();
      drawOne(ctx, { ...dragged, selected: true, dim: false }, sx, sy, k * 1.15, res);
    }
    ctx.restore();
    markerStats.total = items.length;
    markerStats.drawn = drawn;
    markerStats.ms = performance.now() - t0;
  };
  return <Shape sceneFunc={sceneFunc} listening={false} perfectDrawEnabled={false} />;
}

function drawOne(ctx: CanvasRenderingContext2D, m: MarkerItem, sx: number, sy: number, k: number, res: number) {
  if (m.dim) ctx.globalAlpha = 0.22;
  if (m.selected) {
    ctx.beginPath();
    ctx.arc(sx, sy, (MARKER_R + 7) * k, 0, Math.PI * 2);
    ctx.fillStyle = SELECT_HALO_FILL;
    ctx.fill();
    // Light-blue halo outside, dark ink ring inside: visible on white paper and on dense linework.
    ctx.lineWidth = 5;
    ctx.strokeStyle = SELECT_HALO;
    ctx.stroke();
    ctx.lineWidth = 2;
    ctx.strokeStyle = SELECT_INK;
    ctx.stroke();
  }
  const sp = markerSprite(m, res);
  const size = (sp.canvas.width / sp.res) * k;
  ctx.drawImage(sp.canvas, sx - sp.half * k, sy - sp.half * k, size, size);
  if (m.photos > 0) {
    // Camera badge: this device has site photos.
    const bx = sx - (MARKER_R + 1) * k;
    const by = sy - (MARKER_R + 1) * k;
    ctx.beginPath();
    ctx.arc(bx, by, 7.5 * k, 0, Math.PI * 2);
    ctx.fillStyle = "#0f172a";
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = "#fff";
    ctx.stroke();
    ctx.fillStyle = "#fff";
    ctx.fillRect(bx - 4 * k, by - 2.5 * k, 8 * k, 5.5 * k);
    ctx.fillRect(bx - 1.6 * k, by - 4 * k, 3.2 * k, 1.8 * k);
    ctx.beginPath();
    ctx.arc(bx, by + 0.3 * k, 1.6 * k, 0, Math.PI * 2);
    ctx.fillStyle = "#0f172a";
    ctx.fill();
  }
  if (m.dim) ctx.globalAlpha = 1;
}
