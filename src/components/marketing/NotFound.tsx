"use client";
// The 404 page (src/app/not-found.tsx): the site header and footer, so a mistyped or old link still has the way home,
// to the jobs (signed in) or to sign-up, and to help. A client component so the text follows the visitor's language.
import Link from "next/link";
import { useT } from "@/lib/i18n";
import { useSyncStatus } from "@/lib/sync";
import { SitePage } from "./Site";

export default function NotFound() {
  const t = useT();
  const s = useSyncStatus();
  const signedIn = s.authReady && s.signedIn;
  return (
    <SitePage>
      <section aria-labelledby="nf-title" className="mk-dark mk-table">
        <div className="mx-auto max-w-[1240px] px-4 py-20 sm:px-6 lg:py-28">
          <p className="mk-num text-[15px] font-semibold text-(--mk-electric)">404</p>
          <h1 id="nf-title" className="mk-display mt-3 max-w-[11em]">
            {t("Page not found")}
          </h1>
          <p className="mk-lede mt-6">{t("This page doesn’t exist or has moved. Check the address, or carry on from here.")}</p>
          <div className="mt-8 flex flex-col gap-3 min-[420px]:flex-row min-[420px]:flex-wrap">
            <Link href="/" className="mk-btn mk-btn-primary">
              {t("Go to the home page")}
            </Link>
            {signedIn ? (
              <Link href="/jobs" className="mk-btn mk-btn-line">
                {t("Open the app")}
              </Link>
            ) : (
              <Link href="/login" className="mk-btn mk-btn-line">
                {t("Sign in")}
              </Link>
            )}
            <Link href="/help" className="mk-btn mk-btn-line">
              {t("Help")}
            </Link>
          </div>
        </div>
      </section>
    </SitePage>
  );
}
