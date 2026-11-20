"use client";
// Small JPEG previews of stored images for job cards and photo grids. A full sheet is up to 4800 px (~20 MB decoded),
// so showing a dozen jobs or a few hundred photos at full size runs an iPad out of memory; a 480 px thumb is ~0.9 MB
// decoded. Thumbs live in the local-only `thumbs` table (never synced) and are made once per image: at import, or the
// first time a card or grid shows an image pulled from another device.
import { db, type StoredThumb } from "./db";

/** Longest side of a job card's sheet preview. */
export const SHEET_THUMB = 480;
/** Longest side of a photo grid tile. */
export const PHOTO_THUMB = 400;
const QUALITY = 0.8;
/** At most this many full-size images decoded at once while making thumbs (memory). */
const CONCURRENCY = 2;

export const thumbId = (imageId: string, maxSide: number) => `${imageId}@${maxSide}`;

/** Size of a thumb that fits in maxSide × maxSide, keeping the aspect ratio and never enlarging. */
export function thumbSize(width: number, height: number, maxSide: number): { width: number; height: number } {
  if (!(width > 0) || !(height > 0)) return { width: maxSide, height: maxSide };
  const k = Math.min(1, maxSide / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * k)), height: Math.max(1, Math.round(height * k)) };
}

function canvasOf(w: number, h: number): OffscreenCanvas | HTMLCanvasElement {
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(w, h);
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

async function toJpeg(c: OffscreenCanvas | HTMLCanvasElement): Promise<Blob> {
  if ("convertToBlob" in c) return c.convertToBlob({ type: "image/jpeg", quality: QUALITY });
  return new Promise((r, j) => c.toBlob((b) => (b ? r(b) : j(new Error("Couldn't make a preview"))), "image/jpeg", QUALITY));
}

/** Draw any image source (bitmap, canvas, img) into a thumb of at most maxSide. */
export async function thumbFromSource(src: CanvasImageSource, width: number, height: number, maxSide: number): Promise<{ blob: Blob; width: number; height: number }> {
  const t = thumbSize(width, height, maxSide);
  const c = canvasOf(t.width, t.height);
  const ctx = c.getContext("2d") as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
  if (!ctx) throw new Error("Couldn't make a preview");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, t.width, t.height);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(src, 0, 0, t.width, t.height);
  const blob = await toJpeg(c);
  c.width = c.height = 0;
  return { blob, ...t };
}

/** Make a thumb from an image blob. Lets the browser decode straight to the small size where it can. */
export async function makeThumb(blob: Blob, maxSide: number, size?: { width: number; height: number }): Promise<{ blob: Blob; width: number; height: number }> {
  if (size && size.width > 0 && size.height > 0) {
    const t = thumbSize(size.width, size.height, maxSide);
    try {
      const bmp = await createImageBitmap(blob, { resizeWidth: t.width, resizeHeight: t.height, resizeQuality: "medium" });
      try {
        // Some browsers ignore the resize options; fall through to drawing it down either way.
        return await thumbFromSource(bmp, bmp.width, bmp.height, maxSide);
      } finally {
        bmp.close();
      }
    } catch {
      /* resize options unsupported: decode at full size below */
    }
  }
  const bmp = await createImageBitmap(blob);
  try {
    return await thumbFromSource(bmp, bmp.width, bmp.height, maxSide);
  } finally {
    bmp.close();
  }
}

export type ThumbMaker = (blob: Blob, maxSide: number, size?: { width: number; height: number }) => Promise<{ blob: Blob; width: number; height: number }>;

/** Store a thumb made elsewhere (e.g. from the canvas a photo import already drew). */
export async function saveThumb(imageId: string, maxSide: number, t: { blob: Blob; width: number; height: number }): Promise<StoredThumb> {
  const row: StoredThumb = { id: thumbId(imageId, maxSide), imageId, ...t };
  await db().thumbs.put(row);
  return row;
}

// A small queue so a grid of 200 photos doesn't decode 200 full-size images at once.
let running = 0;
const waiting: (() => void)[] = [];
async function slot<T>(fn: () => Promise<T>): Promise<T> {
  // A freed slot is handed straight to the next waiter (running stays the same), so a new caller arriving in between
  // can't take it too and push the count past CONCURRENCY.
  if (running >= CONCURRENCY) await new Promise<void>((r) => waiting.push(r));
  else running++;
  try {
    return await fn();
  } finally {
    const next = waiting.shift();
    if (next) next();
    else running--;
  }
}

const inflight = new Map<string, Promise<StoredThumb | null>>();

/**
 * The thumb for a stored image, making and storing it if needed. Null when the image isn't on this device (yet) or
 * can't be decoded (a PDF document, say): callers then show a placeholder.
 */
export function ensureThumb(imageId: string, maxSide: number, make: ThumbMaker = makeThumb): Promise<StoredThumb | null> {
  const id = thumbId(imageId, maxSide);
  const pending = inflight.get(id);
  if (pending) return pending;
  const p = (async () => {
    const hit = await db().thumbs.get(id);
    if (hit) return hit;
    return slot(async () => {
      const rec = await db().images.get(imageId);
      if (!rec || !rec.blob || (rec.mime && !rec.mime.startsWith("image/"))) return null;
      try {
        return await saveThumb(imageId, maxSide, await make(rec.blob, maxSide, { width: rec.width, height: rec.height }));
      } catch {
        return null;
      }
    });
  })().finally(() => inflight.delete(id));
  inflight.set(id, p);
  return p;
}
