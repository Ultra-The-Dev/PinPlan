import Link from "next/link";

/** Public-site footer: Pricing, Terms, Privacy, Support. Server component; safe to use on any page. */
export const FOOTER_LINKS = [
  { href: "/pricing", label: "Pricing" },
  { href: "/terms", label: "Terms" },
  { href: "/privacy", label: "Privacy" },
  { href: "/support", label: "Support" },
] as const;

export default function SiteFooter({ className = "" }: { className?: string }) {
  return (
    <footer className={`border-t border-slate-200 bg-white/60 ${className}`}>
      <div className="mx-auto flex w-full max-w-5xl flex-col items-center gap-3 px-4 py-6 text-sm text-slate-500 sm:flex-row sm:justify-between sm:px-6">
        {/* No year from new Date(): this renders at build time (static, prerendered pages). */}
        <p>© PinPlan</p>
        <nav aria-label="Legal and support" className="flex flex-wrap justify-center gap-x-5 gap-y-2">
          {FOOTER_LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="rounded hover:text-slate-900 hover:underline hover:underline-offset-4">
              {l.label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}
