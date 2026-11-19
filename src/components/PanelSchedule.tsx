"use client";
// Electrical panel schedule: each panel's circuits with breaker, what they feed, devices, wire and a rough load —
// derived from the plan like the closet port schedule. Shown in the crew view (no prices); CSV and PDF exports.
import { Download, FileText, Hash } from "lucide-react";
import { useMemo, useState } from "react";
import { downloadBlob, downloadText, slug } from "@/lib/download";
import { breakerLabel, circuitLabel, numberCircuits, panelSchedule, panelScheduleCsv } from "@/lib/panelSchedule";
import { useEditor } from "@/lib/store";
import { wireColor } from "@/lib/symbols";
import { toast } from "@/lib/toast";

export default function PanelSchedule() {
  const { project, sheets, markers, runs, closets, catalog, updateRun } = useEditor();
  const panels = useMemo(() => panelSchedule({ sheets, markers, runs, closets }, catalog), [sheets, markers, runs, closets, catalog]);
  const [busy, setBusy] = useState(false);
  if (!project) return null;
  const base = slug(project.address || "project");

  async function pdf() {
    setBusy(true);
    try {
      const { renderPanelSchedulePdf } = await import("./PanelSchedulePdf");
      const title = `${project!.address || "Project"}${project!.clientName ? ` — ${project!.clientName}` : ""}`;
      const blob = await renderPanelSchedulePdf({ title, subtitle: `Panel schedule · ${new Date().toLocaleDateString()}`, panels });
      downloadBlob(blob, `${base}-panel-schedule.pdf`);
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), "error");
    } finally {
      setBusy(false);
    }
  }

  async function number(closetId: string) {
    const p = panels.find((x) => x.closetId === closetId);
    if (!p) return;
    const nums = numberCircuits(p);
    const ids = Object.keys(nums);
    if (!ids.length) return toast("Every drawn circuit already has a number", "info");
    for (const id of ids) {
      const r = runs.find((x) => x.id === id);
      if (r) await updateRun(id, { circuit: { ...(r.circuit ?? {}), number: nums[id] } });
    }
    toast(`Numbered ${new Set(Object.values(nums)).size} circuits`, "success");
  }

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="mr-auto">
          <h3 className="text-lg font-semibold">Panel schedule</h3>
          <p className="mt-0.5 text-sm text-slate-500">
            Circuits per panel, from the plan: draw a circuit from a device to its panel, and give devices that share it the same circuit number. Loads are rough estimates (180 VA per receptacle…).
          </p>
        </div>
        <button className="btn" disabled={!panels.length} onClick={() => downloadText(panelScheduleCsv(panels), `${base}-panel-schedule.csv`)}>
          <Download /> Panel schedule CSV
        </button>
        <button className="btn btn-primary" disabled={!panels.length || busy} onClick={() => void pdf()}>
          <FileText /> {busy ? "Preparing…" : "Panel schedule PDF"}
        </button>
      </div>
      {!panels.length && <p className="card p-6 text-center text-sm text-slate-500">Place a main panel or subpanel on the plan and draw circuits to it.</p>}
      <div className="grid gap-4">
        {panels.map((p) => (
          <div key={p.closetId} className="card overflow-hidden">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-slate-100 px-4 py-2.5">
              <span className="font-semibold">
                {p.name}
              </span>
              {p.floor && <span className="text-xs text-slate-400">{p.floor}</span>}
              <span className="text-xs text-slate-500">
                {p.circuits.filter((c) => c.number !== "unassigned").length} circuits · {p.circuits.reduce((n, c) => n + c.devices, 0)} devices
              </span>
              <span className="chip bg-slate-100 text-slate-700 tabular-nums">
                ~{p.totalVA.toLocaleString()} VA · {p.amps240} A @ 240 V
              </span>
              {p.circuits.some((c) => !c.number && c.runIds.length) && (
                <button className="btn btn-sm ml-auto" onClick={() => void number(p.closetId)} title="Give unnumbered circuits the next free breaker spaces (2-pole breakers take two)">
                  <Hash /> Number circuits
                </button>
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="tbl min-w-[720px]">
                <thead>
                  <tr>
                    <th className="w-16">Ckt</th>
                    <th className="w-24">Breaker</th>
                    <th>Feeds</th>
                    <th>Devices</th>
                    <th>Wire</th>
                    <th className="text-right">Ft</th>
                    <th className="text-right">VA</th>
                  </tr>
                </thead>
                <tbody>
                  {p.circuits.map((c, i) => (
                    <tr key={i} className={c.number === "unassigned" ? "bg-amber-50/60" : ""}>
                      <td className="font-mono text-xs font-semibold">{circuitLabel(c)}</td>
                      <td className="whitespace-nowrap">
                        {breakerLabel(c)}
                        {c.volts >= 208 && <span className="ml-1 text-xs text-slate-500">{c.volts} V</span>}
                        {c.breakerGuessed && <span className="ml-1 text-xs text-slate-400" title="Typical size for these devices — set it on the circuit">?</span>}
                      </td>
                      <td>{c.description || <span className="text-slate-400">—</span>}</td>
                      <td className="text-sm">
                        <span className="text-slate-700">{c.devicesText || "—"}</span>
                        {c.labels.length > 0 && <span className="block text-xs text-slate-400">{c.labels.join(", ")}</span>}
                      </td>
                      <td className="whitespace-nowrap">
                        {c.wire && <span className="mr-1.5 inline-block h-2 w-2 rounded-full" style={{ background: wireColor(c.wire) }} />}
                        {c.wire || "—"}
                      </td>
                      <td className="text-right tabular-nums text-slate-500">{c.wireFt ?? ""}</td>
                      <td className="text-right tabular-nums">{c.va ? c.va.toLocaleString() : ""}</td>
                    </tr>
                  ))}
                  {!p.circuits.length && (
                    <tr>
                      <td colSpan={7} className="py-4 text-center text-slate-500">
                        No circuits yet. Draw a circuit from a device to this panel, or set devices’ panel and circuit number.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
