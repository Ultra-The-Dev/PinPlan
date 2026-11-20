"use client";
// The job's Money tab (office only): one place for the whole money flow, in order — Pricing (the internal numbers),
// Quote (what the client approves), Change orders, then Invoices & payments. The step lives in ?step= so links can
// open it directly; the step bodies are their own components.
import dynamic from "next/dynamic";
import { useMemo } from "react";
import { useJobDocs } from "@/lib/docActions";
import { useDocSettings } from "@/lib/docSettings";
import { msg, useT } from "@/lib/i18n";
import { normalizeDocSettings } from "@/lib/documents";
import { useEditor } from "@/lib/store";
import { isMoneyStep, MONEY_STEPS, type MoneyStep } from "@/lib/tabRoutes";
import { useApprovedProposalQuote } from "../documents/useApprovedProposalQuote";
import { useJobNav } from "../nav/useJobNav";

function Loading() {
  const t = useT();
  return <div className="p-6 text-slate-500">{t("Loading…")}</div>;
}
const loading = () => <Loading />;
const EstimateTab = dynamic(() => import("../EstimateTab"), { loading });
const DocumentsTab = dynamic(() => import("../documents/DocumentsTab"), { loading });
const ChangeOrdersTab = dynamic(() => import("../changeOrders/ChangeOrdersTab"), { loading });

export const MONEY_STEP_LABELS: Record<MoneyStep, string> = {
  pricing: msg("Pricing"),
  quote: msg("Quote"),
  changes: msg("Change orders"),
  invoices: msg("Invoices & payments"),
};

/** `step` is the resolved ?step= from the job page (old links like ?tab=billing already mapped to theirs). */
export default function MoneyTab({ step: asked }: { step?: string | null }) {
  const t = useT();
  const { setTab } = useJobNav();
  const step: MoneyStep = isMoneyStep(asked) ? asked : "pricing";
  // A client approved the quote link: the approved quote is made here, once for the whole tab, so it is there on every
  // step (Change orders too) without anyone opening Pricing or Quote first.
  const project = useEditor((s) => s.project);
  const settings = useEditor((s) => s.settings);
  const liveDocSettings = useDocSettings();
  const ds = useMemo(() => liveDocSettings ?? normalizeDocSettings(settings?.documents, settings?.pricing.currency), [liveDocSettings, settings]);
  const { docs } = useJobDocs(project?.id);
  useApprovedProposalQuote(docs, ds);
  return (
    <div className="flex h-full flex-col">
      <nav className="flex shrink-0 gap-1 overflow-x-auto border-b border-slate-200 bg-white px-3 sm:justify-center sm:px-6" aria-label={t("Money steps")}>
        {MONEY_STEPS.map((s, i) => {
          const on = s === step;
          return (
            <button
              key={s}
              type="button"
              // Also the way back to the step's list from an open document (the document isn't part of another step).
              onClick={() => setTab("money", { step: s })}
              aria-current={on ? "step" : undefined}
              className={`flex h-11 shrink-0 items-center gap-2 border-b-2 px-2 text-sm max-sm:flex-auto max-sm:justify-center font-medium whitespace-nowrap transition sm:px-3 ${on ? "border-brand-600 text-slate-900" : "border-transparent text-slate-500 hover:text-slate-900"}`}
            >
              <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-semibold max-sm:hidden ${on ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-500"}`}>{i + 1}</span>
              {t(MONEY_STEP_LABELS[s])}
            </button>
          );
        })}
      </nav>
      <div className="relative min-h-0 flex-1">
        {step === "pricing" && (
          <div className="h-full overflow-auto">
            <EstimateTab />
          </div>
        )}
        {(step === "quote" || step === "invoices") && (
          <div className="h-full overflow-auto">
            <DocumentsTab />
          </div>
        )}
        {step === "changes" && <ChangeOrdersTab />}
      </div>
    </div>
  );
}
