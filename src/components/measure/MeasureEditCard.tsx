"use client";
// The selected measurement: group label, extra feet (drops), waste %, notes, colour, delete. A bottom sheet on phones
// (in the status slot), a card beside the right rail on larger screens. Read only unless `locked` is null (Edit mode or
// Measure open, and the author or the office: canEditMeasurement).
import { Pentagon, Ruler, Spline, Trash, TriangleAlert, X } from "lucide-react";
import { useId, useState } from "react";
import { formatFeetInches, formatSqFt, formatValue, KIND_NAMES, measurementValue } from "@/lib/measure";
import { useMeasurements } from "@/lib/measurements";
import type { Measurement, Sheet } from "@/lib/types";
import { COLOR_NAMES, MEASURE_COLORS, useMeasureUi } from "./measureUi";

const ICONS = { length: Ruler, polyline: Spline, area: Pentagon };

function parseNum(s: string): number | null {
  const t = s.trim().replace(",", ".");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** A text box that saves on blur / Enter. */
function Field({ label, value, onSave, numeric, placeholder, suffix, list, testId, readOnly }: { label: string; value: string; onSave: (v: string) => void; numeric?: boolean; placeholder?: string; suffix?: string; list?: string; testId?: string; readOnly?: boolean }) {
  const [v, setV] = useState(value);
  const [prev, setPrev] = useState(value);
  if (prev !== value) {
    setPrev(value);
    setV(value);
  }
  return (
    <label className="block min-w-0">
      <span className="label">{label}</span>
      <span className="relative block">
        <input
          className={`input h-10 ${suffix ? "pr-9" : ""}`}
          value={v}
          placeholder={placeholder}
          inputMode={numeric ? "decimal" : undefined}
          list={list}
          onChange={(e) => setV(e.target.value)}
          readOnly={readOnly}
          onBlur={() => !readOnly && v !== value && onSave(v)}
          onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
          data-testid={testId}
        />
        {suffix && <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs text-slate-400">{suffix}</span>}
      </span>
    </label>
  );
}

export default function MeasureEditCard({ m, sheet, recent, locked, sheetMode }: { m: Measurement; sheet: Sheet; recent: string[]; locked: string | null; sheetMode?: boolean }) {
  const ro = locked != null;
  const select = useMeasureUi((s) => s.select);
  const setLastDeleted = useMeasureUi((s) => s.setLastDeleted);
  const update = useMeasurements((s) => s.update);
  const remove = useMeasurements((s) => s.remove);
  const [confirm, setConfirm] = useState(false);
  const listId = useId();
  const v = measurementValue(m, sheet);
  const Icon = ICONS[m.kind];
  const color = m.color || MEASURE_COLORS[0];
  const area = m.kind === "area";
  const allowances = (!area && (m.extraFt ?? 0) > 0) || (m.wastePct ?? 0) > 0;

  return (
    <div
      className={`animate-in pointer-events-auto overflow-y-auto bg-white p-3.5 shadow-pop ring-1 ring-black/5 ${
        sheetMode ? "max-h-[55dvh] w-full rounded-t-2xl pb-[max(0.875rem,env(safe-area-inset-bottom))]" : "absolute right-16 bottom-[132px] z-[12] max-h-[calc(100%-16rem)] w-80 rounded-2xl"
      }`}
      data-plan-ui
      data-plan-sheet={sheetMode ? "" : undefined}
      data-testid="measure-edit"
    >
      <div className="mb-2.5 flex items-center gap-2">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white" style={{ background: color }}>
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="section-title">{KIND_NAMES[m.kind]}</div>
          <div className="truncate text-lg leading-tight font-semibold tabular-nums" data-testid="measure-edit-value">
            {formatValue(v)}
          </div>
        </div>
        <button className="btn btn-sm btn-icon btn-ghost" onClick={() => select(null)} aria-label="Close">
          <X />
        </button>
      </div>
      {v ? (
        <p className="mb-3 text-xs text-slate-500">
          {area ? (
            <>
              {formatSqFt(v.raw)} drawn · perimeter {formatFeetInches(v.perimeterFt)}
              {(m.wastePct ?? 0) > 0 && <> · +{m.wastePct}% waste</>}
            </>
          ) : (
            <>
              {formatFeetInches(v.raw)} drawn
              {(m.extraFt ?? 0) > 0 && <> + {formatFeetInches(m.extraFt)} extra</>}
              {(m.wastePct ?? 0) > 0 && <> + {m.wastePct}% waste</>}
              {allowances && <> = {formatFeetInches(v.value)}</>}
            </>
          )}
        </p>
      ) : (
        <p className="mb-3 rounded-lg bg-amber-50 p-2 text-xs text-amber-800">This sheet has no scale yet — set it to see the length.</p>
      )}
      {v?.warning && (
        <p className="mb-3 flex items-start gap-1.5 rounded-lg bg-amber-50 p-2 text-xs text-amber-800">
          <TriangleAlert className="mt-px h-3.5 w-3.5 shrink-0" /> The outline crosses itself, so the area is approximate. Redraw it corner by corner around the edge.
        </p>
      )}
      <div className="grid grid-cols-2 gap-2">
        <div className="col-span-2">
          <Field label="Group" value={m.label ?? ""} placeholder="e.g. Cat6 tray" list={listId} onSave={(s) => void update(m.id, { label: s.trim() || null })} testId="measure-edit-label" readOnly={ro} />
          <datalist id={listId}>
            {recent.map((l) => (
              <option key={l} value={l} />
            ))}
          </datalist>
        </div>
        {!area && <Field label="Extra (drops)" numeric suffix="ft" value={m.extraFt ? String(m.extraFt) : ""} placeholder="0" onSave={(s) => void update(m.id, { extraFt: parseNum(s) })} testId="measure-edit-extra" readOnly={ro} />}
        <Field label="Waste" numeric suffix="%" value={m.wastePct ? String(m.wastePct) : ""} placeholder="0" onSave={(s) => void update(m.id, { wastePct: parseNum(s) })} testId="measure-edit-waste" readOnly={ro} />
        <div className="col-span-2">
          <Field label="Notes" value={m.notes ?? ""} placeholder="Optional" onSave={(s) => void update(m.id, { notes: s.trim() || null })} readOnly={ro} />
        </div>
      </div>
      <div className="mt-3 flex items-center gap-1.5">
        {MEASURE_COLORS.map((c) => (
          <button key={c} className={`flex h-8 w-8 items-center justify-center rounded-full ${color === c ? "ring-2 ring-slate-900/70" : ""}`} onClick={() => void update(m.id, { color: c })} disabled={ro} aria-label={`Colour: ${COLOR_NAMES[c] ?? c}`} aria-pressed={color === c}>
            <span className="h-5 w-5 rounded-full" style={{ background: c }} />
          </button>
        ))}
        <div className="flex-1" />
        {!ro && (
        <button
          className={`btn btn-sm ${confirm ? "btn-danger" : "btn-ghost text-slate-500 hover:text-red-600"}`}
          onClick={async () => {
            if (!confirm) return setConfirm(true);
            setLastDeleted(m);
            select(null);
            await remove(m.id);
          }}
          data-testid="measure-delete"
        >
          <Trash /> {confirm ? "Delete?" : "Delete"}
        </button>
        )}
      </div>
      {locked && (
        <p className="mt-2 text-[11px] text-slate-500" data-testid="measure-edit-locked">
          {locked}
        </p>
      )}
      {m.author && <p className="mt-2 text-[11px] text-slate-400">Drawn by {m.author}</p>}
    </div>
  );
}
