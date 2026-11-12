"use client";
import { Cable, Camera, Download, FileText, Lightbulb, Speaker, Tv, Wifi } from "lucide-react";
import { useMemo, useState } from "react";
import { CATEGORIES, CLOSET_KINDS } from "@/lib/catalog";
import { downloadText, slug } from "@/lib/download";
import { exportSheetsPdf } from "@/lib/exportSheets";
import { useEditor } from "@/lib/store";
import { computeTakeoff, countOf, takeoffCsv, type TakeoffBucket } from "@/lib/takeoff";
import { toast } from "@/lib/toast";

export default function TakeoffTab() {
  const st = useEditor();
  const { project, sheets, markers, runs, closets, catalog } = st;
  const takeoff = useMemo(() => computeTakeoff({ sheets, markers, runs, closets }), [sheets, markers, runs, closets]);
  const [busy, setBusy] = useState<string | null>(null);
  if (!project) return null;
  const cols: { name: string; b: TakeoffBucket }[] = [...takeoff.floors.map((f) => ({ name: f.name, b: f })), { name: "Total", b: takeoff.total }];

  const cell = (v: number, tent = 0, unit = "") =>
    v || tent ? (
      <>
        {v ? `${v}${unit}` : "—"}
        {tent ? <span className="ml-1 text-xs text-amber-700">({tent}{unit}?)</span> : null}
      </>
    ) : (
      <span className="text-slate-300">—</span>
    );

  const deviceRows = catalog.filter((d) => d.kind === "device" && cols.some((c) => c.b.counts[d.id]));
  const ledRows = catalog.filter((d) => d.kind === "led" && cols.some((c) => c.b.ledFt[d.id] || c.b.ledTentativeFt[d.id]));
  const wireTypes = Array.from(new Set(cols.flatMap((c) => Object.keys(c.b.wireRuns))));
  const tentativeList = markers.filter((m) => m.tentative);

  async function pdf() {
    setBusy("Preparing…");
    try {
      await exportSheetsPdf({ project: project!, sheets, markers, runs, closets, catalog }, { mode: "takeoff", onProgress: setBusy });
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), "error");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <div className="mb-5 flex flex-wrap items-end gap-3">
          <div className="mr-auto">
            <h2 className="page-title">Takeoff</h2>
            <p className="mt-1 text-sm text-slate-500">Counted only from placed markers and runs. <span className="chip bg-amber-50 text-amber-700">n?</span> = tentative, listed separately.</p>
          </div>
          <button className="btn" onClick={() => downloadText(takeoffCsv(takeoff, catalog), `${slug(project.address)}-takeoff.csv`)}>
            <Download /> CSV
          </button>
          <button className="btn btn-brand" disabled={!!busy || !sheets.length} onClick={pdf}>
            <FileText /> {busy ?? "Marked-up plans PDF"}
          </button>
        </div>

        <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <SummaryCard icon={Camera} label="Cameras" value={countOf(takeoff.total, ["cam-indoor", "cam-outdoor"])} sub={`${takeoff.total.counts["cam-outdoor"] ?? 0} outdoor`} color="text-red-600 bg-red-50" />
          <SummaryCard icon={Wifi} label="Wi-Fi APs" value={takeoff.total.counts["wap"] ?? 0} color="text-blue-600 bg-blue-50" />
          <SummaryCard icon={Speaker} label="Speakers" value={takeoff.total.counts["speaker"] ?? 0} sub={takeoff.total.tentative["speaker"] ? `${takeoff.total.tentative["speaker"]} tentative` : undefined} color="text-violet-600 bg-violet-50" />
          <SummaryCard icon={Tv} label="TVs" value={takeoff.total.counts["tv"] ?? 0} color="text-cyan-600 bg-cyan-50" />
          <SummaryCard icon={Lightbulb} label="LED" value={`${takeoff.total.ledTotalFt}`} unit="LF" sub={`${takeoff.total.ledZones} zones`} color="text-amber-600 bg-amber-50" />
          <SummaryCard icon={Cable} label="Cable" value={`${Math.round(Object.values(takeoff.total.wireFt).reduce((a, b) => a + b, 0))}`} unit="ft" sub={`${Object.values(takeoff.total.wireRuns).reduce((a, b) => a + b, 0)} home runs`} color="text-slate-600 bg-slate-100" />
        </div>

        <div className="card overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th>Item</th>
                {cols.map((c) => (
                  <th key={c.name} className={`text-right ${c.name === "Total" ? "bg-slate-50" : ""}`}>
                    {c.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {CATEGORIES.map((cat) => {
                const rows = deviceRows.filter((d) => d.category === cat.id);
                if (!rows.length) return null;
                return [
                  <tr key={cat.id}>
                    <td colSpan={cols.length + 1} className="bg-slate-50 text-xs font-semibold" style={{ color: cat.color }}>
                      {cat.name}
                    </td>
                  </tr>,
                  ...rows.map((d) => (
                    <tr key={d.id}>
                      <td>{d.name}</td>
                      {cols.map((c) => (
                        <td key={c.name} className={`text-right tabular-nums ${c.name === "Total" ? "bg-slate-50 font-semibold" : ""}`}>
                          {cell(c.b.counts[d.id] ?? 0, c.b.tentative[d.id] ?? 0)}
                        </td>
                      ))}
                    </tr>
                  )),
                ];
              })}
              <tr>
                <td colSpan={cols.length + 1} className="bg-slate-50 text-xs font-semibold text-amber-700">
                  LED
                </td>
              </tr>
              {ledRows.map((d) => (
                <tr key={d.id}>
                  <td>{d.name}</td>
                  {cols.map((c) => (
                    <td key={c.name} className={`text-right tabular-nums ${c.name === "Total" ? "bg-slate-50 font-semibold" : ""}`}>
                      {cell(c.b.ledFt[d.id] ?? 0, c.b.ledTentativeFt[d.id] ?? 0, " LF")}
                    </td>
                  ))}
                </tr>
              ))}
              <tr>
                <td>Stair steps</td>
                {cols.map((c) => (
                  <td key={c.name} className={`text-right tabular-nums ${c.name === "Total" ? "bg-slate-50 font-semibold" : ""}`}>
                    {cell(c.b.stairSteps)}
                  </td>
                ))}
              </tr>
              <tr>
                <td>LED zones</td>
                {cols.map((c) => (
                  <td key={c.name} className={`text-right tabular-nums ${c.name === "Total" ? "bg-slate-50 font-semibold" : ""}`}>
                    {cell(c.b.ledZones)}
                  </td>
                ))}
              </tr>
              <tr className="font-semibold">
                <td>LED total</td>
                {cols.map((c) => (
                  <td key={c.name} className={`text-right tabular-nums ${c.name === "Total" ? "bg-slate-50" : ""}`}>
                    {cell(c.b.ledTotalFt, 0, " LF")}
                  </td>
                ))}
              </tr>
              {wireTypes.length > 0 && (
                <tr>
                  <td colSpan={cols.length + 1} className="bg-slate-50 text-xs font-semibold text-blue-700">
                    Wire (home runs)
                  </td>
                </tr>
              )}
              {wireTypes.map((w) => (
                <tr key={w}>
                  <td>{w}</td>
                  {cols.map((c) => (
                    <td key={c.name} className={`text-right tabular-nums ${c.name === "Total" ? "bg-slate-50 font-semibold" : ""}`}>
                      {c.b.wireRuns[w] ? `${c.b.wireFt[w] ?? 0} ft · ${c.b.wireRuns[w]} runs` : <span className="text-slate-300">—</span>}
                    </td>
                  ))}
                </tr>
              ))}
              <tr>
                <td colSpan={cols.length + 1} className="bg-slate-50 text-xs font-semibold text-green-700">
                  Infrastructure
                </td>
              </tr>
              {CLOSET_KINDS.map((k) => (
                <tr key={k.id}>
                  <td>{k.name}</td>
                  {cols.map((c) => (
                    <td key={c.name} className={`text-right tabular-nums ${c.name === "Total" ? "bg-slate-50 font-semibold" : ""}`}>
                      {cell(c.b.closets[k.id])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {takeoff.total.unmeasuredRuns > 0 && (
          <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            {takeoff.total.unmeasuredRuns} run(s) have no length yet. Set each sheet&apos;s scale or type the LF on the run.
          </p>
        )}

        <h3 className="mb-2 mt-6 font-semibold">Tentative items ({tentativeList.length})</h3>
        {tentativeList.length ? (
          <div className="card overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Label</th>
                  <th>Device</th>
                  <th>Floor</th>
                  <th>Room</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {tentativeList.map((m) => (
                  <tr key={m.id}>
                    <td>{m.label}</td>
                    <td>{catalog.find((d) => d.id === m.deviceTypeId)?.name}</td>
                    <td>{sheets.find((s) => s.id === m.sheetId)?.name}</td>
                    <td>{m.room}</td>
                    <td>{m.notes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-slate-500">None. Mark a device as tentative (?) in its editor.</p>
        )}
      </div>
    </div>
  );
}

function SummaryCard({ icon: Icon, label, value, unit, sub, color }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string | number; unit?: string; sub?: string; color: string }) {
  return (
    <div className="card p-4">
      <div className="flex items-center gap-2">
        <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${color}`}>
          <Icon className="h-4 w-4" />
        </span>
        <span className="text-xs font-medium text-slate-500">{label}</span>
      </div>
      <div className="mt-3 text-2xl font-semibold tabular-nums">
        {value}
        {unit && <span className="ml-1 text-sm font-medium text-slate-400">{unit}</span>}
      </div>
      <div className="h-4 text-xs text-slate-500">{sub}</div>
    </div>
  );
}
