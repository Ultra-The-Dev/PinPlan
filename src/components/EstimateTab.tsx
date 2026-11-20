"use client";
import { apiFetch } from "@/lib/api";
import { ChevronDown, CircleExclamationPoint, Download, Ellipsis, FileText, Package, RefreshCw, RotateCcw, Send, Settings, Trash } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { contractSummary } from "@/lib/changeOrders";
import { put } from "@/lib/db";
import { useJobDocs } from "@/lib/docActions";
import { useDocSettings } from "@/lib/docSettings";
import { jobBilling, normalizeDocSettings } from "@/lib/documents";
import { useBilldu } from "@/lib/useBilldu";
import { useChangeOrders } from "./changeOrders/useChangeOrders";
import { Menu } from "./documents/ui";
import { downloadBlob, downloadText, slug } from "@/lib/download";
import { depositAmount, estimateCsv, lineProductId, projectEstimate, formatMoney, type ComputedLine, type Estimate } from "@/lib/estimate";
import { useEditor } from "@/lib/store";
import { msg, useT } from "@/lib/i18n";
import { LAYERS } from "@/lib/catalog";
import { computeTakeoff } from "@/lib/takeoff";
import type { BillduDocRef, PricingSettings } from "@/lib/types";
import JobProducts from "./JobProducts";
import ProposalPanel from "./ProposalPanel";
import AddChargeMenu from "./AddChargeMenu";
import { fmtPct, roundPct } from "@/lib/percent";

type DocType = "estimate" | "order" | "invoice";
// Billdu's own document types; "estimate" is what Billdu calls a quote (the id stays, the words follow the glossary).
const DOC_TYPE_NAMES: Record<DocType, string> = { estimate: msg("quote"), order: msg("order"), invoice: msg("invoice") };

function Cell(props: Parameters<typeof CellInner>[0]) {
  return <CellInner key={String(props.value)} {...props} />;
}

function CellInner({
  value,
  onCommit,
  numeric,
  className = "",
  placeholder,
  label,
}: {
  value: string | number;
  onCommit: (v: string) => void;
  numeric?: boolean;
  className?: string;
  placeholder?: string;
  /** Accessible name (the cells have no visible label of their own). */
  label?: string;
}) {
  // Parent remounts the cell (key) when the committed value changes.
  const [v, setV] = useState(String(value));
  return (
    <input
      value={v}
      aria-label={label}
      placeholder={placeholder}
      inputMode={numeric ? "decimal" : undefined}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => v !== String(value) && onCommit(v)}
      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
      className={`w-full rounded border border-transparent bg-transparent px-1.5 py-1 hover:border-slate-200 pointer-coarse:border-slate-200 pointer-coarse:bg-white pointer-coarse:py-1.5 focus:border-brand-500 focus:bg-white focus:outline-none ${numeric ? "text-right tabular-nums" : ""} ${className}`}
    />
  );
}

const enterBlurs = (e: React.KeyboardEvent<HTMLInputElement>) => {
  if (e.key === "Enter") e.currentTarget.blur();
};

const num = (s: string) => {
  const n = parseFloat(s.replace(/[$,]/g, ""));
  return Number.isFinite(n) ? n : null;
};

const GROUP_NAMES: Record<ComputedLine["group"], string> = {
  devices: msg("Devices"),
  lighting: msg("Lighting"),
  wire: msg("Wire"),
  labor: msg("Labor"),
  infrastructure: msg("Infrastructure"),
  custom: msg("Additional charges"),
};

export default function EstimateTab() {
  const t = useT();
  const project = useEditor((s) => s.project);
  const sheets = useEditor((s) => s.sheets);
  const markers = useEditor((s) => s.markers);
  const runs = useEditor((s) => s.runs);
  const closets = useEditor((s) => s.closets);
  const catalog = useEditor((s) => s.catalog);
  const products = useEditor((s) => s.products);
  const settings = useEditor((s) => s.settings);
  const estimateLines = useEditor((s) => s.estimateLines);
  const upsert = useEditor((s) => s.upsertEstimateLine);
  const removeOverride = useEditor((s) => s.removeEstimateOverride);
  const updateProject = useEditor((s) => s.updateProject);
  const reloadCatalog = useEditor((s) => s.reloadCatalog);

  const pricing: PricingSettings | null = useMemo(
    () => (settings ? { ...settings.pricing, ...(project?.pricing ?? {}) } : null),
    [settings, project?.pricing],
  );
  const takeoff = useMemo(() => computeTakeoff({ sheets, markers, runs, closets }), [sheets, markers, runs, closets]);
  const estimate: Estimate | null = useMemo(
    () => (pricing && project ? projectEstimate({ project, sheets, markers, runs, closets, estimateLines }, catalog, products, pricing, takeoff) : null),
    [takeoff, catalog, products, pricing, estimateLines, project, sheets, markers, runs, closets],
  );

  const billdu = useBilldu();
  const liveDocSettings = useDocSettings();
  const docSettings = liveDocSettings ?? normalizeDocSettings(settings?.documents, settings?.pricing.currency);
  const { docs } = useJobDocs(project?.id);
  const { rows: changeOrders } = useChangeOrders(project?.id);
  const billing = useMemo(() => jobBilling(docs ?? [], contractSummary(0, changeOrders ?? []).approved), [docs, changeOrders]);
  // Bumped by "Send to client": opens the client quote form.
  const [sendTick, setSendTick] = useState(0);

  const [docTypeChoice, setDocType] = useState<DocType | null>(null);
  const docType: DocType = docTypeChoice ?? settings?.billduDocType ?? "estimate";
  const [depositPct, setDepositPct] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);


  const input = "input w-24 text-right";
  if (!project || !settings || !pricing || !estimate) return <div className="p-6 text-slate-500">{t("Loading…")}</div>;

  const cur = pricing.currency;
  const pricedOverrides = estimateLines.filter((l) => !l.deleted && !l.removed && l.unitPrice != null && !l.key.startsWith("custom:")).length;
  const removedKeys = estimateLines.filter((l) => l.removed && !l.deleted).map((l) => l.key);
  const fileBase = `${slug(project.address || project.clientName)}-quote`;
  const docTypeName = t(DOC_TYPE_NAMES[docType]);

  const setPricing = (patch: Partial<PricingSettings>) => updateProject({ pricing: { ...(project.pricing ?? {}), ...patch } });

  async function downloadPdf() {
    setBusy("pdf");
    try {
      const { renderEstimatePdf } = await import("./EstimatePdf");
      const tot = takeoff.total;
      const devices = Object.entries(tot.counts).reduce((n, [, v]) => n + v, 0) - Object.values(tot.tentative).reduce((a, b) => a + b, 0);
      const scope = [
        { label: "Floors", value: String(sheets.length) },
        { label: "Devices", value: String(devices) },
        ...(tot.ledTotalFt ? [{ label: "LED", value: `${tot.ledTotalFt} LF` }] : []),
      ];
      const blob = await renderEstimatePdf({ project: project!, business: settings!.business, estimate: estimate!, currency: cur, taxPct: pricing!.taxPct, scope, validDays: docSettings.quoteValidDays });
      downloadBlob(blob, `${fileBase}.pdf`);
    } catch (e) {
      setError(t("PDF failed: {error}", { error: (e as Error).message }));
    } finally {
      setBusy(null);
    }
  }
  const downloadCsv = () => downloadText(estimateCsv(estimate), `${fileBase}.csv`);

  const dep = num(depositPct);
  const isDeposit = dep != null && dep > 0 && dep < 100;
  const existingSame = project.billduDocs.find((d) => d.type === docType && !d.percent);

  async function send(existingDocId: number | null) {
    setBusy("send");
    setError(null);
    setNotice(null);
    try {

      const r = await apiFetch("/api/billdu/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project: {
            id: project!.id,
            clientName: project!.clientName,
            clientEmail: project!.clientEmail,
            clientPhone: project!.clientPhone,
            address: project!.address,
            billduClientId: project!.billduClientId ?? null,
          },
          docType,
          // Item code in Billdu = the product's SKU when there is one (nothing otherwise).
          lines: estimate!.lines.map((l) => {
            const pid = lineProductId(l.key, project!, products);
            return { ...l, sku: pid ? (products.find((p) => p.id === pid)?.sku ?? null) : null };
          }),
          taxPct: pricing!.taxPct,
          currency: cur,
          depositPct: isDeposit ? dep : null,
          existingDocId,
        }),
      });
      const j = await r.json().catch(() => ({ error: t("Server returned {status}", { status: r.status }) }));
      if (!r.ok) throw new Error(j.error || t("Billdu request failed ({status})", { status: r.status }));
      const ref: BillduDocRef = {
        id: j.doc.id,
        type: docType,
        serial: j.doc.serial,
        amount: j.doc.amount,
        percent: j.doc.percent,
        label: isDeposit ? `Deposit ${dep}%` : undefined,
        createdAt: new Date().toISOString(),
      };
      const old = existingDocId ? project!.billduDocs.find((d) => d.id === existingDocId) : undefined;
      // Updated: keep its number and date. Re-created (deleted in Billdu): replace the old entry.
      const merged = old ? { ...ref, serial: j.doc.updated ? (ref.serial ?? old.serial) : ref.serial, createdAt: j.doc.updated ? old.createdAt : ref.createdAt } : ref;
      const docs = old ? project!.billduDocs.map((d) => (d.id === old.id ? merged : d)) : [...project!.billduDocs, ref];
      await updateProject({ billduClientId: j.clientId, billduDocs: docs });
      const noticeVars = { type: docTypeName, number: merged.serial ?? `#${merged.id}`, amount: formatMoney(merged.amount, cur) };
      setNotice(
        j.doc.updated
          ? t("Updated in Billdu: {type} {number} ({amount} before tax). Attach the plans PDF in Billdu if needed.", noticeVars)
          : t("Created in Billdu: {type} {number} ({amount} before tax). Attach the plans PDF in Billdu if needed.", noticeVars),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  function onSendClick() {
    // Same job, same document type: update what was sent before instead of making a duplicate.
    void send(!isDeposit && existingSame ? existingSame.id : null);
  }

  /** The client's marked-up plans (devices + lighting, no crew wiring) as a PDF, to attach in Billdu. */
  async function downloadPlansPdf() {
    setBusy("plans");
    try {
      const { exportSheetsPdf } = await import("@/lib/exportSheets");
      const layers = LAYERS.map((l) => l.id).filter((l) => l !== "wiring");
      await exportSheetsPdf({ project: project!, sheets, markers, runs, closets, catalog }, { mode: "takeoff", layers });
    } catch (e) {
      setError(t("Plans PDF failed: {error}", { error: (e as Error).message }));
    } finally {
      setBusy(null);
    }
  }

  async function syncProducts() {
    setBusy("products");
    setError(null);
    setNotice(null);
    try {
      const live = catalog.filter((d) => !d.archived);
      const r = await apiFetch("/api/billdu/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceTypes: live, taxPct: pricing!.taxPct, laborMode: pricing!.laborMode, markupPct: pricing!.markupPct }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || t("Product sync failed"));
      const created = j.created as Record<string, number>;
      for (const d of live) if (created[d.id]) await put("deviceTypes", { ...d, billduProductId: created[d.id] });
      await reloadCatalog();
      const n = Object.keys(created).length;
      const failed = j.errors?.length ?? 0;
      const parts = [t.tn("{n} product created in Billdu.", "{n} products created in Billdu.", n)];
      if (failed) parts.push(t("{n} failed.", { n: failed }));
      parts.push(t.tn("{n} was already linked.", "{n} were already linked.", live.length - n - failed));
      setNotice(parts.join(" "));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const groups = (Object.keys(GROUP_NAMES) as ComputedLine["group"][])
    .map((g) => ({ g, lines: estimate.lines.filter((l) => l.group === g) }))
    .filter((x) => x.lines.length);
  const unpriced = estimate.lines.filter((l) => l.included && l.unitPrice === 0 && l.qty > 0);
  // Billed so far, from the job's own invoices (Billdu documents are a copy, not counted here).
  const billedPct = Math.min(100, billing.contract ? (billing.billed / billing.contract) * 100 : 0);

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      <div className="mb-3 sm:mb-5">
        <h2 className="page-title">{t("Pricing")}</h2>
        <p className="mt-1 text-sm text-slate-500">{t("Built from the takeoff and your price list. Tap any value to change it for this job.")}</p>
      </div>

      {/* The total and the next step first; it stays in view while scrolling on a phone. */}
      <div className="card sticky top-0 z-20 mb-5 flex flex-wrap items-center gap-3 px-4 py-3 shadow-sm sm:static sm:shadow-none">
        <div className="mr-auto min-w-0">
          <div className="text-xs text-slate-500">{pricing.taxPct ? t("Total with {pct}% tax", { pct: fmtPct(pricing.taxPct) }) : t("Total")}</div>
          <div className="text-2xl font-semibold tabular-nums" data-testid="pricing-total">
            {formatMoney(estimate.total, cur)}
          </div>
          {billing.quote ? (
            <div className="text-xs text-slate-500">
              {t("Quote approved · {billed} of {contract} billed", { billed: formatMoney(billing.billed, cur), contract: formatMoney(billing.contract ?? 0, cur) })}
            </div>
          ) : null}
        </div>
        <button className="btn btn-brand" onClick={() => setSendTick((n) => n + 1)} disabled={!estimate.lines.length}>
          <Send /> {t("Send to client")}
        </button>
        <Menu
          label={<span className="sr-only sm:not-sr-only">{t("More")}</span>}
          icon={<Ellipsis />}
          items={[
            { label: busy === "pdf" ? t("Building PDF…") : t("Client PDF"), icon: <FileText />, disabled: busy === "pdf", onClick: () => void downloadPdf() },
            { label: t("Spreadsheet (CSV)"), icon: <Download />, onClick: downloadCsv },
          ]}
        />
      </div>

      {unpriced.length > 0 && (
        <div className="mb-5 flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 sm:flex-row sm:items-center">
          <div className="flex flex-1 items-start gap-2.5">
            <CircleExclamationPoint className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              <strong className="font-semibold">{t.tn("{n} line has no price yet", "{n} lines have no price yet", unpriced.length)}</strong>{" "}
              — {unpriced
                .slice(0, 3)
                .map((l) => l.description.replace(" — installed", "").replace(/ \(home runs: \d+\)/, ""))
                .join(", ")}
              {unpriced.length > 3 ? ` ${t("and {n} more", { n: unpriced.length - 3 })}` : ""}. {t("Set prices in the price list and wire settings, or type them here.")}
            </span>
          </div>
          <div className="flex gap-2 pl-6 sm:pl-0">
            <Link href="/catalog" className="btn btn-sm">
              <Package /> {t("Price list")}
            </Link>
            <Link href="/settings#wire" className="btn btn-sm">
              <Settings /> {t("Wire prices")}
            </Link>
          </div>
        </div>
      )}

      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-5">
          <details className="card group">
            <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-2 gap-y-0.5 px-4 py-3 text-sm font-medium pointer-coarse:min-h-11 [&::-webkit-details-marker]:hidden">
              <ChevronDown className="h-4 w-4 text-slate-400 transition-transform group-open:rotate-180" />
              <span className="shrink-0">{t("Adjust pricing")}</span>
              <span className="min-w-0 text-xs font-normal text-slate-500 max-sm:basis-full max-sm:pl-6 sm:ml-auto sm:truncate">
                {pricing.laborMode === "combined"
                  ? t("Markup {markup}% · tax {tax}% · labor in the price", { markup: pricing.markupPct, tax: fmtPct(pricing.taxPct) })
                  : t("Markup {markup}% · tax {tax}% · labor separate", { markup: pricing.markupPct, tax: fmtPct(pricing.taxPct) })}
              </span>
            </summary>
          <div className="flex flex-wrap items-end gap-4 border-t border-slate-100 p-4">
            <label className="text-sm">
              <span className="label">{t("Markup %")}</span>
              <input className={input} defaultValue={pricing.markupPct} key={`mk${pricing.markupPct}`} inputMode="decimal" onBlur={(e) => setPricing({ markupPct: num(e.target.value) ?? 0 })} onKeyDown={enterBlurs} />
            </label>
            <label className="text-sm">
              <span className="label">{t("Tax %")}</span>
              <input className={input} defaultValue={pricing.taxPct} key={`tx${pricing.taxPct}`} inputMode="decimal" onBlur={(e) => setPricing({ taxPct: roundPct(num(e.target.value) ?? 0) })} onKeyDown={enterBlurs} />
            </label>
            <label className="text-sm">
              <span className="label">{t("Labor")}</span>
              <select className="input w-full sm:w-auto" value={pricing.laborMode} onChange={(e) => setPricing({ laborMode: e.target.value as PricingSettings["laborMode"] })}>
                <option value="combined">{t("Combined (installed price)")}</option>
                <option value="separate">{t("Separate labor lines")}</option>
              </select>
            </label>
            <label className="flex h-10 cursor-pointer items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" className="accent-brand-600" checked={pricing.includeTentative} onChange={(e) => setPricing({ includeTentative: e.target.checked })} />
              {t("Include “?” items by default")}
            </label>
            <span className="ml-auto self-center text-xs text-slate-400">{t("Applies to this job only")}</span>
            <p className="basis-full text-xs text-slate-500">
              {t("Wire prices per foot are set in Settings:")}{" "}
              <Link href="/settings#wire" className="font-medium text-brand-600 hover:underline">
                {t("Settings → Wire")}
              </Link>
            </p>
            {pricedOverrides > 0 && (
              <p className="basis-full text-xs text-slate-500">
                {t.tn(
                  "Markup is on material. {n} line has a typed price, which is final and isn’t marked up — reset it to use the price list.",
                  "Markup is on material. {n} lines have a typed price, which is final and isn’t marked up — reset them to use the price list.",
                  pricedOverrides,
                )}
              </p>
            )}
          </div>
          </details>

          <JobProducts takeoff={takeoff} pricing={pricing} />

          {/* Phones: one stacked block per line (description, then qty × price = total), all still editable. */}
          <div className="card divide-y divide-slate-100 sm:hidden">
            {groups.map(({ g, lines }) => (
              <div key={g} className="px-4 pt-3 pb-1">
                <div className="section-title pb-1">{t(GROUP_NAMES[g])}</div>
                {lines.map((l) => (
                  <div key={l.key} className={`py-2.5 ${l.included ? "" : "text-slate-400"}`}>
                    <div className="flex items-center gap-2">
                      {l.optional && (
                        <input type="checkbox" className="accent-brand-600" title={t("Include in total")} aria-label={t("Include in total: {item}", { item: l.description })} checked={l.included} onChange={(e) => upsert(l.key, { include: e.target.checked })} />
                      )}
                      <div className="min-w-0 flex-1">
                        <Cell label={t("Description")} value={l.description} onCommit={(v) => upsert(l.key, { description: v || null })} />
                      </div>
                      <button className="btn btn-sm btn-icon btn-ghost text-slate-400" aria-label={t("Remove line: {item}", { item: l.description })} onClick={() => upsert(l.key, { removed: true })}>
                        <Trash />
                      </button>
                    </div>
                    <div className="mt-1 flex items-center gap-1 text-sm text-slate-500">
                      <div className="w-16">
                        <Cell numeric label={t("Quantity: {item}", { item: l.description })} value={Number(l.qty.toFixed(2))} onCommit={(v) => upsert(l.key, { qty: num(v) })} />
                      </div>
                      <span className="shrink-0 whitespace-nowrap">{l.unit} ×</span>
                      <div className="w-24">
                        <Cell numeric label={t("Unit price: {item}", { item: l.description })} value={l.unitPrice.toFixed(2)} onCommit={(v) => upsert(l.key, { unitPrice: num(v) })} className={l.unitPrice === 0 && l.included ? "text-amber-700" : ""} />
                      </div>
                      <span className="ml-auto font-medium text-slate-900 tabular-nums">{formatMoney(l.total, cur)}</span>
                    </div>
                    {(l.optional || (l.overridden && !l.key.startsWith("custom:"))) && (
                      <div className="mt-1 flex gap-3 text-xs">
                        {l.optional && <span className="text-amber-700">{t("Optional, marked ?")}</span>}
                        {l.overridden && !l.key.startsWith("custom:") && (
                          <button className="tap text-brand-600" onClick={() => removeOverride(l.key)}>
                            {t("Edited · reset")}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ))}
            <div className="px-4 py-2.5">
              <AddChargeMenu total={takeoff.total} currency={cur} onAdd={(k, p) => void upsert(k, p)} />
            </div>
            {estimate.lines.length === 0 && <p className="p-8 text-center text-sm text-slate-500">{t("Place devices on the plan to build the pricing.")}</p>}
          </div>

          <div className="card hidden overflow-x-auto sm:block">
            <table className="w-full min-w-[680px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/60 text-left text-[11px] font-semibold text-slate-500">
                  <th className="w-10 px-3 py-2.5"></th>
                  <th className="px-3 py-2.5">{t("Description")}</th>
                  <th className="w-24 px-3 py-2.5 text-right">{t("Qty")}</th>
                  <th className="w-20 px-3 py-2.5">{t("Unit")}</th>
                  <th className="w-28 px-3 py-2.5 text-right">{t("Unit price")}</th>
                  <th className="w-28 px-3 py-2.5 text-right">{t("Total")}</th>
                  <th className="w-20 px-3 py-2.5"></th>
                </tr>
              </thead>
              {groups.map(({ g, lines }) => (
                <tbody key={g}>
                  <tr>
                    <td colSpan={7} className="px-3 pt-4 pb-1.5 text-[11px] font-semibold text-slate-400">
                      {t(GROUP_NAMES[g])}
                    </td>
                  </tr>
                  {lines.map((l) => (
                    <tr key={l.key} className={`group border-t border-slate-100 ${l.included ? "" : "text-slate-400"}`}>
                      <td className="px-3 py-1 text-center">
                        {l.optional ? (
                          <input type="checkbox" className="accent-brand-600" title={t("Include in total")} aria-label={t("Include in total: {item}", { item: l.description })} checked={l.included} onChange={(e) => upsert(l.key, { include: e.target.checked })} />
                        ) : null}
                      </td>
                      <td className="px-2 py-1">
                        <div className="flex items-center gap-1.5">
                          <Cell label={t("Description")} value={l.description} onCommit={(v) => upsert(l.key, { description: v || null })} />
                          {l.optional && <span className="chip shrink-0 bg-amber-50 text-amber-700">{t("optional")}</span>}
                          {l.overridden && !l.key.startsWith("custom:") && <span className="chip shrink-0 bg-brand-50 text-brand-700">{t("edited")}</span>}
                        </div>
                      </td>
                      <td className="px-2 py-1">
                        <Cell numeric label={t("Quantity: {item}", { item: l.description })} value={Number(l.qty.toFixed(2))} onCommit={(v) => upsert(l.key, { qty: num(v) })} />
                      </td>
                      <td className="px-2 py-1">
                        <Cell label={t("Unit: {item}", { item: l.description })} value={l.unit} onCommit={(v) => upsert(l.key, { unit: v || null })} />
                      </td>
                      <td className="px-2 py-1">
                        <Cell numeric label={t("Unit price: {item}", { item: l.description })} value={l.unitPrice.toFixed(2)} onCommit={(v) => upsert(l.key, { unitPrice: num(v) })} className={l.unitPrice === 0 && l.included ? "text-amber-700" : ""} />
                      </td>
                      <td className="px-3 py-1 text-right font-medium tabular-nums">{formatMoney(l.total, cur)}</td>
                      <td className="px-2 py-1 text-right whitespace-nowrap">
                        {l.overridden && !l.key.startsWith("custom:") && (
                          <button className="btn btn-sm btn-icon btn-ghost" title={t("Reset to the takeoff value")} aria-label={t("Reset to the takeoff value: {item}", { item: l.description })} onClick={() => removeOverride(l.key)}>
                            <RotateCcw />
                          </button>
                        )}
                        <button className="btn btn-sm btn-icon btn-ghost text-slate-400 hover:text-red-600" title={t("Remove line")} aria-label={t("Remove line: {item}", { item: l.description })} onClick={() => upsert(l.key, { removed: true })}>
                          <Trash />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              ))}
              <tbody>
                <tr className="border-t border-slate-200">
                  <td colSpan={7} className="px-3 py-2.5">
                    <AddChargeMenu total={takeoff.total} currency={cur} onAdd={(k, p) => void upsert(k, p)} />
                    {removedKeys.length > 0 && (
                      <span className="ml-3 text-xs text-slate-500">
                        {t.tn("{n} removed line", "{n} removed lines", removedKeys.length)} ·{" "}
                        <button className="font-medium text-brand-600 hover:underline" onClick={() => removedKeys.forEach((k) => (k.startsWith("custom:") ? upsert(k, { removed: false }) : removeOverride(k)))}>
                          {t("restore")}
                        </button>
                      </span>
                    )}
                  </td>
                </tr>
              </tbody>
            </table>
            {estimate.lines.length === 0 && <p className="p-8 text-center text-sm text-slate-500">{t("Place devices on the plan to build the pricing.")}</p>}
          </div>
        </div>

        <aside className="space-y-5 lg:sticky lg:top-4 lg:self-start">
          <section className="card p-5">
            <div className="section-title mb-3">{t("Summary")}</div>
            <dl className="space-y-1.5 text-sm">
              <div className="flex justify-between">
                <dt className="text-slate-500">{t("Subtotal")}</dt>
                <dd className="tabular-nums">{formatMoney(estimate.subtotal, cur)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">{t("Tax ({pct}%)", { pct: fmtPct(pricing.taxPct) })}</dt>
                <dd className="tabular-nums">{formatMoney(estimate.tax, cur)}</dd>
              </div>
              <div className="flex items-baseline justify-between border-t border-slate-200 pt-3">
                <dt className="font-semibold">{t("Total")}</dt>
                <dd className="text-2xl font-semibold tabular-nums">{formatMoney(estimate.total, cur)}</dd>
              </div>
              {estimate.optionalTotal > 0 && (
                <div className="flex justify-between text-xs text-slate-500">
                  <dt>{t("Optional (“?”) not included")}</dt>
                  <dd className="tabular-nums">{formatMoney(estimate.optionalTotal, cur)}</dd>
                </div>
              )}
            </dl>
          </section>

          {(billing.quote || billing.billed > 0) && (
            <section className="card p-5 text-sm">
              <div className="section-title mb-3">{t("Billed")}</div>
              <div className="mb-1.5 flex justify-between">
                <span className="text-slate-500">{billing.quote ? (billing.contract !== billing.quote.total ? t("Approved quote + changes") : t("Approved quote")) : t("Invoiced")}</span>
                <span className="font-medium tabular-nums">{billing.quote ? formatMoney(billing.contract ?? 0, cur) : formatMoney(billing.billed, cur)}</span>
              </div>
              {billing.contract ? (
                <>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-brand-600 transition-all" style={{ width: `${billedPct}%` }} />
                  </div>
                  <p className="mt-1.5 text-xs text-slate-500">
                    {t("{billed} billed · {left} left to bill", { billed: formatMoney(billing.billed, cur), left: formatMoney(billing.leftToBill ?? 0, cur) })}
                  </p>
                </>
              ) : null}
              <Link href={`/project?id=${encodeURIComponent(project.id)}&tab=money&step=invoices`} className="mt-2 inline-block text-xs font-medium text-brand-600 hover:underline">
                {t("Invoices & payments")}
              </Link>
            </section>
          )}

          <ProposalPanel estimate={estimate} takeoff={takeoff} pricing={pricing} openForm={sendTick} />

          {billdu && (
          <section className="card p-5">
            <div className="mb-4 flex items-center gap-2">
              <Send className="h-4 w-4 text-brand-600" />
              <h3 className="font-semibold">{t("Send to Billdu")}</h3>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-sm">
                <span className="label">{t("Document")}</span>
                <select className="input" value={docType} onChange={(e) => setDocType(e.target.value as DocType)}>
                  <option value="estimate">{t("Quote")}</option>
                  <option value="order">{t("Order")}</option>
                  <option value="invoice">{t("Invoice")}</option>
                </select>
              </label>
              <label className="text-sm">
                <span className="label">{t("Deposit %")}</span>
                <input className="input text-right" placeholder={t("full")} value={depositPct} onChange={(e) => setDepositPct(e.target.value)} inputMode="decimal" />
              </label>
            </div>
            {isDeposit && (
              <p className="mt-2 text-xs text-slate-600">
                {t("One line: {pct}% of {subtotal} = {amount} before tax.", { pct: dep!, subtotal: formatMoney(estimate.subtotal, cur), amount: formatMoney(depositAmount(estimate.subtotal, dep!), cur) })}
              </p>
            )}
            <button className="btn btn-brand mt-4 h-10 w-full" disabled={!!busy || estimate.subtotal <= 0} onClick={onSendClick}>
              <Send />{" "}
              {busy === "send"
                  ? t("Sending…")
                  : !isDeposit && existingSame
                    ? t("Update {type} {number} in Billdu", { type: docTypeName, number: existingSame.serial ?? `#${existingSame.id}` })
                    : isDeposit
                      ? t("Send {pct}% {type} to Billdu", { pct: dep!, type: docTypeName })
                      : t("Send {type} to Billdu", { type: docTypeName })}
            </button>
            {!isDeposit && existingSame && (
              <p className="mt-1.5 text-center text-xs text-slate-500">
                {t("Updates the same document with this job’s current lines")} ·{" "}
                <button className="font-medium text-brand-600 hover:underline" disabled={!!busy} onClick={() => void send(null)}>
                  {t("create a new one instead")}
                </button>
              </p>
            )}
            {estimate.subtotal <= 0 && <p className="mt-2 text-center text-xs text-slate-400">{t("Add prices to send a document.")}</p>}
            {sheets.length > 0 && (
              <button className="btn btn-sm mt-3 w-full" disabled={!!busy} onClick={() => void downloadPlansPdf()} title={t("Marked-up plans without crew wiring — attach it to the document in Billdu")}>
                <FileText /> {busy === "plans" ? t("Making the plans PDF…") : t("Plans PDF (to attach in Billdu)")}
              </button>
            )}

            {notice && <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{notice}</p>}
            {error && (
              <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                <p className="mb-1 font-medium">{error}</p>
                <p className="mb-2 text-red-700">{t("Nothing is blocked — export the same lines and enter them in Billdu by hand:")}</p>
                <div className="flex gap-2">
                  <button className="btn btn-sm" onClick={downloadCsv}>
                    <Download /> CSV
                  </button>
                  <button className="btn btn-sm" onClick={downloadPdf}>
                    <FileText /> PDF
                  </button>
                </div>
              </div>
            )}

            <div className="mt-5 border-t border-slate-100 pt-4 text-sm">
              {project.billduDocs.length > 0 && (
                <ul className="space-y-1.5" aria-label={t("Sent to Billdu")}>
                  {project.billduDocs.map((d) => (
                    <li key={`${d.type}-${d.id}`} className="flex items-center justify-between gap-2 text-sm">
                      <span className="min-w-0 truncate">
                        <span className="chip mr-1.5 bg-slate-100 capitalize text-slate-600">{DOC_TYPE_NAMES[d.type as DocType] ? t(DOC_TYPE_NAMES[d.type as DocType]) : d.type}</span>
                        {d.serial ?? `#${d.id}`}
                        {d.label ? <span className="text-slate-500"> · {d.label}</span> : null}
                      </span>
                      <span className="tabular-nums text-slate-600">{formatMoney(d.amount, cur)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <button className="btn btn-sm btn-ghost mt-3 w-full text-slate-500" disabled={!!busy} onClick={syncProducts}>
              <RefreshCw /> {busy === "products" ? t("Syncing…") : t("Sync price list to Billdu products")}
            </button>
          </section>
          )}
        </aside>
      </div>
    </div>
  );
}
