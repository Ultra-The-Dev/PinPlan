"use client";
// The five job tabs, always labelled: a segmented strip in the header from sm up, a bottom tab bar on phones.
import { ClipboardCheck, Info, ListChecks, MapPin, Receipt } from "lucide-react";
import type { JobTabId } from "@/lib/tabRoutes";

export const JOB_TAB_META: Record<JobTabId, { label: string; icon: typeof Info }> = {
  overview: { label: "Overview", icon: Info },
  plan: { label: "Plan", icon: MapPin },
  takeoff: { label: "Takeoff", icon: ListChecks },
  money: { label: "Money", icon: Receipt },
  field: { label: "Field", icon: ClipboardCheck },
};

interface Props {
  tabs: readonly JobTabId[];
  active: JobTabId;
  onSelect: (tab: JobTabId) => void;
}

/** Header strip (hidden on phones, where the bottom bar takes over). */
export function JobTabStrip({ tabs, active, onSelect }: Props) {
  return (
    <nav className="seg max-sm:hidden" aria-label="Job sections">
      {tabs.map((id) => {
        const t = JOB_TAB_META[id];
        return (
          <button key={id} type="button" className={`tab ${active === id ? "tab-active" : ""}`} onClick={() => onSelect(id)} aria-current={active === id ? "page" : undefined}>
            <t.icon />
            {t.label}
          </button>
        );
      })}
    </nav>
  );
}

/** Phone bottom bar: icon over label, thumb-sized targets, clear of the home indicator. */
export function JobTabBar({ tabs, active, onSelect }: Props) {
  return (
    <nav className="flex shrink-0 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur sm:hidden" aria-label="Job sections">
      {tabs.map((id) => {
        const t = JOB_TAB_META[id];
        const on = active === id;
        return (
          <button
            key={id}
            type="button"
            className={`flex h-14 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition [&_svg]:h-5 [&_svg]:w-5 ${on ? "text-brand-700" : "text-slate-500 active:bg-slate-50"}`}
            onClick={() => onSelect(id)}
            aria-current={on ? "page" : undefined}
          >
            <t.icon />
            <span className="truncate">{t.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
