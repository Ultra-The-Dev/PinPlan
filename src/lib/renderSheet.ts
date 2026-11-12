"use client";
import { CLOSET_KINDS } from "./catalog";
import { db } from "./db";
import { runLengthFt } from "./geometry";
import { drawSymbol, wireColor } from "./symbols";
import type { Closet, DeviceType, Layer, Marker, Run, Sheet } from "./types";

export interface RenderOptions {
  layers?: Layer[] | null; // null = all
  maxSide?: number;
  labels?: boolean;
}

async function loadImage(imageId: string): Promise<ImageBitmap | null> {
  const rec = await db().images.get(imageId);
  if (!rec) return null;
  return createImageBitmap(rec.blob);
}

/** Draw a marked-up sheet (plan + runs + closets + devices) to a canvas, for PDF export. */
export async function renderSheet(
  sheet: Sheet,
  data: { markers: Marker[]; runs: Run[]; closets: Closet[]; catalog: DeviceType[] },
  opts: RenderOptions = {},
): Promise<HTMLCanvasElement> {
  const maxSide = opts.maxSide ?? 3200;
  const k = Math.min(1, maxSide / Math.max(sheet.width, sheet.height));
  const W = Math.round(sheet.width * k);
  const H = Math.round(sheet.height * k);
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, W, H);
  const img = await loadImage(sheet.imageId);
  if (img) {
    ctx.globalAlpha = 0.85; // fade the plan a little so markup stands out
    ctx.drawImage(img, 0, 0, W, H);
    ctx.globalAlpha = 1;
    img.close();
  }
  const show = (l: Layer) => !opts.layers || opts.layers.includes(l);
  const types = new Map(data.catalog.map((d) => [d.id, d]));
  const r = Math.max(W, H) / 140;

  for (const run of data.runs) {
    if (run.sheetId !== sheet.id || run.deleted) continue;
    if (!show(run.kind === "wire" ? "wiring" : "lighting")) continue;
    const color = run.kind === "wire" ? wireColor(run.wireType) : (types.get(run.deviceTypeId ?? "")?.color ?? "#d97706");
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = run.kind === "wire" ? r * 0.18 : r * 0.4;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    if (run.kind === "wire") ctx.setLineDash([r * 0.6, r * 0.4]);
    if (run.kind === "stair") ctx.setLineDash([r * 0.3, r * 0.3]);
    if (run.tentative) ctx.globalAlpha = 0.5;
    ctx.beginPath();
    for (let i = 0; i + 1 < run.points.length; i += 2) {
      const x = run.points[i] * W;
      const y = run.points[i + 1] * H;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.restore();
    if (run.kind !== "wire") {
      const len = runLengthFt(run);
      const label = [run.zone ? `Z${run.zone}` : "", len != null ? `${Math.round(len * 10) / 10} LF` : "", run.switchLabel ?? ""].filter(Boolean).join(" · ");
      const mx = ((run.points[0] + run.points[run.points.length - 2]) / 2) * W;
      const my = ((run.points[1] + run.points[run.points.length - 1]) / 2) * H;
      ctx.save();
      ctx.font = `bold ${r * 0.75}px sans-serif`;
      const tw = ctx.measureText(label).width;
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      ctx.fillRect(mx - tw / 2 - 4, my - r * 1.5, tw + 8, r);
      ctx.fillStyle = color;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(label, mx, my - r);
      ctx.restore();
    }
  }

  if (show("infrastructure")) {
    for (const cl of data.closets) {
      if (cl.sheetId !== sheet.id || cl.deleted) continue;
      const meta = CLOSET_KINDS.find((k2) => k2.id === cl.kind)!;
      const s = r * 1.3;
      const x = cl.x * W;
      const y = cl.y * H;
      ctx.save();
      ctx.fillStyle = meta.color;
      ctx.fillRect(x - s, y - s, 2 * s, 2 * s);
      ctx.fillStyle = "#fff";
      ctx.font = `bold ${r * 0.8}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(meta.abbrev, x, y);
      ctx.fillStyle = meta.color;
      ctx.textBaseline = "top";
      ctx.font = `bold ${r * 0.7}px sans-serif`;
      ctx.fillText(cl.name, x, y + s + 3);
      ctx.restore();
    }
  }

  for (const m of data.markers) {
    if (m.sheetId !== sheet.id || m.deleted) continue;
    const t = types.get(m.deviceTypeId);
    if (!t || !show(t.category)) continue;
    drawSymbol(ctx, t.shape, m.x * W, m.y * H, r, t.color, t.symbol, { tentative: m.tentative, label: opts.labels ? m.label : undefined });
  }
  return c;
}

/** Small PNG data URL of a device symbol, for PDF legends. */
export function symbolDataUrl(t: Pick<DeviceType, "shape" | "color" | "symbol">, size = 48): string {
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  drawSymbol(c.getContext("2d")!, t.shape, size / 2, size / 2, size * 0.36, t.color, t.symbol);
  return c.toDataURL("image/png");
}
