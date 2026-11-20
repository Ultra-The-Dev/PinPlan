"use client";
// On-device text recognition for pages with no text layer (scanned PDFs, photos), used only to name sheets: the
// title-block corner first, then a downscaled whole page. The engine is Tesseract.js (Apache-2.0), self-hosted in
// public/vendor (see its README) and loaded the first time a page needs it, in a Web Worker. Nothing leaves the
// device; no AI service is involved. When the files are missing or the browser can't run it, callers get null.
import { findFloorName, type FloorTextItem } from "./floorName";

/** Self-hosted engine files (scripts/vendor-ocr.mjs downloads and verifies them). */
export const OCR_BASE = "/vendor/tesseract-7.0.0";
export const OCR_FILES = {
  lib: `${OCR_BASE}/tesseract.min.js`,
  worker: `${OCR_BASE}/worker.min.js`,
  core: `${OCR_BASE}/tesseract-core-simd-lstm.wasm.js`,
  lang: `${OCR_BASE}/lang`,
};

interface TessLine {
  text: string;
  confidence: number;
  bbox: { x0: number; y0: number; x1: number; y1: number };
}
interface TessResult {
  data: { text: string; blocks: { paragraphs: { lines: TessLine[] }[] }[] | null };
}
interface TessWorker {
  recognize(image: HTMLCanvasElement, opts?: object, output?: object): Promise<TessResult>;
  setParameters(p: Record<string, string>): Promise<unknown>;
  terminate(): Promise<unknown>;
}
interface TessLib {
  createWorker(lang: string, oem: number, options: object): Promise<TessWorker>;
}

export interface OcrProgress {
  /** "loading" while the engine and English data load (first time: ~7 MB), "reading" while a page is read. */
  phase: "loading" | "reading";
  /** 0–1 within the phase. */
  progress: number;
}

/** Raised when a read was cancelled (the worker is stopped; the next read starts a fresh one). */
export class OcrCancelled extends Error {
  constructor() {
    super("Cancelled");
    this.name = "OcrCancelled";
  }
}

let libPromise: Promise<TessLib> | null = null;
let workerPromise: Promise<TessWorker> | null = null;
let listener: ((p: OcrProgress) => void) | null = null;
/** Set once the engine failed to load (files missing, no WebAssembly SIMD): don't try again this session. */
let unavailable: string | null = null;

function loadLib(): Promise<TessLib> {
  if (libPromise) return libPromise;
  libPromise = new Promise<TessLib>((resolve, reject) => {
    const w = window as unknown as { Tesseract?: TessLib };
    if (w.Tesseract) return resolve(w.Tesseract);
    const s = document.createElement("script");
    s.src = OCR_FILES.lib;
    s.async = true;
    s.onload = () => (w.Tesseract ? resolve(w.Tesseract) : reject(new Error("OCR engine didn't start")));
    s.onerror = () => reject(new Error("OCR engine files are missing"));
    document.head.appendChild(s);
  }).catch((e) => {
    libPromise = null;
    throw e;
  });
  return libPromise;
}

const abs = (p: string) => new URL(p, window.location.href).href;

function getWorker(): Promise<TessWorker> {
  if (workerPromise) return workerPromise;
  workerPromise = (async () => {
    const lib = await loadLib();
    const worker = await lib.createWorker("eng", 1 /* LSTM only */, {
      workerPath: abs(OCR_FILES.worker),
      corePath: abs(OCR_FILES.core),
      langPath: abs(OCR_FILES.lang),
      // Load the worker from our origin (not a blob:) so the service worker can serve it offline.
      workerBlobURL: false,
      gzip: true,
      logger: (m: { status?: string; progress?: number }) => {
        const loading = !/recogniz/i.test(m.status ?? "");
        listener?.({ phase: loading ? "loading" : "reading", progress: m.progress ?? 0 });
      },
    });
    // Title blocks: sparse text, so let it find lines anywhere in the crop.
    // A fixed DPI also keeps Tesseract from logging "Estimating resolution" as an error on every read.
    await worker.setParameters({ tessedit_pageseg_mode: "11", user_defined_dpi: "200" });
    return worker;
  })().catch((e) => {
    workerPromise = null;
    unavailable = e instanceof Error ? e.message : String(e);
    throw e;
  });
  return workerPromise;
}

/** Stop the engine (cancels a read in progress). */
export async function stopOcr(): Promise<void> {
  const w = workerPromise;
  workerPromise = null;
  if (w) await w.then((x) => x.terminate()).catch(() => undefined);
}

/** Why OCR can't run here, or null when it may (it is only known for sure after the first try). */
export function ocrUnavailableReason(): string | null {
  return unavailable;
}

/** True when the engine files are on this server (a quick HEAD request; cached by the browser afterwards). */
export async function ocrInstalled(): Promise<boolean> {
  try {
    const r = await fetch(OCR_FILES.lib, { method: "HEAD" });
    return r.ok;
  } catch {
    return false;
  }
}

/** A region of a canvas (relative 0–1), copied out and scaled so its longest side is at most `maxSide` px. */
function crop(src: HTMLCanvasElement, r: { x: number; y: number; w: number; h: number }, maxSide: number): HTMLCanvasElement {
  const sx = Math.round(r.x * src.width);
  const sy = Math.round(r.y * src.height);
  const sw = Math.max(1, Math.round(r.w * src.width));
  const sh = Math.max(1, Math.round(r.h * src.height));
  const k = Math.min(1, maxSide / Math.max(sw, sh));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(sw * k));
  c.height = Math.max(1, Math.round(sh * k));
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(src, sx, sy, sw, sh, 0, 0, c.width, c.height);
  return c;
}

/** Read the lines of text in a region of a page; boxes come back relative to the whole page. */
async function readRegion(page: HTMLCanvasElement, r: { x: number; y: number; w: number; h: number }, maxSide: number, signal?: AbortSignal): Promise<FloorTextItem[]> {
  if (signal?.aborted) throw new OcrCancelled();
  const worker = await getWorker();
  const c = crop(page, r, maxSide);
  const onAbort = () => void stopOcr();
  signal?.addEventListener("abort", onAbort, { once: true });
  try {
    const res = await worker.recognize(c, {}, { blocks: true, text: false });
    if (signal?.aborted) throw new OcrCancelled();
    const out: FloorTextItem[] = [];
    for (const b of res.data.blocks ?? [])
      for (const p of b.paragraphs)
        for (const l of p.lines) {
          const str = l.text.replace(/\s+/g, " ").trim();
          if (!str || l.confidence < 40) continue;
          out.push({
            str,
            x: r.x + (l.bbox.x0 / c.width) * r.w,
            y: r.y + (l.bbox.y0 / c.height) * r.h,
            w: ((l.bbox.x1 - l.bbox.x0) / c.width) * r.w,
            h: ((l.bbox.y1 - l.bbox.y0) / c.height) * r.h,
          });
        }
    return out;
  } catch (e) {
    if (signal?.aborted) throw new OcrCancelled();
    throw e;
  } finally {
    signal?.removeEventListener("abort", onAbort);
    c.width = c.height = 0;
  }
}

export interface OcrFloorResult {
  /** The floor name read, or null. */
  name: string | null;
  /** Lines read (relative to the page), for the sheet number / title proposals. */
  items: FloorTextItem[];
}

/**
 * Read a page image's floor name: the title-block corner (bottom-right 38%) at full detail first, then the whole page
 * downscaled. Resolves null when OCR isn't available here (files missing, old browser);
 * rejects with OcrCancelled when `signal` aborts.
 */
export async function ocrFloorName(page: HTMLCanvasElement, opts: { signal?: AbortSignal; onProgress?: (p: OcrProgress) => void } = {}): Promise<OcrFloorResult | null> {
  if (unavailable) return null;
  listener = opts.onProgress ?? null;
  try {
    const corner = await readRegion(page, { x: 0.62, y: 0.62, w: 0.38, h: 0.38 }, 1800, opts.signal);
    let found = findFloorName(corner);
    if (found) return { name: found.name, items: corner };
    const whole = await readRegion(page, { x: 0, y: 0, w: 1, h: 1 }, 2200, opts.signal);
    // The corner's lines are sharper: keep them, and add the rest of the page.
    const items = [...corner, ...whole.filter((w) => !(w.x >= 0.62 && w.y >= 0.62))];
    found = findFloorName(items);
    return { name: found?.name ?? null, items };
  } catch (e) {
    if (e instanceof OcrCancelled) throw e;
    console.warn("OCR unavailable:", e);
    return null;
  } finally {
    listener = null;
  }
}
