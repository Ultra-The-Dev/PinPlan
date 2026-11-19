// Layout and typography for the public legal / support pages. Server components only (no client JS needed).
import Link from "next/link";
import SiteFooter from "@/components/SiteFooter";

/**
 * Renders a value from src/lib/legal.ts. Bracketed placeholders ("[Contact email]") are highlighted so an
 * unfinished draft is obvious on screen; real values render as plain text (emails become mailto links).
 */
export function Ph({ children }: { children: string }) {
  if (/^\[.*\]$/.test(children))
    return (
      <mark className="rounded bg-amber-100 px-1 font-medium text-amber-900 ring-1 ring-amber-300" title="Placeholder: replace before launch">
        {children}
      </mark>
    );
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(children))
    return (
      <a href={`mailto:${children}`} className="font-medium">
        {children}
      </a>
    );
  return <>{children}</>;
}

/** Prose styles for long-form legal text, scoped to the article (no typography plugin needed). */
const PROSE = [
  "text-[15px] leading-7 text-slate-700",
  "[&_h2]:mt-12 [&_h2]:scroll-mt-20 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:tracking-tight [&_h2]:text-slate-900",
  "[&_h3]:mt-8 [&_h3]:scroll-mt-20 [&_h3]:text-base [&_h3]:font-semibold [&_h3]:text-slate-900",
  "[&_p]:mt-4 [&_ul]:mt-4 [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-6 [&_ol]:mt-4 [&_ol]:list-decimal [&_ol]:space-y-2 [&_ol]:pl-6",
  "[&_li]:pl-1 [&_strong]:font-semibold [&_strong]:text-slate-900",
  "[&_a]:text-brand-700 [&_a]:underline [&_a]:underline-offset-2 hover:[&_a]:text-brand-600",
  "[&_table]:mt-4 [&_table]:w-full [&_table]:border-collapse [&_table]:text-sm",
  "[&_th]:border-b [&_th]:border-slate-200 [&_th]:py-2 [&_th]:pr-4 [&_th]:text-left [&_th]:align-bottom [&_th]:font-semibold [&_th]:text-slate-900",
  "[&_td]:border-b [&_td]:border-slate-100 [&_td]:py-2.5 [&_td]:pr-4 [&_td]:align-top",
].join(" ");

export interface TocItem {
  id: string;
  title: string;
}

export default function LegalDoc({
  title,
  intro,
  effective,
  toc,
  children,
}: {
  title: string;
  intro?: React.ReactNode;
  effective?: string;
  toc?: TocItem[];
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-0 flex-1 overflow-auto bg-slate-50">
      <div className="flex min-h-full flex-col">
        <header className="border-b border-slate-200/80 bg-white/85">
          <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between gap-3 px-4 sm:px-6">
            <Link href="/" className="flex items-center gap-2 font-semibold text-slate-900" aria-label="PinPlan home">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/icon.svg" alt="" className="h-8 w-8 rounded-lg" />
              <span className="text-[15px]">PinPlan</span>
            </Link>
            <nav className="flex items-center gap-1 text-sm" aria-label="Legal">
              <Link href="/terms" className="tab px-2 sm:px-3">
                Terms
              </Link>
              <Link href="/privacy" className="tab px-2 sm:px-3">
                Privacy
              </Link>
              <Link href="/support" className="tab px-2 sm:px-3">
                Support
              </Link>
            </nav>
          </div>
        </header>

        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:px-6 sm:py-14">
          <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_220px] lg:gap-12">
            <article className="min-w-0">
              <h1 className="text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">{title}</h1>
              {effective && (
                <p className="mt-3 text-sm text-slate-500">
                  Effective <Ph>{effective}</Ph>
                </p>
              )}
              {intro && <div className="mt-6 text-base leading-7 text-slate-600">{intro}</div>}
              {toc && toc.length > 0 && (
                <nav aria-label="On this page" className="card mt-8 p-5 lg:hidden">
                  <p className="section-title mb-2">On this page</p>
                  <ol className="grid gap-1.5 text-sm sm:grid-cols-2">
                    {toc.map((t, i) => (
                      <li key={t.id}>
                        <a href={`#${t.id}`} className="text-slate-600 hover:text-slate-900">
                          {i + 1}. {t.title}
                        </a>
                      </li>
                    ))}
                  </ol>
                </nav>
              )}
              <div className={PROSE}>{children}</div>
            </article>
            {toc && toc.length > 0 && (
              <aside className="hidden lg:block">
                <nav aria-label="On this page" className="sticky top-8 text-sm">
                  <p className="section-title mb-3">On this page</p>
                  <ol className="space-y-2 border-l border-slate-200">
                    {toc.map((t) => (
                      <li key={t.id}>
                        <a href={`#${t.id}`} className="-ml-px block border-l border-transparent pl-3 text-slate-500 hover:border-slate-400 hover:text-slate-900">
                          {t.title}
                        </a>
                      </li>
                    ))}
                  </ol>
                </nav>
              </aside>
            )}
          </div>
        </main>
        <SiteFooter />
      </div>
    </div>
  );
}

/** A numbered section with an anchor matching its TOC entry. */
export function Section({ item, n, children }: { item: TocItem; n?: number; children: React.ReactNode }) {
  return (
    <section aria-labelledby={item.id}>
      <h2 id={item.id}>
        {n != null ? `${n}. ` : ""}
        {item.title}
      </h2>
      {children}
    </section>
  );
}
