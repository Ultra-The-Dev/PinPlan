"use client";
// One-time tips: the first visit to Plan, Takeoff, Money, Tasks and Photos shows one line about how it works, until
// it's dismissed or the person moves on. Turned off with "Show tips" in Settings › More › Help & tips.
import { Lightbulb, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { create } from "zustand";
import { useT } from "@/lib/i18n";
import { useRole } from "@/lib/team";
import { can } from "@/lib/teamLogic";
import { shouldShowTip, tipForLocation, type TipId } from "@/lib/tour/model";
import { useTour } from "@/lib/tour/store";
import { TIPS } from "@/lib/tour/tours";
import "./tour.css";

/** The tip on screen and the page it belongs to (it goes when the page changes). */
const useShownTip = create<{ tip: TipId | null; at: string }>(() => ({ tip: null, at: "" }));

/** Wait for the page to settle before the tip appears. */
const DELAY_MS = 900;

export default function RouteTip() {
  const t = useT();
  const path = usePathname() ?? "";
  const search = useSearchParams()?.toString() ?? "";
  const office = can(useRole(), "prices");
  const prefs = useTour((s) => s.prefs);
  const tip = tipForLocation(path, search);
  const shown = useShownTip();
  const at = tip ? `${path}:${tip}` : "";

  useEffect(() => {
    if (!shouldShowTip(tip, prefs, { tourActive: false, path, office })) return;
    const id = setTimeout(() => {
      useShownTip.setState({ tip, at });
      // Shown once: counted as seen as soon as it appears.
      useTour.getState().tipSeen(tip);
    }, DELAY_MS);
    return () => clearTimeout(id);
  }, [tip, prefs, path, office, at]);

  if (!shown.tip || shown.at !== at || prefs.tipsOff) return null;
  const def = TIPS[shown.tip];
  const dismiss = () => useShownTip.setState({ tip: null, at: "" });
  return (
    <div
      className={`pointer-events-none fixed inset-x-0 z-[45] flex justify-center px-3 ${
        def.edge === "top"
          ? "top-[calc(env(safe-area-inset-top)+7.5rem)] sm:top-[7rem]"
          : def.edge === "middle"
            ? "top-[45%] sm:top-auto sm:bottom-[5.5rem]"
            : "bottom-[calc(env(safe-area-inset-bottom)+4.75rem)] sm:bottom-6"
      }`}
    >
      <div role="status" className="tour-tip pointer-events-auto flex max-w-xl items-center gap-2 rounded-xl py-1 pr-1 pl-3 text-sm" data-testid="route-tip">
        <Lightbulb aria-hidden className="h-4 w-4 shrink-0 text-[#33a9ff]" />
        <span className="min-w-0 py-1.5 leading-snug">
          <span className="sr-only">{t("Tip:")} </span>
          {t(def.text)}
        </span>
        <Link href={`/help/${def.guide}`} className="shrink-0 rounded-lg px-2 py-1.5 text-xs font-semibold underline underline-offset-2 hover:bg-white/10" onClick={dismiss}>
          {t("Learn more")}
        </Link>
        <button type="button" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-white/80 hover:bg-white/10 hover:text-white" onClick={dismiss} aria-label={t("Dismiss tip")}>
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
