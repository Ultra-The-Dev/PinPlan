"use client";
import { X } from "lucide-react";
import { useState } from "react";

export interface DialogField {
  name: string;
  label: string;
  placeholder?: string;
  initial?: string;
  inputMode?: "decimal" | "numeric" | "text";
  help?: string;
}

/** Small modal form used by the drawing tools (calibration, LED run details, stair LED). */
export default function Dialog(props: {
  title: string;
  description?: string;
  fields: DialogField[];
  submitLabel?: string;
  error?: string | null;
  secondary?: { label: string; onClick: () => void };
  onSubmit: (values: Record<string, string>) => void;
  onCancel: () => void;
}) {
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(props.fields.map((f) => [f.name, f.initial ?? ""])));
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/30 p-4 backdrop-blur-[2px] sm:items-center" onClick={props.onCancel}>
      <form
        role="dialog"
        aria-label={props.title}
        className="card animate-in w-full max-w-sm space-y-4 p-5 shadow-pop"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          props.onSubmit(values);
        }}
      >
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold">{props.title}</h2>
            {props.description && <p className="mt-1 text-sm text-slate-500">{props.description}</p>}
          </div>
          <button type="button" className="btn btn-sm btn-icon btn-ghost -mt-1 -mr-1" onClick={props.onCancel} aria-label="Close">
            <X />
          </button>
        </div>
        {props.fields.map((f, i) => (
          <div key={f.name}>
            <label className="label" htmlFor={`dlg-${f.name}`}>
              {f.label}
            </label>
            <input
              id={`dlg-${f.name}`}
              className="input"
              autoFocus={i === 0}
              inputMode={f.inputMode}
              placeholder={f.placeholder}
              value={values[f.name]}
              onChange={(e) => setValues({ ...values, [f.name]: e.target.value })}
            />
            {f.help && <p className="mt-1 text-xs text-slate-500">{f.help}</p>}
          </div>
        ))}
        {props.error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{props.error}</p>}
        <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
          {props.secondary && (
            <button type="button" className="btn btn-ghost mr-auto px-2 text-brand-600" onClick={props.secondary.onClick}>
              {props.secondary.label}
            </button>
          )}
          <button type="button" className="btn" onClick={props.onCancel}>
            Cancel
          </button>
          <button className="btn btn-brand">{props.submitLabel ?? "Save"}</button>
        </div>
      </form>
    </div>
  );
}
