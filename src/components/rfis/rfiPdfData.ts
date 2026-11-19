"use client";
// Turns RFIs into PDF rows (dates as text, photos with mark-up drawn in, the plan crop drawn on a canvas) and downloads them.
import { db } from "@/lib/db";
import { downloadBlob, slug } from "@/lib/download";
import { renderPhoto } from "@/lib/photos";
import { ageText, isOverdue, planCropRect, RFI_STATUS_LABEL, rfiCode, rfiPdfName, rfiPhotos } from "@/lib/rfis";
import type { AppSettings, JobDocument, Photo, Project, Rfi, Sheet } from "@/lib/types";
import type { RfiPdfData, RfiPdfEntry } from "./RfiPdf";
import { localToday } from "./ui";

const day = (d?: string | null) => {
  if (!d) return "";
  const t = new Date(d.length === 10 ? `${d}T12:00:00` : d);
  return Number.isNaN(t.getTime()) ? "" : t.toLocaleDateString(undefined, { month: "2-digit", day: "2-digit", year: "2-digit" });
};
const IMPACT: Record<string, string> = { yes: "Yes", no: "No", tbd: "TBD" };

const toDataUrl = (b: Blob) =>
  new Promise<string>((r, j) => {
    const fr = new FileReader();
    fr.onload = () => r(String(fr.result));
    fr.onerror = () => j(fr.error);
    fr.readAsDataURL(b);
  });

/** The plan around (x, y) with a ring on the spot, as a PNG data URL (local helper for the PDF). */
export async function planCropPng(blob: Blob, x: number, y: number, outW = 1100): Promise<{ src: string; width: number; height: number }> {
  const bmp = await createImageBitmap(blob);
  try {
    const c = planCropRect(x, y, bmp.width, bmp.height);
    const sx = c.x * bmp.width;
    const sy = c.y * bmp.height;
    const sw = c.w * bmp.width;
    const sh = c.h * bmp.height;
    const k = Math.min(1.5, outW / Math.max(1, sw));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(sw * k));
    canvas.height = Math.max(1, Math.round(sh * k));
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bmp, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
    const px = (x * bmp.width - sx) * k;
    const py = (y * bmp.height - sy) * k;
    const r = Math.max(14, canvas.width * 0.035);
    ctx.lineWidth = Math.max(4, r * 0.28);
    ctx.strokeStyle = "rgba(255,255,255,0.9)";
    ctx.beginPath();
    ctx.arc(px, py, r + ctx.lineWidth * 0.8, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = "#dc2626";
    ctx.fillStyle = "rgba(239,68,68,0.15)";
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#dc2626";
    ctx.beginPath();
    ctx.arc(px, py, Math.max(3, r * 0.18), 0, Math.PI * 2);
    ctx.fill();
    return { src: canvas.toDataURL("image/png"), width: canvas.width, height: canvas.height };
  } finally {
    bmp.close();
  }
}

export interface RfiPdfContext {
  project: Project;
  settings: AppSettings;
  photos: Photo[];
  sheets: Sheet[];
  documents: JobDocument[];
  /** Device label for markerId, if any. */
  markerLabel?: (id: string) => string | null;
}

function baseEntry(r: Rfi, ctx: RfiPdfContext, now: string, today: string): RfiPdfEntry {
  const sheet = r.sheetId ? ctx.sheets.find((s) => s.id === r.sheetId) : undefined;
  const marker = r.markerId && ctx.markerLabel ? ctx.markerLabel(r.markerId) : null;
  const docs = (r.documentIds ?? []).map((id) => ctx.documents.find((d) => d.id === id && !d.deleted)?.name).filter((n): n is string => !!n);
  return {
    code: rfiCode(r.number),
    subject: r.subject || "Untitled",
    question: r.question,
    suggestion: r.suggestion,
    status: RFI_STATUS_LABEL[r.status],
    ball: r.status === "void" || r.status === "closed" ? "—" : r.ballInCourt === "them" ? "Them" : "Us",
    to: [r.toName, r.toCompany].filter(Boolean).join(", "),
    due: day(r.due),
    sent: day(r.sentAt),
    age: ageText(r.sentAt ?? r.createdAt, now),
    priority: r.priority ? r.priority[0].toUpperCase() + r.priority.slice(1) : "",
    costImpact: r.costImpact ? IMPACT[r.costImpact] : "",
    scheduleImpact: r.scheduleImpact ? IMPACT[r.scheduleImpact] : "",
    createdBy: r.createdBy,
    location: sheet && r.x != null ? [sheet.name, marker].filter(Boolean).join(" · ") : null,
    documents: docs,
    answer: r.answer,
    answeredBy: r.answeredBy,
    answered: day(r.answeredAt),
    closed: r.status === "closed" ? day(r.closedAt) : "",
    overdue: isOverdue(r, today),
    photos: [],
    plan: null,
  };
}

function pdfData(ctx: RfiPdfContext, now: string): RfiPdfData {
  return { business: ctx.settings.business, clientName: ctx.project.clientName, address: ctx.project.address, printed: day(now) };
}

/** Build and download one RFI as a PDF (photos with mark-up, plan crop). */
export async function downloadRfiPdf(r: Rfi, ctx: RfiPdfContext): Promise<void> {
  const now = new Date().toISOString();
  const entry = baseEntry(r, ctx, now, localToday());
  for (const p of rfiPhotos(r, ctx.photos)) {
    const rec = await db().images.get(p.imageId);
    if (!rec) continue;
    const blob = await renderPhoto(rec.blob, p.annotations, 1400);
    entry.photos.push({ src: await toDataUrl(blob), width: p.width, height: p.height, caption: p.caption });
  }
  const sheet = r.sheetId ? ctx.sheets.find((s) => s.id === r.sheetId) : undefined;
  if (sheet && r.x != null && r.y != null) {
    const rec = await db().images.get(sheet.imageId);
    if (rec) entry.plan = await planCropPng(rec.blob, r.x, r.y);
  }
  const { renderRfiPdf } = await import("./RfiPdf");
  const out = await renderRfiPdf(pdfData(ctx, now), entry);
  downloadBlob(out, rfiPdfName(slug(ctx.project.address || ctx.project.clientName || "job"), r));
}

/** Build and download the job's RFI log (a table, oldest first). */
export async function downloadRfiLogPdf(rfis: Rfi[], ctx: RfiPdfContext): Promise<void> {
  const now = new Date().toISOString();
  const today = localToday();
  const rows = [...rfis].filter((r) => !r.deleted).sort((a, b) => a.number - b.number).map((r) => baseEntry(r, ctx, now, today));
  const { renderRfiLogPdf } = await import("./RfiPdf");
  const out = await renderRfiLogPdf(pdfData(ctx, now), rows);
  downloadBlob(out, rfiPdfName(slug(ctx.project.address || ctx.project.clientName || "job")));
}
