"use client";
// The tours with Start / Resume / Restart, for Help and Settings › More › Help & tips.
import { Loader2, Play, RotateCcw, StepForward } from "lucide-react";
import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n";
import { useRole } from "@/lib/team";
import { can } from "@/lib/teamLogic";
import { tourAvailable, tourButton, visibleSteps, type TourDef, type TourId } from "@/lib/tour/model";
import { useTour } from "@/lib/tour/store";
import { TOUR_LIST } from "@/lib/tour/tours";
import { startTour } from "./startTour";

/** `tone="site"` for the public Help pages (.mk scope), `"app"` inside Settings. */
export default function TourList({ tone = "app" }: { tone?: "app" | "site" }) {
  const t = useT();
  const office = can(useRole(), "prices");
  const prefs = useTour((s) => s.prefs);
  const [busy, setBusy] = useState<TourId | null>(null);
  useEffect(() => {
    if (!useTour.getState().loaded) useTour.getState().load();
  }, []);
  // The office's own tours first for the office, the crew tour first for technicians.
  const tours = TOUR_LIST.filter((x) => tourAvailable(x, office)).sort((a, b) => Number(b.audience === (office ? "office" : "crew")) - Number(a.audience === (office ? "office" : "crew")));
  const go = async (tour: TourDef, from: number) => {
    setBusy(tour.id);
    try {
      await startTour(tour.id, { from });
    } finally {
      setBusy(null);
    }
  };
  const site = tone === "site";
  return (
    <ul className={site ? "help-tours" : "divide-y divide-slate-100"}>
      {tours.map((tour) => {
        const total = visibleSteps(tour, office).length;
        const b = tourButton(prefs, tour.id, total);
        const label = b.kind === "resume" ? t("Resume (step {n} of {total})", { n: b.step + 1, total }) : b.kind === "restart" ? t("Take it again") : t("Start the tour");
        const Icon = b.kind === "resume" ? StepForward : b.kind === "restart" ? RotateCcw : Play;
        return (
          <li key={tour.id} className={site ? "help-tour" : "flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:gap-4"}>
            <div className="min-w-0 flex-1">
              <h3 className={site ? "help-tour-title" : "text-sm font-semibold text-slate-900"}>
                {t(tour.title)} <span className={site ? "help-tour-min" : "font-normal text-slate-500"}>· {t.tn("{n} min", "{n} min", tour.minutes)}</span>
              </h3>
              <p className={site ? "help-tour-sum" : "text-sm text-slate-500"}>{t(tour.summary)}</p>
            </div>
            <button
              type="button"
              className={site ? "tap mk-btn mk-btn-line mk-btn-sm shrink-0" : "btn btn-sm shrink-0"}
              disabled={busy !== null}
              onClick={() => void go(tour, b.kind === "resume" ? b.step : 0)}
              data-testid={`tour-start-${tour.id}`}
            >
              {busy === tour.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />} {label}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
