"use client";
// Closet port schedule: which cable lands on which patch-panel / termination port, plus cable label export.
import { Download, Tag } from "lucide-react";
import { useMemo } from "react";
import { downloadText, slug } from "@/lib/download";
import { useEditor } from "@/lib/store";
import { wireColor } from "@/lib/symbols";
import { cableLabelsCsv, portSchedule, portScheduleCsv } from "@/lib/wiring";

export default function PortSchedule() {
  const { project, sheets, markers, runs, closets, catalog, products } = useEditor();
  const rows = useMemo(() => (project ? portSchedule({ project, sheets, markers, runs, closets }, catalog, products) : []), [project, sheets, markers, runs, closets, catalog, products]);
  if (!project) return null;
  const groups = [...new Set(rows.map((r) => r.closetName))];
  const base = slug(project.address);
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="mr-auto">
          <h3 className="text-lg font-semibold">Closet port schedule</h3>
          <p className="mt-0.5 text-sm text-slate-500">Every cable and the port it lands on. Cat6 goes to {24}-port patch panels (PP1-01…); other cables are numbered by type. Print labels once the plan is final — numbers follow floor and label order.</p>
        </div>
        <button className="btn" disabled={!rows.length} onClick={() => downloadText(portScheduleCsv(rows), `${base}-port-schedule.csv`)}>
          <Download /> Port schedule CSV
        </button>
        <button className="btn btn-primary" disabled={!rows.length} onClick={() => downloadText(cableLabelsCsv(rows), `${base}-cable-labels.csv`)} title="Two labels per cable (device end and closet end). Import into Brady, Dymo or Brother P-touch software.">
          <Tag /> Cable labels CSV
        </button>
      </div>
      {groups.length === 0 && <p className="card p-6 text-center text-sm text-slate-500">No wired devices yet.</p>}
      <div className="grid gap-4 lg:grid-cols-2">
        {groups.map((g) => {
          const list = rows.filter((r) => r.closetName === g);
          return (
            <div key={g} className="card overflow-hidden">
              <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-2.5">
                <span className="font-semibold">{g}</span>
                <span className="text-xs text-slate-400">{list.length} cables</span>
                {!list[0].closetId && <span className="ml-auto text-xs text-amber-700">Assign a closet to number these</span>}
              </div>
              <div className="max-h-96 overflow-auto">
                <table className="tbl whitespace-nowrap">
                  <tbody>
                    {list.map((r, i) => (
                      <tr key={i}>
                        <td className="w-20 font-mono text-xs font-semibold">{r.port || "—"}</td>
                        <td>
                          <span className="mr-1.5 inline-block h-2 w-2 rounded-full" style={{ background: wireColor(r.cable) }} />
                          {r.cable}
                        </td>
                        <td className="font-medium">
                          {r.label}
                          {r.tentative && <span className="ml-1 text-amber-700">?</span>}
                        </td>
                        <td className="text-slate-500">{r.room}</td>
                        <td className="text-right text-slate-500 tabular-nums">{r.lengthFt != null ? `${r.lengthFt} ft` : ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
