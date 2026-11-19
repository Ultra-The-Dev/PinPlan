"use client";
// Main-thread side of the sheet image pyramid: opens a sheet's pyramid (preview first, tiles on demand), keeps decoded
// tiles in a small LRU of ImageBitmaps, and serves thumbnails for the sheet browser and minimap. The heavy work runs
// in tile.worker.ts; browsers without OffscreenCanvas fall back to drawing the whole sheet image (as before).
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { db } from "../db";
import { PREVIEW_MAX, TILE_SIZE, THUMB_MAX, pyramidInfo, tileKey, type PyramidInfo } from "../viewport";
import type { WorkerIn, WorkerOut } from "./tile.worker";

export interface Pyramid {
  imageId: string;
  /** Null until the preview is ready. */
  info: PyramidInfo | null;
  preview: CanvasImageSource | null;
  /** Every tile is cached (tiles may still be served before that, straight from the worker). */
  complete: boolean;
  /** Bumped whenever something new can be drawn (preview, a tile, completion). */
  version: number;
}

/** Decoded tiles kept in memory (~1 MB each). */
const MAX_TILES = 160;

type Listener = () => void;

class TileClient {
  private worker: Worker | null = null;
  private workerFailed = false;
  private pyramids = new Map<string, Pyramid>();
  private listeners = new Map<string, Set<Listener>>();
  private tiles = new Map<string, ImageBitmap>();
  private inflight = new Set<string>();
  /** Tiles the worker didn't have yet: asked again when the pyramid completes. */
  private missing = new Set<string>();
  private thumbs = new Map<string, string>();
  private thumbWaiters = new Map<string, Set<Listener>>();
  private wantFull = new Set<string>();
  private retryTimer: ReturnType<typeof setTimeout> | null = null;

  private supported() {
    if (this.workerFailed || typeof window === "undefined") return false;
    return typeof Worker !== "undefined" && typeof OffscreenCanvas !== "undefined" && "transferToImageBitmap" in OffscreenCanvas.prototype && typeof createImageBitmap === "function";
  }

  private getWorker(): Worker | null {
    if (this.worker || !this.supported()) return this.worker;
    try {
      const w = new Worker(new URL("./tile.worker.ts", import.meta.url), { type: "module" });
      w.onmessage = (e: MessageEvent<WorkerOut>) => this.onMessage(e.data);
      w.onerror = () => this.fail();
      this.worker = w;
    } catch {
      this.fail();
    }
    return this.worker;
  }

  /** Worker couldn't start: draw whole images on the main thread from now on. */
  private fail() {
    this.worker?.terminate();
    this.worker = null;
    this.workerFailed = true;
    for (const p of this.pyramids.values()) if (!p.preview) this.fallback(p.imageId);
    for (const id of this.thumbWaiters.keys()) this.fallbackThumb(id);
  }

  private post(m: WorkerIn) {
    this.getWorker()?.postMessage(m);
  }

  /** Something new to draw (a tile): tell the canvases without changing the pyramid (no React render). */
  private notify(imageId: string) {
    this.listeners.get(imageId)?.forEach((l) => l());
  }

  /** The pyramid itself changed (preview, completion): new snapshot for React. */
  private emit(imageId: string) {
    const p = this.pyramids.get(imageId);
    if (p) this.pyramids.set(imageId, { ...p, version: p.version + 1 });
    this.notify(imageId);
  }

  private onMessage(m: WorkerOut) {
    switch (m.type) {
      case "meta": {
        const p = this.pyramids.get(m.imageId) ?? this.blank(m.imageId);
        const info = pyramidInfo(m.width, m.height, TILE_SIZE, PREVIEW_MAX);
        this.pyramids.set(m.imageId, { ...p, info, preview: m.preview, complete: m.complete });
        this.setThumb(m.imageId, m.thumb);
        this.emit(m.imageId);
        break;
      }
      case "need-blob":
        this.sendBlob(m.imageId, m.full);
        break;
      case "tile": {
        const key = tileKey(m.imageId, m.level, m.col, m.row);
        this.inflight.delete(key);
        if (m.bitmap) {
          this.tiles.set(key, m.bitmap);
          this.trim();
          this.notify(m.imageId);
        } else this.missing.add(key);
        break;
      }
      case "complete": {
        const p = this.pyramids.get(m.imageId);
        if (p) this.pyramids.set(m.imageId, { ...p, complete: true });
        for (const k of [...this.missing]) if (k.startsWith(`${m.imageId}/`)) this.missing.delete(k);
        this.emit(m.imageId);
        break;
      }
      case "error":
        console.warn("Sheet tiles:", m.message);
        this.fallback(m.imageId);
        break;
    }
  }

  private blank(imageId: string): Pyramid {
    return { imageId, info: null, preview: null, complete: false, version: 0 };
  }

  private async sendBlob(imageId: string, full: boolean) {
    const rec = await db().images.get(imageId);
    if (!rec) return this.retryLater();
    this.post({ type: "blob", imageId, blob: rec.blob, full, priority: this.listeners.get(imageId)?.size ? 0 : 1 });
  }

  /** The sheet image hasn't downloaded yet: try again in a while (and after the next sync). */
  private retryLater() {
    if (this.retryTimer) return;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      for (const p of this.pyramids.values()) if (!p.preview && this.listeners.get(p.imageId)?.size) this.request(p.imageId);
    }, 2500);
  }

  private request(imageId: string) {
    if (this.supported() && this.getWorker()) this.post({ type: "open", imageId, full: true });
    else this.fallback(imageId);
  }

  /** Whole image as the "preview", no tiles. */
  private async fallback(imageId: string) {
    const rec = await db().images.get(imageId);
    if (!rec) return this.retryLater();
    const url = URL.createObjectURL(rec.blob);
    const img = new Image();
    img.onload = () => {
      const info = { ...pyramidInfo(img.naturalWidth, img.naturalHeight, TILE_SIZE, Infinity) };
      const p = this.pyramids.get(imageId) ?? this.blank(imageId);
      this.pyramids.set(imageId, { ...p, info, preview: img, complete: true });
      this.emit(imageId);
    };
    img.src = url;
  }

  /** Start loading a sheet's pyramid; `listener` runs whenever there's something new to draw. */
  open(imageId: string, listener: Listener): () => void {
    let set = this.listeners.get(imageId);
    if (!set) this.listeners.set(imageId, (set = new Set()));
    set.add(listener);
    if (!this.pyramids.has(imageId)) {
      this.pyramids.set(imageId, this.blank(imageId));
      this.request(imageId);
    } else if (!this.wantFull.has(imageId) && !this.pyramids.get(imageId)!.complete) this.request(imageId);
    this.wantFull.add(imageId);
    return () => {
      set!.delete(listener);
    };
  }

  /** Build (and cache) a sheet's tiles in the background, e.g. the next sheet. */
  prefetch(imageId: string) {
    if (this.pyramids.get(imageId)?.complete || this.wantFull.has(imageId) || !this.supported()) return;
    this.wantFull.add(imageId);
    if (!this.pyramids.has(imageId)) this.pyramids.set(imageId, this.blank(imageId));
    this.post({ type: "open", imageId, full: true });
  }

  get(imageId: string): Pyramid | undefined {
    return this.pyramids.get(imageId);
  }

  /** A loaded tile, or undefined (and it's requested, unless `request` is false). */
  tile(imageId: string, level: number, col: number, row: number, request = true): ImageBitmap | undefined {
    const key = tileKey(imageId, level, col, row);
    const t = this.tiles.get(key);
    if (t) {
      // LRU: most recently drawn last.
      this.tiles.delete(key);
      this.tiles.set(key, t);
      return t;
    }
    if (request && !this.inflight.has(key) && !this.missing.has(key) && this.worker) {
      this.inflight.add(key);
      this.post({ type: "tile", imageId, level, col, row });
    }
    return undefined;
  }

  private trim() {
    while (this.tiles.size > MAX_TILES) {
      const [k, bmp] = this.tiles.entries().next().value as [string, ImageBitmap];
      this.tiles.delete(k);
      bmp.close();
    }
  }

  // ---------------- thumbnails ----------------

  private setThumb(imageId: string, blob: Blob) {
    if (this.thumbs.has(imageId)) return;
    this.thumbs.set(imageId, URL.createObjectURL(blob));
    this.thumbWaiters.get(imageId)?.forEach((l) => l());
  }

  private async fallbackThumb(imageId: string) {
    const rec = await db().images.get(imageId);
    if (!rec || this.thumbs.has(imageId)) return;
    const bmp = await createImageBitmap(rec.blob).catch(() => null);
    if (!bmp) return;
    const k = Math.min(1, THUMB_MAX / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * k);
    c.height = Math.round(bmp.height * k);
    const ctx = c.getContext("2d")!;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bmp, 0, 0, c.width, c.height);
    bmp.close();
    c.toBlob((b) => b && this.setThumb(imageId, b), "image/jpeg", 0.8);
  }

  thumbUrl(imageId: string): string | null {
    return this.thumbs.get(imageId) ?? null;
  }

  watchThumb(imageId: string, l: Listener): () => void {
    let set = this.thumbWaiters.get(imageId);
    if (!set) this.thumbWaiters.set(imageId, (set = new Set()));
    set.add(l);
    if (!this.thumbs.has(imageId)) {
      if (this.supported() && this.getWorker()) this.post({ type: "open", imageId, full: false });
      else this.fallbackThumb(imageId);
    }
    return () => set!.delete(l);
  }
}

let client: TileClient | null = null;
export function tileClient(): TileClient {
  if (!client) client = new TileClient();
  return client;
}

/** The pyramid of a sheet image, re-rendering when it changes (preview loaded, new tiles). */
export function usePyramid(imageId: string | null | undefined): Pyramid | null {
  const subscribe = useCallback((l: Listener) => (imageId ? tileClient().open(imageId, l) : () => undefined), [imageId]);
  const snap = useCallback(() => (imageId ? (tileClient().get(imageId) ?? null) : null), [imageId]);
  return useSyncExternalStore(subscribe, snap, () => null);
}

/** Object URL of a sheet's small thumbnail (built from the pyramid; cached in IndexedDB). */
export function useSheetThumb(imageId: string | null | undefined): string | null {
  const [, bump] = useState(0);
  useEffect(() => {
    if (!imageId) return;
    return tileClient().watchThumb(imageId, () => bump((n) => n + 1));
  }, [imageId]);
  return imageId ? tileClient().thumbUrl(imageId) : null;
}
