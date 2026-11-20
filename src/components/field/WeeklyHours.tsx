"use client";
// Weekly hours: person × day from the crew on each daily report, with totals and a CSV for payroll / T&M billing.
import { ChevronLeft, ChevronRight, Download, X } from "lucide-react";
import { useState } from "react";
import { addDays, weeklyHours, weeklyHoursCsv, weekStartOf } from "@/lib/dailyReport";
import { downloadBlob, slug } from "@/lib/download";
import type { JobLog } from "@/lib/types";
import { fmtDate, useT } from "@/lib/i18n";

const dow = (d: string) => fmtDate(`${d}T12:00:00`, { weekday: "short" });
const md = (d: string) => fmtDate(`${d}T12:00:00`, { month: "numeric", day: "numeric" });
const range = (a: string, b: string) => `${fmtDate(`${a}T12:00:00`, { month: "short", day: "numeric" })} – ${fmtDate(`${b}T12:00:00`, { month: "short", day: "numeric", year: "numeric" })}`;
const h = (n: number) => (n ? String(n) : "");

export default function WeeklyHours({ logs, today, job, onClose }: { logs: JobLog[]; today: string; job: string; onClose: () => void }) {
  // Start on the week of the latest report (usually this week).
  const [start, setStart] = useState(() => weekStartOf(logs.map((l) => l.date).sort().pop() ?? today));
  const w = weeklyHours(logs, start);
  const t = useT();
  return (
    <div className="card space-y-3 p-4" aria-label={t("Weekly hours")}>
      <div className="flex items-center gap-2">
        <h3 className="font-semibold">{t("Weekly hours")}</h3>
        <div className="flex-1" />
        <button className="btn btn-sm" disabled={!w.rows.length} onClick={() => downloadBlob(new Blob([weeklyHoursCsv(w)], { type: "text/csv" }), `${slug(job) || "job"}-hours-${w.days[0]}.csv`)}>
          <Download /> CSV
        </button>
        <button className="btn btn-sm btn-icon btn-ghost" aria-label={t("Close weekly hours")} onClick={onClose}>
          <X />
        </button>
      </div>
      <div className="flex items-center gap-1">
        <button className="btn btn-sm btn-icon btn-ghost" aria-label={t("Previous week")} onClick={() => setStart(addDays(start, -7))}>
          <ChevronLeft />
        </button>
        <span className="text-sm text-slate-600 tabular-nums">{range(w.days[0], w.days[6])}</span>
        <button className="btn btn-sm btn-icon btn-ghost" aria-label={t("Next week")} onClick={() => setStart(addDays(start, 7))}>
          <ChevronRight />
        </button>
      </div>
      {w.rows.length ? (
        <div className="-mx-4 overflow-x-auto px-4">
          <table className="tbl min-w-[560px] tabular-nums">
            <thead>
              <tr>
                <th className="sticky left-0 bg-white">{t("Name")}</th>
                {w.days.map((d) => (
                  <th key={d} className={`text-right ${d === today ? "text-brand-700" : ""}`}>
                    {dow(d)} <span className="font-normal text-slate-400">{md(d)}</span>
                  </th>
                ))}
                <th className="text-right">{t("Total")}</th>
              </tr>
            </thead>
            <tbody>
              {w.rows.map((r) => (
                <tr key={r.name}>
                  <td className="sticky left-0 bg-white font-medium whitespace-nowrap">{r.name}</td>
                  {r.hours.map((x, i) => (
                    <td key={i} className="text-right">
                      {h(x)}
                    </td>
                  ))}
                  <td className="text-right font-semibold">{r.total}</td>
                </tr>
              ))}
              <tr className="bg-slate-50">
                <td className="sticky left-0 bg-slate-50 font-semibold">{t("Total")}</td>
                {w.dayTotals.map((x, i) => (
                  <td key={i} className="text-right font-medium">
                    {h(x)}
                  </td>
                ))}
                <td className="text-right font-semibold" data-testid="week-total">
                  {w.total}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-slate-500">{t("No crew hours on the daily logs this week.")}</p>
      )}
    </div>
  );
}
