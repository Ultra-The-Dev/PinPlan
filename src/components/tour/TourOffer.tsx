"use client";
// First run: on the jobs list, offer the 2-minute tour with a sample plan. Office people only (technicians get the
// crew tour from Help), new companies, "Try it without an account", or anyone with no jobs yet. Answered once.
import { Compass, Loader2, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { db } from "@/lib/db";
import { useT } from "@/lib/i18n";
import { isDemo, useOnboarding } from "@/lib/onboarding";
import { useRole } from "@/lib/team";
import { can } from "@/lib/teamLogic";
import { shouldOfferFirstTour } from "@/lib/tour/model";
import { useTour } from "@/lib/tour/store";
import { startTour } from "./startTour";

export default function TourOffer() {
  const t = useT();
  const office = can(useRole(), "prices");
  const prefs = useTour((s) => s.prefs);
  const loaded = useTour((s) => s.loaded);
  const active = useTour((s) => !!s.active);
  const onboarding = useOnboarding();
  const [fresh, setFresh] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let alive = true;
    db()
      .projects.filter((p) => !p.deleted)
      .count()
      .then(
        (n) => alive && setFresh(n === 0 || isDemo()),
        () => alive && setFresh(false),
      );
    return () => {
      alive = false;
    };
  }, []);
  if (!loaded || fresh === null) return null;
  if (!(fresh || onboarding.started) || !shouldOfferFirstTour(prefs, { office, tourActive: active })) return null;
  return (
    <div className="mx-auto max-w-6xl px-4 pt-6 sm:px-6 sm:pt-8" data-testid="tour-offer">
      <section className="card flex flex-col gap-3 p-4 ring-1 ring-slate-200/60 sm:flex-row sm:items-center sm:gap-5 sm:p-5" aria-labelledby="tour-offer-title">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
            <Compass className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h2 id="tour-offer-title" className="text-[15px] font-semibold text-slate-900">
              {t("New here? Take the 2-minute tour")}
            </h2>
            <p className="text-sm text-slate-500">{t("We'll open a sample plan and show you how to place devices, count doors and windows, and send a quote.")}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="btn btn-brand flex-1 sm:flex-none"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              await startTour("first-job");
              setBusy(false);
            }}
          >
            {busy && <Loader2 className="animate-spin" />} {t("Start the tour")}
          </button>
          <Link href="/help" className="btn btn-ghost max-sm:hidden">
            {t("Help")}
          </Link>
          <button type="button" className="btn btn-ghost btn-icon text-slate-500" onClick={() => useTour.getState().answerOffer()} aria-label={t("Not now")} title={t("Not now")}>
            <X />
          </button>
        </div>
      </section>
    </div>
  );
}
