"use client";
// Shared chrome for the public pages (/welcome, /pricing) and the auth pages (/signup, /login, /reset).
// The public pages use the brand in docs/brand.md, scoped under `.mk`; the auth pages keep the app's look (Brand).
import { CheckCircle2, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { PRODUCT_NAME } from "@/lib/plans";
import { startDemo } from "@/lib/onboarding";
import { useSyncStatus } from "@/lib/sync";
import { useArrivalParams } from "@/lib/useArrivalUrl";
import SiteFooter from "@/components/SiteFooter";
import { MK_ROOT } from "./fonts";
import { Wordmark } from "./Wordmark";
import "./marketing.css";

/** The app-styled logo link, used by the sign-in and sign-up pages. */
export function Brand({ href = "/welcome" }: { href?: string }) {
  return (
    <Link href={href} className="flex shrink-0 items-center gap-2 rounded-lg font-semibold text-slate-900" aria-label={`${PRODUCT_NAME} home`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/icon.svg" alt="" className="h-8 w-8 rounded-lg" />
      <span className="text-[15px] tracking-tight">{PRODUCT_NAME}</span>
    </Link>
  );
}

const NAV = [
  { href: "/welcome#how", label: "How it works" },
  { href: "/welcome#trades", label: "Trades" },
  { href: "/pricing", label: "Pricing" },
  { href: "/welcome#faq", label: "Questions" },
];

/** Top bar for the marketing pages. Signed-in visitors get a way back into the app instead of the sign-up buttons. */
export function SiteHeader() {
  const s = useSyncStatus();
  return (
    <header className="sticky top-0 z-30 border-b border-mk-rule bg-mk-paper/90 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-[1240px] items-center gap-3 px-4 sm:px-6">
        <Wordmark />
        <nav className="ml-6 hidden items-center gap-1 text-[15px] lg:flex" aria-label="Site">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className="rounded-md px-3 py-2 font-medium text-mk-pencil hover:text-mk-graphite">
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-1 sm:gap-2">
          {s.authReady && s.signedIn ? (
            <Link href="/" className="mk-btn mk-btn-ink mk-btn-sm">
              Open the app
            </Link>
          ) : (
            <>
              <Link href="/login" className="rounded-md px-2 py-2 text-[15px] font-semibold whitespace-nowrap hover:underline hover:underline-offset-4 sm:px-3">
                Sign in
              </Link>
              <Link href="/signup" className="mk-btn mk-btn-primary mk-btn-sm max-[359px]:px-2.5">
                Start free trial
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

/** A scrolling page under the site header (the app's body is a fixed-height column). */
export function SitePage({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${MK_ROOT} flex-1 overflow-x-hidden overflow-y-auto scroll-smooth motion-reduce:scroll-auto`} id="site-scroll">
      <SiteHeader />
      <main>{children}</main>
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
  return (
    <button
      type="button"
      className={className}
      onClick={() => {
        startDemo();
        router.push("/");
      }}
    >
      Try it without an account
    </button>
  );
}

/** After "Delete account" the app lands here with ?deleted=1: confirm it. */
export function DeletedNotice() {
  const deleted = useArrivalParams()?.search.get("deleted") === "1";
  const [hidden, setHidden] = useState(false);
  if (!deleted || hidden) return null;
  return (
    <div className="mx-auto mt-4 flex max-w-[1240px] items-center gap-3 px-4 sm:px-6" role="status">
      <div className="flex flex-1 items-center gap-2 rounded-lg bg-mk-sheet px-3 py-2.5 text-[15px] ring-1 ring-mk-rule">
        <CheckCircle2 className="h-4 w-4 shrink-0 text-mk-ok" />
        <span className="flex-1">Your account was deleted and this device was cleared.</span>
        <button className="rounded p-1 hover:bg-mk-paper" onClick={() => setHidden(true)} aria-label="Dismiss">
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
