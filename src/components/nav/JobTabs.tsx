"use client";
// The five job tabs, always labelled: a segmented strip in the header from sm up, a bottom tab bar on phones.
import { ClipboardCheck, Info, ListChecks, MapPin, Receipt } from "lucide-react";
import { msg, useT } from "@/lib/i18n";
import type { JobTabId } from "@/lib/tabRoutes";

export const JOB_TAB_META: Record<JobTabId, { label: string; icon: typeof Info }> = {
  overview: { label: msg("Overview"), icon: Info },
  plan: { label: msg("Plan"), icon: MapPin },
  takeoff: { label: msg("Takeoff"), icon: ListChecks },
  money: { label: msg("Money"), icon: Receipt },
  field: { label: msg("Field"), icon: ClipboardCheck },
};

interface Props {
  tabs: readonly JobTabId[];
  active: JobTabId;
  onSelect: (tab: JobTabId) => void;
}

/** Header strip (hidden on phones, where the bottom bar takes over). */
export function JobTabStrip({ tabs, active, onSelect, className = "" }: Props & { className?: string }) {
  const t = useT();
  return (
    <nav className={`seg max-sm:hidden ${className}`} aria-label={t("Job sections")}>
      {tabs.map((id) => {
        const m = JOB_TAB_META[id];
        return (
          <button key={id} type="button" className={`tab ${active === id ? "tab-active" : ""}`} onClick={() => onSelect(id)} aria-current={active === id ? "page" : undefined}>
            <m.icon />
            {t(m.label)}
          </button>
        );
      })}
    </nav>
  );
}

/** Phone bottom bar: icon over label, thumb-sized targets, clear of the home indicator. */
export function JobTabBar({ tabs, active, onSelect }: Props) {
  const t = useT();
  return (
    <nav className="flex shrink-0 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur sm:hidden" aria-label={t("Job sections")}>
      {tabs.map((id) => {
        const m = JOB_TAB_META[id];
        const on = active === id;
        return (
          <button
            key={id}
            type="button"
            className={`flex h-14 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition [&_svg]:h-5 [&_svg]:w-5 ${on ? "text-brand-700" : "text-slate-500 active:bg-slate-50"}`}
            onClick={() => onSelect(id)}
            aria-current={on ? "page" : undefined}
          >
            <m.icon />
            <span className="line-clamp-2 max-w-full px-0.5 text-center leading-[1.15] break-words">{t(m.label)}</span>
          </button>
        );
      })}
    </nav>
  );
}
