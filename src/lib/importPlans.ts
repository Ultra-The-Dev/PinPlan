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
}

async function pdfjs() {
  const lib = await import("pdfjs-dist");
  lib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
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
    try {
      const tc = await page.getTextContent();
      text = tc.items.map((it) => ("str" in it ? it.str : "")).join(" ").replace(/\s+/g, " ").trim();
    } catch {
      /* scanned PDFs have no text layer */
    }
    const blob = await canvasToBlob(canvas, "image/jpeg", 0.9);
    pages.push({ blob, width: canvas.width, height: canvas.height, pageNumber: i, pxPerInch: 72 * scale, text });
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
