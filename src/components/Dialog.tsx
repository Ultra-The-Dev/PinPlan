"use client";
import { X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import Modal from "./ui/Modal";

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
  const id = useId();
  // Mark the native <dialog> (opened modal by Modal) aria-modal, so the plan's shortcuts and Escape handlers, which
  // look for [aria-modal='true'] (planKeyBlocked / modalOpen), stand down while this form is open, focus on its buttons too.
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    const dlg = form.current?.closest("dialog");
    dlg?.setAttribute("aria-modal", "true");
    return () => dlg?.removeAttribute("aria-modal");
  }, []);
  return (
    <Modal onClose={props.onCancel} labelledBy={`${id}-title`} describedBy={props.description ? `${id}-desc` : undefined}>
      <form
        ref={form}
        className="card animate-in w-full max-w-sm space-y-4 p-5 shadow-pop"
        onSubmit={(e) => {
          e.preventDefault();
          props.onSubmit(values);
        }}
      >
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h2 id={`${id}-title`} className="text-base font-semibold">
              {props.title}
            </h2>
            {props.description && <p id={`${id}-desc`} className="mt-1 text-sm text-slate-500">{props.description}</p>}
          </div>
          <button type="button" className="btn btn-sm btn-icon btn-ghost -mt-1 -mr-1" onClick={props.onCancel} aria-label="Close">
            <X />
          </button>
        </div>
        {props.fields.map((f, i) => (
          <div key={f.name}>
            <label className="label" htmlFor={`${id}-${f.name}`}>
              {f.label}
            </label>
            <input
              id={`${id}-${f.name}`}
              className="input"
              autoFocus={i === 0}
              inputMode={f.inputMode}
              placeholder={f.placeholder}
              value={values[f.name]}
              aria-describedby={f.help ? `${id}-${f.name}-help` : undefined}
              onChange={(e) => setValues({ ...values, [f.name]: e.target.value })}
            />
            {f.help && (
              <p id={`${id}-${f.name}-help`} className="mt-1 text-xs text-slate-500">
                {f.help}
              </p>
            )}
          </div>
        ))}
        {props.error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{props.error}</p>}
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
    </Modal>
  );
}
