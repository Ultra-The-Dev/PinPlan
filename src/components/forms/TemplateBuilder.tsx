"use client";
// Build or change a company form template: fields in order (up / down), labels, required, options, units and limits,
// table columns and calculations. Problems are listed live and block saving.
import { ArrowDown, ArrowUp, ChevronDown, Plus, Save, Trash, X } from "lucide-react";
import { useState } from "react";
import { CALC_OPS, FIELD_TYPES, FORM_CATEGORIES, MAX_TABLE_COLUMNS, TABLE_COLUMN_TYPES, calcChoices, moveField, newFieldId, validateTemplate } from "@/lib/forms/forms";
import { TRADE_PACKS } from "@/lib/trades";
import type { FormCalcOp, FormField, FormFieldType, FormTemplate } from "@/lib/types";
import { useT } from "@/lib/i18n";

const typeName = (tpl: FormFieldType) => FIELD_TYPES.find((x) => x.type === tpl)?.name ?? tpl;
const optionsText = (o?: string[]) => (o ?? []).join("\n");
const parseOptions = (s: string) => s.split("\n").map((x) => x.trim()).filter(Boolean);

/** Defaults for a newly added field of a type. */
function blankField(type: FormFieldType, existing: FormField[], tpl: FormTemplate): FormField {
  const label = type === "heading" ? "Section" : type === "signature" ? "Signature" : type === "table" ? "Items" : type === "calc" ? "Total" : typeName(type);
  const f: FormField = { id: newFieldId(existing, label), type, label };
  if (type === "select" || type === "multiselect") f.options = ["Option 1", "Option 2"];
  if (type === "table") f.columns = [{ id: "item", type: "text", label: "Item" }, { id: "qty", type: "number", label: "Qty" }];
  if (type === "calc") f.calc = { op: "sum", of: calcChoices(tpl, "sum")[0]?.of ?? "" };
  return f;
}

function OptionsEditor({ value, onChange, label }: { value?: string[]; onChange: (o: string[]) => void; label: string }) {
  const [text, setText] = useState(optionsText(value));
  const t = useT();
  return (
    <label className="block">
      <span className="label">{t("{name} (one per line)", { name: label })}</span>
      <textarea
        className="input min-h-20"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          onChange(parseOptions(e.target.value));
        }}
      />
    </label>
  );
}

const numOrUndef = (s: string) => {
  const n = Number(s.replace(",", "."));
  return s.trim() === "" || !Number.isFinite(n) ? undefined : n;
};

function ColumnsEditor({ field, onChange }: { field: FormField; onChange: (cols: FormField[]) => void }) {
  const cols = field.columns ?? [];
  const set = (i: number, patch: Partial<FormField>) => onChange(cols.map((c, k) => (k === i ? { ...c, ...patch } : c)));
  const t = useT();
  return (
    <div className="space-y-2">
      <span className="label">{t("Columns ({n}/{max})", { n: cols.length, max: MAX_TABLE_COLUMNS })}</span>
      {cols.map((c, i) => (
        <div key={c.id || i} className="rounded-lg bg-slate-50 p-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <input className="input h-9 min-w-32 flex-1" aria-label={t("Column {n} label", { n: i + 1 })} value={c.label} onChange={(e) => set(i, { label: e.target.value })} />
            <select className="input h-9 w-32 max-w-full" aria-label={t("Column {n} type", { n: i + 1 })} value={c.type} onChange={(e) => set(i, { type: e.target.value as FormFieldType, ...(e.target.value === "select" && !c.options?.length ? { options: ["Option 1"] } : {}) })}>
              {TABLE_COLUMN_TYPES.map((tpl) => (
                <option key={tpl} value={tpl}>
                  {t(typeName(tpl))}
                </option>
              ))}
            </select>
            <label className="inline-flex items-center gap-1 text-xs text-slate-600">
              <input type="checkbox" checked={!!c.required} onChange={(e) => set(i, { required: e.target.checked || undefined })} /> {t("Required")}
            </label>
            <button type="button" className="btn btn-sm btn-icon btn-ghost" aria-label={t("Move column left")} disabled={i === 0} onClick={() => onChange(moveField(cols, i, -1))}>
              <ArrowUp className="-rotate-90" />
            </button>
            <button type="button" className="btn btn-sm btn-icon btn-ghost text-slate-400 hover:text-red-600" aria-label={t("Remove column {name}", { name: c.label })} onClick={() => onChange(cols.filter((_, k) => k !== i))}>
              <X />
            </button>
          </div>
          {c.type === "number" && (
            <input className="input mt-1.5 h-8 w-28" placeholder={t("Unit")} aria-label={t("Column {n} unit", { n: i + 1 })} value={c.unit ?? ""} onChange={(e) => set(i, { unit: e.target.value || undefined })} />
          )}
          {c.type === "select" && (
            <div className="mt-1.5">
              <OptionsEditor label={t("Choices")} value={c.options} onChange={(o) => set(i, { options: o })} />
            </div>
          )}
        </div>
      ))}
      {cols.length < MAX_TABLE_COLUMNS && (
        <button type="button" className="btn btn-sm" onClick={() => onChange([...cols, { id: newFieldId(cols, "col"), type: "text", label: "Column" }])}>
          <Plus /> {t("Add column")}
        </button>
      )}
    </div>
  );
}

function FieldEditor({
  tpl,
  f,
  i,
  count,
  onChange,
  onMove,
  onRemove,
}: {
  tpl: FormTemplate;
  f: FormField;
  i: number;
  count: number;
  onChange: (patch: Partial<FormField>) => void;
  onMove: (by: -1 | 1) => void;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(false);
  const t = useT();
  const hasMore = f.type !== "heading" && f.type !== "signature" && f.type !== "photo" && f.type !== "checkbox";
  return (
    <li className="rounded-xl border border-slate-200 bg-white p-2.5" data-field={f.id}>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="w-6 text-center text-xs font-semibold text-slate-400">{i + 1}</span>
        <input className={`input h-9 min-w-40 flex-1 ${f.type === "heading" ? "font-semibold" : ""}`} aria-label={t("Field {n} label", { n: i + 1 })} value={f.label} onChange={(e) => onChange({ label: e.target.value })} />
        <span className="chip bg-slate-100 text-slate-600">{t(typeName(f.type))}</span>
        {f.type !== "heading" && f.type !== "calc" && (
          <label className="inline-flex h-9 items-center gap-1 px-1 text-xs text-slate-600">
            <input type="checkbox" checked={!!f.required} onChange={(e) => onChange({ required: e.target.checked || undefined })} aria-label={t("{name} required", { name: f.label })} /> {t("Required")}
          </label>
        )}
        <div className="ml-auto flex items-center">
          {hasMore && (
            <button type="button" className={`btn btn-sm btn-icon btn-ghost ${open ? "btn-on" : ""}`} aria-label={t("Options for {name}", { name: f.label })} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
              <ChevronDown className={open ? "rotate-180" : ""} />
            </button>
          )}
          <button type="button" className="btn btn-sm btn-icon btn-ghost" aria-label={t("Move {name} up", { name: f.label })} disabled={i === 0} onClick={() => onMove(-1)}>
            <ArrowUp />
          </button>
          <button type="button" className="btn btn-sm btn-icon btn-ghost" aria-label={t("Move {name} down", { name: f.label })} disabled={i === count - 1} onClick={() => onMove(1)}>
            <ArrowDown />
          </button>
          <button type="button" className="btn btn-sm btn-icon btn-ghost text-slate-400 hover:text-red-600" aria-label={t("Remove {name}", { name: f.label })} onClick={onRemove}>
            <Trash />
          </button>
        </div>
      </div>
      {open && hasMore && (
        <div className="mt-2.5 space-y-2.5 border-t border-slate-100 pt-2.5 pl-7">
          {(f.type === "select" || f.type === "multiselect") && <OptionsEditor label={t("Choices")} value={f.options} onChange={(o) => onChange({ options: o })} />}
          {(f.type === "number" || f.type === "calc") && (
            <div className="flex flex-wrap gap-2">
              <label>
                <span className="label">{t("Unit")}</span>
                <input className="input h-9 w-24" value={f.unit ?? ""} onChange={(e) => onChange({ unit: e.target.value || undefined })} />
              </label>
              {f.type === "number" && (
                <>
                  <label>
                    <span className="label">{t("Min")}</span>
                    <input className="input h-9 w-24" inputMode="decimal" defaultValue={f.min ?? ""} onChange={(e) => onChange({ min: numOrUndef(e.target.value) })} />
                  </label>
                  <label>
                    <span className="label">{t("Max")}</span>
                    <input className="input h-9 w-24" inputMode="decimal" defaultValue={f.max ?? ""} onChange={(e) => onChange({ max: numOrUndef(e.target.value) })} />
                  </label>
                </>
              )}
            </div>
          )}
          {f.type === "calc" && (
            <div className="flex flex-wrap gap-2">
              <label>
                <span className="label">{t("Work out")}</span>
                <select
                  className="input h-9 w-44"
                  value={f.calc?.op ?? "sum"}
                  onChange={(e) => {
                    const op = e.target.value as FormCalcOp;
                    const choices = calcChoices(tpl, op);
                    onChange({ calc: { op, of: choices.some((c) => c.of === f.calc?.of) ? f.calc!.of : (choices[0]?.of ?? "") } });
                  }}
                >
                  {CALC_OPS.map((o) => (
                    <option key={o.op} value={o.op}>
                      {t(o.name)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="min-w-48 flex-1">
                <span className="label">{t("Of")}</span>
                <select className="input h-9" value={f.calc?.of ?? ""} onChange={(e) => onChange({ calc: { op: f.calc?.op ?? "sum", of: e.target.value } })}>
                  <option value="">{t("Choose a field…")}</option>
                  {calcChoices(tpl, f.calc?.op ?? "sum").map((c) => (
                    <option key={c.of} value={c.of}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}
          {f.type === "table" && <ColumnsEditor field={f} onChange={(columns) => onChange({ columns })} />}
          <label className="block">
            <span className="label">{t("Help text (optional)")}</span>
            <input className="input h-9" value={f.help ?? ""} onChange={(e) => onChange({ help: e.target.value || undefined })} />
          </label>
        </div>
      )}
    </li>
  );
}

export default function TemplateBuilder({ initial, onSave, onCancel }: { initial: FormTemplate; onSave: (tpl: FormTemplate) => Promise<void> | void; onCancel: () => void }) {
  const [tpl, setT] = useState<FormTemplate>(initial);
  const [addType, setAddType] = useState<FormFieldType>("yesno");
  const [busy, setBusy] = useState(false);
  const problems = validateTemplate(tpl);
  const t = useT();
  const setField = (i: number, patch: Partial<FormField>) => setT((cur) => ({ ...cur, fields: cur.fields.map((f, k) => (k === i ? { ...f, ...patch } : f)) }));
  return (
    <div className="space-y-4" role="region" aria-label={t("Form template builder")}>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="sm:col-span-3">
          <span className="label">{t("Form name")}</span>
          <input className="input h-11 text-base" aria-label={t("Form name")} value={tpl.name} onChange={(e) => setT({ ...tpl, name: e.target.value })} />
        </label>
        <label>
          <span className="label">{t("Kind")}</span>
          <select className="input" value={tpl.category} onChange={(e) => setT({ ...tpl, category: e.target.value as FormTemplate["category"] })}>
            {FORM_CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>
                {t(c.name)}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="label">{t("Trade")}</span>
          <select className="input" value={tpl.trade ?? ""} onChange={(e) => setT({ ...tpl, trade: e.target.value || undefined })}>
            <option value="">{t("Any trade")}</option>
            {TRADE_PACKS.map((p) => (
              <option key={p.id} value={p.id}>
                {t(p.name)}
              </option>
            ))}
          </select>
        </label>
        <p className="self-end pb-2 text-xs text-slate-500">{t("Version {n}. Forms already started keep the version they began with.", { n: tpl.version })}</p>
      </div>

      <ol className="space-y-2">
        {tpl.fields.map((f, i) => (
          <FieldEditor
            key={`${f.id}-${i}`}
            tpl={tpl}
            f={f}
            i={i}
            count={tpl.fields.length}
            onChange={(p) => setField(i, p)}
            onMove={(by) => setT((cur) => ({ ...cur, fields: moveField(cur.fields, i, by) }))}
            onRemove={() => setT((cur) => ({ ...cur, fields: cur.fields.filter((_, k) => k !== i) }))}
          />
        ))}
      </ol>

      <div className="flex flex-wrap items-end gap-2 rounded-xl bg-slate-50 p-3">
        <label className="min-w-44 flex-1">
          <span className="label">{t("New field")}</span>
          <select className="input" aria-label={t("New field type")} value={addType} onChange={(e) => setAddType(e.target.value as FormFieldType)}>
            {FIELD_TYPES.map((x) => (
              <option key={x.type} value={x.type}>
                {t(x.name)}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="btn" onClick={() => setT((cur) => ({ ...cur, fields: [...cur.fields, blankField(addType, cur.fields, cur)] }))}>
          <Plus /> {t("Add field")}
        </button>
      </div>

      {problems.length > 0 && (
        <ul className="space-y-0.5 rounded-lg bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-200" aria-label={t("Problems")}>
          {problems.map((p, k) => (
            <li key={k}>• {t(p)}</li>
          ))}
        </ul>
      )}
      <div className="flex justify-end gap-2">
        <button type="button" className="btn" onClick={onCancel}>
          {t("Cancel")}
        </button>
        <button
          type="button"
          className="btn btn-brand"
          disabled={problems.length > 0 || busy}
          onClick={async () => {
            setBusy(true);
            try {
              await onSave({ ...tpl, name: tpl.name.trim() });
            } finally {
              setBusy(false);
            }
          }}
        >
          <Save /> {t("Save template")}
        </button>
      </div>
    </div>
  );
}
