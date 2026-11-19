// Daily log PDF export helpers: which logs go in, their photos, and the file name / date-range label.
// Mirrors PinPlanCore/DailyLogReport.swift.
import { clampHours, hoursText, isStructured, totals, weatherLine } from "./dailyReport";
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

// --- Structured daily reports in the PDF (src/lib/dailyReport.ts) ---

/** What the PDF prints for a structured log, ready to lay out. Legacy logs (no report) give null and print as before. */
export interface ReportPdfSections {
  weather: string;
  crew: { name: string; role: string; hours: number }[];
  manHours: number;
  work: string[];
  deliveries: string[];
  equipment: string[];
  delays: string[];
  delayHours: number;
  /** "No incidents", "Incident: …", or "" when not answered. */
  safety: string;
  incident: boolean;
  visitors: string[];
  signature: { name: string; imageId: string; signedAt: string } | null;
}

const lines = (xs: string[] | undefined) => (xs ?? []).map((x) => x.trim()).filter(Boolean);

export function reportPdfSections(log: JobLog, sheetName: (id: string) => string | null | undefined = () => null): ReportPdfSections | null {
  if (!isStructured(log)) return null;
  const r = log.report!;
  const t = totals(r);
  const notes = r.safety?.notes?.trim() ?? "";
  let safety = "";
  if (r.safety) safety = r.safety.incident ? `Incident${notes ? `: ${notes}` : " reported"}` : `No incidents${notes ? ` · ${notes}` : ""}`;
  return {
    weather: weatherLine(r.weather),
    crew: (r.crew ?? []).filter((c) => c.name?.trim()).map((c) => ({ name: c.name.trim(), role: c.role?.trim() ?? "", hours: clampHours(c.hours) })),
    manHours: t.manHours,
    work: (r.work ?? [])
      .filter((w) => w.text?.trim())
      .map((w) => {
        const where = [w.sheetId ? sheetName(w.sheetId) : null, w.area?.trim()].filter(Boolean).join(" · ");
        return where ? `${w.text.trim()} (${where})` : w.text.trim();
      }),
    deliveries: lines(r.deliveries),
    equipment: lines(r.equipment),
    delays: (r.delays ?? [])
      .filter((d) => d.reason?.trim())
      .map((d) => [d.reason.trim(), d.hours ? `${hoursText(clampHours(d.hours))} lost` : "", d.ongoing ? "ongoing" : ""].filter(Boolean).join(" · ")),
    delayHours: t.delayHours,
    safety,
    incident: !!r.safety?.incident,
    visitors: lines(r.visitors),
    signature: r.signature ?? null,
  };
}

export interface RangeSummaryRow {
  date: string;
  crew: number;
  manHours: number;
  delayHours: number;
  incident: boolean;
}

/** Summary page for a date range: per day crew, man-hours and delay hours, and the totals. Null when no log has a report. */
export function rangeSummary(logs: JobLog[]): { rows: RangeSummaryRow[]; manHours: number; delayHours: number; incidents: number } | null {
  const structured = logs.filter((l) => !l.deleted && isStructured(l));
  if (!structured.length) return null;
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const byDay = new Map<string, RangeSummaryRow>();
  for (const l of structured) {
    const t = totals(l.report);
    const d = byDay.get(l.date) ?? { date: l.date, crew: 0, manHours: 0, delayHours: 0, incident: false };
    d.crew += t.crew;
    d.manHours = r2(d.manHours + t.manHours);
    d.delayHours = r2(d.delayHours + t.delayHours);
    if (l.report!.safety?.incident) d.incident = true;
    byDay.set(l.date, d);
  }
  const rows = [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date));
  return {
    rows,
    manHours: r2(rows.reduce((n, r) => n + r.manHours, 0)),
    delayHours: r2(rows.reduce((n, r) => n + r.delayHours, 0)),
    incidents: rows.filter((r) => r.incident).length,
  };
}
