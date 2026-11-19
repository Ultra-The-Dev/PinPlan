"use client";
// Small building blocks for the quotes / invoices screens.
import { X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { STATUS_LABEL } from "@/lib/documents";
import type { DocDisplayStatus, DocKind } from "@/lib/types";

const STATUS_STYLE: Record<DocDisplayStatus, string> = {
  draft: "bg-slate-100 text-slate-600",
  sent: "bg-sky-50 text-sky-700",
  viewed: "bg-indigo-50 text-indigo-700",
  accepted: "bg-emerald-50 text-emerald-700",
  declined: "bg-red-50 text-red-700",
  partially_paid: "bg-amber-50 text-amber-800",
  paid: "bg-emerald-50 text-emerald-700",
  void: "bg-slate-100 text-slate-400 line-through",
  overdue: "bg-red-50 text-red-700",
  expired: "bg-amber-50 text-amber-800",
};

export function StatusChip({ status }: { status: DocDisplayStatus }) {
  return <span className={`chip shrink-0 ${STATUS_STYLE[status]}`}>{STATUS_LABEL[status]}</span>;
}

export const KIND_SHORT: Record<DocKind, string> = { quote: "Quote", invoice: "Invoice", credit_note: "Credit" };
const KIND_STYLE: Record<DocKind, string> = { quote: "bg-violet-50 text-violet-700", invoice: "bg-brand-50 text-brand-700", credit_note: "bg-slate-100 text-slate-600" };
export function KindChip({ kind, label }: { kind: DocKind; label?: string }) {
  return <span className={`chip shrink-0 ${KIND_STYLE[kind]}`}>{label ?? KIND_SHORT[kind]}</span>;
}

/** "$1,200.50", "1200.5", "-40" → number; anything else → null. */
export function parseAmount(s: string): number | null {
  const t = s.replace(/[\s$€£,]/g, "");
  if (!t || t === "-" || t === ".") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** A dropdown menu of actions. */
export function Menu({ label, icon, items, align = "right", className = "btn" }: { label: React.ReactNode; icon?: React.ReactNode; items: ({ label: string; icon?: React.ReactNode; onClick: () => void; danger?: boolean; disabled?: boolean; hint?: string } | null | false)[]; align?: "left" | "right"; className?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);
  const list = items.filter(Boolean) as Exclude<(typeof items)[number], null | false>[];
  return (
    <div className="relative" ref={ref}>
      <button type="button" className={className} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {icon}
        {label}
      </button>
      {open && (
        <div role="menu" className={`card animate-in absolute z-40 mt-1 min-w-56 p-1 shadow-pop ${align === "right" ? "right-0" : "left-0"}`}>
          {list.map((it) => (
            <button
              key={it.label}
              role="menuitem"
              type="button"
              disabled={it.disabled}
              title={it.hint}
              className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-50 disabled:opacity-40 [&_svg]:h-4 [&_svg]:w-4 ${it.danger ? "text-red-600" : "text-slate-700"}`}
              onClick={() => {
                setOpen(false);
                it.onClick();
              }}
            >
              {it.icon}
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** A modal panel (bottom sheet on phones). */
export function Modal({ title, description, onClose, children, wide }: { title: string; description?: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", k);
    return () => document.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/30 p-0 backdrop-blur-[2px] sm:items-center sm:p-4" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`card animate-in max-h-[92vh] w-full overflow-auto rounded-b-none p-5 shadow-pop sm:rounded-b-2xl ${wide ? "sm:max-w-2xl" : "sm:max-w-md"}`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold">{title}</h2>
            {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
          </div>
          <button type="button" className="btn btn-sm btn-icon btn-ghost -mt-1 -mr-1" onClick={onClose} aria-label="Close">
            <X />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** A text input that commits on blur / Enter (so typing doesn't save every keystroke). */
export function CommitInput({ value, onCommit, className = "input", ...rest }: { value: string; onCommit: (v: string) => void; className?: string } & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  const [v, setV] = useState(value);
  const [prev, setPrev] = useState(value);
  if (prev !== value) {
    setPrev(value);
    setV(value);
  }
  return (
    <input
      {...rest}
      className={className}
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={(e) => {
        if (v !== value) onCommit(v);
        rest.onBlur?.(e);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" && !e.nativeEvent.isComposing) (e.target as HTMLInputElement).blur();
        rest.onKeyDown?.(e);
      }}
    />
  );
}
