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
import { fmtDate, t as tr, tn, useT } from "@/lib/i18n";
import { useChangeOrders } from "./changeOrders/useChangeOrders";

/** "today", "yesterday", "3 days ago" or a short date, for a YYYY-MM-DD day. */
function dayAgo(day: string, today: string): string {
  const d = daysUntil(today, day);
  if (d === 0) return tr("today");
  if (d === 1) return tr("yesterday");
  if (d > 1 && d < 14) return tn("{n} day ago", "{n} days ago", d);
  const date = new Date(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10));
  return Number.isNaN(date.getTime()) ? day : fmtDate(date, { month: "short", day: "numeric", year: d > 300 ? "numeric" : undefined });
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
  const t = useT();
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
    <section className="card p-5 lg:col-span-2" aria-label={t("Job health")}>
      <div className="mb-3 flex items-center gap-2">
        <Activity className="h-4 w-4 text-slate-400" />
        <h2 className="font-semibold">{t("Job health")}</h2>
      </div>
      <div className={`grid grid-cols-2 gap-2 sm:grid-cols-3 ${prices ? "lg:grid-cols-6" : "lg:grid-cols-5"}`}>
        <Stat icon={MapPin} label={t("Devices")} value={String(s.devices)} sub={[s.tentative ? t("{n} optional", { n: s.tentative }) : "", s.ledRuns ? t.tn("{n} LED run", "{n} LED runs", s.ledRuns) : ""].filter(Boolean).join(" · ") || t.tn("{n} plan", "{n} plans", s.sheets)} />
        <Stat
          icon={ClipboardCheck}
          label={t("Checklists")}
          value={s.checklists.total ? `${s.checklists.pct}%` : "—"}
          sub={s.checklists.total ? t("{done} of {total} done", { done: s.checklists.done, total: s.checklists.total }) : t("None started")}
          tone={s.checklists.total && s.checklists.done === s.checklists.total ? "ok" : undefined}
        />
        <Stat icon={ListTodo} label={t("Open tasks")} value={String(s.tasks.open)} sub={s.tasks.overdue ? t("{n} overdue", { n: s.tasks.overdue }) : s.tasks.dueToday ? t("{n} due today", { n: s.tasks.dueToday }) : s.tasks.open ? t("None overdue") : t("All clear")} tone={s.tasks.overdue ? "bad" : undefined} />
        <Stat icon={Camera} label={t("Photos")} value={String(s.photos.count)} sub={s.photos.lastAt ? t("Last: {when}", { when: dayAgo(localDay(s.photos.lastAt), today) }) : s.photos.count ? undefined : t("None yet")} />
        <Stat icon={NotebookPen} label={t("Daily log")} value={s.logs.lastDate ? dayAgo(s.logs.lastDate, today) : "—"} sub={s.logs.count ? t.tn("{n} log", "{n} logs", s.logs.count) : t("None yet")} />
        {prices && (
          <Stat
            icon={Receipt}
            label={money.quote ? t("Money") : t("Pricing")}
            value={money.quote ? formatMoney(money.contract ?? 0, currency) : s.estimate ? formatMoney(s.estimate.total, currency) : "—"}
            sub={
              money.quote
                ? t("Quote approved · {billed} of {contract} billed", { billed: formatMoney(money.billed, currency), contract: formatMoney(money.contract ?? 0, currency) })
                : s.estimate?.unpriced
                  ? t.tn("{n} unpriced line", "{n} unpriced lines", s.estimate.unpriced)
                  : money.billed
                    ? t("{amount} billed", { amount: formatMoney(money.billed, currency) })
                    : t("No approved quote yet")
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
            <span className="text-xs font-semibold tracking-wide uppercase opacity-70">{t("Next step")}</span>
            <span className="min-w-0 flex-1 truncate">{t(s.next.text)}</span>
            {icon}
          </>
        );
        // Status steps act right here (the status picker lives in the header, hidden on phones).
        const status = s.next.kind === "markApproved" ? "approved" : s.next.kind === "markInstalled" ? "installed" : null;
        if (status)
          return (
            <button type="button" className={cls} onClick={() => void updateProject({ status })}>
              {inner(<span className="chip shrink-0 bg-white">{status === "approved" ? t("Mark approved") : t("Mark installed")}</span>)}
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
