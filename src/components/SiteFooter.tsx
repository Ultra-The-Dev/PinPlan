import Link from "next/link";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { MK_ROOT } from "@/components/marketing/fonts";
import { Wordmark } from "@/components/marketing/Wordmark";
import { msg } from "@/lib/i18n/msg";
import { T } from "@/lib/i18n/T";
import { COMPANY, isPlaceholder } from "@/lib/legal";
import { PRODUCT_NAME } from "@/lib/plans";
import "@/components/marketing/marketing.css";

/** Public-site footer (/welcome, /pricing, the legal pages). Server component; brings its own brand scope (`.mk`).
 *  Text is marked with msg() and shown through the <T> client island, so it follows the visitor's language. */
export const FOOTER_COLUMNS: { title: string; links: { href: string; label: string }[] }[] = [
  {
    title: msg("Product"),
    links: [
      { href: "/#how", label: msg("How it works") },
      { href: "/#trades", label: msg("Trades") },
      { href: "/pricing", label: msg("Pricing") },
      { href: "/signup", label: msg("Start free trial") },
    ],
  },
  {
    title: msg("Your team"),
    links: [
      { href: "/login", label: msg("Sign in") },
      { href: "/join", label: msg("Join your team") },
      { href: "/support", label: msg("Support") },
    ],
  },
  {
    title: msg("Legal"),
    links: [
      { href: "/terms", label: msg("Terms of Service") },
      { href: "/privacy", label: msg("Privacy Policy") },
      { href: "/legal/subprocessors", label: msg("Subprocessors") },
      { href: "/legal/dpa", label: msg("Data Processing Addendum") },
      { href: "/support#security", label: msg("Security") },
      { href: "/accessibility", label: msg("Accessibility") },
    ],
  },
];

export default function SiteFooter({ className = "" }: { className?: string }) {
  return (
    <footer className={`${MK_ROOT} ${className}`}>
      <div className="mk-dark mk-table">
        <div className="mx-auto grid max-w-[1240px] gap-10 px-4 pt-14 pb-10 sm:px-6 md:grid-cols-[1.5fr_repeat(3,1fr)]">
          <div className="space-y-4">
            <Wordmark onDark />
            <p className="max-w-[26em] text-[15px] leading-relaxed text-mk-on-dark">
              <T>Plans, counts, quotes, invoices and field work for electrical, low-voltage and specialty contractors.</T>
            </p>
          </div>
          {FOOTER_COLUMNS.map((c, i) => (
            <nav key={c.title} aria-labelledby={`footer-col-${i}`}>
              <h2 id={`footer-col-${i}`} className="text-[15px] font-semibold">
                <T>{c.title}</T>
              </h2>
              <ul className="mt-3 space-y-2.5 text-[15px]">
                {c.links.map((l) => (
                  <li key={l.href}>
                    <Link href={l.href} className="text-mk-on-dark hover:text-white hover:underline hover:underline-offset-4">
                      <T>{l.label}</T>
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
          <div className="mx-auto flex max-w-[1240px] flex-wrap items-center justify-between gap-3 px-4 py-5 sm:px-6">
            <p className="text-[13px] text-mk-on-dark">© {isPlaceholder(COMPANY.legalName) ? PRODUCT_NAME : COMPANY.legalName}</p>
            <LanguageSwitcher tone="dark" />
          </div>
        </div>
      </div>
    </footer>
  );
}
