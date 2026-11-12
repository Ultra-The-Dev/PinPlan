"use client";
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
  onSubmit: (values: Record<string, string>) => void;
  onCancel: () => void;
}) {
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(props.fields.map((f) => [f.name, f.initial ?? ""])));
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={props.onCancel}>
      <form
        className="card w-full max-w-sm space-y-3 p-4"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          props.onSubmit(values);
        }}
      >
        <h2 className="text-lg font-semibold">{props.title}</h2>
        {props.description && <p className="text-sm text-slate-600">{props.description}</p>}
        {props.fields.map((f, i) => (
          <div key={f.name}>
            <label className="label">{f.label}</label>
            <input
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
        {props.error && <p className="text-sm text-red-600">{props.error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn" onClick={props.onCancel}>
            Cancel
          </button>
          <button className="btn btn-primary">{props.submitLabel ?? "OK"}</button>
        </div>
      </form>
    </div>
  );
}
