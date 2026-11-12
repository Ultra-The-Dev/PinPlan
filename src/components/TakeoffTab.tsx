"use client";
import { useMemo, useState } from "react";
import { CATEGORIES, CLOSET_KINDS } from "@/lib/catalog";
import { downloadText, slug } from "@/lib/download";
import { exportSheetsPdf } from "@/lib/exportSheets";
import { useEditor } from "@/lib/store";
import { computeTakeoff, takeoffCsv, type TakeoffBucket } from "@/lib/takeoff";

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
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto max-w-6xl p-4 sm:p-6">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <h2 className="text-xl font-semibold">Takeoff</h2>
          <p className="text-sm text-slate-500">Counted only from placed markers and runs. (n?) = tentative, listed separately.</p>
          <div className="flex-1" />
          <button className="btn" onClick={() => downloadText(takeoffCsv(takeoff, catalog), `${slug(project.address)}-takeoff.csv`)}>
            Download CSV
          </button>
          <button className="btn btn-primary" disabled={!!busy || !sheets.length} onClick={pdf}>
            {busy ?? "Marked-up plans PDF"}
          </button>
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
                    <td colSpan={cols.length + 1} className="bg-slate-50 text-xs font-semibold uppercase tracking-wide" style={{ color: cat.color }}>
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
                <td colSpan={cols.length + 1} className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-amber-700">
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
                  <td colSpan={cols.length + 1} className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-blue-700">
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
                <td colSpan={cols.length + 1} className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-green-700">
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
