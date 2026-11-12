"use client";
import { CircleExclamationPoint, CircleCheck, Info, X } from "lucide-react";
import { useToasts } from "@/lib/toast";

export default function Toaster() {
  const { toasts, dismiss } = useToasts();
  return (
    <div className="pointer-events-none fixed top-16 right-0 z-[60] flex flex-col items-end gap-2 px-4">
      {toasts.map((t) => {
        const Icon = t.kind === "error" ? CircleExclamationPoint : t.kind === "info" ? Info : CircleCheck;
        return (
          <div
            key={t.id}
            role="status"
            className="pointer-events-auto flex max-w-md items-center gap-2.5 rounded-xl bg-ink/95 py-2.5 pr-2 pl-3.5 text-sm text-white shadow-pop backdrop-blur animate-in"
          >
            <Icon className={`h-4 w-4 shrink-0 ${t.kind === "error" ? "text-red-400" : t.kind === "info" ? "text-sky-300" : "text-emerald-400"}`} />
            <span className="min-w-0">{t.text}</span>
            <button className="rounded-md p-1 text-white/60 hover:bg-white/10 hover:text-white" onClick={() => dismiss(t.id)} aria-label="Dismiss">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
