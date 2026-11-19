"use client";
// Shared chrome for the public pages (/welcome, /pricing) and the auth pages (/signup, /login, /reset).
import { ArrowRight, CheckCircle2, ChevronDown, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { PRODUCT_NAME } from "@/lib/plans";
import { startDemo } from "@/lib/onboarding";
import { useSyncStatus } from "@/lib/sync";
import { useArrivalParams } from "@/lib/useArrivalUrl";

export function Brand({ href = "/welcome" }: { href?: string }) {
  return (
    <Link href={href} className="flex shrink-0 items-center gap-2 rounded-lg font-semibold text-slate-900" aria-label={`${PRODUCT_NAME} home`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/icon.svg" alt="" className="h-8 w-8 rounded-lg" />
      <span className="text-[15px] tracking-tight">{PRODUCT_NAME}</span>
    </Link>
  );
}

/** Top bar for the marketing pages. Signed-in visitors get a way back into the app instead of the sign-up buttons. */
export function SiteHeader() {
  const s = useSyncStatus();
  return (
    <header className="sticky top-0 z-30 border-b border-slate-200/70 bg-slate-50/85 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-2 px-4 sm:gap-3 sm:px-6">
        <Brand />
        <nav className="ml-4 hidden items-center gap-1 text-sm md:flex" aria-label="Site">
          <Link href="/welcome#features" className="rounded-lg px-3 py-1.5 text-slate-600 hover:bg-white hover:text-slate-900">
            Features
          </Link>
          <Link href="/pricing" className="rounded-lg px-3 py-1.5 text-slate-600 hover:bg-white hover:text-slate-900">
            Pricing
          </Link>
          <Link href="/welcome#faq" className="rounded-lg px-3 py-1.5 text-slate-600 hover:bg-white hover:text-slate-900">
            FAQ
          </Link>
        </nav>
        <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
          {s.authReady && s.signedIn ? (
            <Link href="/" className="btn btn-primary">
              Open {PRODUCT_NAME} <ArrowRight />
            </Link>
          ) : (
            <>
              <Link href="/login" className="btn btn-ghost px-2.5 sm:px-3">
                Sign in
              </Link>
              <Link href="/signup" className="btn btn-brand px-2.5 sm:px-3">
                Start free trial
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

export function SiteFooter() {
  const cols: { title: string; links: [string, string][] }[] = [
    {
      title: "Product",
      links: [
        ["/welcome#features", "Features"],
        ["/pricing", "Pricing"],
        ["/signup", "Start free trial"],
        ["/login", "Sign in"],
      ],
    },
    {
      title: "Teams",
      links: [
        ["/join", "Join your team"],
        ["/reset", "Reset password"],
        ["/support", "Support"],
      ],
    },
    {
      title: "Legal",
      links: [
        ["/terms", "Terms of Service"],
        ["/privacy", "Privacy Policy"],
      ],
    },
  ];
  return (
    <footer className="border-t border-slate-200 bg-white">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:px-6 md:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div className="space-y-3">
          <Brand />
          <p className="max-w-xs text-sm text-slate-500">Floor-plan device mapping, estimating and field documentation for low-voltage installers.</p>
        </div>
        {cols.map((c) => (
          <div key={c.title}>
            <div className="mb-3 text-xs font-semibold text-slate-900">{c.title}</div>
            <ul className="space-y-2 text-sm">
              {c.links.map(([href, label]) => (
                <li key={href}>
                  <Link href={href} className="text-slate-500 hover:text-slate-900">
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-slate-100">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-4 text-xs text-slate-400 sm:px-6">
          <span>© {PRODUCT_NAME}</span>
          <span>Made for the people who pull the wire.</span>
        </div>
      </div>
    </footer>
  );
}

/** A scrolling page under the site header (the app's body is a fixed-height column). */
export function SitePage({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex-1 overflow-x-hidden overflow-y-auto scroll-smooth" id="site-scroll">
      <SiteHeader />
      {children}
      <SiteFooter />
    </div>
  );
}

export function Faq({ items }: { items: [string, React.ReactNode][] }) {
  return (
    <div className="divide-y divide-slate-200 rounded-xl bg-white shadow-soft ring-1 ring-slate-200/60">
      {items.map(([q, a]) => (
        <details key={q} className="group px-5 py-4 [&_summary::-webkit-details-marker]:hidden">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[15px] font-medium text-slate-900">
            {q}
            <ChevronDown className="h-4 w-4 shrink-0 text-slate-400 transition group-open:rotate-180" />
          </summary>
          <div className="mt-2 text-sm leading-relaxed text-slate-600">{a}</div>
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
    <div className="mx-auto mt-4 flex max-w-6xl items-center gap-3 px-4 sm:px-6" role="status">
      <div className="flex flex-1 items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2.5 text-sm text-emerald-800 ring-1 ring-emerald-200">
        <CheckCircle2 className="h-4 w-4 shrink-0" />
        <span className="flex-1">Your account was deleted and this device was cleared.</span>
        <button className="rounded p-0.5 hover:bg-emerald-100" onClick={() => setHidden(true)} aria-label="Dismiss">
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
