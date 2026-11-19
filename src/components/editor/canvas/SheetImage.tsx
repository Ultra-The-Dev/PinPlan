"use client";
// The sheet image, drawn from its pyramid: the low-res preview underneath (shows at once, blurry when zoomed in), then
// the tiles of the level that matches the zoom, only those on screen. A tile that isn't loaded yet borrows its coarser
// parent if that's in memory; it's requested from the tile worker and the layer redraws when it arrives.
import type Konva from "konva";
import { Shape } from "react-konva";
import type { PlanViewport } from "@/lib/planViewport";
import { tileClient, type Pyramid } from "@/lib/tiles/tileClient";
import { chooseLevel, parentTile, visibleSheetRect, visibleTiles } from "@/lib/viewport";

/** Last frame's numbers, for the perf readout (window.__pinplanViewer). */
export const sheetStats = { level: -1, tiles: 0, drawn: 0, missing: 0, ms: 0 };

export default function SheetImage({ pyramid, viewport, width, height }: { pyramid: Pyramid | null; viewport: PlanViewport; width: number; height: number }) {
  const sceneFunc = (kctx: Konva.Context) => {
    const ctx = (kctx as unknown as { _context: CanvasRenderingContext2D })._context;
    const p = pyramid;
    if (!p?.preview || !p.info) return;
    const info = p.info;
    const t0 = performance.now();
    const t = viewport.transform;
    const k = width / info.width; // sheet px per image px
    // Tiles are drawn close to 1:1, so plain bilinear filtering is sharp enough (and much cheaper than "high").
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "low";
    // Only the on-screen part of the preview is drawn.
    const vr = visibleSheetRect(t, viewport.viewSize);
    const x0 = Math.max(0, vr.x);
    const y0 = Math.max(0, vr.y);
    const x1 = Math.min(width, vr.x + vr.w);
    const y1 = Math.min(height, vr.y + vr.h);
    if (x1 <= x0 || y1 <= y0) return;
    const pk = info.previewWidth / width;
    const pkY = info.previewHeight / height;
    const drawPreview = () => p.preview && ctx.drawImage(p.preview, x0 * pk, y0 * pkY, (x1 - x0) * pk, (y1 - y0) * pkY, x0, y0, x1 - x0, y1 - y0);
    const dpr = Math.min(2, typeof window === "undefined" ? 1 : window.devicePixelRatio || 1);
    const imgT = { scale: t.scale * k, x: t.x, y: t.y };
    const level = chooseLevel(info, imgT.scale, dpr);
    sheetStats.level = level;
    if (level < 0) {
      drawPreview();
      sheetStats.tiles = sheetStats.drawn = sheetStats.missing = 0;
      sheetStats.ms = performance.now() - t0;
      return;
    }
    const tiles = visibleTiles(info, level, imgT, viewport.viewSize, 0);
    // Ask for a ring of tiles just off screen too, so a pan finds them ready.
    for (const r of visibleTiles(info, level, imgT, viewport.viewSize, 256)) tileClient().tile(p.imageId, r.level, r.col, r.row);
    const ext = 0.6 / t.scale; // overlap by about half a screen pixel: no seams between tiles
    let drawn = 0;
    let missing = 0;
    const fallbacks: { bmp: ImageBitmap; x: number; y: number; w: number; h: number }[] = [];
    const sharp: { bmp: ImageBitmap; x: number; y: number; w: number; h: number }[] = [];
    const parentsSeen = new Set<string>();
    for (const r of tiles) {
      const bmp = tileClient().tile(p.imageId, r.level, r.col, r.row);
      if (bmp) {
        sharp.push({ bmp, x: r.x * k, y: r.y * k, w: r.w * k, h: r.h * k });
        drawn++;
        continue;
      }
      missing++;
      const par = parentTile(info, r);
      if (!par) continue;
      const key = `${par.level}/${par.col}/${par.row}`;
      if (parentsSeen.has(key)) continue;
      parentsSeen.add(key);
      const pb = tileClient().tile(p.imageId, par.level, par.col, par.row, false);
      if (pb) {
        const ts = info.tileSize / info.levels[par.level].scale;
        fallbacks.push({ bmp: pb, x: par.col * ts * k, y: par.row * ts * k, w: Math.min(ts, info.width - par.col * ts) * k, h: Math.min(ts, info.height - par.row * ts) * k });
      }
    }
    // The blurry preview only where a sharp tile is still on its way.
    if (missing) drawPreview();
    for (const f of fallbacks) ctx.drawImage(f.bmp, f.x, f.y, f.w + ext, f.h + ext);
    for (const s of sharp) ctx.drawImage(s.bmp, s.x, s.y, s.w + ext, s.h + ext);
    sheetStats.tiles = tiles.length;
    sheetStats.drawn = drawn;
    sheetStats.missing = missing;
    sheetStats.ms = performance.now() - t0;
  };
  return <Shape sceneFunc={sceneFunc} listening={false} perfectDrawEnabled={false} />;
}
