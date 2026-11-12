"use client";
import { db } from "./db";
import type { ScanResult } from "./scanParse";
import type { DeviceType, Sheet } from "./types";

/** Claude's vision input is most efficient at ≤1568 px on the long side. */
const MAX_SIDE = 1568;

async function sheetJpeg(sheet: Pick<Sheet, "imageId">): Promise<Blob> {
  const img = await db().images.get(sheet.imageId);
  if (!img) throw new Error("This sheet's image is not on this device yet.");
  const bitmap = await createImageBitmap(img.blob);
  const k = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * k);
  canvas.height = Math.round(bitmap.height * k);
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("Image export failed"))), "image/jpeg", 0.85));
  canvas.width = canvas.height = 0;
  return blob;
}

/**
 * Send a sheet to the server scan route. Relative positions in the result refer to the whole
 * sheet image (downscaling preserves them). mode "title" only reads the floor name.
 */
export async function scanSheet(
  sheet: Pick<Sheet, "imageId">,
  catalog: Pick<DeviceType, "id" | "name" | "symbol" | "category" | "archived">[],
  mode: "full" | "title" = "full",
  signal?: AbortSignal,
): Promise<ScanResult> {
  if (typeof navigator !== "undefined" && !navigator.onLine) throw new Error("You're offline. The AI scan needs a connection; place markers by hand meanwhile.");
  const form = new FormData();
  form.append("image", await sheetJpeg(sheet), "sheet.jpg");
  form.append("mode", mode);
  form.append(
    "catalog",
    JSON.stringify(catalog.filter((d) => !d.archived).map((d) => ({ id: d.id, name: d.name, symbol: d.symbol, category: d.category }))),
  );
  const res = await fetch("/api/scan", { method: "POST", body: form, signal });
  const data = await res.json().catch(() => ({ error: `Scan failed (${res.status})` }));
  if (!res.ok) throw new Error(data.error || `Scan failed (${res.status})`);
  return data as ScanResult;
}
