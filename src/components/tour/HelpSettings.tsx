"use client";
// Settings › More › Help & tips: the Help center, the tours, "Show tips", and starting over.
import { BookOpen, LifeBuoy, Trash2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n";
import { tourAnchor } from "@/lib/tour/anchors";
import { deleteSampleJob, existingSampleJob } from "@/lib/tour/sampleJob";
import { useTour } from "@/lib/tour/store";
import { toast } from "@/lib/toast";
import TourList from "./TourList";

export default function HelpSettings() {
  const t = useT();
  const tipsOff = useTour((s) => s.prefs.tipsOff);
  const sampleJobId = useTour((s) => s.prefs.sampleJobId);
  const [sample, setSample] = useState<string | null>(null);
  useEffect(() => {
    if (!useTour.getState().loaded) useTour.getState().load();
  }, []);
  useEffect(() => {
    let alive = true;
    void existingSampleJob(sampleJobId).then((id) => alive && setSample(id));
    return () => {
      alive = false;
    };
  }, [sampleJobId]);
  return (
    <section id="help" className="card scroll-mt-6 space-y-4 p-6" aria-labelledby="help-settings-title" {...tourAnchor("settings-help")}>
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <h3 id="help-settings-title" className="flex items-center gap-2 font-semibold text-slate-900">
            <LifeBuoy className="h-4 w-4 text-slate-400" /> {t("Help & tips")}
          </h3>
          <p className="mt-0.5 text-sm text-slate-500">{t("Short guides with pictures, and tours that walk you through the real screens.")}</p>
        </div>
        <Link href="/help" className="btn btn-sm">
          <BookOpen /> {t("Open Help")}
        </Link>
      </div>
      <TourList />
      <label className="flex min-h-11 items-center gap-3 border-t border-slate-100 pt-3 text-sm text-slate-700">
        <input type="checkbox" className="h-5 w-5 accent-brand-600" checked={!tipsOff} onChange={(e) => useTour.getState().setTipsOff(!e.target.checked)} />
        <span>
          <span className="font-medium text-slate-900">{t("Show tips")}</span>
          <span className="block text-slate-500">{t("A one-line tip the first time you open Plan, Takeoff, Tasks, Photos and Money.")}</span>
        </span>
      </label>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="btn btn-sm btn-ghost"
          onClick={() => {
            useTour.getState().resetAll();
            toast(t("Tours and tips will show again"));
          }}
        >
          {t("Show tours and tips again")}
        </button>
        {sample && (
          <button
            type="button"
            className="btn btn-sm btn-ghost text-slate-600"
            onClick={async () => {
              if (!confirm(t("Delete the sample job? Its devices and quote go with it."))) return;
              await deleteSampleJob(sample);
              useTour.getState().setSampleJob(null);
              toast(t("Sample job deleted"));
            }}
          >
            <Trash2 /> {t("Delete the sample job")}
          </button>
        )}
      </div>
    </section>
  );
}
