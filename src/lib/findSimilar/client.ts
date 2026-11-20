"use client";
// Main-thread side of Find similar's matcher: one worker (match.worker.ts), one search at a time — a new search
// replaces the one running. See docs/find-similar.md.
import { db } from "../db";
import { msg } from "../i18n/msg";
import { OPENCV_URL } from "../perspective";
import { MIN_THRESHOLD, type Box, type Candidate } from "./match";
import type { MatchIn, MatchOut } from "./match.worker";

export type MatchProgress = Extract<MatchOut, { type: "progress" }>;

let worker: Worker | null = null;
let nextId = 1;
const waiting = new Map<number, { resolve: (r: { candidates: Candidate[]; template: Box; ms: number }) => void; reject: (e: Error) => void; onProgress?: (p: MatchProgress) => void }>();

function getWorker(): Worker {
  if (worker) return worker;
  if (typeof Worker === "undefined" || typeof OffscreenCanvas === "undefined") throw new Error(msg("This browser can’t run Find similar. Try a current Chrome, Edge, Firefox or Safari."));
  const w = new Worker(new URL("./match.worker.ts", import.meta.url), { type: "module" });
  w.onmessage = (e: MessageEvent<MatchOut>) => {
    const m = e.data;
    const job = waiting.get(m.id);
    if (!job) return;
    if (m.type === "progress") return job.onProgress?.(m);
    waiting.delete(m.id);
    if (m.type === "result") job.resolve({ candidates: m.candidates, template: m.template, ms: m.ms });
    else job.reject(new Error(m.message));
  };
  w.onerror = (e) => {
    e.preventDefault?.();
    for (const [, job] of waiting) job.reject(new Error(msg("Find similar stopped unexpectedly. Try a smaller box.")));
    waiting.clear();
    w.terminate();
    worker = null;
  };
  worker = w;
  return w;
}

/** Search a sheet's image for symbols like the one in `box` (sheet px). Rejects when a newer search replaced it. */
export async function findSimilarOnSheet(
  sheet: { imageId: string; width: number; height: number },
  box: Box,
  opts: { trim: boolean; onProgress?: (p: MatchProgress) => void },
): Promise<{ candidates: Candidate[]; template: Box; ms: number }> {
  const rec = await db().images.get(sheet.imageId);
  if (!rec?.blob) throw new Error(msg("This plan’s image isn’t on this device yet. Open it once while online, then try again."));
  const w = getWorker();
  const id = nextId++;
  // Only the newest search matters: drop the older ones' promises.
  for (const [oldId, job] of waiting) {
    job.reject(new Error("replaced"));
    waiting.delete(oldId);
  }
  return new Promise((resolve, reject) => {
    waiting.set(id, { resolve, reject, onProgress: opts.onProgress });
    const msg: MatchIn = {
      type: "match",
      id,
      opencvUrl: OPENCV_URL,
      imageId: sheet.imageId,
      blob: rec.blob,
      sheet: { width: sheet.width, height: sheet.height },
      box,
      trim: opts.trim,
      minScore: MIN_THRESHOLD,
    };
    w.postMessage(msg);
  });
}
