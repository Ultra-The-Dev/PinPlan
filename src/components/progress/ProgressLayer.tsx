"use client";
// Progress view on the plan: a ring in its install-status colour around every device and a translucent status line
// over every run. One Konva shape drawn in screen pixels (like MarkersShape), so rings keep their size at any zoom and
// only on-screen items cost anything. Read-only: it never changes data.
import type Konva from "konva";
import { useMemo } from "react";
import { Shape } from "react-konva";
import { MARKER_R } from "@/components/editor/canvas/markerSprites";
import { STATUS_COLORS, statusOf } from "@/lib/installProgress";
import type { PlanViewport } from "@/lib/planViewport";
import type { InstallStatus, Sheet } from "@/lib/types";
import { useProgressUi } from "./progressStore";
import { useShownItems } from "./useShownItems";

interface Ring {
  x: number;
  y: number;
  status: InstallStatus;
  photo: boolean;
}

export default function ProgressLayer({ sheet, viewport }: { sheet: Sheet; viewport: PlanViewport }) {
  const on = useProgressUi((s) => s.on);
  const { markers, runs } = useShownItems(sheet.id);
  const W = sheet.width;
  const H = sheet.height;
  const rings = useMemo<Ring[]>(() => markers.map((m) => ({ x: m.x * W, y: m.y * H, status: statusOf(m), photo: !!m.install?.photoIds?.length })), [markers, W, H]);
  const lines = useMemo(() => runs.map((r) => ({ pts: r.points.map((v, i) => (i % 2 === 0 ? v * W : v * H)), status: statusOf(r) })), [runs, W, H]);
  if (!on) return null;

  const sceneFunc = (kctx: Konva.Context, shape: Konva.Shape) => {
    const ctx = (kctx as unknown as { _context: CanvasRenderingContext2D })._context;
    const t = viewport.transform;
    const { w, h } = viewport.viewSize;
    const k = viewport.sizeFactor;
    const pr = shape.getLayer()?.getCanvas().getPixelRatio() ?? 1;
    ctx.save();
    ctx.setTransform(pr, 0, 0, pr, 0, 0);
    // Runs: a wide translucent line in the status colour under the rings.
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = 7 * k;
    ctx.globalAlpha = 0.45;
    for (const l of lines) {
      if (l.pts.length < 4) continue;
      ctx.strokeStyle = STATUS_COLORS[l.status];
      ctx.beginPath();
      for (let i = 0; i + 1 < l.pts.length; i += 2) {
        const sx = l.pts[i] * t.scale + t.x;
        const sy = l.pts[i + 1] * t.scale + t.y;
        if (i === 0) ctx.moveTo(sx, sy);
        else ctx.lineTo(sx, sy);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    const R = (MARKER_R + 5) * k;
    const margin = R + 10;
    for (const r of rings) {
      const sx = r.x * t.scale + t.x;
      const sy = r.y * t.scale + t.y;
      if (sx < -margin || sy < -margin || sx > w + margin || sy > h + margin) continue;
      const c = STATUS_COLORS[r.status];
      ctx.beginPath();
      ctx.arc(sx, sy, R, 0, Math.PI * 2);
      ctx.lineWidth = 4 * k;
      ctx.strokeStyle = "rgba(255,255,255,0.95)";
      ctx.stroke();
      ctx.lineWidth = 3 * k;
      ctx.strokeStyle = c;
      if (r.status === "planned") ctx.setLineDash([4 * k, 3 * k]);
      ctx.stroke();
      ctx.setLineDash([]);
      // Corner badge: ✓ verified/tested, ! issue, ● photo proof.
      const bx = sx + R * 0.72;
      const by = sy + R * 0.72;
      const badge = r.status === "verified" || r.status === "tested" || r.status === "issue";
      if (badge) {
        ctx.beginPath();
        ctx.arc(bx, by, 6 * k, 0, Math.PI * 2);
        ctx.fillStyle = c;
        ctx.fill();
        ctx.lineWidth = 1.5 * k;
        ctx.strokeStyle = "#fff";
        ctx.stroke();
        ctx.fillStyle = "#fff";
        ctx.strokeStyle = "#fff";
        if (r.status === "issue") {
          ctx.font = `bold ${9 * k}px ui-sans-serif, system-ui, sans-serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText("!", bx, by + 0.5 * k);
        } else {
          ctx.lineWidth = 1.6 * k;
          ctx.beginPath();
          ctx.moveTo(bx - 2.6 * k, by);
          ctx.lineTo(bx - 0.6 * k, by + 2 * k);
          ctx.lineTo(bx + 2.8 * k, by - 2.2 * k);
          ctx.stroke();
        }
      } else if (r.photo) {
        ctx.beginPath();
        ctx.arc(bx, by, 3 * k, 0, Math.PI * 2);
        ctx.fillStyle = c;
        ctx.fill();
      }
    }
    ctx.restore();
  };
  // A new function each render makes react-konva redraw when statuses change; pan/zoom redraws via the stage.
  return <Shape sceneFunc={sceneFunc} listening={false} perfectDrawEnabled={false} />;
}
