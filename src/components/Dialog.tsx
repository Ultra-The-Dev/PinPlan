"use client";
import { X } from "lucide-react";
import { useId, useState } from "react";
import Modal from "./ui/Modal";
import { useT } from "@/lib/i18n";

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
  const t = useT();
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(props.fields.map((f) => [f.name, f.initial ?? ""])));
  const id = useId();
  return (
    <Modal onClose={props.onCancel} labelledBy={`${id}-title`} describedBy={props.description ? `${id}-desc` : undefined}>
      <form
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
          <button type="button" className="btn btn-sm btn-icon btn-ghost -mt-1 -mr-1" onClick={props.onCancel} aria-label={t("Close")}>
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
              // Modal focuses this once the <dialog> is open (React's autoFocus runs while it is still closed).
              data-autofocus={i === 0 ? "" : undefined}
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
            {t("Cancel")}
          </button>
          <button className="btn btn-brand">{props.submitLabel ?? t("Save")}</button>
        </div>
      </form>
    </Modal>
  );
}
