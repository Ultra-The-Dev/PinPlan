"use client";
import { Eye, PencilLine } from "lucide-react";
import { useT } from "@/lib/i18n";
import type { ViewerMode } from "@/lib/viewerStore";

/** View only ↔ Edit. Edit is orange (and the plan gets an orange frame) so it's never on by accident. */
export default function ModeToggle({ mode, onChange, compact }: { mode: ViewerMode; onChange: (m: ViewerMode) => void; compact?: boolean }) {
  const t = useT();
  const btn = (m: ViewerMode, label: string, Icon: typeof Eye) => {
    const on = mode === m;
    return (
      <button
        className={`flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-semibold transition ${
          on ? (m === "edit" ? "bg-brand-600 text-white shadow-sm" : "bg-ink text-white shadow-sm") : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
        }`}
        onClick={() => onChange(m)}
        aria-pressed={on}
        title={m === "edit" ? t("Edit mode: place, move and draw (E)") : t("View only: look around without changing anything (E)")}
        data-testid={`mode-${m}`}
      >
        <Icon className="h-4 w-4" />
        {(!compact || on) && <span>{label}</span>}
      </button>
    );
  };
  return (
    <div className="flex h-11 shrink-0 items-center gap-0.5 rounded-xl bg-white/90 p-1 shadow-pop ring-1 ring-black/5 backdrop-blur-md" role="group" aria-label={t("Mode")} data-plan-ui>
      {btn("view", t("View"), Eye)}
      {btn("edit", t("Edit"), PencilLine)}
    </div>
  );
}
