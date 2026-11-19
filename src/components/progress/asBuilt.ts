"use client";
// As-built set: every sheet marked up as usual (renderSheet, unchanged) with install-status rings drawn over a copy,
// a device table with who/when/test results, and a cover summary. Never shows prices.
import { downloadBlob, slug } from "@/lib/download";
import { STATUS_COLORS, STATUS_LABELS, STATUS_ORDER, issues, markable, progress, progressMarkers, progressRuns, statusOf, testText, workflowOf } from "@/lib/installProgress";
import { renderSheet } from "@/lib/renderSheet";
import type { Closet, DeviceType, InstallStatus, Marker, Project, Run, Sheet, TradeId } from "@/lib/types";

export interface RingItem {
  /** Relative 0–1. */
  x: number;
  y: number;
  status: InstallStatus;
}

/** Status rings (and status lines over runs) on a rendered sheet canvas. `r` is the symbol radius renderSheet used. */
export function drawInstallRings(ctx: CanvasRenderingContext2D, rings: RingItem[], lines: { points: number[]; status: InstallStatus }[], W: number, H: number, r: number) {
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.globalAlpha = 0.45;
  ctx.lineWidth = r * 0.45;
  for (const l of lines) {
    if (l.points.length < 4) continue;
    ctx.strokeStyle = STATUS_COLORS[l.status];
    ctx.beginPath();
    for (let i = 0; i + 1 < l.points.length; i += 2) {
      const x = l.points[i] * W;
      const y = l.points[i + 1] * H;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  for (const g of rings) {
    const x = g.x * W;
    const y = g.y * H;
    ctx.beginPath();
    ctx.arc(x, y, r * 1.5, 0, Math.PI * 2);
    ctx.lineWidth = r * 0.42;
    ctx.strokeStyle = "#fff";
    ctx.stroke();
    ctx.lineWidth = r * 0.28;
    ctx.strokeStyle = STATUS_COLORS[g.status];
    ctx.setLineDash(g.status === "planned" ? [r * 0.35, r * 0.25] : []);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.restore();
}

interface Data {
  project: Project;
  sheets: Sheet[];
  markers: Marker[];
  runs: Run[];
  closets: Closet[];
  catalog: DeviceType[];
}

const fmt = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString() : "");

export async function exportAsBuiltPdf(data: Data, opts: { trades?: TradeId[]; business?: string; onProgress?: (s: string) => void; download?: boolean } = {}): Promise<Blob> {
  const { renderAsBuiltPdf } = await import("./AsBuiltPdf");
  const live = <T extends { deleted?: boolean }>(xs: T[]) => xs.filter((x) => !x.deleted);
  const sheets = live(data.sheets).sort((a, b) => a.order - b.order);
  const markers = live(data.markers);
  const runs = live(data.runs);
  const closets = live(data.closets);
  const types = new Map(data.catalog.map((d) => [d.id, d]));
  const tracked = progressMarkers(markers, data.catalog);
  const trackedRuns = progressRuns(runs);
  const bySheet = progress(markers, runs, sheets, data.catalog, { by: "sheet", trades: opts.trades });
  const pages = [];
  for (const sheet of sheets) {
    const row = bySheet.find((r) => r.key === sheet.id);
    if (!row) continue;
    opts.onProgress?.(`Rendering ${sheet.name}…`);
    const base = await renderSheet(sheet, { markers, runs, closets, catalog: data.catalog }, { labels: true });
    // A copy of the marked-up sheet with the rings on top (renderSheet itself is untouched).
    const c = document.createElement("canvas");
    c.width = base.width;
    c.height = base.height;
    const ctx = c.getContext("2d")!;
    ctx.drawImage(base, 0, 0);
    base.width = base.height = 0;
    const r = Math.max(c.width, c.height) / 140;
    drawInstallRings(
      ctx,
      tracked.filter((m) => m.sheetId === sheet.id).map((m) => ({ x: m.x, y: m.y, status: statusOf(m) })),
      trackedRuns.filter((x) => x.sheetId === sheet.id).map((x) => ({ points: x.points, status: statusOf(x) })),
      c.width,
      c.height,
      r,
    );
    const imageDataUrl = c.toDataURL("image/jpeg", 0.85);
    c.width = c.height = 0;
    const rows = tracked
      .filter((m) => m.sheetId === sheet.id)
      .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true, sensitivity: "base" }))
      .map((m) => {
        const s = statusOf(m);
        const wf = workflowOf(m, data.catalog, opts.trades);
        return { label: m.label, type: types.get(m.deviceTypeId)?.name ?? "", room: m.room || "", status: s, statusText: s === "planned" ? "Not started" : wf.labels[s], by: m.install?.by ?? "", date: fmt(m.install?.at), test: testText(m.install?.test) };
      });
    const runRows = trackedRuns
      .filter((x) => x.sheetId === sheet.id && x.kind === "wire")
      .map((x) => {
        const s = statusOf(x);
        const wf = workflowOf(x, data.catalog, opts.trades);
        const m = markers.find((mm) => mm.id === x.markerId);
        return { label: m ? `${m.label} cable` : "Cable", type: (x.wireTypes?.length ? x.wireTypes.join(" + ") : x.wireType) || "Cable", room: m?.room ?? "", status: s, statusText: s === "planned" ? "Not started" : wf.labels[s], by: x.install?.by ?? "", date: fmt(x.install?.at), test: testText(x.install?.test) };
      });
    pages.push({ name: sheet.name, imageDataUrl, row, rows: [...rows, ...runRows] });
  }
  opts.onProgress?.("Building PDF…");
  const all = { counts: Object.fromEntries(STATUS_ORDER.map((s) => [s, tracked.filter((m) => statusOf(m) === s).length])) as Record<InstallStatus, number>, total: tracked.length };
  const done = all.counts.tested + all.counts.verified;
  const blob = await renderAsBuiltPdf({
    title: data.project.address || "Project",
    client: data.project.clientName || "",
    business: opts.business ?? "",
    date: new Date().toLocaleDateString(),
    overall: { ...all, done, pct: all.total ? Math.round((done / all.total) * 100) : 0, cables: trackedRuns.filter((x) => x.kind === "wire").length, cablesDone: trackedRuns.filter((x) => x.kind === "wire" && ["tested", "verified"].includes(statusOf(x))).length },
    sheets: bySheet,
    issues: issues(markers.filter(markable), trackedRuns).map((i) => ({ ...i, sheet: sheets.find((s) => s.id === i.sheetId)?.name ?? "", date: fmt(i.at) })),
    legend: STATUS_ORDER.map((s) => ({ color: STATUS_COLORS[s], name: STATUS_LABELS[s] })),
    pages,
  });
  if (opts.download !== false) downloadBlob(blob, `${slug(data.project.address || "project")}-as-built.pdf`);
  return blob;
}
