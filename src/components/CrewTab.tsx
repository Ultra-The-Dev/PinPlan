"use client";
import { useMemo, useState } from "react";
import { LAYERS } from "@/lib/catalog";
import { downloadText, slug } from "@/lib/download";
import { exportSheetsPdf } from "@/lib/exportSheets";
import { runLengthFt } from "@/lib/geometry";
import { useEditor } from "@/lib/store";
import { computeTakeoff, toCsv } from "@/lib/takeoff";
import type { Layer } from "@/lib/types";

/** Wiring-only view for the crew: no prices. Marked PDFs by layer plus the home-run schedule. */
export default function CrewTab() {
  const { project, sheets, markers, runs, closets, catalog, autoHomeRuns } = useEditor();
  const [layers, setLayers] = useState<Layer[]>(LAYERS.map((l) => l.id));
  const [busy, setBusy] = useState<string | null>(null);
  const takeoff = useMemo(() => computeTakeoff({ sheets, markers, runs, closets }), [sheets, markers, runs, closets]);
  if (!project) return null;
  const typeName = (id: string) => catalog.find((d) => d.id === id)?.name ?? id;
  const closetName = (id?: string | null) => closets.find((c) => c.id === id)?.name ?? "—";
  const sheetName = (id: string) => sheets.find((s) => s.id === id)?.name ?? "";
  const order = new Map(sheets.map((s) => [s.id, s.order]));
  const schedule = markers
    .filter((m) => catalog.find((d) => d.id === m.deviceTypeId)?.kind === "device")
    .sort((a, b) => (order.get(a.sheetId)! - order.get(b.sheetId)!) || a.label.localeCompare(b.label))
    .map((m) => {
      const run = runs.find((r) => r.kind === "wire" && r.markerId === m.id);
      return { m, len: run ? runLengthFt(run) : null, drawn: !!run };
    });
  const noCloset = schedule.filter((s) => !s.m.closetId && s.m.wireType !== "None").length;

  function csv() {
    const rows: (string | number)[][] = [["Floor", "Label", "Device", "Room", "Mount", "Wire", "Home run to", "Cable ft", "Tentative", "Notes"]];
    for (const { m, len } of schedule) rows.push([sheetName(m.sheetId), m.label, typeName(m.deviceTypeId), m.room, m.mount, m.wireType, closetName(m.closetId), len ?? "", m.tentative ? "yes" : "", m.notes]);
    downloadText(toCsv(rows), `${slug(project!.address)}-home-runs.csv`);
  }

  async function pdf(oneLayer?: Layer) {
    setBusy("Preparing…");
    try {
      await exportSheetsPdf({ project: project!, sheets, markers, runs, closets, catalog }, { mode: "crew", layers: oneLayer ? [oneLayer, "infrastructure", "wiring"] : layers, onProgress: setBusy });
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto max-w-6xl space-y-4 p-4 sm:p-6">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-xl font-semibold">Crew wiring sheets</h2>
          <p className="text-sm text-slate-500">Where each wire goes and which type — no prices.</p>
        </div>

        <div className="card space-y-3 p-4">
          <div className="flex flex-wrap gap-3">
            {LAYERS.map((l) => (
              <label key={l.id} className="flex items-center gap-1.5 text-sm">
                <input type="checkbox" checked={layers.includes(l.id)} onChange={() => setLayers((ls) => (ls.includes(l.id) ? ls.filter((x) => x !== l.id) : [...ls, l.id]))} />
                {l.name}
              </label>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="btn btn-primary" disabled={!!busy || !sheets.length} onClick={() => pdf()}>
              {busy ?? "Wiring PDF (selected layers)"}
            </button>
            {(["security", "network", "audio", "video", "lighting", "shades"] as Layer[]).map((l) => (
              <button key={l} className="btn" disabled={!!busy || !sheets.length} onClick={() => pdf(l)}>
                {LAYERS.find((x) => x.id === l)?.name} only
              </button>
            ))}
            <button className="btn" onClick={csv}>
              Home-run CSV
            </button>
            <button className="btn" onClick={() => autoHomeRuns()}>
              Auto-draw all home runs
            </button>
          </div>
          {noCloset > 0 && <p className="text-sm text-amber-700">{noCloset} device(s) have no home-run closet assigned.</p>}
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          {Object.entries(takeoff.total.wireFt).map(([w, ft]) => (
            <div key={w} className="card p-3">
              <div className="text-xs uppercase text-slate-500">{w}</div>
              <div className="text-2xl font-semibold">{ft} ft</div>
              <div className="text-xs text-slate-500">{takeoff.total.wireRuns[w]} home runs</div>
            </div>
          ))}
        </div>

        <div className="card overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th>Floor</th>
                <th>Label</th>
                <th>Device</th>
                <th>Room</th>
                <th>Wire</th>
                <th>Home run to</th>
                <th className="text-right">Cable</th>
              </tr>
            </thead>
            <tbody>
              {schedule.map(({ m, len, drawn }) => (
                <tr key={m.id}>
                  <td>{sheetName(m.sheetId)}</td>
                  <td className="font-medium">
                    {m.label}
                    {m.tentative && <span className="ml-1 text-amber-700">?</span>}
                  </td>
                  <td>{typeName(m.deviceTypeId)}</td>
                  <td>{m.room}</td>
                  <td>{m.wireType}</td>
                  <td>{closetName(m.closetId)}</td>
                  <td className="text-right tabular-nums">{len != null ? `${len} ft` : drawn ? "no scale" : "—"}</td>
                </tr>
              ))}
              {!schedule.length && (
                <tr>
                  <td colSpan={7} className="py-6 text-center text-slate-500">
                    No devices placed yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
