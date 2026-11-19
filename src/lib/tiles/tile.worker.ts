// Tile worker: turns a sheet image into a multi-resolution pyramid off the main thread — a ≤2048 px preview, a
// thumbnail, and 512 px tiles for every finer level — caches it all in IndexedDB (tileDb.ts) and hands tiles to the
// viewer as ImageBitmaps. A tile asked for while a pyramid is still being built is cut right away from the in-memory
// level instead of waiting its turn.
import { PREVIEW_MAX, THUMB_MAX, TILE_SIZE, pyramidInfo, tileKey, tileSourceRect, type PyramidInfo } from "../viewport";
import { getMeta, getTileBlob, prunePyramids, putMeta, putTileBlobs, type PyramidMeta } from "./tileDb";

export type WorkerIn =
  | { type: "open"; imageId: string; full: boolean }
  | { type: "blob"; imageId: string; blob: Blob; full: boolean; priority: number }
  | { type: "tile"; imageId: string; level: number; col: number; row: number };

export type WorkerOut =
  | { type: "meta"; imageId: string; width: number; height: number; preview: ImageBitmap; thumb: Blob; complete: boolean }
  | { type: "need-blob"; imageId: string; full: boolean }
  | { type: "tile"; imageId: string; level: number; col: number; row: number; bitmap: ImageBitmap | null }
  | { type: "complete"; imageId: string }
  | { type: "error"; imageId: string; message: string };

type Src = ImageBitmap | OffscreenCanvas;

interface Build {
  info: PyramidInfo;
  /** Level images, finest first (level 0 is the decoded image itself). Null once the build is done. */
  levels: Src[] | null;
}

const scope = self as unknown as { postMessage(m: WorkerOut, transfer?: Transferable[]): void; onmessage: ((e: MessageEvent<WorkerIn>) => void) | null };
const post = (m: WorkerOut, transfer: Transferable[] = []) => scope.postMessage(m, transfer);

const building = new Map<string, Build>();
const queue: { imageId: string; blob: Blob; full: boolean; priority: number }[] = [];
let running = false;
/** Images whose running build makes tiles. */
const runningFull = new Set<string>();
/** A build that covers this request is already queued or running. */
const pending = (imageId: string, full: boolean) =>
  runningFull.has(imageId) || queue.some((q) => q.imageId === imageId && (q.full || !full)) || (!full && building.has(imageId));

function canvas(w: number, h: number) {
  const c = new OffscreenCanvas(Math.max(1, w), Math.max(1, h));
  const ctx = c.getContext("2d")!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  return { c, ctx };
}

/** Downscale in halving steps (sharper than one big jump), finishing at exactly w × h. */
function resize(src: Src, w: number, h: number): OffscreenCanvas {
  let cur: Src = src;
  let cw = src.width;
  let ch = src.height;
  while (cw / 2 >= w * 1.0001 && ch / 2 >= h) {
    const { c, ctx } = canvas(Math.round(cw / 2), Math.round(ch / 2));
    ctx.drawImage(cur, 0, 0, c.width, c.height);
    cur = c;
    cw = c.width;
    ch = c.height;
  }
  const { c, ctx } = canvas(w, h);
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(cur, 0, 0, w, h);
  return c;
}

function cut(info: PyramidInfo, src: Src, level: number, col: number, row: number): OffscreenCanvas {
  const r = tileSourceRect(info, level, col, row);
  const { c, ctx } = canvas(r.w, r.h);
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, r.w, r.h);
  ctx.drawImage(src, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
  return c;
}

const jpeg = (c: OffscreenCanvas, quality = 0.86) => c.convertToBlob({ type: "image/jpeg", quality });

async function open(imageId: string, full: boolean) {
  const meta = await getMeta(imageId).catch(() => undefined);
  if (meta) {
    const preview = await createImageBitmap(meta.preview);
    post({ type: "meta", imageId, width: meta.width, height: meta.height, preview, thumb: meta.thumb, complete: meta.complete }, [preview]);
    putMeta({ ...meta, usedAt: Date.now() }).catch(() => undefined);
    if (full && !meta.complete && !pending(imageId, true)) post({ type: "need-blob", imageId, full });
    return;
  }
  if (!pending(imageId, full)) post({ type: "need-blob", imageId, full });
}

async function build(job: { imageId: string; blob: Blob; full: boolean }) {
  const { imageId, full } = job;
  const existing = await getMeta(imageId).catch(() => undefined);
  if (existing?.complete || (existing && !full)) return;
  const bmp = await createImageBitmap(job.blob);
  const info = pyramidInfo(bmp.width, bmp.height, TILE_SIZE, PREVIEW_MAX);
  const levels: Src[] = [bmp];
  for (let i = 1; i < info.levels.length; i++) {
    const L = info.levels[i];
    const { c, ctx } = canvas(L.width, L.height);
    ctx.drawImage(levels[i - 1], 0, 0, L.width, L.height);
    levels.push(c);
  }
  const b: Build = { info, levels };
  building.set(imageId, b);
  try {
    let meta = existing;
    if (!meta) {
      // Preview from the coarsest level (cheaper and just as sharp), thumbnail from the preview.
      const preview = info.previewScale >= 1 ? resize(bmp, bmp.width, bmp.height) : resize(levels[levels.length - 1], info.previewWidth, info.previewHeight);
      const ts = Math.min(1, THUMB_MAX / Math.max(preview.width, preview.height));
      const thumb = resize(preview, Math.round(preview.width * ts), Math.round(preview.height * ts));
      const [previewBlob, thumbBlob] = await Promise.all([jpeg(preview, 0.88), jpeg(thumb, 0.8)]);
      meta = { imageId, width: bmp.width, height: bmp.height, tileSize: info.tileSize, previewMax: PREVIEW_MAX, preview: previewBlob, thumb: thumbBlob, complete: !info.levels.length, usedAt: Date.now() };
      await putMeta(meta);
      const pv = preview.transferToImageBitmap();
      post({ type: "meta", imageId, width: bmp.width, height: bmp.height, preview: pv, thumb: thumbBlob, complete: meta.complete }, [pv]);
    }
    if (!full || meta.complete) return;
    // Coarse levels first: they cover the screen at fit-to-sheet zoom, where a sheet usually opens.
    for (let level = info.levels.length - 1; level >= 0; level--) {
      const L = info.levels[level];
      let batch: [string, Blob][] = [];
      for (let row = 0; row < L.rows; row++)
        for (let col = 0; col < L.cols; col++) {
          batch.push([tileKey(imageId, level, col, row), await jpeg(cut(info, levels[level], level, col, row))]);
          if (batch.length >= 12) {
            await putTileBlobs(batch);
            batch = [];
          }
        }
      await putTileBlobs(batch);
    }
    await putMeta({ ...meta, complete: true, usedAt: Date.now() });
    post({ type: "complete", imageId });
    prunePyramids().catch(() => undefined);
  } finally {
    building.delete(imageId);
    b.levels = null;
    bmp.close();
  }
}

async function pump() {
  if (running) return;
  running = true;
  try {
    while (queue.length) {
      queue.sort((a, b) => a.priority - b.priority);
      const job = queue.shift()!;
      if (job.full) runningFull.add(job.imageId);
      try {
        await build(job);
      } catch (e) {
        post({ type: "error", imageId: job.imageId, message: e instanceof Error ? e.message : String(e) });
      } finally {
        runningFull.delete(job.imageId);
      }
    }
  } finally {
    running = false;
  }
}

async function tile(imageId: string, level: number, col: number, row: number) {
  const b = building.get(imageId);
  if (b?.levels && b.info.levels[level]) {
    const bitmap = cut(b.info, b.levels[level], level, col, row).transferToImageBitmap();
    post({ type: "tile", imageId, level, col, row, bitmap }, [bitmap]);
    return;
  }
  const blob = await getTileBlob(tileKey(imageId, level, col, row)).catch(() => undefined);
  const bitmap = blob ? await createImageBitmap(blob) : null;
  post({ type: "tile", imageId, level, col, row, bitmap }, bitmap ? [bitmap] : []);
}

scope.onmessage = (e) => {
  const m = e.data;
  if (m.type === "open") open(m.imageId, m.full).catch((err) => post({ type: "error", imageId: m.imageId, message: String(err) }));
  else if (m.type === "blob") {
    const q = queue.find((j) => j.imageId === m.imageId);
    if (q) {
      q.priority = Math.min(q.priority, m.priority);
      q.full = q.full || m.full;
    } else queue.push({ imageId: m.imageId, blob: m.blob, full: m.full, priority: m.priority });
    pump();
  } else if (m.type === "tile") tile(m.imageId, m.level, m.col, m.row).catch(() => post({ type: "tile", imageId: m.imageId, level: m.level, col: m.col, row: m.row, bitmap: null }));
};

export type { PyramidMeta };
