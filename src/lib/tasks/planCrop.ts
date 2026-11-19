// A square of the plan around a task's pin, with the pin drawn on top (for the task report PDF).
// cropRect is pure (tested); cropPlanAroundPin needs a browser canvas.

/** The source square (image px) to cut around a pin at relative (x, y), kept inside the image, and where the pin lands in it (0–1). */
export function cropRect(width: number, height: number, x: number, y: number, span = 600): { sx: number; sy: number; side: number; pinX: number; pinY: number } {
  const side = Math.max(1, Math.min(span, width, height));
  const px = x * width;
  const py = y * height;
  const sx = Math.max(0, Math.min(width - side, px - side / 2));
  const sy = Math.max(0, Math.min(height - side, py - side / 2));
  return { sx, sy, side, pinX: (px - sx) / side, pinY: (py - sy) / side };
}

/** Draw a teardrop pin with its tip at (x, y) (same shape as on the plan). */
export function drawPin(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, label?: string) {
  const L = r * 1.9;
  const a = Math.acos(r / L);
  ctx.save();
  ctx.translate(x, y);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.arc(0, -L, r, Math.PI / 2 + a, Math.PI / 2 - a + Math.PI * 2);
  ctx.closePath();
  ctx.shadowColor = "rgba(0,0,0,0.35)";
  ctx.shadowBlur = r * 0.4;
  ctx.shadowOffsetY = r * 0.1;
  ctx.fillStyle = color;
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.lineWidth = Math.max(1.5, r * 0.14);
  ctx.strokeStyle = "#fff";
  ctx.stroke();
  if (label) {
    ctx.fillStyle = "#fff";
    ctx.font = `bold ${Math.round(r * (label.length > 3 ? 0.62 : 0.8))}px Helvetica, Arial, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, 0, -L + 0.5);
  }
  ctx.restore();
}

/** JPEG data URL of an `out`-px square of the plan image around (x, y), with the pin drawn on top. */
export async function cropPlanAroundPin(image: Blob, x: number, y: number, opts: { color: string; label?: string; span?: number; out?: number }): Promise<string> {
  const bmp = await createImageBitmap(image);
  try {
    const out = opts.out ?? 600;
    const r = cropRect(bmp.width, bmp.height, x, y, opts.span ?? 600);
    const c = document.createElement("canvas");
    c.width = out;
    c.height = out;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, out, out);
    ctx.drawImage(bmp, r.sx, r.sy, r.side, r.side, 0, 0, out, out);
    drawPin(ctx, r.pinX * out, r.pinY * out, out * 0.065, opts.color, opts.label);
    ctx.strokeStyle = "#cbd5e1";
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, out - 2, out - 2);
    return c.toDataURL("image/jpeg", 0.82);
  } finally {
    bmp.close();
  }
}
