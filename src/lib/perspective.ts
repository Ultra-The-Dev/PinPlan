"use client";
// Perspective correction for phone photos of plans: a 4-corner warp done in plain JS
// (works offline), plus optional automatic page-edge detection with OpenCV.js.

export type Pt = { x: number; y: number };

/** Solve the 3x3 homography mapping src[i] -> dst[i] (4 point pairs). */
export function homography(src: Pt[], dst: Pt[]): number[] {
  const A: number[][] = [];
  const b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = src[i];
    const { x: u, y: v } = dst[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    b.push(v);
  }
  const h = solve(A, b);
  return [...h, 1];
}

function solve(A: number[][], b: number[]): number[] {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    const piv = M[c][c] || 1e-12;
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r][c] / piv;
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  return M.map((row, i) => row[n] / (row[i] || 1e-12));
}

/** Order 4 points as top-left, top-right, bottom-right, bottom-left. */
export function orderCorners(pts: Pt[]): Pt[] {
  const s = [...pts].sort((a, b) => a.x + a.y - (b.x + b.y));
  const tl = s[0];
  const br = s[3];
  const rest = [s[1], s[2]].sort((a, b) => a.x - a.y - (b.x - b.y));
  return [tl, rest[1], br, rest[0]];
}

const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * Warp the quadrilateral `corners` (TL, TR, BR, BL in image px) of `img` into a flat rectangle.
 * Uses inverse mapping with bilinear sampling. Output is capped to maxSide.
 */
export function warpToRect(img: HTMLImageElement | HTMLCanvasElement, corners: Pt[], maxSide = 4000): HTMLCanvasElement {
  const [tl, tr, br, bl] = corners;
  let w = Math.max(dist(tl, tr), dist(bl, br));
  let h = Math.max(dist(tl, bl), dist(tr, br));
  const k = Math.min(1, maxSide / Math.max(w, h));
  w = Math.round(w * k);
  h = Math.round(h * k);

  const sw = img instanceof HTMLImageElement ? img.naturalWidth : img.width;
  const sh = img instanceof HTMLImageElement ? img.naturalHeight : img.height;
  const srcCanvas = document.createElement("canvas");
  srcCanvas.width = sw;
  srcCanvas.height = sh;
  const sctx = srcCanvas.getContext("2d")!;
  sctx.drawImage(img, 0, 0);
  const src = sctx.getImageData(0, 0, sw, sh).data;

  // Map destination -> source.
  const H = homography(
    [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }],
    [tl, tr, br, bl],
  );
  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  const octx = out.getContext("2d")!;
  const dst = octx.createImageData(w, h);
  const d = dst.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const den = H[6] * x + H[7] * y + H[8];
      const sx = (H[0] * x + H[1] * y + H[2]) / den;
      const sy = (H[3] * x + H[4] * y + H[5]) / den;
      const o = (y * w + x) * 4;
      if (sx < 0 || sy < 0 || sx >= sw - 1 || sy >= sh - 1) {
        d[o] = d[o + 1] = d[o + 2] = 255;
        d[o + 3] = 255;
        continue;
      }
      const x0 = sx | 0;
      const y0 = sy | 0;
      const fx = sx - x0;
      const fy = sy - y0;
      const i00 = (y0 * sw + x0) * 4;
      const i10 = i00 + 4;
      const i01 = i00 + sw * 4;
      const i11 = i01 + 4;
      for (let c = 0; c < 3; c++) {
        const top = src[i00 + c] * (1 - fx) + src[i10 + c] * fx;
        const bot = src[i01 + c] * (1 - fx) + src[i11 + c] * fx;
        d[o + c] = top * (1 - fy) + bot * fy;
      }
      d[o + 3] = 255;
    }
  }
  octx.putImageData(dst, 0, 0);
  srcCanvas.width = srcCanvas.height = 0;
  return out;
}

// ---- OpenCV.js page detection (optional; loaded on demand) ----

const OPENCV_URL = "https://docs.opencv.org/4.10.0/opencv.js";

type CV = {
  Mat: new () => CvMat;
  MatVector: new () => { size(): number; get(i: number): CvMat; delete(): void };
  Size: new (w: number, h: number) => unknown;
  imread(el: HTMLCanvasElement): CvMat;
  cvtColor(a: CvMat, b: CvMat, code: number): void;
  GaussianBlur(a: CvMat, b: CvMat, s: unknown, sigma: number): void;
  Canny(a: CvMat, b: CvMat, t1: number, t2: number): void;
  dilate(a: CvMat, b: CvMat, k: CvMat): void;
  findContours(a: CvMat, c: unknown, h: CvMat, mode: number, method: number): void;
  contourArea(c: CvMat): number;
  arcLength(c: CvMat, closed: boolean): number;
  approxPolyDP(c: CvMat, out: CvMat, eps: number, closed: boolean): void;
  ones(r: number, c: number, t: number): CvMat;
  COLOR_RGBA2GRAY: number;
  RETR_EXTERNAL: number;
  CHAIN_APPROX_SIMPLE: number;
  CV_8U: number;
  onRuntimeInitialized?: () => void;
};
type CvMat = { rows: number; data32S: Int32Array; delete(): void };

let cvPromise: Promise<CV> | null = null;
function loadOpenCV(): Promise<CV> {
  if (cvPromise) return cvPromise;
  cvPromise = new Promise((resolve, reject) => {
    const w = window as unknown as { cv?: CV & { then?: unknown } };
    const finish = () => {
      const cv = w.cv!;
      if ((cv as { Mat?: unknown }).Mat) resolve(cv);
      else cv.onRuntimeInitialized = () => resolve(cv);
    };
    if (w.cv) return finish();
    const s = document.createElement("script");
    s.src = OPENCV_URL;
    s.async = true;
    s.onload = finish;
    s.onerror = () => {
      cvPromise = null;
      reject(new Error("Could not load OpenCV.js (offline?). Adjust the corners by hand."));
    };
    document.head.appendChild(s);
  });
  return cvPromise;
}

/** Find the page outline in a photo. Returns 4 corners in image px, or null. */
export async function detectPageCorners(img: HTMLImageElement): Promise<Pt[] | null> {
  const cv = await loadOpenCV();
  const scale = Math.min(1, 1000 / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement("canvas");
  c.width = Math.round(img.naturalWidth * scale);
  c.height = Math.round(img.naturalHeight * scale);
  c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
  const src = cv.imread(c);
  const gray = new cv.Mat();
  const edges = new cv.Mat();
  const contours = new cv.MatVector();
  const hier = new cv.Mat();
  const kernel = cv.ones(5, 5, cv.CV_8U);
  try {
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    cv.GaussianBlur(gray, gray, new cv.Size(5, 5), 0);
    cv.Canny(gray, edges, 50, 150);
    cv.dilate(edges, edges, kernel);
    cv.findContours(edges, contours, hier, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
    let best: Pt[] | null = null;
    let bestArea = c.width * c.height * 0.2;
    for (let i = 0; i < contours.size(); i++) {
      const cnt = contours.get(i);
      const area = cv.contourArea(cnt);
      if (area > bestArea) {
        const approx = new cv.Mat();
        cv.approxPolyDP(cnt, approx, 0.02 * cv.arcLength(cnt, true), true);
        if (approx.rows === 4) {
          const d = approx.data32S;
          best = [0, 1, 2, 3].map((k) => ({ x: d[k * 2] / scale, y: d[k * 2 + 1] / scale }));
          bestArea = area;
        }
        approx.delete();
      }
      cnt.delete();
    }
    return best ? orderCorners(best) : null;
  } finally {
    src.delete();
    gray.delete();
    edges.delete();
    contours.delete();
    hier.delete();
    kernel.delete();
  }
}
