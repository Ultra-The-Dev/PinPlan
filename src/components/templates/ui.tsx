"use client";
// Small building blocks for the job template screens: a sheet that rises from the bottom on phones (a centred dialog
// on wider screens) and big, thumb-friendly switch rows.
import { X } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { useT } from "@/lib/i18n";

export function TemplateSheet(props: { title: string; subtitle?: string; onClose: () => void; children: ReactNode; busy?: boolean; label?: string }) {
  const t = useT();
  const { onClose, busy } = props;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, busy]);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/30 backdrop-blur-[2px] sm:items-center sm:p-4" onClick={() => !busy && onClose()}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={props.label ?? props.title}
        className="card animate-in max-h-[92dvh] w-full overflow-auto rounded-b-none p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-pop sm:max-w-md sm:rounded-b-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto -mt-2 mb-3 h-1 w-10 rounded-full bg-slate-200 sm:hidden" aria-hidden />
        <div className="mb-4 flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold">{props.title}</h2>
            {props.subtitle && <p className="mt-0.5 text-sm text-slate-500">{props.subtitle}</p>}
          </div>
          <button type="button" className="btn btn-sm btn-icon btn-ghost" onClick={onClose} disabled={busy} aria-label={t("Close")}>
            <X />
          </button>
        </div>
        {props.children}
      </div>
    </div>
  );
}

/** A full-width switch row (44px+ tall) — easy to hit with a gloved thumb. */
export function ToggleRow(props: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; testId?: string }) {
  return (
    <label className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-lg px-1 py-2 ${props.disabled ? "opacity-50" : "hover:bg-slate-50"}`} data-testid={props.testId}>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-slate-800">{props.label}</span>
        {props.hint && <span className="block text-xs text-slate-500">{props.hint}</span>}
      </span>
      <input type="checkbox" role="switch" className="peer sr-only" checked={props.checked} disabled={props.disabled} onChange={(e) => props.onChange(e.target.checked)} />
      <span
        aria-hidden
        className="relative h-6 w-10 shrink-0 rounded-full bg-slate-200 transition peer-checked:bg-brand-600 peer-focus-visible:ring-4 peer-focus-visible:ring-brand-100 after:absolute after:top-0.5 after:left-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:shadow after:transition peer-checked:after:translate-x-4"
      />
    </label>
  );
}

/** Things that were skipped while applying a template. */
export function WarningList({ warnings }: { warnings: string[] }) {
  const t = useT();
  if (!warnings.length) return null;
  return (
    <ul className="space-y-1.5 rounded-lg bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-200" data-testid="template-warnings">
      {warnings.map((w, i) => (
        <li key={i}>• {t(w)}</li>
      ))}
    </ul>
  );
}
