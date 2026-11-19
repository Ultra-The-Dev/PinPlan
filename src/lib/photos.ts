"use client";
// Taking/importing job photos and drawing their mark-up.
import { readExif } from "./exif";
import { newId, nowIso, saveImage } from "./db";
import type { Photo, PhotoShape } from "./types";

const AUTHOR_KEY = "pinplan.author";

/** Name shown on photos, comments and logs ("taken by"). The signed-in email if there's no name set. */
export function getAuthor(fallbackEmail?: string | null): string {
  try {
    const n = localStorage.getItem(AUTHOR_KEY)?.trim();
    if (n) return n;
  } catch {
    /* storage unavailable */
  }
  return fallbackEmail?.split("@")[0] || "Me";
}
export function setAuthor(name: string) {
  try {
    if (name.trim()) localStorage.setItem(AUTHOR_KEY, name.trim());
    else localStorage.removeItem(AUTHOR_KEY);
  } catch {
    /* storage unavailable */
  }
}

/** Current position if the browser allows it (quick, low accuracy is fine for a job site). */
export function currentPosition(timeoutMs = 6000): Promise<{ lat: number; lng: number } | null> {
  if (typeof navigator === "undefined" || !navigator.geolocation) return Promise.resolve(null);
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: Math.round(p.coords.latitude * 1e6) / 1e6, lng: Math.round(p.coords.longitude * 1e6) / 1e6 }),
      () => resolve(null),
      { enableHighAccuracy: false, timeout: timeoutMs, maximumAge: 120_000 },
    );
  });
}

const MAX_SIDE = 2560;

/**
 * Save a photo file as a job photo: shrink to a sensible size (keeps it quick to sync), keep when/where it was
 * taken from the file's EXIF, else now / the device's location for a photo taken just now.
 */
export async function importPhoto(
  file: File,
  opts: { projectId: string; author: string; position?: { lat: number; lng: number } | null; extra?: Partial<Photo> },
): Promise<Photo> {
  const buf = await file.arrayBuffer();
  const exif = file.type === "image/jpeg" || /\.jpe?g$/i.test(file.name) ? readExif(buf) : {};
  const bmp = await createImageBitmap(new Blob([buf], { type: file.type }));
  const k = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * k);
  const h = Math.round(bmp.height * k);
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  c.getContext("2d")!.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  const blob: Blob = await new Promise((r, j) => c.toBlob((b) => (b ? r(b) : j(new Error("Couldn't read the photo"))), "image/jpeg", 0.85));
  const imageId = await saveImage(blob, w, h);
  const now = nowIso();
  const pos = exif.lat != null && exif.lng != null ? { lat: exif.lat, lng: exif.lng } : (opts.position ?? null);
  return {
    id: newId(),
    projectId: opts.projectId,
    imageId,
    width: w,
    height: h,
    takenAt: exif.takenAt ?? (file.lastModified ? new Date(file.lastModified).toISOString() : now),
    takenBy: opts.author,
    lat: pos?.lat ?? null,
    lng: pos?.lng ?? null,
    tags: [],
    createdAt: now,
    updatedAt: now,
    ...opts.extra,
  };
}

export const ANNOTATION_COLORS = ["#ef4444", "#f59e0b", "#22c55e", "#3b82f6", "#ffffff", "#111827"];

/** Draw mark-up onto a canvas region of size w×h (already translated to the photo's top-left). */
export function drawAnnotations(ctx: CanvasRenderingContext2D, shapes: PhotoShape[], w: number, h: number) {
  const side = Math.max(w, h);
  for (const s of shapes) {
    const lw = Math.max(1, s.width * side);
    const P = (i: number) => [s.points[i] * w, s.points[i + 1] * h] as const;
    ctx.save();
    ctx.strokeStyle = s.color;
    ctx.fillStyle = s.color;
    ctx.lineWidth = lw;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    // A soft dark halo keeps light colours readable on busy photos.
    ctx.shadowColor = "rgba(0,0,0,0.45)";
    ctx.shadowBlur = lw * 0.8;
    if (s.kind === "pen" && s.points.length >= 4) {
      ctx.beginPath();
      ctx.moveTo(...P(0));
      for (let i = 2; i + 1 < s.points.length; i += 2) ctx.lineTo(...P(i));
      ctx.stroke();
    } else if (s.kind === "arrow" && s.points.length >= 4) {
      const [x0, y0] = P(0);
      const [x1, y1] = P(2);
      const a = Math.atan2(y1 - y0, x1 - x0);
      const head = lw * 4.5;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1 - Math.cos(a) * head * 0.6, y1 - Math.sin(a) * head * 0.6);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x1 - head * Math.cos(a - 0.45), y1 - head * Math.sin(a - 0.45));
      ctx.lineTo(x1 - head * Math.cos(a + 0.45), y1 - head * Math.sin(a + 0.45));
      ctx.closePath();
      ctx.fill();
    } else if (s.kind === "rect" && s.points.length >= 4) {
      const [x0, y0] = P(0);
      const [x1, y1] = P(2);
      ctx.strokeRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0));
    } else if (s.kind === "circle" && s.points.length >= 4) {
      const [x0, y0] = P(0);
      const [x1, y1] = P(2);
      ctx.beginPath();
      ctx.ellipse((x0 + x1) / 2, (y0 + y1) / 2, Math.abs(x1 - x0) / 2, Math.abs(y1 - y0) / 2, 0, 0, Math.PI * 2);
      ctx.stroke();
    } else if (s.kind === "text" && s.text) {
      const [x, y] = P(0);
      const size = Math.max(12, lw * 6);
      ctx.font = `700 ${size}px system-ui, sans-serif`;
      ctx.textBaseline = "top";
      ctx.shadowBlur = 0;
      const tw = ctx.measureText(s.text).width;
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.fillRect(x - size * 0.25, y - size * 0.15, tw + size * 0.5, size * 1.3);
      ctx.fillStyle = s.color;
      ctx.fillText(s.text, x, y);
    }
    ctx.restore();
  }
}

/** The photo with its mark-up as a JPEG (for reports, sharing and downloads). */
export async function renderPhoto(blob: Blob, shapes: PhotoShape[] | null | undefined, maxSide = 1600): Promise<Blob> {
  const bmp = await createImageBitmap(blob);
  const k = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * k);
  const h = Math.round(bmp.height * k);
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  if (shapes?.length) drawAnnotations(ctx, shapes, w, h);
  return new Promise((r, j) => c.toBlob((b) => (b ? r(b) : j(new Error("Couldn't draw the photo"))), "image/jpeg", 0.85));
}

export const mapsLink = (lat: number, lng: number) => `https://maps.google.com/?q=${lat},${lng}`;
