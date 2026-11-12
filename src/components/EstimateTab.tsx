"use client";
import { apiFetch } from "@/lib/api";
import { CircleExclamationPoint, Download, FileText, Package, Plus, RefreshCw, RotateCcw, Send, Settings, Trash } from "lucide-react";
import { nanoid } from "nanoid";
import Link from "next/link";
import { useMemo, useState } from "react";
import { put } from "@/lib/db";
import { downloadBlob, downloadText, slug } from "@/lib/download";
import { buildEstimate, estimateCsv, formatMoney, type ComputedLine, type Estimate } from "@/lib/estimate";
import { useEditor } from "@/lib/store";
import { computeTakeoff } from "@/lib/takeoff";
import type { BillduDocRef, PricingSettings } from "@/lib/types";

type DocType = "estimate" | "order" | "invoice";

function Cell(props: Parameters<typeof CellInner>[0]) {
  return <CellInner key={String(props.value)} {...props} />;
}

function CellInner({
  value,
  onCommit,
  numeric,
  className = "",
  placeholder,
}: {
  value: string | number;
  onCommit: (v: string) => void;
  numeric?: boolean;
  className?: string;
  placeholder?: string;
}) {
  // Parent remounts the cell (key) when the committed value changes.
  const [v, setV] = useState(String(value));
  return (
    <input
      value={v}
      placeholder={placeholder}
      inputMode={numeric ? "decimal" : undefined}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => v !== String(value) && onCommit(v)}
      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
      className={`w-full rounded border border-transparent bg-transparent px-1.5 py-1 hover:border-slate-200 focus:border-brand-500 focus:bg-white focus:outline-none ${numeric ? "text-right tabular-nums" : ""} ${className}`}
    />
  );
}

const num = (s: string) => {
  const n = parseFloat(s.replace(/[$,]/g, ""));
  return Number.isFinite(n) ? n : null;
};

const GROUP_NAMES: Record<ComputedLine["group"], string> = {
  devices: "Devices",
  lighting: "Lighting",
  wire: "Wire",
  labor: "Labor",
  infrastructure: "Infrastructure",
  custom: "Other",
};

export default function EstimateTab() {
  const project = useEditor((s) => s.project);
  const sheets = useEditor((s) => s.sheets);
  const markers = useEditor((s) => s.markers);
  const runs = useEditor((s) => s.runs);
  const closets = useEditor((s) => s.closets);
  const catalog = useEditor((s) => s.catalog);
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
    () => (pricing ? buildEstimate(takeoff, catalog, pricing, estimateLines) : null),
    [takeoff, catalog, pricing, estimateLines],
  );

  const [docTypeChoice, setDocType] = useState<DocType | null>(null);
  const docType: DocType = docTypeChoice ?? settings?.billduDocType ?? "estimate";
  const [depositPct, setDepositPct] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmDup, setConfirmDup] = useState<BillduDocRef | null>(null);

  const input = "input w-24 text-right";
  if (!project || !settings || !pricing || !estimate) return <div className="p-6 text-slate-500">Loading…</div>;

  const cur = pricing.currency;
  const removedKeys = estimateLines.filter((l) => l.removed && !l.deleted).map((l) => l.key);
  const fileBase = `${slug(project.address || project.clientName)}-estimate`;

  const setPricing = (patch: Partial<PricingSettings>) => updateProject({ pricing: { ...(project.pricing ?? {}), ...patch } });

  async function downloadPdf() {
    setBusy("pdf");
    try {
      const { renderEstimatePdf } = await import("./EstimatePdf");
      const t = takeoff.total;
      const devices = Object.entries(t.counts).reduce((n, [, v]) => n + v, 0) - Object.values(t.tentative).reduce((a, b) => a + b, 0);
      const scope = [
        { label: "Floors", value: String(sheets.length) },
        { label: "Devices", value: String(devices) },
        ...(t.ledTotalFt ? [{ label: "LED", value: `${t.ledTotalFt} LF` }] : []),
      ];
      const blob = await renderEstimatePdf({ project: project!, business: settings!.business, estimate: estimate!, currency: cur, taxPct: pricing!.taxPct, scope });
      downloadBlob(blob, `${fileBase}.pdf`);
    } catch (e) {
      setError(`PDF failed: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  }
  const downloadCsv = () => downloadText(estimateCsv(estimate), `${fileBase}.csv`);

  const dep = num(depositPct);
  const isDeposit = dep != null && dep > 0 && dep < 100;
  const existingSame = project.billduDocs.find((d) => d.type === docType && !d.percent);
  const billed = project.billduDocs.filter((d) => d.type === "invoice").reduce((s, d) => s + d.amount, 0);

  async function send(existingDocId: number | null) {
    setConfirmDup(null);
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
          lines: estimate!.lines,
          taxPct: pricing!.taxPct,
          currency: cur,
          depositPct: isDeposit ? dep : null,
          existingDocId,
        }),
      });
      const j = await r.json().catch(() => ({ error: `Server returned ${r.status}` }));
      if (!r.ok) throw new Error(j.error || `Billdu request failed (${r.status})`);
      const ref: BillduDocRef = {
        id: j.doc.id,
        type: docType,
        serial: j.doc.serial,
        amount: j.doc.amount,
        percent: j.doc.percent,
        label: isDeposit ? `Deposit ${dep}%` : undefined,
        createdAt: new Date().toISOString(),
      };
      const docs = existingDocId ? project!.billduDocs.map((d) => (d.id === existingDocId ? { ...ref, createdAt: d.createdAt } : d)) : [...project!.billduDocs, ref];
      await updateProject({ billduClientId: j.clientId, billduDocs: docs });
      setNotice(`${existingDocId ? "Updated" : "Created"} Billdu ${docType} ${ref.serial ?? `#${ref.id}`} (${formatMoney(ref.amount, cur)} before tax).`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  function onSendClick() {
    if (!isDeposit && existingSame) setConfirmDup(existingSame);
    else send(null);
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
      if (!r.ok) throw new Error(j.error || "Product sync failed");
      const created = j.created as Record<string, number>;
      for (const d of live) if (created[d.id]) await put("deviceTypes", { ...d, billduProductId: created[d.id] });
      await reloadCatalog();
      const n = Object.keys(created).length;
      setNotice(`${n} product${n === 1 ? "" : "s"} created in Billdu${j.errors?.length ? `; ${j.errors.length} failed` : ""}. ${live.length - n - (j.errors?.length ?? 0)} were already linked.`);
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
  const billedPct = Math.min(100, estimate.subtotal ? (billed / estimate.subtotal) * 100 : 0);

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      <div className="mb-5 flex flex-wrap items-end gap-3">
        <div className="mr-auto">
          <h2 className="page-title">Estimate</h2>
          <p className="mt-1 text-sm text-slate-500">Built from the takeoff and catalog prices. Tap any value to override it.</p>
        </div>
        <button className="btn" onClick={downloadCsv}>
          <Download /> CSV
        </button>
        <button className="btn btn-brand" onClick={downloadPdf} disabled={busy === "pdf"}>
          <FileText /> {busy === "pdf" ? "Building PDF…" : "Client estimate PDF"}
        </button>
      </div>

      {unpriced.length > 0 && (
        <div className="mb-5 flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 sm:flex-row sm:items-center">
          <div className="flex flex-1 items-start gap-2.5">
            <CircleExclamationPoint className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              <strong className="font-semibold">
                {unpriced.length} line{unpriced.length === 1 ? " has" : "s have"} no price yet
              </strong>{" "}
              — {unpriced
                .slice(0, 3)
                .map((l) => l.description.replace(" — installed", "").replace(/ \(home runs: \d+\)/, ""))
                .join(", ")}
              {unpriced.length > 3 ? ` and ${unpriced.length - 3} more` : ""}. Set prices in the catalog and settings, or type them here.
            </span>
          </div>
          <div className="flex gap-2 pl-6 sm:pl-0">
            <Link href="/catalog" className="btn btn-sm">
              <Package /> Catalog
            </Link>
            <Link href="/settings#wire" className="btn btn-sm">
              <Settings /> Wire prices
            </Link>
          </div>
        </div>
      )}

      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-5">
          <div className="card flex flex-wrap items-end gap-4 p-4">
            <label className="text-sm">
              <span className="label">Markup %</span>
              <input className={input} defaultValue={pricing.markupPct} key={`mk${pricing.markupPct}`} inputMode="decimal" onBlur={(e) => setPricing({ markupPct: num(e.target.value) ?? 0 })} />
            </label>
            <label className="text-sm">
              <span className="label">Tax %</span>
              <input className={input} defaultValue={pricing.taxPct} key={`tx${pricing.taxPct}`} inputMode="decimal" onBlur={(e) => setPricing({ taxPct: num(e.target.value) ?? 0 })} />
            </label>
            <label className="text-sm">
              <span className="label">Labor</span>
              <select className="input w-full sm:w-auto" value={pricing.laborMode} onChange={(e) => setPricing({ laborMode: e.target.value as PricingSettings["laborMode"] })}>
                <option value="combined">Combined (installed price)</option>
                <option value="separate">Separate labor lines</option>
              </select>
            </label>
            <label className="flex h-10 cursor-pointer items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" className="accent-brand-600" checked={pricing.includeTentative} onChange={(e) => setPricing({ includeTentative: e.target.checked })} />
              Include “?” items by default
            </label>
            <span className="ml-auto self-center text-xs text-slate-400">Applies to this project only</span>
          </div>

          <div className="card overflow-x-auto">
            <table className="w-full min-w-[680px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/60 text-left text-[11px] font-semibold tracking-wide text-slate-500 uppercase">
                  <th className="w-10 px-3 py-2.5"></th>
                  <th className="px-3 py-2.5">Description</th>
                  <th className="w-24 px-3 py-2.5 text-right">Qty</th>
                  <th className="w-20 px-3 py-2.5">Unit</th>
                  <th className="w-28 px-3 py-2.5 text-right">Unit price</th>
                  <th className="w-28 px-3 py-2.5 text-right">Total</th>
                  <th className="w-20 px-3 py-2.5"></th>
                </tr>
              </thead>
              {groups.map(({ g, lines }) => (
                <tbody key={g}>
                  <tr>
                    <td colSpan={7} className="px-3 pt-4 pb-1.5 text-[11px] font-semibold tracking-wider text-slate-400 uppercase">
                      {GROUP_NAMES[g]}
                    </td>
                  </tr>
                  {lines.map((l) => (
                    <tr key={l.key} className={`group border-t border-slate-100 ${l.included ? "" : "text-slate-400"}`}>
                      <td className="px-3 py-1 text-center">
                        {l.optional ? (
                          <input type="checkbox" className="accent-brand-600" title="Include in total" checked={l.included} onChange={(e) => upsert(l.key, { include: e.target.checked })} />
                        ) : null}
                      </td>
                      <td className="px-2 py-1">
                        <div className="flex items-center gap-1.5">
                          <Cell value={l.description} onCommit={(v) => upsert(l.key, { description: v || null })} />
                          {l.optional && <span className="chip shrink-0 bg-amber-50 text-amber-700">optional</span>}
                          {l.overridden && !l.key.startsWith("custom:") && <span className="chip shrink-0 bg-brand-50 text-brand-700">edited</span>}
                        </div>
                      </td>
                      <td className="px-2 py-1">
                        <Cell numeric value={Number(l.qty.toFixed(2))} onCommit={(v) => upsert(l.key, { qty: num(v) })} />
                      </td>
                      <td className="px-2 py-1">
                        <Cell value={l.unit} onCommit={(v) => upsert(l.key, { unit: v || null })} />
                      </td>
                      <td className="px-2 py-1">
                        <Cell numeric value={l.unitPrice.toFixed(2)} onCommit={(v) => upsert(l.key, { unitPrice: num(v) })} className={l.unitPrice === 0 && l.included ? "text-amber-700" : ""} />
                      </td>
                      <td className="px-3 py-1 text-right font-medium tabular-nums">{formatMoney(l.total, cur)}</td>
                      <td className="px-2 py-1 text-right whitespace-nowrap">
                        {l.overridden && !l.key.startsWith("custom:") && (
                          <button className="btn btn-sm btn-icon btn-ghost" title="Reset to the takeoff value" aria-label="Reset" onClick={() => removeOverride(l.key)}>
                            <RotateCcw />
                          </button>
                        )}
                        <button className="btn btn-sm btn-icon btn-ghost text-slate-400 hover:text-red-600" title="Remove line" aria-label="Remove line" onClick={() => upsert(l.key, { removed: true })}>
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
                    <button
                      className="btn btn-sm btn-ghost text-brand-600"
                      onClick={() => upsert(`custom:${nanoid(8)}`, { description: "Custom item", qty: 1, unit: "each", unitPrice: 0, sort: Date.now() })}
                    >
                      <Plus /> Add custom line
                    </button>
                    {removedKeys.length > 0 && (
                      <span className="ml-3 text-xs text-slate-500">
                        {removedKeys.length} removed line{removedKeys.length > 1 ? "s" : ""} ·{" "}
                        <button className="font-medium text-brand-600 hover:underline" onClick={() => removedKeys.forEach((k) => (k.startsWith("custom:") ? upsert(k, { removed: false }) : removeOverride(k)))}>
                          restore
                        </button>
                      </span>
                    )}
                  </td>
                </tr>
              </tbody>
            </table>
            {estimate.lines.length === 0 && <p className="p-8 text-center text-sm text-slate-500">Place devices on the plan to build the estimate.</p>}
          </div>
        </div>

        <aside className="space-y-5 lg:sticky lg:top-4 lg:self-start">
          <section className="card p-5">
            <div className="section-title mb-3">Summary</div>
            <dl className="space-y-1.5 text-sm">
              <div className="flex justify-between">
                <dt className="text-slate-500">Subtotal</dt>
                <dd className="tabular-nums">{formatMoney(estimate.subtotal, cur)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Tax ({pricing.taxPct}%)</dt>
                <dd className="tabular-nums">{formatMoney(estimate.tax, cur)}</dd>
              </div>
              <div className="flex items-baseline justify-between border-t border-slate-200 pt-3">
                <dt className="font-semibold">Total</dt>
                <dd className="text-2xl font-semibold tracking-tight tabular-nums">{formatMoney(estimate.total, cur)}</dd>
              </div>
              {estimate.optionalTotal > 0 && (
                <div className="flex justify-between text-xs text-slate-500">
                  <dt>Optional (“?”) not included</dt>
                  <dd className="tabular-nums">{formatMoney(estimate.optionalTotal, cur)}</dd>
                </div>
              )}
            </dl>
          </section>

          <section className="card p-5">
            <div className="mb-4 flex items-center gap-2">
              <Send className="h-4 w-4 text-brand-600" />
              <h3 className="font-semibold">Send to Billdu</h3>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-sm">
                <span className="label">Document</span>
                <select className="input" value={docType} onChange={(e) => setDocType(e.target.value as DocType)}>
                  <option value="estimate">Estimate</option>
                  <option value="order">Order</option>
                  <option value="invoice">Invoice</option>
                </select>
              </label>
              <label className="text-sm">
                <span className="label">Deposit %</span>
                <input className="input text-right" placeholder="full" value={depositPct} onChange={(e) => setDepositPct(e.target.value)} inputMode="decimal" />
              </label>
            </div>
            {isDeposit && (
              <p className="mt-2 text-xs text-slate-600">
                One line: {dep}% of {formatMoney(estimate.subtotal, cur)} = <strong>{formatMoney(Math.round(estimate.subtotal * dep!) / 100, cur)}</strong> before tax.
              </p>
            )}
            <button className="btn btn-brand mt-4 h-10 w-full" disabled={!!busy || estimate.subtotal <= 0} onClick={onSendClick}>
              <Send /> {busy === "send" ? "Sending…" : `Send ${isDeposit ? `${dep}% ` : ""}${docType} to Billdu`}
            </button>
            {estimate.subtotal <= 0 && <p className="mt-2 text-center text-xs text-slate-400">Add prices to send a document.</p>}

            {confirmDup && (
              <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm">
                <p className="mb-2">
                  Already sent as {confirmDup.type} {confirmDup.serial ?? `#${confirmDup.id}`} ({formatMoney(confirmDup.amount, cur)}). Update it or create a new one?
                </p>
                <div className="flex flex-wrap gap-2">
                  <button className="btn btn-sm btn-primary" onClick={() => send(confirmDup.id)}>
                    Update existing
                  </button>
                  <button className="btn btn-sm" onClick={() => send(null)}>
                    Create new
                  </button>
                  <button className="btn btn-sm btn-ghost" onClick={() => setConfirmDup(null)}>
                    Cancel
                  </button>
                </div>
              </div>
            )}
            {notice && <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{notice}</p>}
            {error && (
              <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                <p className="mb-1 font-medium">{error}</p>
                <p className="mb-2 text-red-700">Nothing is blocked — export the same lines and enter them in Billdu by hand:</p>
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
              <div className="mb-1.5 flex justify-between">
                <span className="text-slate-500">Invoiced so far</span>
                <span className="font-medium tabular-nums">{Math.round(billedPct)}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-brand-600 transition-all" style={{ width: `${billedPct}%` }} />
              </div>
              <p className="mt-1.5 text-xs text-slate-500">
                {formatMoney(billed, cur)} of {formatMoney(estimate.subtotal, cur)} · remaining {formatMoney(Math.max(0, estimate.subtotal - billed), cur)} before tax
              </p>
              {project.billduDocs.length > 0 && (
                <ul className="mt-3 space-y-1.5">
                  {project.billduDocs.map((d) => (
                    <li key={`${d.type}-${d.id}`} className="flex items-center justify-between gap-2 text-sm">
                      <span className="min-w-0 truncate">
                        <span className="chip mr-1.5 bg-slate-100 capitalize text-slate-600">{d.type}</span>
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
              <RefreshCw /> {busy === "products" ? "Syncing…" : "Sync catalog to Billdu products"}
            </button>
          </section>
        </aside>
      </div>
    </div>
  );
}
