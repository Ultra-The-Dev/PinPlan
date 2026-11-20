"use client";
// The job tabs, always labelled: a segmented strip in the header from sm up (every tab), a bottom tab bar on phones
// (four tabs and More, see phoneTabs in src/lib/tabRoutes.ts).
import { Camera, ClipboardCheck, Ellipsis, Info, ListChecks, ListTodo, MapPin, Receipt } from "lucide-react";
import { useEffect, useState } from "react";
import { msg, useT } from "@/lib/i18n";
import type { JobTabId } from "@/lib/tabRoutes";
import { tourAnchor } from "@/lib/tour/anchors";

export const JOB_TAB_META: Record<JobTabId, { label: string; icon: typeof Info }> = {
  overview: { label: msg("Overview"), icon: Info },
  plan: { label: msg("Plan"), icon: MapPin },
  takeoff: { label: msg("Takeoff"), icon: ListChecks },
  tasks: { label: msg("Tasks"), icon: ListTodo },
  photos: { label: msg("Photos"), icon: Camera },
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
          <button key={id} type="button" className={`tab ${active === id ? "tab-active" : ""}`} onClick={() => onSelect(id)} aria-current={active === id ? "page" : undefined} {...tourAnchor(`job-tab-${id}`)}>
            <m.icon />
            {t(m.label)}
          </button>
        );
      })}
    </nav>
  );
}

const barButton = (on: boolean) =>
  `flex h-14 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition [&_svg]:h-5 [&_svg]:w-5 ${on ? "text-brand-700" : "text-slate-500 active:bg-slate-50"}`;

/**
 * Phone bottom bar: four tabs and More (the other tabs, in a small menu; More is lit while one of them is open), icon
 * over label, thumb-sized, clear of the home indicator.
 */
export function JobTabBar({ tabs, more, active, onSelect }: Props & { more: readonly JobTabId[] }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const inMore = more.includes(active);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  const pick = (id: JobTabId) => {
    setOpen(false);
    onSelect(id);
  };
  return (
    <nav className="relative z-40 flex shrink-0 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur sm:hidden" aria-label={t("Job sections")}>
      {tabs.map((id) => {
        const m = JOB_TAB_META[id];
        const on = active === id;
        return (
          <button key={id} type="button" className={barButton(on)} onClick={() => pick(id)} aria-current={on ? "page" : undefined} {...tourAnchor(`job-tab-${id}`)}>
            <m.icon />
            <span className="line-clamp-2 max-w-full px-0.5 text-center leading-[1.15] break-words">{t(m.label)}</span>
          </button>
        );
      })}
      {more.length > 0 && (
        <button type="button" className={barButton(inMore || open)} onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="true" aria-current={inMore ? "page" : undefined} data-testid="job-tabs-more" {...tourAnchor("job-tab-more")}>
          <Ellipsis />
          <span className="line-clamp-2 max-w-full px-0.5 text-center leading-[1.15] break-words">{t("More")}</span>
        </button>
      )}
      {open && (
        <>
          <button type="button" className="fixed inset-0 z-40 cursor-default bg-slate-900/20" aria-label={t("Close")} onClick={() => setOpen(false)} />
          <div className="card animate-in absolute right-2 bottom-full z-50 mb-2 w-56 p-1.5 shadow-pop" role="group" aria-label={t("More")}>
            {more.map((id) => {
              const m = JOB_TAB_META[id];
              const on = active === id;
              return (
                <button key={id} type="button" className={`flex h-12 w-full items-center gap-3 rounded-lg px-3 text-left text-sm font-medium [&_svg]:h-5 [&_svg]:w-5 ${on ? "bg-brand-50 text-brand-700" : "text-slate-700 hover:bg-slate-50"}`} onClick={() => pick(id)} aria-current={on ? "page" : undefined}>
                  <m.icon />
                  {t(m.label)}
                </button>
              );
            })}
          </div>
        </>
      )}
    </nav>
  );
}
