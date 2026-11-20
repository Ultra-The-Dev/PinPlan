"use client";
// /help/<guide>: one guide. The title block stays in view on wide screens while the steps (with their screenshots)
// scroll past, like the feature sections of the public site.
import { ChevronLeft, ChevronRight, Loader2, Play } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useT } from "@/lib/i18n";
import { AUDIENCE_LABEL, GUIDES, guideById, SHOT_SIZE } from "@/lib/help/guides";
import { TOURS } from "@/lib/tour/tours";
import { SitePage } from "../marketing/Site";
import { startTour } from "../tour/startTour";
import "./help.css";

export default function HelpGuidePage({ id }: { id: string }) {
  const t = useT();
  const g = guideById(id);
  const [busy, setBusy] = useState(false);
  if (!g) return null;
  const i = GUIDES.indexOf(g);
  const prev = GUIDES[i - 1];
  const next = GUIDES[i + 1];
  return (
    <SitePage>
      <div className="mx-auto max-w-[1240px] px-4 pt-8 sm:px-6 lg:pt-12">
        <nav aria-label={t("Breadcrumb")} className="text-[15px]">
          <Link href="/help" className="inline-flex min-h-11 items-center gap-1 font-medium text-mk-pencil hover:text-mk-graphite">
            <ChevronLeft className="h-4 w-4" aria-hidden /> {t("Help")}
          </Link>
        </nav>
      </div>
      <article aria-labelledby="guide-title" className="mx-auto grid max-w-[1240px] gap-10 px-4 pt-4 pb-20 sm:px-6 lg:grid-cols-[minmax(0,4fr)_minmax(0,7fr)] lg:gap-16 lg:pb-28">
        <header className="lg:sticky lg:top-24 lg:self-start">
          <p className="help-guide-no">
            {g.number} · {t(AUDIENCE_LABEL[g.audience])}
          </p>
          <h1 id="guide-title" className="mk-h2 mt-2">
            {t(g.title)}
          </h1>
          <p className="mk-lede mt-4">{t(g.summary)}</p>
          {g.tour && (
            <button
              type="button"
              className="mk-btn mk-btn-primary mt-6"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                await startTour(g.tour!);
                setBusy(false);
              }}
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Play className="h-4 w-4" aria-hidden />}
              {t("Show me in the app")}
            </button>
          )}
          {g.tour && <p className="mt-2 text-[14px] text-mk-pencil">{t("Tour: {name}", { name: t(TOURS[g.tour].title) })}</p>}
        </header>

        <div>
          <ol className="help-steps">
            {g.steps.map((s, n) => (
              <li key={s.title} className="help-step">
                <span className="help-pin" aria-hidden>
                  {n + 1}
                </span>
                <h2 className="mk-h3 text-[1.375rem]!">
                  <span className="sr-only">{t("Step {n}:", { n: n + 1 })} </span>
                  {t(s.title)}
                </h2>
                <p className="mk-body mt-2">{t(s.text)}</p>
                {s.shot && (
                  <figure className={`help-shot ${s.shot.device === "phone" ? "mk-phone" : "mk-sheet"}`}>
                    <div className={s.shot.device === "phone" ? "mk-screen" : undefined}>
                      {/* Real screenshots, pre-sized and compressed (scripts/help-screens.mjs); no next/image (works offline). */}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={s.shot.src} alt={t(s.shot.alt)} width={SHOT_SIZE[s.shot.device].w} height={SHOT_SIZE[s.shot.device].h} loading="lazy" decoding="async" />
                    </div>
                  </figure>
                )}
              </li>
            ))}
          </ol>
          {g.notes?.length ? (
            <div className="mt-12 space-y-3">
              {g.notes.map((n) => (
                <p key={n} className="help-note">
                  {t(n)}
                </p>
              ))}
            </div>
          ) : null}
          <nav aria-label={t("More guides")} className="mt-14 grid gap-3 border-t border-mk-rule pt-6 sm:grid-cols-2">
            {prev ? (
              <Link href={`/help/${prev.id}`} className="group flex min-h-11 flex-col rounded py-1">
                <span className="flex items-center gap-1 text-[14px] text-mk-pencil">
                  <ChevronLeft className="h-4 w-4" aria-hidden /> {t("Previous")}
                </span>
                <span className="font-semibold group-hover:underline group-hover:underline-offset-4">{t(prev.title)}</span>
              </Link>
            ) : (
              <span />
            )}
            {next && (
              <Link href={`/help/${next.id}`} className="group flex min-h-11 flex-col rounded py-1 sm:items-end sm:text-right">
                <span className="flex items-center gap-1 text-[14px] text-mk-pencil">
                  {t("Next")} <ChevronRight className="h-4 w-4" aria-hidden />
                </span>
                <span className="font-semibold group-hover:underline group-hover:underline-offset-4">{t(next.title)}</span>
              </Link>
            )}
          </nav>
        </div>
      </article>
    </SitePage>
  );
}
