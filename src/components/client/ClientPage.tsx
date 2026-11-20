"use client";
// The frame every client link page shares (quote and plan review /p, documents /d, change orders /co, photo reports /r,
// questions /q): the company's letterhead, a cover band in their colour with a drawing-style title block (who it's
// for, the key numbers, the next step), ruled sheets for the content, and how to reach the company. Styles live in
// ./client.css; colours come from clientTheme() so any brand colour stays readable.
import "./client.css";
import { Mail, Phone, Printer } from "lucide-react";
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { CLIENT_FONT_FAMILY } from "@/components/marketing/clientFont";
import { clientTheme, clientThemeVars, type ClientTheme } from "@/lib/clientTheme";

export interface ClientBusiness {
  name?: string | null;
  logo?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  tagline?: string | null;
  address?: string | null;
  serviceArea?: string | null;
}

export const telHref = (phone: string) => `tel:${phone.replace(/[^+\d]/g, "")}`;
const siteHref = (w: string) => (/^https?:\/\//i.test(w) ? w : `https://${w}`);
const siteText = (w: string) => w.replace(/^https?:\/\//i, "").replace(/\/$/, "");

/** Smooth scroll unless the person asked for less motion. */
export function scrollToId(id: string, focusSelector?: string) {
  const el = document.getElementById(id);
  if (!el) return;
  const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  if (focusSelector) window.setTimeout(() => el.querySelector<HTMLElement>(focusSelector)?.focus({ preventScroll: true }), reduce ? 0 : 450);
}

export function ClientPage({ brandColor, accentColor, children, wide = false }: { brandColor?: string | null; accentColor?: string | null; children: ReactNode; wide?: boolean }) {
  const theme: ClientTheme = clientTheme(brandColor, accentColor);
  const style = { ...clientThemeVars(theme), fontFamily: CLIENT_FONT_FAMILY } as CSSProperties;
  return (
    <div className={`cp ${wide ? "cp-is-wide" : ""}`} style={style} data-band-light={theme.bandLight ? "true" : undefined}>
      {children}
    </div>
  );
}

/** The company's logo (or name) and how to reach them. `tools` sits at the end (print, PDF). */
export function Letterhead({ business, tools, wide }: { business: ClientBusiness; tools?: ReactNode; wide?: boolean }) {
  const name = business.name?.trim() || "";
  return (
    <header className="cp-letterhead">
      <div className={`cp-wrap ${wide ? "cp-wrap-wide" : ""}`}>
        <div className="min-w-0">
          {business.logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={business.logo} alt={name || "Company logo"} className="cp-logo" />
          ) : (
            <div className="cp-company">{name || "Your contractor"}</div>
          )}
          {!business.logo && business.tagline ? <div className="cp-tagline hidden sm:block">{business.tagline}</div> : null}
        </div>
        <div className="cp-reach">
          <div className="hidden min-w-0 sm:block">
            {business.phone ? (
              <a className="cp-phone block" href={telHref(business.phone)}>
                {business.phone}
              </a>
            ) : null}
            {business.email ? (
              <a className="block" href={`mailto:${business.email}`}>
                {business.email}
              </a>
            ) : null}
          </div>
          {business.phone ? (
            <a className="cp-tool cp-noprint sm:hidden" href={telHref(business.phone)} aria-label={`Call ${name || "the company"}: ${business.phone}`}>
              <Phone />
            </a>
          ) : null}
          {tools}
        </div>
      </div>
    </header>
  );
}

export function PrintButton({ label = "Print" }: { label?: string }) {
  return (
    <button type="button" className="cp-tool cp-noprint" onClick={() => window.print()} aria-label={label}>
      <Printer /> <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

/** The cover band: what this is (`kind`), the title, and a line on who it's for. The title block follows it. */
export function Cover({ kind, title, sub, wide }: { kind: ReactNode; title: ReactNode; sub?: ReactNode; wide?: boolean }) {
  return (
    <section className="cp-cover">
      <div className={`cp-wrap ${wide ? "cp-wrap-wide" : ""}`}>
        <p className="cp-kind">{kind}</p>
        <h1 className="cp-title">{title}</h1>
        {sub ? <p className="cp-sub">{sub}</p> : null}
      </div>
    </section>
  );
}

export interface TbCell {
  label: string;
  value: ReactNode;
  /** A key number: large figure. */
  key?: boolean;
  /** Spans the whole row. */
  wide?: boolean;
  /** Spans half the row on wider screens. */
  half?: boolean;
  testId?: string;
}

/** Drawing-style title block: ruled cells of facts, then a footer with the next step or the outcome. */
export function TitleBlock({ id, cells, cols = 4, foot, footTone, wide }: { id?: string; cells: TbCell[]; cols?: number; foot?: ReactNode; footTone?: "ok" | "warn" | "neutral"; wide?: boolean }) {
  // Two columns on a phone: an odd cell out before a full-width one (or at the end) takes the whole row, not half.
  let lone = -1;
  let run = 0;
  cells.forEach((c, i) => {
    if (c.wide) {
      if (run % 2) lone = i - 1;
      run = 0;
    } else run++;
  });
  if (run % 2) lone = cells.length - 1;
  return (
    <div id={id} className={`cp-wrap ${wide ? "cp-wrap-wide" : ""}`}>
      <div className="cp-tb">
        {cells.length > 0 && (
          <dl className="cp-tb-grid" style={{ "--cp-tb-cols": cols } as CSSProperties}>
            {cells.map((c, i) => (
              <div key={c.label} className={`cp-cell ${c.key ? "cp-cell-key" : ""} ${c.wide ? "cp-cell-wide" : ""} ${c.half ? "cp-cell-half" : ""} ${i === lone ? "cp-cell-lone" : ""}`}>
                <dt>{c.label}</dt>
                <dd data-testid={c.testId}>{c.value}</dd>
              </div>
            ))}
          </dl>
        )}
        {foot ? (
          <div className={`cp-tb-foot ${footTone ? "" : "cp-noprint"}`} data-tone={footTone} role={footTone ? "status" : undefined}>
            {foot}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** Footer: one plain question and big buttons to call or email the company. */
export function ContactFooter({ business, ask = "Questions?", wide }: { business: ClientBusiness; ask?: string; wide?: boolean }) {
  const name = business.name?.trim() || "";
  const fine = [name, business.address, business.serviceArea].filter(Boolean).join("\n");
  return (
    <footer className="cp-footer">
      <div className={`cp-wrap ${wide ? "cp-wrap-wide" : ""}`}>
        <p className="cp-footer-ask">
          {ask} {business.phone || business.email ? `${name ? `Get in touch with ${name}.` : "Get in touch."}` : null}
        </p>
        {(business.phone || business.email || business.website) && (
          <div className="cp-footer-links">
            {business.phone ? (
              <a className="cp-btn cp-btn-line cp-btn-sm" href={telHref(business.phone)}>
                <Phone /> Call {business.phone}
              </a>
            ) : null}
            {business.email ? (
              <a className="cp-btn cp-btn-line cp-btn-sm max-w-full" href={`mailto:${business.email}`}>
                <Mail /> <span className="min-w-0 truncate">{business.email}</span>
              </a>
            ) : null}
            {business.website ? (
              <a className="cp-btn cp-btn-quiet cp-btn-sm" href={siteHref(business.website)} target="_blank" rel="noreferrer noopener">
                {siteText(business.website)}
              </a>
            ) : null}
          </div>
        )}
        {fine ? <p className="cp-footer-fine">{fine}</p> : null}
      </div>
    </footer>
  );
}

/**
 * Phone only: a bar at the bottom with the key figure and the next step, shown once the title block has scrolled
 * away and hidden again when the answer form is on screen.
 */
export function Dock({ watch, target, children }: { watch: string; target: string; children: ReactNode }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const seen = new Map<string, boolean>();
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) seen.set(e.target.id, e.isIntersecting);
      setShow(!seen.get(watch) && !seen.get(target));
    });
    for (const id of [watch, target]) {
      const el = document.getElementById(id);
      if (el) io.observe(el);
    }
    return () => io.disconnect();
  }, [watch, target]);
  if (!show) return null;
  return <div className="cp-dock">{children}</div>;
}

/** Link withdrawn, failed to load… */
export function ClientNotice({ title, body }: { title: string; body: ReactNode }) {
  return (
    <div className="cp" style={{ fontFamily: CLIENT_FONT_FAMILY } as CSSProperties}>
      <main className="cp-wrap py-20 sm:py-28">
        <div className="cp-sheet mx-auto max-w-md p-7 sm:p-9">
          <h1 className="cp-h2">{title}</h1>
          <p className="mt-2 text-[var(--cp-pencil)]">{body}</p>
        </div>
      </main>
    </div>
  );
}

export function ClientLoading({ text }: { text: string }) {
  return (
    <div className="cp" style={{ fontFamily: CLIENT_FONT_FAMILY } as CSSProperties}>
      <p className="cp-wrap py-24 text-center text-[var(--cp-pencil)]" role="status">
        {text}
      </p>
    </div>
  );
}
