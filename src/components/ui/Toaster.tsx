"use client";
// Toasts. Two live regions are always on the page (screen readers only announce changes to regions that already
// exist): a polite one for "Saved"-style news and an assertive role=alert one for errors. Hovering or focusing the
// toasts pauses their timers; errors stay 10 s, or until dismissed while paused. While a modal is open the toasts
// move into it (the rest of the page is inert then).
import { CircleExclamationPoint, CircleCheck, Info, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useToasts, type Toast } from "@/lib/toast";
import { useTopModalSlot } from "./Modal";

function ToastItem({ t, onDismiss }: { t: Toast; onDismiss: () => void }) {
  const Icon = t.kind === "error" ? CircleExclamationPoint : t.kind === "info" ? Info : CircleCheck;
  return (
    <div className="pointer-events-auto flex max-w-md items-center gap-1.5 rounded-xl bg-ink/95 py-0.5 pr-0.5 pl-3.5 text-sm text-white shadow-pop backdrop-blur animate-in">
      <Icon aria-hidden className={`h-4 w-4 shrink-0 ${t.kind === "error" ? "text-red-400" : t.kind === "info" ? "text-sky-300" : "text-emerald-400"}`} />
      <span className="min-w-0 py-2">
        {t.kind === "error" && <span className="sr-only">Error: </span>}
        {t.text}
      </span>
      {t.action && (
        <Link
          href={t.action.href}
          onClick={onDismiss}
          className="flex h-9 shrink-0 items-center rounded-lg px-2.5 font-semibold whitespace-nowrap text-white underline-offset-2 hover:bg-white/10 hover:underline focus-visible:outline-2 focus-visible:outline-white"
        >
          {t.action.label}
        </Link>
      )}
      <button
        type="button"
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-white/70 hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-white"
        onClick={onDismiss}
        aria-label="Dismiss"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

export default function Toaster() {
  const { toasts, paused, dismiss, pause, resume } = useToasts();
  const slot = useTopModalSlot();
  const box = useRef<HTMLDivElement>(null);
  // A dismissed toast takes its focused button with it (no blur event follows): don't stay paused for good.
  useEffect(() => {
    const el = box.current;
    if (paused && (!el || (!el.contains(document.activeElement) && !el.matches(":hover")))) resume();
  }, [toasts, paused, resume]);
  const errors = toasts.filter((t) => t.kind === "error");
  const news = toasts.filter((t) => t.kind !== "error");
  const ui = (
    <div
      ref={box}
      className="pointer-events-none fixed top-16 right-0 z-[60] flex flex-col items-end gap-2 px-4"
      onPointerEnter={pause}
      onPointerLeave={(e) => {
        // Stay paused while keyboard focus is still on a dismiss button.
        if (!e.currentTarget.contains(document.activeElement)) resume();
      }}
      onFocus={pause}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null) && !e.currentTarget.matches(":hover")) resume();
      }}
    >
      <div role="alert" className="flex flex-col items-end gap-2">
        {errors.map((t) => (
          <ToastItem key={t.id} t={t} onDismiss={() => dismiss(t.id)} />
        ))}
      </div>
      <div role="status" aria-live="polite" className="flex flex-col items-end gap-2">
        {news.map((t) => (
          <ToastItem key={t.id} t={t} onDismiss={() => dismiss(t.id)} />
        ))}
      </div>
    </div>
  );
  return slot ? createPortal(ui, slot) : ui;
}
