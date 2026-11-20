// Find similar: template matching off the main thread (docs/find-similar.md). Loads the self-hosted OpenCV.js (the
// same file the photo-straightening tool uses, src/lib/perspective.ts), shrinks the sheet so the picked symbol is
// ~32 px, and runs normalised cross-correlation for every distinct 90° turn and mirror of the symbol. Peaks above the
// lowest slider threshold come back with their scores; the slider then filters on the main thread without a new search.
import { msg } from "../i18n/msg";
import { chooseScale, distinctOrientations, grayStd, inkBounds, inkLevel, MIN_TEMPLATE_PX, nonMaxSuppress, onlyStraightLines, orientGray, orientedSize, peakToCandidate, scorePeaks, type Box, type Candidate } from "./match";

export type MatchIn = {
  type: "match";
  id: number;
  opencvUrl: string;
  imageId: string;
  blob: Blob;
  sheet: { width: number; height: number };
  /** The picked symbol, sheet px. */
  box: Box;
  /** A tap (not a drawn box): trim the square to the ink inside it. */
  trim: boolean;
  minScore: number;
};

export type MatchOut =
  | { type: "progress"; id: number; stage: "load" | "image" | "match"; done: number; total: number }
  | { type: "result"; id: number; candidates: Candidate[]; template: Box; ms: number }
  | { type: "error"; id: number; message: string };

/** Shown translated by the card (FindSimilarPanel passes notes through t()). */
const TOO_SMALL = msg("That box is too small. Zoom in and drag a box around one symbol.");
const NOTHING_DRAWN = msg("There’s nothing drawn there. Tap right on a symbol, or drag a box around one.");
const ONLY_LINES = msg("That’s only straight lines, like a wall. Tap right on a symbol, or draw the box tightly around one.");

/* eslint-disable @typescript-eslint/no-explicit-any -- OpenCV.js has no types */
type CV = any;
type Mat = any;

const scope = self as unknown as { postMessage(m: MatchOut): void; onmessage: ((e: MessageEvent<MatchIn>) => void) | null; cv?: CV };
const post = (m: MatchOut) => scope.postMessage(m);

// The OpenCV module is "thenable" (emscripten adds a then()), and resolving a promise with it loops forever: always
// pass it wrapped in an object.
let cvPromise: Promise<{ cv: CV }> | null = null;
function loadCv(url: string): Promise<{ cv: CV }> {
  if (cvPromise) return cvPromise;
  cvPromise = (async () => {
    const res = await fetch(url);
    if (!res.ok) throw new Error(msg("Couldn’t load the matcher (offline?)."));
    const src = await res.text();
    // OpenCV.js is a UMD script: run it as a classic script so it sets self.cv (CSP allows eval for it).
    new Function(src).call(self);
    const cv = scope.cv;
    if (!cv) throw new Error(msg("The matcher didn’t start."));
    await new Promise<void>((resolve, reject) => {
      if (cv.Mat) return resolve();
      const t0 = Date.now();
      cv.onRuntimeInitialized = () => resolve();
      const poll = setInterval(() => {
        if (cv.Mat) {
          clearInterval(poll);
          resolve();
        } else if (Date.now() - t0 > 60_000) {
          clearInterval(poll);
          reject(new Error(msg("The matcher didn’t start.")));
        }
      }, 100);
    });
    return { cv };
  })();
  cvPromise.catch(() => (cvPromise = null));
  return cvPromise;
}

/** The last sheet image prepared for matching (grey, shrunk, slightly blurred), reused while the user tries again. */
let work: { key: string; mat: Mat; w: number; h: number } | null = null;
let latest = 0;

async function prepare(cv: CV, msg: MatchIn, scale: number) {
  const W = Math.max(1, Math.round(msg.sheet.width * scale));
  const H = Math.max(1, Math.round(msg.sheet.height * scale));
  const key = `${msg.imageId}@${W}x${H}`;
  if (work?.key === key) return work;
  work?.mat.delete();
  work = null;
  // Decode at up to twice the work size, then area-average down (keeps thin lines as grey instead of dropping them).
  const s2 = Math.min(1, scale * 2);
  const W2 = Math.max(W, Math.round(msg.sheet.width * s2));
  const H2 = Math.max(H, Math.round(msg.sheet.height * s2));
  const bmp = await createImageBitmap(msg.blob, { resizeWidth: W2, resizeHeight: H2, resizeQuality: "high" });
  const c = new OffscreenCanvas(W2, H2);
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, W2, H2);
  ctx.drawImage(bmp, 0, 0);
  bmp.close();
  const rgba = ctx.getImageData(0, 0, W2, H2).data;
  const gray = new cv.Mat(H2, W2, cv.CV_8UC1);
  const g: Uint8Array = gray.data;
  for (let i = 0, j = 0; j < g.length; i += 4, j++) g[j] = (rgba[i] * 77 + rgba[i + 1] * 150 + rgba[i + 2] * 29) >> 8;
  let mat = gray;
  if (W2 !== W || H2 !== H) {
    mat = new cv.Mat();
    cv.resize(gray, mat, new cv.Size(W, H), 0, 0, cv.INTER_AREA);
    gray.delete();
  }
  cv.GaussianBlur(mat, mat, new cv.Size(3, 3), 0);
  work = { key, mat, w: W, h: H };
  return work;
}

function crop(img: { mat: Mat; w: number }, b: Box): Uint8Array {
  const out = new Uint8Array(b.w * b.h);
  const d: Uint8Array = img.mat.data;
  for (let y = 0; y < b.h; y++) out.set(d.subarray((b.y + y) * img.w + b.x, (b.y + y) * img.w + b.x + b.w), y * b.w);
  return out;
}

async function run(msg: MatchIn) {
  const t0 = performance.now();
  post({ type: "progress", id: msg.id, stage: "load", done: 0, total: 1 });
  const { cv } = await loadCv(msg.opencvUrl);
  const scale = chooseScale(msg.box, msg.sheet);
  if (scale == null) throw new Error(TOO_SMALL);
  post({ type: "progress", id: msg.id, stage: "image", done: 0, total: 1 });
  const img = await prepare(cv, msg, scale);

  // The template, in work px, cut from the prepared image (so it is shrunk and blurred exactly like the sheet).
  const x0 = Math.max(0, Math.round(msg.box.x * scale));
  const y0 = Math.max(0, Math.round(msg.box.y * scale));
  let tb: Box = { x: x0, y: y0, w: Math.min(img.w - x0, Math.round(msg.box.w * scale)), h: Math.min(img.h - y0, Math.round(msg.box.h * scale)) };
  let tpl = crop(img, tb);
  if (msg.trim) {
    const ink = inkBounds(tpl, tb.w, tb.h, inkLevel(tpl), 2);
    if (ink && Math.min(ink.w, ink.h) >= MIN_TEMPLATE_PX) {
      tb = { x: tb.x + ink.x, y: tb.y + ink.y, w: ink.w, h: ink.h };
      tpl = crop(img, tb);
    }
  }
  if (Math.min(tb.w, tb.h) < MIN_TEMPLATE_PX - 1) throw new Error(TOO_SMALL);
  if (grayStd(tpl) < 6) throw new Error(NOTHING_DRAWN);
  // A wall, a corner of walls, a wire: matching it would find every wall junction on the sheet.
  if (onlyStraightLines(tpl, tb.w, tb.h, inkLevel(tpl))) throw new Error(ONLY_LINES);

  const orients = distinctOrientations(tpl, tb.w, tb.h);
  const cands: Candidate[] = [];
  const res = new cv.Mat();
  try {
    for (let i = 0; i < orients.length; i++) {
      if (latest !== msg.id) return; // a newer search replaced this one
      post({ type: "progress", id: msg.id, stage: "match", done: i, total: orients.length });
      const o = orientGray(tpl, tb.w, tb.h, orients[i]);
      const t = cv.matFromArray(o.h, o.w, cv.CV_8UC1, o.data);
      try {
        cv.matchTemplate(img.mat, t, res, cv.TM_CCOEFF_NORMED);
      } finally {
        t.delete();
      }
      const size = orientedSize(tb.w, tb.h, orients[i]);
      const peaks = scorePeaks(res.data32F, res.cols, res.rows, msg.minScore, Math.min(size.w, size.h) / 4);
      for (const p of peaks) cands.push(peakToCandidate(p, size, scale, orients[i]));
      // Let a newer request in between orientations.
      await new Promise((r) => setTimeout(r, 0));
    }
  } finally {
    res.delete();
  }
  const template: Box = { x: tb.x / scale, y: tb.y / scale, w: tb.w / scale, h: tb.h / scale };
  const kept = nonMaxSuppress(cands, 0.5 * Math.min(template.w, template.h));
  post({ type: "result", id: msg.id, candidates: kept, template, ms: Math.round(performance.now() - t0) });
}

scope.onmessage = (e) => {
  const msg = e.data;
  if (msg.type !== "match") return;
  latest = msg.id;
  run(msg).catch((err) => post({ type: "error", id: msg.id, message: err instanceof Error ? err.message : String(err) }));
};
