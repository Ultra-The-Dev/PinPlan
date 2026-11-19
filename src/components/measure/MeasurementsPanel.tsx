"use client";
// Totals of the saved measurements, for this sheet or the whole job, grouped by label: CSV download and (office only)
// "Add to estimate" as a custom line (custom:meas-<label>-<kind>, so adding again updates the same line).
import { Calculator, Check, ChevronRight, Download, Pentagon, Ruler, TriangleAlert, X } from "lucide-react";
import { useMemo, useState } from "react";
import { downloadText, slug } from "@/lib/download";
import { formatMoney } from "@/lib/estimate";
import { estimateLineFromGroup, formatFeetInches, formatSqFt, formatValue, measureLineKey, measurementValue, suggestUnitPrice, summarize, toCsv, type SummaryRow } from "@/lib/measure";
import { useEditor } from "@/lib/store";
import { can } from "@/lib/teamLogic";
import { useRole } from "@/lib/team";
import { toast } from "@/lib/toast";
import type { Measurement, Sheet } from "@/lib/types";
import { useMeasureUi } from "./measureUi";

const fmtTotal = (r: Pick<SummaryRow, "kind" | "total">) => (r.kind === "area" ? formatSqFt(r.total) : formatFeetInches(r.total));

function AddToEstimate({ row, onDone }: { row: SummaryRow; onDone: () => void }) {
  const { estimateLines, settings, project, products, upsertEstimateLine } = useEditor();
  const key = measureLineKey(row);
  const existing = estimateLines.find((l) => l.key === key && !l.deleted);
  const wirePrices = { ...(settings?.pricing.wirePrices ?? {}), ...(project?.pricing?.wirePrices ?? {}) };
  const suggestion = suggestUnitPrice(row.label, { wirePrices, products });
  const initial = existing?.unitPrice ?? suggestion?.price ?? null;
  const [price, setPrice] = useState(initial != null ? String(initial) : "");
  const [busy, setBusy] = useState(false);
  const currency = settings?.pricing.currency ?? "USD";
  const line = estimateLineFromGroup(row);
  const n = Number(price.trim().replace(",", "."));
  const valid = price.trim() === "" || (Number.isFinite(n) && n >= 0);
  return (
    <form
      className="mt-2 rounded-xl bg-slate-50 p-2.5 ring-1 ring-slate-200"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!valid || busy) return;
        setBusy(true);
        try {
          const unitPrice = price.trim() === "" ? (existing?.unitPrice ?? null) : n;
          await upsertEstimateLine(key, { ...estimateLineFromGroup(row, unitPrice), sort: existing?.sort ?? Date.now() });
          toast(`${existing ? "Updated" : "Added"} on the estimate: ${line.description} — ${line.qty} ${line.unit}`);
          onDone();
        } finally {
          setBusy(false);
        }
      }}
      data-plan-ui
    >
      <div className="mb-2 text-xs text-slate-600">
        <span className="font-semibold text-slate-800 tabular-nums">
          {line.qty} {line.unit}
        </span>{" "}
        (rounded up) as an estimate line{existing ? ` — replaces ${existing.qty ?? "?"} ${existing.unit ?? ""}` : ""}.
      </div>
      <div className="flex items-end gap-2">
        <label className="block min-w-0 flex-1">
          <span className="label">Unit price per {line.unit}</span>
          <input className="input h-10" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0.00" autoFocus aria-invalid={!valid} data-testid="measure-unit-price" />
        </label>
        <button className="btn btn-brand h-10" disabled={!valid || busy} data-testid="measure-add-confirm">
          <Check /> {existing ? "Update" : "Add"}
        </button>
      </div>
      {suggestion && existing?.unitPrice == null && <p className="mt-1.5 text-[11px] text-slate-500">Price from {suggestion.source}.</p>}
      {valid && price.trim() !== "" && <p className="mt-1 text-[11px] text-slate-500">Line total {formatMoney((line.qty ?? 0) * n, currency)} before markup and tax.</p>}
    </form>
  );
}

export default function MeasurementsPanel({ sheet, rows }: { sheet: Sheet; rows: Measurement[] }) {
  const ui = useMeasureUi();
  const sheets = useEditor((s) => s.sheets);
  const project = useEditor((s) => s.project);
  const estimateLines = useEditor((s) => s.estimateLines);
  const setActiveSheet = useEditor((s) => s.setActiveSheet);
  const office = can(useRole(), "prices");
  const [scope, setScope] = useState<"sheet" | "job">("sheet");
  const [open, setOpen] = useState<string | null>(null);
  const [adding, setAdding] = useState<string | null>(null);

  const scoped = useMemo(() => (scope === "sheet" ? rows.filter((m) => m.sheetId === sheet.id) : rows), [rows, scope, sheet.id]);
  const summary = useMemo(() => summarize(scoped, sheets), [scoped, sheets]);
  const byId = useMemo(() => new Map(sheets.map((s) => [s.id, s])), [sheets]);
  const inEstimate = useMemo(() => new Map(estimateLines.filter((l) => !l.deleted && !l.removed && l.key.startsWith("custom:meas-")).map((l) => [l.key, l])), [estimateLines]);

  const goTo = (m: Measurement) => {
    const pts = m.points;
    let x = 0;
    let y = 0;
    for (let i = 0; i + 1 < pts.length; i += 2) {
      x += pts[i];
      y += pts[i + 1];
    }
    const n = Math.max(1, pts.length / 2);
    ui.focus({ sheetId: m.sheetId, id: m.id, x: x / n, y: y / n });
    if (m.sheetId !== sheet.id) setActiveSheet(m.sheetId);
    ui.setPanelOpen(false);
  };

  return (
    <div
      className="animate-in pointer-events-auto absolute inset-x-2 bottom-2 z-[12] flex max-h-[75%] flex-col rounded-2xl bg-white shadow-pop ring-1 ring-black/5 sm:inset-x-auto sm:top-[170px] sm:right-3 sm:bottom-[72px] sm:max-h-none sm:w-[22rem]"
      data-plan-ui
      data-testid="measure-panel"
    >
      <div className="flex items-center gap-2 border-b border-slate-100 p-3">
        <div className="min-w-0 flex-1">
          <div className="section-title">Measurements</div>
          <h3 className="truncate text-base leading-tight font-semibold">{scope === "sheet" ? sheet.name : "Whole job"}</h3>
        </div>
        <div className="flex shrink-0 rounded-lg bg-slate-100 p-0.5 text-xs font-semibold" role="group" aria-label="Totals for">
          {(["sheet", "job"] as const).map((s) => (
            <button key={s} aria-pressed={scope === s} className={`rounded-md px-2.5 py-1.5 ${scope === s ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`} onClick={() => setScope(s)} data-testid={`measure-scope-${s}`}>
              {s === "sheet" ? "Sheet" : "Job"}
            </button>
          ))}
        </div>
        <button className="btn btn-sm btn-icon btn-ghost" onClick={() => ui.setPanelOpen(false)} aria-label="Close">
          <X />
        </button>
      </div>

      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto p-3">
        {!summary.rows.length && !summary.uncalibrated.length && (
          <div className="px-2 py-8 text-center text-sm text-slate-500">
            <Ruler className="mx-auto mb-2 h-6 w-6 text-slate-300" />
            Nothing measured {scope === "sheet" ? "on this sheet" : "on this job"} yet. Open <b>Measure</b>, pick Length, Run or Area and tap the plan.
          </div>
        )}
        <ul className="space-y-2" data-testid="measure-groups">
          {summary.rows.map((r) => {
            const key = measureLineKey(r);
            const est = inEstimate.get(key);
            const expanded = open === r.key;
            const members = scoped.filter((m) => r.ids.includes(m.id));
            return (
              <li key={r.key} className="rounded-xl ring-1 ring-slate-200" data-testid="measure-group">
                <button className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left" onClick={() => setOpen(expanded ? null : r.key)} aria-expanded={expanded}>
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-white" style={{ background: r.color ?? "#64748b" }}>
                    {r.kind === "area" ? <Pentagon className="h-3.5 w-3.5" /> : <Ruler className="h-3.5 w-3.5" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{r.label}</span>
                    <span className="block truncate text-[11px] text-slate-500">
                      {r.count} {r.kind === "area" ? (r.count === 1 ? "area" : "areas") : r.count === 1 ? "length" : "lengths"}
                      {r.kind === "area" && r.perimeterFt != null && <> · perimeter {formatFeetInches(r.perimeterFt)}</>}
                      {scope === "job" && <> · {r.sheets.map((s) => s.name).join(", ")}</>}
                    </span>
                  </span>
                  {r.warning && <TriangleAlert className="h-3.5 w-3.5 shrink-0 text-amber-500" aria-label="Approximate: an outline crosses itself" />}
                  <span className="shrink-0 text-sm font-semibold tabular-nums" data-testid="measure-group-total">
                    {fmtTotal(r)}
                  </span>
                  <ChevronRight className={`h-3.5 w-3.5 shrink-0 text-slate-400 transition ${expanded ? "rotate-90" : ""}`} />
                </button>
                {expanded && (
                  <ul className="border-t border-slate-100 px-1.5 py-1">
                    {members.map((m) => (
                      <li key={m.id}>
                        <button className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs hover:bg-slate-50" onClick={() => goTo(m)}>
                          <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: m.color ?? "#64748b" }} />
                          <span className="min-w-0 flex-1 truncate text-slate-600">
                            {byId.get(m.sheetId)?.name}
                            {m.notes ? ` · ${m.notes}` : ""}
                          </span>
                          <span className="shrink-0 font-medium text-slate-800 tabular-nums">{formatValue(measurementValue(m, byId.get(m.sheetId)))}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {office && (
                  <div className="border-t border-slate-100 px-3 py-2">
                    {adding === r.key ? (
                      <AddToEstimate row={r} onDone={() => setAdding(null)} />
                    ) : (
                      <div className="flex items-center gap-2">
                        {est ? (
                          <span className="min-w-0 flex-1 truncate text-[11px] text-emerald-700">
                            <Check className="mr-0.5 inline h-3 w-3" />
                            In estimate: {est.qty ?? "?"} {est.unit ?? ""}
                            {Math.ceil(r.total - 1e-9) !== est.qty && <span className="text-amber-700"> · now {Math.ceil(r.total - 1e-9)}</span>}
                          </span>
                        ) : (
                          <span className="flex-1" />
                        )}
                        <button className="btn btn-sm btn-ghost text-brand-600" onClick={() => setAdding(r.key)} data-testid="measure-add-estimate">
                          <Calculator /> {est ? "Update estimate" : "Add to estimate"}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        {summary.uncalibrated.length > 0 && (
          <p className="mt-3 rounded-lg bg-amber-50 p-2.5 text-xs text-amber-800" data-testid="measure-uncalibrated">
            Not totalled — no scale yet: {summary.uncalibrated.map((u) => `${u.name} (${u.count})`).join(", ")}.
          </p>
        )}
      </div>

      {summary.rows.length > 0 && (
        <div className="flex items-center gap-2 border-t border-slate-100 p-2.5">
          <span className="min-w-0 flex-1 truncate text-[11px] text-slate-500">Totals include extra feet and waste.</span>
          <button
            className="btn btn-sm"
            onClick={() => downloadText(toCsv(summary.rows), `measurements-${slug(project?.address || "job")}${scope === "sheet" ? `-${slug(sheet.name)}` : ""}.csv`)}
            data-testid="measure-csv"
          >
            <Download /> CSV
          </button>
        </div>
      )}
    </div>
  );
}
