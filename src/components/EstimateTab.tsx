"use client";
import { nanoid } from "nanoid";
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
      className={`w-full rounded border border-transparent bg-transparent px-1.5 py-1 hover:border-slate-200 focus:border-blue-500 focus:bg-white focus:outline-none ${numeric ? "text-right tabular-nums" : ""} ${className}`}
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

  if (!project || !settings || !pricing || !estimate) return <div className="p-6 text-slate-500">Loading…</div>;

  const cur = pricing.currency;
  const removedKeys = estimateLines.filter((l) => l.removed && !l.deleted).map((l) => l.key);
  const fileBase = `${slug(project.address || project.clientName)}-estimate`;

  const setPricing = (patch: Partial<PricingSettings>) => updateProject({ pricing: { ...(project.pricing ?? {}), ...patch } });

  async function downloadPdf() {
    setBusy("pdf");
    try {
      const { renderEstimatePdf } = await import("./EstimatePdf");
      const blob = await renderEstimatePdf({ project: project!, business: settings!.business, estimate: estimate!, currency: cur, taxPct: pricing!.taxPct });
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
      const r = await fetch("/api/billdu/send", {
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
      const r = await fetch("/api/billdu/products", {
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
  const input = "w-20 rounded-lg border border-slate-300 px-2 py-1.5 text-right text-sm";
  const btn = "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-40";

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
      <div className="flex flex-wrap items-end gap-4 rounded-xl border border-slate-200 bg-white p-4">
        <label className="text-sm">
          <span className="mb-1 block text-slate-500">Markup %</span>
          <input className={input} defaultValue={pricing.markupPct} key={`mk${pricing.markupPct}`} inputMode="decimal" onBlur={(e) => setPricing({ markupPct: num(e.target.value) ?? 0 })} />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-slate-500">Tax %</span>
          <input className={input} defaultValue={pricing.taxPct} key={`tx${pricing.taxPct}`} inputMode="decimal" onBlur={(e) => setPricing({ taxPct: num(e.target.value) ?? 0 })} />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-slate-500">Labor</span>
          <select className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm" value={pricing.laborMode} onChange={(e) => setPricing({ laborMode: e.target.value as PricingSettings["laborMode"] })}>
            <option value="combined">Combined (installed price)</option>
            <option value="separate">Separate labor lines</option>
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={pricing.includeTentative} onChange={(e) => setPricing({ includeTentative: e.target.checked })} />
          Include “?” items by default
        </label>
        <div className="ml-auto flex flex-wrap gap-2">
          <button className={btn} onClick={downloadPdf} disabled={busy === "pdf"}>
            {busy === "pdf" ? "Building PDF…" : "Estimate PDF"}
          </button>
          <button className={btn} onClick={downloadCsv}>
            CSV
          </button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="w-10 px-3 py-2"></th>
              <th className="px-3 py-2">Description</th>
              <th className="w-24 px-3 py-2 text-right">Qty</th>
              <th className="w-20 px-3 py-2">Unit</th>
              <th className="w-28 px-3 py-2 text-right">Unit price</th>
              <th className="w-28 px-3 py-2 text-right">Total</th>
              <th className="w-24 px-3 py-2"></th>
            </tr>
          </thead>
          {groups.map(({ g, lines }) => (
            <tbody key={g}>
              <tr>
                <td colSpan={7} className="bg-slate-50/60 px-3 pt-3 pb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {GROUP_NAMES[g]}
                </td>
              </tr>
              {lines.map((l) => (
                <tr key={l.key} className={`border-t border-slate-100 ${l.included ? "" : "text-slate-400"}`}>
                  <td className="px-3 py-1 text-center">
                    {l.optional ? (
                      <input type="checkbox" title="Include in total" checked={l.included} onChange={(e) => upsert(l.key, { include: e.target.checked })} />
                    ) : null}
                  </td>
                  <td className="px-2 py-1">
                    <Cell value={l.description} onCommit={(v) => upsert(l.key, { description: v || null })} />
                  </td>
                  <td className="px-2 py-1">
                    <Cell numeric value={Number(l.qty.toFixed(2))} onCommit={(v) => upsert(l.key, { qty: num(v) })} />
                  </td>
                  <td className="px-2 py-1">
                    <Cell value={l.unit} onCommit={(v) => upsert(l.key, { unit: v || null })} />
                  </td>
                  <td className="px-2 py-1">
                    <Cell numeric value={l.unitPrice.toFixed(2)} onCommit={(v) => upsert(l.key, { unitPrice: num(v) })} />
                  </td>
                  <td className="px-3 py-1 text-right tabular-nums">{formatMoney(l.total, cur)}</td>
                  <td className="px-3 py-1 text-right whitespace-nowrap">
                    {l.overridden && !l.key.startsWith("custom:") && (
                      <button className="mr-2 text-xs text-blue-600" title="Back to the takeoff value" onClick={() => removeOverride(l.key)}>
                        Reset
                      </button>
                    )}
                    <button className="text-xs text-red-600" onClick={() => upsert(l.key, { removed: true })}>
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          ))}
          <tbody>
            <tr className="border-t border-slate-200">
              <td colSpan={7} className="px-3 py-2">
                <button
                  className="text-sm font-medium text-blue-600"
                  onClick={() => upsert(`custom:${nanoid(8)}`, { description: "Custom item", qty: 1, unit: "each", unitPrice: 0, sort: Date.now() })}
                >
                  + Add custom line
                </button>
                {removedKeys.length > 0 && (
                  <span className="ml-4 text-xs text-slate-500">
                    {removedKeys.length} removed line{removedKeys.length > 1 ? "s" : ""} ·{" "}
                    <button className="text-blue-600" onClick={() => removedKeys.forEach((k) => (k.startsWith("custom:") ? upsert(k, { removed: false }) : removeOverride(k)))}>
                      restore
                    </button>
                  </span>
                )}
              </td>
            </tr>
          </tbody>
        </table>
        {estimate.lines.length === 0 && <p className="p-6 text-center text-sm text-slate-500">Place devices on the plan to build the estimate.</p>}
        <div className="flex justify-end border-t border-slate-200 p-4">
          <dl className="w-72 space-y-1 text-sm">
            <div className="flex justify-between">
              <dt className="text-slate-500">Subtotal</dt>
              <dd className="tabular-nums">{formatMoney(estimate.subtotal, cur)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Tax ({pricing.taxPct}%)</dt>
              <dd className="tabular-nums">{formatMoney(estimate.tax, cur)}</dd>
            </div>
            <div className="flex justify-between border-t border-slate-200 pt-1 text-base font-semibold">
              <dt>Total</dt>
              <dd className="tabular-nums">{formatMoney(estimate.total, cur)}</dd>
            </div>
            {estimate.optionalTotal > 0 && (
              <div className="flex justify-between text-xs text-slate-500">
                <dt>Optional (“?”) not included</dt>
                <dd className="tabular-nums">{formatMoney(estimate.optionalTotal, cur)}</dd>
              </div>
            )}
          </dl>
        </div>
      </div>

      <section className="rounded-xl border border-blue-200 bg-blue-50/40 p-4">
        <h2 className="mb-3 text-base font-semibold">Billdu</h2>
        <div className="flex flex-wrap items-end gap-4">
          <label className="text-sm">
            <span className="mb-1 block text-slate-500">Document</span>
            <select className="rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm" value={docType} onChange={(e) => setDocType(e.target.value as DocType)}>
              <option value="estimate">Estimate</option>
              <option value="order">Order</option>
              <option value="invoice">Invoice</option>
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-slate-500">Deposit / progress %</span>
            <input className={input + " bg-white"} placeholder="full" value={depositPct} onChange={(e) => setDepositPct(e.target.value)} inputMode="decimal" />
          </label>
          <button className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40" disabled={!!busy || estimate.subtotal <= 0} onClick={onSendClick}>
            {busy === "send" ? "Sending…" : `Send ${isDeposit ? `${dep}% ` : ""}to Billdu`}
          </button>
          <button className={btn} disabled={!!busy} onClick={syncProducts}>
            {busy === "products" ? "Syncing…" : "Sync catalog to Billdu products"}
          </button>
        </div>
        {isDeposit && (
          <p className="mt-2 text-xs text-slate-600">
            Sends one line: {dep}% of {formatMoney(estimate.subtotal, cur)} = {formatMoney(Math.round(estimate.subtotal * dep!) / 100, cur)} (before tax).
          </p>
        )}

        {confirmDup && (
          <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm">
            <p className="mb-2">
              This project already has a Billdu {confirmDup.type} {confirmDup.serial ?? `#${confirmDup.id}`} ({formatMoney(confirmDup.amount, cur)}). Update it with the current lines, or create a new one?
            </p>
            <div className="flex gap-2">
              <button className="rounded-lg bg-amber-600 px-3 py-1.5 font-medium text-white" onClick={() => send(confirmDup.id)}>
                Update existing
              </button>
              <button className={btn} onClick={() => send(null)}>
                Create new
              </button>
              <button className="px-3 py-1.5 text-slate-600" onClick={() => setConfirmDup(null)}>
                Cancel
              </button>
            </div>
          </div>
        )}
        {notice && <p className="mt-3 text-sm text-emerald-700">{notice}</p>}
        {error && (
          <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            <p className="mb-2">{error}</p>
            <p className="mb-2 text-red-700">Nothing is blocked — export the same lines and enter them in Billdu by hand:</p>
            <div className="flex gap-2">
              <button className={btn} onClick={downloadCsv}>
                Download CSV
              </button>
              <button className={btn} onClick={downloadPdf}>
                Download PDF
              </button>
            </div>
          </div>
        )}

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="text-sm">
            <div className="mb-1 flex justify-between">
              <span className="text-slate-500">Invoiced so far</span>
              <span className="tabular-nums">
                {formatMoney(billed, cur)} of {formatMoney(estimate.subtotal, cur)}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-200">
              <div className="h-full bg-blue-600" style={{ width: `${Math.min(100, estimate.subtotal ? (billed / estimate.subtotal) * 100 : 0)}%` }} />
            </div>
            <p className="mt-1 text-xs text-slate-500">Remaining {formatMoney(Math.max(0, estimate.subtotal - billed), cur)} before tax.</p>
          </div>
          {project.billduDocs.length > 0 && (
            <ul className="space-y-1 text-sm">
              {project.billduDocs.map((d) => (
                <li key={`${d.type}-${d.id}`} className="flex justify-between gap-2">
                  <span>
                    <span className="capitalize">{d.type}</span> {d.serial ?? `#${d.id}`}
                    {d.label ? <span className="text-slate-500"> · {d.label}</span> : null}
                  </span>
                  <span className="tabular-nums text-slate-600">{formatMoney(d.amount, cur)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
