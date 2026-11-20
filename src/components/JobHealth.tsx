"use client";
import Link from "next/link";
import { useMemo } from "react";
import { Activity, ArrowRight, Camera, Check, ClipboardCheck, ListTodo, MapPin, NotebookPen, Receipt } from "lucide-react";
import { contractSummary } from "@/lib/changeOrders";
import { useJobDocs } from "@/lib/docActions";
import { jobBilling } from "@/lib/documents";
import { daysUntil, localDay } from "@/lib/fieldDocs";
import { formatMoney, projectEstimate } from "@/lib/estimate";
import { jobSummary } from "@/lib/jobSummary";
import { useEditor } from "@/lib/store";
import { useRole } from "@/lib/team";
import { can } from "@/lib/teamLogic";
import { useChangeOrders } from "./changeOrders/useChangeOrders";

/** "today", "yesterday", "3 days ago" or a short date, for a YYYY-MM-DD day. */
function dayAgo(day: string, today: string): string {
  const d = daysUntil(today, day);
  if (d === 0) return "today";
  if (d === 1) return "yesterday";
  if (d > 1 && d < 14) return `${d} days ago`;
  const date = new Date(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10));
  return Number.isNaN(date.getTime()) ? day : date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: d > 300 ? "numeric" : undefined });
}

function Stat({ icon: Icon, label, value, sub, tone }: { icon: typeof Activity; label: string; value: string; sub?: string; tone?: "bad" | "ok" }) {
  return (
    <div className="min-w-0 rounded-lg bg-slate-50 px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-xs text-slate-500">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <div className={`mt-0.5 text-lg font-semibold tabular-nums ${tone === "bad" ? "text-red-600" : tone === "ok" ? "text-emerald-700" : "text-slate-900"}`}>{value}</div>
      {sub && <div className={`truncate text-xs ${tone === "bad" ? "text-red-600" : "text-slate-500"}`}>{sub}</div>}
    </div>
  );
}

/** Job health at a glance with the next thing to do. Local data only (no cloud calls). */
export default function JobHealth() {
  const { project, sheets, markers, runs, closets, estimateLines, photos, checklists, jobLogs, catalog, products, settings, updateProject } = useEditor();
  const today = localDay(new Date().toISOString());
  const prices = can(useRole(), "prices");
  const estimate = useMemo(() => {
    if (!project || !settings || !prices) return null;
    const e = projectEstimate({ project, sheets, markers, runs, closets, estimateLines }, catalog, products, { ...settings.pricing, ...(project.pricing ?? {}) });
    return { total: e.total, unpriced: e.lines.filter((l) => l.included && l.unitPrice === 0 && l.qty > 0).length };
  }, [prices, project, settings, sheets, markers, runs, closets, estimateLines, catalog, products]);
  const s = useMemo(
    () => (project ? jobSummary({ project, sheets, markers, runs, photos, checklists, jobLogs, estimate, today, prices }) : null),
    [project, sheets, markers, runs, photos, checklists, jobLogs, estimate, today, prices],
  );
  // Money from the job's own quotes and invoices (office only; technicians never load them).
  const { docs } = useJobDocs(prices ? project?.id : undefined);
  const { rows: changeOrders } = useChangeOrders(prices ? project?.id : undefined);
  const money = useMemo(() => jobBilling(docs ?? [], contractSummary(0, changeOrders ?? []).approved), [docs, changeOrders]);
  if (!project || !s) return null;
  const currency = project.pricing?.currency ?? settings?.pricing.currency ?? "USD";
  const urgent = s.next.kind === "overdueTasks" || s.next.kind === "reviseProposal";
  const finished = s.next.kind === "done";
  return (
    <section className="card p-5 lg:col-span-2" aria-label="Job health">
      <div className="mb-3 flex items-center gap-2">
        <Activity className="h-4 w-4 text-slate-400" />
        <h2 className="font-semibold">Job health</h2>
      </div>
      <div className={`grid grid-cols-2 gap-2 sm:grid-cols-3 ${prices ? "lg:grid-cols-6" : "lg:grid-cols-5"}`}>
        <Stat icon={MapPin} label="Devices" value={String(s.devices)} sub={[s.tentative ? `${s.tentative} tentative` : "", s.ledRuns ? `${s.ledRuns} LED run${s.ledRuns === 1 ? "" : "s"}` : ""].filter(Boolean).join(" · ") || `${s.sheets} plan${s.sheets === 1 ? "" : "s"}`} />
        <Stat
          icon={ClipboardCheck}
          label="Checklists"
          value={s.checklists.total ? `${s.checklists.pct}%` : "—"}
          sub={s.checklists.total ? `${s.checklists.done} of ${s.checklists.total} done` : "None started"}
          tone={s.checklists.total && s.checklists.done === s.checklists.total ? "ok" : undefined}
        />
        <Stat icon={ListTodo} label="Open tasks" value={String(s.tasks.open)} sub={s.tasks.overdue ? `${s.tasks.overdue} overdue` : s.tasks.dueToday ? `${s.tasks.dueToday} due today` : s.tasks.open ? "None overdue" : "All clear"} tone={s.tasks.overdue ? "bad" : undefined} />
        <Stat icon={Camera} label="Photos" value={String(s.photos.count)} sub={s.photos.lastAt ? `Last ${dayAgo(localDay(s.photos.lastAt), today)}` : s.photos.count ? undefined : "None yet"} />
        <Stat icon={NotebookPen} label="Daily log" value={s.logs.lastDate ? dayAgo(s.logs.lastDate, today) : "—"} sub={s.logs.count ? `${s.logs.count} log${s.logs.count === 1 ? "" : "s"}` : "None yet"} />
        {prices && (
          <Stat
            icon={Receipt}
            label={money.quote ? "Money" : "Pricing"}
            value={money.quote ? formatMoney(money.contract ?? 0, currency) : s.estimate ? formatMoney(s.estimate.total, currency) : "—"}
            sub={
              money.quote
                ? `Quote approved · ${formatMoney(money.billed, currency)} of ${formatMoney(money.contract ?? 0, currency)} billed`
                : s.estimate?.unpriced
                  ? `${s.estimate.unpriced} unpriced line${s.estimate.unpriced === 1 ? "" : "s"}`
                  : money.billed
                    ? `${formatMoney(money.billed, currency)} billed`
                    : "No approved quote yet"
            }
            tone={!money.quote && s.estimate?.unpriced ? "bad" : money.quote && money.leftToBill === 0 ? "ok" : undefined}
          />
        )}
      </div>
      {(() => {
        const cls = `mt-3 flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm font-medium ring-1 transition-colors ${
          urgent ? "bg-red-50 text-red-800 ring-red-200 hover:bg-red-100" : finished ? "bg-emerald-50 text-emerald-800 ring-emerald-200" : "bg-brand-50 text-brand-700 ring-brand-200 hover:bg-brand-100"
        }`;
        const inner = (icon: React.ReactNode) => (
          <>
            <span className="text-xs font-semibold tracking-wide uppercase opacity-70">Next step</span>
            <span className="min-w-0 flex-1 truncate">{s.next.text}</span>
            {icon}
          </>
        );
        // Status steps act right here (the status picker lives in the header, hidden on phones).
        const status = s.next.kind === "markApproved" ? "approved" : s.next.kind === "markInstalled" ? "installed" : null;
        if (status)
          return (
            <button type="button" className={cls} onClick={() => void updateProject({ status })}>
              {inner(<span className="chip shrink-0 bg-white capitalize">Mark {status}</span>)}
            </button>
          );
        if (finished) return <div className={cls}>{inner(<Check className="h-4 w-4 shrink-0" />)}</div>;
        return (
          <Link href={`/project?id=${project.id}&tab=${s.next.tab}`} replace className={cls}>
            {inner(<ArrowRight className="h-4 w-4 shrink-0" />)}
          </Link>
        );
      })()}
    </section>
  );
}
