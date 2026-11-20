// Layout and typography for the public legal / support pages. Server markup inside the public site's brand scope
// (`.mk`, docs/brand.md): the same header and footer as /welcome and /pricing.
import Link from "next/link";
import SiteFooter from "@/components/SiteFooter";
import { MAIN_ID, MK_ROOT } from "@/components/marketing/fonts";
import { SiteHeader } from "@/components/marketing/Site";
import { msg } from "@/lib/i18n/msg";
import { T } from "@/lib/i18n/T";
import type { Locale } from "@/lib/i18n/types";
import ByLocale from "./ByLocale";

/**
 * Renders a value from src/lib/legal.ts. Bracketed placeholders ("[Contact email]") are highlighted so an
 * unfinished draft is obvious on screen; real values render as plain text (emails become mailto links).
 */
export function Ph({ children }: { children: string | number }) {
  const text = String(children);
  if (/^\[.*\]$/.test(text))
    return (
      <mark className="rounded bg-amber-100 px-1 font-medium text-amber-900 ring-1 ring-amber-300" title="Placeholder: replace before launch">
        {text}
      </mark>
    );
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text))
    return (
      <a href={`mailto:${text}`} className="font-medium">
        {text}
      </a>
    );
  return <>{text}</>;
}

/** The legal pages, in the order they appear in the sub-navigation. */
export const LEGAL_NAV: { href: string; label: string }[] = [
  { href: "/terms", label: msg("Terms") },
  { href: "/privacy", label: msg("Privacy") },
  { href: "/legal/subprocessors", label: msg("Subprocessors") },
  { href: "/legal/dpa", label: msg("DPA") },
  { href: "/accessibility", label: msg("Accessibility") },
  { href: "/support", label: msg("Support") },
];

/** Prose styles for long-form legal text, scoped to the article (no typography plugin needed). */
const PROSE = [
  "text-[16px] leading-7 text-mk-graphite",
  "[&_h2]:mt-12 [&_h2]:scroll-mt-24 [&_h2]:text-[22px] [&_h2]:font-[750] [&_h2]:tracking-tight",
  "[&_h3]:mt-8 [&_h3]:scroll-mt-24 [&_h3]:text-[17px] [&_h3]:font-semibold",
  "[&_p]:mt-4 [&_ul]:mt-4 [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-6 [&_ol]:mt-4 [&_ol]:list-decimal [&_ol]:space-y-2 [&_ol]:pl-6",
  "[&_li]:pl-1 [&_strong]:font-semibold",
  "[&_a]:text-mk-marker [&_a]:underline [&_a]:underline-offset-2 hover:[&_a]:text-mk-graphite",
  "[&_table]:mt-4 [&_table]:w-full [&_table]:border-collapse [&_table]:text-[15px]",
  "[&_th]:border-b [&_th]:border-mk-rule [&_th]:py-2 [&_th]:pr-4 [&_th]:text-left [&_th]:align-bottom [&_th]:font-semibold",
  "[&_td]:border-b [&_td]:border-mk-rule/60 [&_td]:py-2.5 [&_td]:pr-4 [&_td]:align-top",
].join(" ");

const KICKER = "text-[13px] font-semibold tracking-[0.08em] text-mk-pencil uppercase";

export interface TocItem {
  id: string;
  title: string;
}

/**
 * A translation of a legal or support page, shown instead of the English text when the visitor's language matches. It
 * is marked as a translation for convenience: the English version governs. Keep it in step with the English page
 * (src/components/legal/<lang>/).
 */
export interface LegalTranslation {
  title: string;
  intro?: React.ReactNode;
  toc?: TocItem[];
  children: React.ReactNode;
}

export default function LegalDoc({
  title,
  intro,
  effective,
  updated,
  toc,
  children,
  ru,
  translations,
}: {
  title: string;
  intro?: React.ReactNode;
  effective?: string;
  /** "Last updated" date, for pages without an effective date (e.g. the subprocessor list). */
  updated?: string;
  toc?: TocItem[];
  children: React.ReactNode;
  /** The Russian translation for convenience (the English text stays the binding one). */
  ru?: LegalTranslation;
  /** Translations in other languages, by locale (same rule: English governs). */
  translations?: Partial<Record<Locale, LegalTranslation>>;
}) {
  const all: Partial<Record<Locale, LegalTranslation>> = { ...translations, ...(ru ? { ru } : {}) };
  const english = (
    <DocBody title={title} intro={intro} effective={effective} updated={updated} toc={toc}>
      {children}
    </DocBody>
  );
  return (
    <div className={`${MK_ROOT} min-h-0 flex-1 overflow-x-hidden overflow-y-auto scroll-smooth motion-reduce:scroll-auto`}>
      <div className="flex min-h-full flex-col">
        <SiteHeader />
        <nav className="border-b border-mk-rule bg-mk-sheet" aria-labelledby="legal-nav-title">
          <span id="legal-nav-title" className="sr-only">
            <T>Legal</T>
          </span>
          <ul className="mx-auto flex max-w-[1240px] gap-1 overflow-x-auto px-4 text-[15px] sm:px-6">
            {LEGAL_NAV.map((l) => (
              <li key={l.href} className="shrink-0">
                <Link href={l.href} className="block px-2 py-3 font-medium text-mk-pencil hover:text-mk-graphite sm:px-3">
                  <T>{l.label}</T>
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <main id={MAIN_ID} tabIndex={-1} className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 outline-none sm:px-6 sm:py-14">
          {Object.keys(all).length ? (
            <ByLocale
              en={english}
              versions={Object.fromEntries(
                Object.entries(all).map(([code, v]) => [
                  code,
                  <DocBody key={code} title={v.title} intro={v.intro} effective={effective} updated={updated} toc={v.toc} translated>
                    {v.children}
                  </DocBody>,
                ]),
              )}
            />
          ) : (
            english
          )}
        </main>
        <SiteFooter />
      </div>
    </div>
  );
}

/** Title, dates, intro, contents and text of one language's version. */
function DocBody({
  title,
  intro,
  effective,
  updated,
  toc,
  translated,
  children,
}: {
  title: string;
  intro?: React.ReactNode;
  effective?: string;
  updated?: string;
  toc?: TocItem[];
  /** A translation for convenience: say so above the text. */
  translated?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_220px] lg:gap-12">
      <article className="min-w-0">
        <h1 className="text-[36px] leading-none font-[750] tracking-[-0.01em] break-words hyphens-auto sm:text-[48px]" style={{ fontStretch: "75%" }}>
          {title}
        </h1>
        {effective && (
          <p className="mt-3 text-[15px] text-mk-pencil">
            <T>Effective</T> <Ph>{effective}</Ph>
          </p>
        )}
        {updated && (
          <p className="mt-3 text-[15px] text-mk-pencil">
            <T>Last updated</T> <Ph>{updated}</Ph>
          </p>
        )}
        {translated && (
          <p className="mt-5 rounded-md bg-mk-sheet px-4 py-3 text-[15px] leading-6 ring-1 ring-mk-rule" role="note">
            Перевод для удобства. Юридическую силу имеет английская версия: если перевод расходится с ней, действует английский текст. Английская
            версия откроется, если выбрать English в переключателе языка.
          </p>
        )}
        {intro && <div className="mt-6 text-[17px] leading-7 text-mk-pencil">{intro}</div>}
        {toc && toc.length > 0 && (
          <nav aria-labelledby="toc-title-short" className="mk-sheet mt-8 p-5 lg:hidden">
            <p id="toc-title-short" className={`${KICKER} mb-2`}>
              <T>On this page</T>
            </p>
            <ol className="grid gap-1.5 text-[15px] sm:grid-cols-2">
              {toc.map((t, i) => (
                <li key={t.id}>
                  <a href={`#${t.id}`} className="text-mk-pencil hover:text-mk-graphite">
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
          <nav aria-labelledby="toc-title" className="sticky top-24 text-[14px]">
            <p id="toc-title" className={`${KICKER} mb-3`}>
              <T>On this page</T>
            </p>
            <ol className="space-y-2 border-l border-mk-rule">
              {toc.map((t) => (
                <li key={t.id}>
                  <a href={`#${t.id}`} className="-ml-px block border-l border-transparent pl-3 text-mk-pencil hover:border-mk-graphite hover:text-mk-graphite">
                    {t.title}
                  </a>
                </li>
              ))}
            </ol>
          </nav>
        </aside>
      )}
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
