"use client";
// /help: the search over guide titles on the drafting table, the tours, and the guides as a sheet index. Public,
// precached by the service worker (works offline), text through t() so it follows the visitor's language.
import { Search } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useT } from "@/lib/i18n";
import { AUDIENCE_LABEL, searchGuides } from "@/lib/help/guides";
import { SitePage } from "../marketing/Site";
import TourList from "../tour/TourList";
import "./help.css";

export default function HelpCenter() {
  const t = useT();
  const [q, setQ] = useState("");
  const found = searchGuides(q, (s) => t(s));
  return (
    <SitePage>
      <section aria-labelledby="help-title" className="mk-dark mk-table">
        <div className="mx-auto max-w-[1240px] px-4 pt-14 pb-14 sm:px-6 lg:pt-20 lg:pb-20">
          <h1 id="help-title" className="mk-display max-w-[10em]">
            {t("Help and tutorials")}
          </h1>
          <p className="mk-lede mt-5">{t("Short guides for the office and the crew, with pictures of the real screens.")}</p>
          <div className="help-search mt-8" role="search">
            <Search className="h-5 w-5" aria-hidden />
            <label htmlFor="help-q" className="sr-only">
              {t("Search the guides")}
            </label>
            <input id="help-q" type="search" placeholder={t("How do I…")} value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" enterKeyHint="search" />
          </div>
        </div>
      </section>

      <div className="mx-auto grid max-w-[1240px] gap-14 px-4 py-16 sm:px-6 lg:grid-cols-[minmax(0,4fr)_minmax(0,7fr)] lg:gap-16 lg:py-24">
        <section aria-labelledby="help-guides" className="lg:col-start-2 lg:row-start-1">
          <h2 id="help-guides" className="mk-h3">
            {t("Guides")}
          </h2>
          <p className="sr-only" role="status" aria-live="polite">
            {q.trim() ? t.tn("{n} guide found", "{n} guides found", found.length) : ""}
          </p>
          {found.length ? (
            <table className="help-index mt-6">
              <thead>
                <tr>
                  <th scope="col">{t("Sheet")}</th>
                  <th scope="col">{t("Guide")}</th>
                  <th scope="col">{t("For")}</th>
                </tr>
              </thead>
              <tbody>
                {found.map((g) => (
                  <tr key={g.id}>
                    <td className="help-num">{g.number}</td>
                    <td>
                      <Link href={`/help/${g.id}`}>{t(g.title)}</Link>
                      <span className="help-sum">{t(g.summary)}</span>
                    </td>
                    <td className="help-for">{t(AUDIENCE_LABEL[g.audience])}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="mk-body mt-6">
              {t("No guide matches “{q}”. Try other words, or ask us on the Support page.", { q: q.trim() })}{" "}
              <Link href="/support" className="mk-link">
                {t("Support")}
              </Link>
            </p>
          )}
          <p className="mk-body mt-12 border-t border-mk-rule pt-6">
            {t("Still stuck? Write to us from the Support page.")}{" "}
            <Link href="/support#contact" className="mk-link">
              {t("Contact support")}
            </Link>
          </p>
        </section>

        <section aria-labelledby="help-tours" className="lg:sticky lg:top-24 lg:col-start-1 lg:row-start-1 lg:self-start">
          <h2 id="help-tours" className="mk-h3">
            {t("Tours")}
          </h2>
          <p className="mk-body mt-3 mb-6">{t("A tour walks you through the real screens, one step at a time. It uses a sample job, so your jobs don't change.")}</p>
          <TourList tone="site" />
        </section>
      </div>
    </SitePage>
  );
}
