"use client";
// Shared chrome for the public pages (/welcome, /pricing, the legal pages) and the auth pages (/signup, /login, /reset).
// The public pages use the brand in docs/brand.md, scoped under `.mk`.
import { CheckCircle2, Menu, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { msg, useT } from "@/lib/i18n";
import { PRODUCT_NAME } from "@/lib/plans";
import { startDemo } from "@/lib/onboarding";
import { useSyncStatus } from "@/lib/sync";
import { useArrivalParams } from "@/lib/useArrivalUrl";
import SiteFooter from "@/components/SiteFooter";
import { MAIN_ID, MK_ROOT } from "./fonts";
import { Wordmark } from "./Wordmark";
import "./marketing.css";

const NAV = [
  { href: "/#how", label: msg("How it works") },
  { href: "/#trades", label: msg("Trades") },
  { href: "/pricing", label: msg("Pricing") },
  { href: "/#faq", label: msg("Questions") },
];

/**
 * Top bar for the marketing and legal pages. Signed-in visitors get a way back into the app instead of the sign-up
 * buttons. Below `lg` the section links fold into a menu button.
 */
export function SiteHeader() {
  const s = useSyncStatus();
  const t = useT();
  const [open, setOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      menuButton.current?.focus();
    };
    const wide = window.matchMedia("(min-width: 1024px)");
    const onWide = () => {
      if (wide.matches) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    wide.addEventListener("change", onWide);
    return () => {
      window.removeEventListener("keydown", onKey);
      wide.removeEventListener("change", onWide);
    };
  }, [open]);
  return (
    <header className="sticky top-0 z-30 border-b border-mk-rule bg-mk-paper/90 backdrop-blur-md">
      <a
        href={`#${MAIN_ID}`}
        className="absolute top-2 left-2 z-40 -translate-y-24 rounded-md bg-mk-graphite px-4 py-2 text-[15px] font-semibold text-white focus:translate-y-0"
      >
        {t("Skip to content")}
      </a>
      <div className="mx-auto flex h-16 max-w-[1240px] items-center gap-3 px-4 sm:px-6">
        <button
          ref={menuButton}
          type="button"
          className="-ml-2 rounded-md p-2 hover:bg-mk-sheet lg:hidden"
          aria-expanded={open}
          aria-controls="site-menu"
          aria-label={open ? t("Close menu") : t("Open menu")}
          onClick={() => setOpen((o) => !o)}
        >
          {open ? <X className="h-5 w-5" aria-hidden="true" /> : <Menu className="h-5 w-5" aria-hidden="true" />}
        </button>
        <Wordmark />
        <nav className="ml-6 hidden items-center gap-1 text-[15px] lg:flex" aria-label={t("Site")}>
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className="rounded-md px-3 py-2 font-medium text-mk-pencil hover:text-mk-graphite">
              {t(n.label)}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-1 sm:gap-2">
          {/* Phones: the switcher lives in the menu and the footer, so the header keeps room for the trial button. */}
          <span className="mr-2 hidden lg:inline-flex">
            <LanguageSwitcher showIcon={false} />
          </span>
          {s.authReady && s.signedIn ? (
            <Link href="/jobs" className="mk-btn mk-btn-ink mk-btn-sm">
              {t("Open the app")}
            </Link>
          ) : (
            <>
              <Link
                href="/login"
                className="hidden rounded-md px-2 py-2 text-[15px] font-semibold whitespace-nowrap hover:underline hover:underline-offset-4 min-[400px]:inline-block sm:px-3"
              >
                {t("Sign in")}
              </Link>
              <Link href="/signup" className="mk-btn mk-btn-primary mk-btn-sm h-auto! min-h-10 py-1 text-center leading-tight whitespace-normal! max-[359px]:px-2.5">
                {t("Start free trial")}
              </Link>
            </>
          )}
        </div>
      </div>
      {/* Always in the page (hidden when closed) so the button's aria-controls points at a real element. */}
      <nav id="site-menu" hidden={!open} className="border-t border-mk-rule bg-mk-paper lg:hidden" aria-label={t("Site menu")}>
        <ul className="mx-auto max-w-[1240px] px-4 py-2 sm:px-6">
          {[...NAV, ...(s.authReady && s.signedIn ? [] : [{ href: "/login", label: msg("Sign in") }])].map((n) => (
            <li key={n.href}>
              <Link href={n.href} className="block rounded-md px-2 py-3 text-[17px] font-medium hover:bg-mk-sheet" onClick={() => setOpen(false)}>
                {t(n.label)}
              </Link>
            </li>
          ))}
          <li className="px-2 py-3">
            <LanguageSwitcher />
          </li>
        </ul>
      </nav>
    </header>
  );
}

/** A scrolling page under the site header (the app's body is a fixed-height column). */
export function SitePage({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${MK_ROOT} flex-1 overflow-x-hidden overflow-y-auto scroll-smooth motion-reduce:scroll-auto`} id="site-scroll">
      <SiteHeader />
      <main id={MAIN_ID} tabIndex={-1} className="outline-none">
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}

export function Faq({ items }: { items: [string, React.ReactNode][] }) {
  return (
    <div className="mk-faq">
      {items.map(([q, a]) => (
        <details key={q}>
          <summary>
            {q}
            <span className="mk-plus" aria-hidden="true" />
          </summary>
          <div className="mk-answer">{a}</div>
        </details>
      ))}
    </div>
  );
}

/** "Try it without an account": local demo mode on this device, then the jobs list. */
export function TryDemoLink({ className = "" }: { className?: string }) {
  const router = useRouter();
  const t = useT();
  return (
    <button
      type="button"
      className={className}
      onClick={() => {
        startDemo();
        router.push("/jobs");
      }}
    >
      {t("Try it without an account")}
    </button>
  );
}

/** After "Delete account" the app lands here with ?deleted=1: confirm it. */
export function DeletedNotice() {
  const deleted = useArrivalParams()?.search.get("deleted") === "1";
  const [hidden, setHidden] = useState(false);
  const t = useT();
  if (!deleted || hidden) return null;
  return (
    <div className="mx-auto mt-4 flex max-w-[1240px] items-center gap-3 px-4 sm:px-6" role="status">
      <div className="flex flex-1 items-center gap-2 rounded-lg bg-mk-sheet px-3 py-2.5 text-[15px] ring-1 ring-mk-rule">
        <CheckCircle2 className="h-4 w-4 shrink-0 text-mk-ok" />
        <span className="flex-1">{t("Your account was deleted and this device was cleared.")}</span>
        <button className="rounded p-1 hover:bg-mk-paper" onClick={() => setHidden(true)} aria-label={t("Dismiss")}>
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
