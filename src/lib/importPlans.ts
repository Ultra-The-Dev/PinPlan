"use client";
// Plan import: PDF pages -> sheet images (PDF.js), photos -> straightened sheet images.

/** Keep canvases under iPad Safari's ~16.7M pixel limit while staying sharp. */
const MAX_SIDE = 4800;
const MAX_PIXELS = 16_000_000;

export interface RenderedPage {
  blob: Blob;
  width: number;
  height: number;
  pageNumber: number;
  /** Image pixels per paper inch (PDF user space is 72 units/inch). */
  pxPerInch: number;
  /** Text found on the page (title-block hint for naming). */
  text: string;
  /**
   * Positioned text (relative 0–1 boxes, y from the top) for the sheet index and callout links. Transient: used during
   * import and not stored. Empty for scanned PDFs.
   */
  items?: PageTextItem[];
}

/** One text run on a page: a relative 0–1 box (y measured from the top of the page). */
export interface PageTextItem {
  str: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * The relative box of a PDF.js text item: its text-space rect (baseline origin, advance `width` along the text
 * direction, `height` up) mapped through the viewport transform, then divided by the viewport size. Handles rotated
 * pages and vertical text by taking the bounding box of the four mapped corners. Pure (tested).
 */
export function textItemBox(
  item: { transform: number[]; width: number; height: number },
  vpTransform: number[],
  vpWidth: number,
  vpHeight: number,
): { x: number; y: number; w: number; h: number } {
  const [a, b, c, d, e, f] = item.transform;
  const along = Math.hypot(a, b) || 1;
  const upLen = Math.hypot(c, d) || 1;
  const h = item.height || upLen;
  const dir = { x: a / along, y: b / along };
  const up = { x: c / upLen, y: d / upLen };
  const corners = [
    { x: e, y: f },
    { x: e + dir.x * item.width, y: f + dir.y * item.width },
    { x: e + up.x * h, y: f + up.y * h },
    { x: e + dir.x * item.width + up.x * h, y: f + dir.y * item.width + up.y * h },
  ];
  const [m0, m1, m2, m3, m4, m5] = vpTransform;
  const xs = corners.map((p) => m0 * p.x + m2 * p.y + m4);
  const ys = corners.map((p) => m1 * p.x + m3 * p.y + m5);
  const x0 = Math.min(...xs);
  const y0 = Math.min(...ys);
  return { x: x0 / vpWidth, y: y0 / vpHeight, w: (Math.max(...xs) - x0) / vpWidth, h: (Math.max(...ys) - y0) / vpHeight };
}

/** Positioned text runs of a PDF.js text content, relative to the viewport. Blank runs are dropped. */
export function pageTextItems(
  content: { items: unknown[] },
  viewport: { transform: number[]; width: number; height: number },
): PageTextItem[] {
  const out: PageTextItem[] = [];
  for (const it of content.items as { str?: string; transform?: number[]; width?: number; height?: number }[]) {
    if (typeof it.str !== "string" || !it.str.trim() || !Array.isArray(it.transform)) continue;
    const box = textItemBox({ transform: it.transform, width: it.width ?? 0, height: it.height ?? 0 }, viewport.transform, viewport.width, viewport.height);
    if (![box.x, box.y, box.w, box.h].every(Number.isFinite)) continue;
    out.push({ str: it.str, ...box });
  }
  return out;
}

/** The PDF.js module with its worker set up (shared by plan import and the sheet index text pass). */
export async function loadPdfjs() {
  return pdfjs();
}

async function pdfjs() {
  const lib = await import("pdfjs-dist");
  // Versioned file name (scripts/copy-pdf-worker.mjs) so a cached worker always matches the library.
  lib.GlobalWorkerOptions.workerSrc = `/pdf.worker.${lib.version}.min.mjs`;
  return lib;
}

export async function renderPdf(file: File | Blob, onProgress?: (done: number, total: number) => void): Promise<RenderedPage[]> {
  const lib = await pdfjs();
  const data = new Uint8Array(await file.arrayBuffer());
  const task = lib.getDocument({ data });
  const doc = await task.promise;
  const pages: RenderedPage[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const base = page.getViewport({ scale: 1 });
    const scale = Math.min(MAX_SIDE / Math.max(base.width, base.height), Math.sqrt(MAX_PIXELS / (base.width * base.height)), 6);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvas, canvasContext: ctx, viewport }).promise;
    let text = "";
    let items: PageTextItem[] = [];
    try {
      const tc = await page.getTextContent();
      text = tc.items.map((it) => ("str" in it ? it.str : "")).join(" ").replace(/\s+/g, " ").trim();
      items = pageTextItems(tc, viewport);
    } catch {
      /* scanned PDFs have no text layer */
    }
    const blob = await canvasToBlob(canvas, "image/jpeg", 0.9);
    pages.push({ blob, width: canvas.width, height: canvas.height, pageNumber: i, pxPerInch: 72 * scale, text, items });
    canvas.width = canvas.height = 0;
    page.cleanup();
    onProgress?.(i, doc.numPages);
  }
  await task.destroy();
  return pages;
}

/** Guess a floor name from a page's text layer, e.g. "ATTIC", "1ST. FL", "CELLAR". */
export function guessFloorName(text: string, fallback: string): string {
  const t = text.toUpperCase();
  const patterns: [RegExp, string][] = [
    [/\bATTIC\b/, "Attic"],
    [/\bCELLAR\b/, "Cellar"],
    [/\bBASEMENT\b/, "Basement"],
    [/\b(1ST|FIRST)\.?\s*(FL|FLOOR)\b/, "1st Fl"],
    [/\b(2ND|SECOND)\.?\s*(FL|FLOOR)\b/, "2nd Fl"],
    [/\b(3RD|THIRD)\.?\s*(FL|FLOOR)\b/, "3rd Fl"],
    [/\bGROUND\s*(FL|FLOOR)\b/, "Ground Fl"],
    [/\bROOF\b/, "Roof"],
    [/\bSITE\s*PLAN\b/, "Site plan"],
  ];
  // A sheet title ("2ND FLOOR PLAN", "ATTIC PLAN") beats a passing mention in the notes ("ATTIC ACCESS", "STAIRS TO BASEMENT").
  // Patterns that already end in PLAN ("SITE PLAN") are titles as they stand.
  const title = (re: RegExp) => (/PLAN\\b$/.test(re.source) ? re : new RegExp(`${re.source}\\.?\\s*(?:FLOOR\\s*)?PLAN\\b`));
  for (const [re, name] of patterns) if (title(re).test(t)) return name;
  for (const [re, name] of patterns) if (re.test(t)) return name;
  return fallback;
}

export function canvasToBlob(canvas: HTMLCanvasElement, type = "image/jpeg", quality = 0.9): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Canvas export failed"))), type, quality));
}

/** Decode a photo (JPG/PNG/HEIC) into an image element. HEIC is converted when the browser can't decode it. */
export async function loadPhoto(file: File): Promise<HTMLImageElement> {
  let blob: Blob = file;
  const isHeic = /hei[cf]$/i.test(file.name) || /hei[cf]/i.test(file.type);
  try {
    return await blobToImage(blob);
  } catch (e) {
    if (!isHeic) throw e;
    const heic2any = (await import("heic2any")).default;
    const out = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.92 });
    blob = Array.isArray(out) ? out[0] : out;
    return blobToImage(blob);
  }
}

export function blobToImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not decode image"));
    };
    img.src = url;
  });
}
