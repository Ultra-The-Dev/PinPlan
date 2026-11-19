// Daily log PDF export helpers: which logs go in, their photos, and the file name / date-range label.
// Mirrors PinPlanCore/DailyLogReport.swift.
import type { JobLog, Photo } from "./types";

/** Live logs whose day is within [from, to] (YYYY-MM-DD, inclusive; either may be empty), oldest day first. */
export function logsInRange(logs: JobLog[], from?: string | null, to?: string | null): JobLog[] {
  let lo = from || "";
  let hi = to || "";
  if (lo && hi && lo > hi) [lo, hi] = [hi, lo];
  return logs
    .filter((l) => !l.deleted && (!lo || l.date >= lo) && (!hi || l.date <= hi))
    .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));
}

/** The photos linked to a log (skipping deleted / missing ones), in the order they were taken. */
export function logPhotos(log: JobLog, photos: Photo[]): Photo[] {
  const ids = new Set(log.photoIds ?? []);
  return photos.filter((p) => ids.has(p.id) && !p.deleted).sort((a, b) => a.takenAt.localeCompare(b.takenAt));
}

/** First and last day covered by the logs (one day when they're all the same), or null when there are none. */
export function logDays(logs: JobLog[]): { first: string; last: string } | null {
  if (!logs.length) return null;
  const days = logs.map((l) => l.date).sort();
  return { first: days[0], last: days[days.length - 1] };
}

/** File name for the export, e.g. `12-oak-st-daily-log-2026-03-02.pdf` or `…-daily-logs-2026-03-02-to-2026-03-06.pdf`. */
export function dailyLogFileName(jobSlug: string, logs: JobLog[]): string {
  const d = logDays(logs);
  const base = `${jobSlug || "job"}-daily-log${logs.length === 1 ? "" : "s"}`;
  if (!d) return `${base}.pdf`;
  return d.first === d.last ? `${base}-${d.first}.pdf` : `${base}-${d.first}-to-${d.last}.pdf`;
}
