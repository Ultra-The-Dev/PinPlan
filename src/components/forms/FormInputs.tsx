"use client";
// Field controls for filling a form on a phone: big targets, a Yes / No / N.A. switch, a number pad with a decimal
// comma, chips for short option lists and table rows as cards.
import { Check, Minus, Plus, SquareCheck, Trash } from "lucide-react";
import { useState } from "react";
import { columnTotals, formatNumber, parseNumber, type FormRow, type YesNo } from "@/lib/forms/forms";
import type { FormField } from "@/lib/types";

const YES_NO: { v: YesNo; label: string; on: string }[] = [
  { v: "yes", label: "Yes", on: "border-emerald-600 bg-emerald-600 text-white" },
  { v: "no", label: "No", on: "border-red-600 bg-red-600 text-white" },
  { v: "na", label: "N/A", on: "border-slate-600 bg-slate-600 text-white" },
];

export function YesNoInput({ value, onChange, disabled, compact, label }: { value: unknown; onChange: (v: YesNo | null) => void; disabled?: boolean; compact?: boolean; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex gap-1.5">
      {YES_NO.map((o) => {
        const on = value === o.v;
        return (
          <button
            key={o.v}
            type="button"
            role="radio"
            aria-checked={on}
            disabled={disabled}
            // Tapping the chosen answer again clears it.
            onClick={() => onChange(on ? null : o.v)}
            className={`${compact ? "h-9 min-w-12 px-2 text-xs" : "h-11 min-w-[4.5rem] flex-1 px-3 text-sm sm:flex-none"} rounded-lg border font-semibold transition select-none active:scale-[0.97] disabled:opacity-60 ${
              on ? o.on : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** Number entry with the phone's decimal keypad. Keeps what was typed ("12," while typing); stores a number once it reads as one. */
export function NumberInput({ value, onChange, disabled, unit, compact, label, step = 1, min }: { value: unknown; onChange: (v: number | string | null) => void; disabled?: boolean; unit?: string; compact?: boolean; label: string; step?: number; min?: number }) {
  const [text, setText] = useState(() => (typeof value === "number" ? formatNumber(value) : typeof value === "string" ? value : ""));
  const set = (t: string) => {
    setText(t);
    if (!t.trim()) return onChange(null);
    const n = parseNumber(t);
    onChange(n == null ? t : n);
  };
  const bump = (by: number) => {
    const n = parseNumber(text) ?? 0;
    const next = Math.round((n + by) * 1000) / 1000;
    set(formatNumber(min != null ? Math.max(min, next) : next));
  };
  return (
    <div className="flex items-center gap-1.5">
      {!compact && !disabled && (
        <button type="button" className="btn btn-icon h-11 w-11" aria-label={`Less ${label}`} onClick={() => bump(-step)}>
          <Minus />
        </button>
      )}
      <div className="relative min-w-0 flex-1">
        <input
          className={`input tabular-nums ${compact ? "h-9" : "h-11 text-base"} ${unit ? "pr-12" : ""}`}
          inputMode="decimal"
          enterKeyHint="next"
          aria-label={label}
          disabled={disabled}
          value={text}
          onChange={(e) => set(e.target.value)}
        />
        {unit && <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-slate-400">{unit}</span>}
      </div>
      {!compact && !disabled && (
        <button type="button" className="btn btn-icon h-11 w-11" aria-label={`More ${label}`} onClick={() => bump(step)}>
          <Plus />
        </button>
      )}
    </div>
  );
}

export function SelectInput({ field, value, onChange, disabled, compact }: { field: FormField; value: unknown; onChange: (v: string | null) => void; disabled?: boolean; compact?: boolean }) {
  const options = field.options ?? [];
  // A few short options read best as chips; long lists as a dropdown.
  if (!compact && options.length <= 6 && options.every((o) => o.length <= 28))
    return (
      <div role="radiogroup" aria-label={field.label} className="flex flex-wrap gap-1.5">
        {options.map((o) => {
          const on = value === o;
          return (
            <button
              key={o}
              type="button"
              role="radio"
              aria-checked={on}
              disabled={disabled}
              onClick={() => onChange(on ? null : o)}
              className={`h-10 rounded-full border px-3.5 text-sm font-medium transition active:scale-[0.97] disabled:opacity-60 ${on ? "border-brand-600 bg-brand-600 text-white" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}
            >
              {o}
            </button>
          );
        })}
      </div>
    );
  return (
    <select className={`input ${compact ? "h-9" : "h-11 text-base"}`} aria-label={field.label} disabled={disabled} value={typeof value === "string" ? value : ""} onChange={(e) => onChange(e.target.value || null)}>
      <option value="">Choose…</option>
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}

export function MultiSelectInput({ field, value, onChange, disabled }: { field: FormField; value: unknown; onChange: (v: string[]) => void; disabled?: boolean }) {
  const picked = Array.isArray(value) ? (value as string[]) : [];
  return (
    <div role="group" aria-label={field.label} className="flex flex-wrap gap-1.5">
      {(field.options ?? []).map((o) => {
        const on = picked.includes(o);
        return (
          <button
            key={o}
            type="button"
            aria-pressed={on}
            disabled={disabled}
            onClick={() => onChange(on ? picked.filter((x) => x !== o) : [...picked, o])}
            className={`inline-flex h-10 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition active:scale-[0.97] disabled:opacity-60 ${on ? "border-brand-200 bg-brand-50 text-brand-700" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}
          >
            {on && <Check className="h-3.5 w-3.5" />}
            {o}
          </button>
        );
      })}
    </div>
  );
}

export function CheckboxInput({ label, value, onChange, disabled }: { label: string; value: unknown; onChange: (v: boolean) => void; disabled?: boolean }) {
  const on = value === true;
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={`inline-flex h-11 items-center gap-2 rounded-lg border px-3.5 text-sm font-medium transition active:scale-[0.98] disabled:opacity-60 ${on ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-slate-200 bg-white text-slate-600"}`}
    >
      <SquareCheck className={`h-5 w-5 ${on ? "text-emerald-600" : "text-slate-300"}`} />
      {on ? "Done" : "Tap to tick"}
    </button>
  );
}

/** One table cell (text | number | select | yesno | date). */
function Cell({ col, value, onChange, disabled, autoFocus }: { col: FormField; value: unknown; onChange: (v: unknown) => void; disabled?: boolean; autoFocus?: boolean }) {
  const label = `${col.label}${col.required ? " *" : ""}`;
  let input: React.ReactNode;
  if (col.type === "yesno") input = <YesNoInput compact label={col.label} value={value} onChange={onChange} disabled={disabled} />;
  else if (col.type === "number") input = <NumberInput compact label={col.label} unit={col.unit} value={value} onChange={onChange} disabled={disabled} />;
  else if (col.type === "select") input = <SelectInput compact field={col} value={value} onChange={onChange} disabled={disabled} />;
  else
    input = (
      <input
        className="input h-9"
        type={col.type === "date" ? "date" : "text"}
        aria-label={col.label}
        autoFocus={autoFocus}
        disabled={disabled}
        value={typeof value === "string" ? value : ""}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  // Yes/No is a group of buttons: a <label> around it would press "Yes" when the column name is tapped.
  const Wrap = col.type === "yesno" ? "div" : "label";
  return (
    <Wrap className="block min-w-0">
      <span className="mb-1 block text-[11px] font-medium text-slate-500" aria-hidden={col.type === "yesno" ? true : undefined}>
        {label}
      </span>
      {input}
    </Wrap>
  );
}

export function TableInput({
  field,
  value,
  onChange,
  disabled,
  newRowId,
  rowErrors,
}: {
  field: FormField;
  value: unknown;
  onChange: (rows: FormRow[]) => void;
  disabled?: boolean;
  newRowId: () => string;
  rowErrors?: Map<number, Set<string>>;
}) {
  const rows = Array.isArray(value) ? (value as FormRow[]) : [];
  const cols = field.columns ?? [];
  const [justAdded, setJustAdded] = useState<string | null>(null);
  const totals = columnTotals(field, rows);
  const setCell = (i: number, colId: string, v: unknown) => onChange(rows.map((r, k) => (k === i ? { ...r, [colId]: v } : r)));
  return (
    <div className="space-y-2">
      {rows.length === 0 && <p className="rounded-lg bg-slate-50 px-3 py-2.5 text-sm text-slate-500">No rows yet.</p>}
      {rows.map((r, i) => {
        const bad = rowErrors?.get(i);
        return (
          <div key={r._id ?? i} className={`rounded-xl border p-2.5 ${bad?.size ? "border-red-300 bg-red-50/40" : "border-slate-200 bg-slate-50/60"}`} data-row={i}>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500">
                {field.label} {i + 1}
              </span>
              {!disabled && (
                <button type="button" className="btn btn-sm btn-icon btn-ghost text-slate-400 hover:text-red-600" aria-label={`Remove row ${i + 1}`} onClick={() => onChange(rows.filter((_, k) => k !== i))}>
                  <Trash />
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-[repeat(auto-fit,minmax(9rem,1fr))]">
              {cols.map((c, ci) => (
                <div key={c.id} className={c.type === "yesno" || (c.type === "text" && ci === 0 && cols.length % 2 === 1) ? "col-span-2 sm:col-span-1" : ""}>
                  <Cell col={c} value={r[c.id]} disabled={disabled} autoFocus={ci === 0 && r._id === justAdded} onChange={(v) => setCell(i, c.id, v)} />
                  {bad?.has(c.id) && <p className="mt-0.5 text-[11px] font-medium text-red-600">{r[c.id] == null || r[c.id] === "" ? "Required" : "Check this"}</p>}
                </div>
              ))}
            </div>
          </div>
        );
      })}
      {Object.keys(totals).length > 0 && rows.length > 0 && (
        <p className="flex flex-wrap gap-x-4 px-1 text-xs text-slate-500">
          {cols
            .filter((c) => c.id in totals)
            .map((c) => (
              <span key={c.id}>
                {c.label} total: <b className="tabular-nums text-slate-800">{formatNumber(totals[c.id])}</b>
                {c.unit ? ` ${c.unit}` : ""}
              </span>
            ))}
        </p>
      )}
      {!disabled && (
        <button
          type="button"
          className="flex h-11 w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-slate-300 text-sm font-medium text-slate-600 transition hover:border-brand-300 hover:text-brand-700 active:scale-[0.99]"
          onClick={() => {
            const id = newRowId();
            setJustAdded(id);
            onChange([...rows, { _id: id }]);
          }}
        >
          <Plus className="h-4 w-4" /> Add {field.label.toLowerCase().replace(/s$/, "") || "row"}
        </button>
      )}
    </div>
  );
}
