import Link from "next/link";
import { MK_ROOT } from "@/components/marketing/fonts";
import { Wordmark } from "@/components/marketing/Wordmark";
import { COMPANY, isPlaceholder } from "@/lib/legal";
import { PRODUCT_NAME } from "@/lib/plans";
import "@/components/marketing/marketing.css";

/** Public-site footer (/welcome, /pricing, the legal pages). Server component; brings its own brand scope (`.mk`). */
export const FOOTER_COLUMNS: { title: string; links: { href: string; label: string }[] }[] = [
  {
    title: "Product",
    links: [
      { href: "/welcome#how", label: "How it works" },
      { href: "/welcome#trades", label: "Trades" },
      { href: "/pricing", label: "Pricing" },
      { href: "/signup", label: "Start free trial" },
    ],
  },
  {
    title: "Your team",
    links: [
      { href: "/login", label: "Sign in" },
      { href: "/join", label: "Join your team" },
      { href: "/support", label: "Support" },
    ],
  },
  {
    title: "Legal",
    links: [
      { href: "/terms", label: "Terms of Service" },
      { href: "/privacy", label: "Privacy Policy" },
      { href: "/legal/subprocessors", label: "Subprocessors" },
      { href: "/legal/dpa", label: "Data Processing Addendum" },
      { href: "/support#security", label: "Security" },
      { href: "/accessibility", label: "Accessibility" },
    ],
  },
];

export default function SiteFooter({ className = "" }: { className?: string }) {
  return (
    <footer className={`${MK_ROOT} ${className}`}>
      <div className="mk-dark">
        <div className="mx-auto grid max-w-[1240px] gap-10 px-4 pt-14 pb-10 sm:px-6 md:grid-cols-[1.5fr_repeat(3,1fr)]">
          <div className="space-y-4">
            <Wordmark onDark />
            <p className="max-w-[26em] text-[15px] leading-relaxed text-mk-on-dark">
              Plans, counts, quotes, invoices and field work for electrical, low-voltage and specialty contractors.
            </p>
          </div>
          {FOOTER_COLUMNS.map((c) => (
            <nav key={c.title} aria-label={c.title}>
              <h2 className="text-[15px] font-semibold">{c.title}</h2>
              <ul className="mt-3 space-y-2.5 text-[15px]">
                {c.links.map((l) => (
                  <li key={l.href}>
                    <Link href={l.href} className="text-mk-on-dark hover:text-white hover:underline hover:underline-offset-4">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
        <div className="border-t border-white/10">
          {/* No year from new Date(): this renders at build time (static, prerendered pages). The company name falls back to the
              product name until COMPANY.legalName is filled in (a production build can't ship with it unfilled). */}
          <p className="mx-auto max-w-[1240px] px-4 py-5 text-[13px] text-mk-on-dark sm:px-6">© {isPlaceholder(COMPANY.legalName) ? PRODUCT_NAME : COMPANY.legalName}</p>
        </div>
      </div>
    </footer>
  );
}
