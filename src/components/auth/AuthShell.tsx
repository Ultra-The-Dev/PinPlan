"use client";
import { CircleAlert, Eye, EyeOff } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useT } from "@/lib/i18n";
import { passwordStrength } from "@/lib/onboardingLogic";
import { PASSWORD_MIN } from "@/lib/teamLogic";
import LanguageSwitcher from "../LanguageSwitcher";
import { Wordmark } from "../marketing/Wordmark";

/** A centred card under a slim header with the wordmark, on blueprint paper, for /signup, /login, /reset. The footer
 *  carries the language switcher (field crews often sign in on a phone set to Russian). */
export function AuthShell({ children, aside, wide }: { children: React.ReactNode; aside?: React.ReactNode; wide?: boolean }) {
  const t = useT();
  return (
    <div className="flex-1 overflow-x-hidden overflow-y-auto bg-slate-50">
      <header className="mx-auto flex h-16 max-w-6xl items-center px-4 sm:px-6">
        <div className="text-ink [font-family:var(--font-mk)]">
          <Wordmark />
        </div>
        <div className="ml-auto text-sm text-slate-500">{aside}</div>
      </header>
      <main className={`mx-auto w-full px-4 pt-6 pb-16 sm:pt-12 ${wide ? "max-w-lg" : "max-w-md"}`}>{children}</main>
      <footer className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 px-4 pb-8 text-xs text-slate-500">
        <Link href="/terms" className="hover:text-slate-700">{t("Terms")}</Link>
        <Link href="/privacy" className="hover:text-slate-700">{t("Privacy")}</Link>
        <Link href="/support" className="hover:text-slate-700">{t("Support")}</Link>
        <Link href="/pricing" className="hover:text-slate-700">{t("Pricing")}</Link>
        <LanguageSwitcher />
      </footer>
    </div>
  );
}

export function AuthCard({ children }: { children: React.ReactNode }) {
  return <div className="card rounded-[4px] p-6 ring-1 ring-slate-300/70 sm:p-8">{children}</div>;
}

export function AuthTitle({ icon, title, sub }: { icon?: React.ReactNode; title: string; sub?: React.ReactNode }) {
  return (
    <div className="mb-6">
      {icon && <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-brand-600 [&_svg]:h-5 [&_svg]:w-5">{icon}</div>}
      <h1 className="page-title">{title}</h1>
      {sub && <p className="mt-1.5 text-sm leading-relaxed text-slate-500">{sub}</p>}
    </div>
  );
}

export function FormError({ children }: { children: React.ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" className="flex gap-2 rounded-lg bg-bad-50 px-3 py-2.5 text-sm text-bad-700 ring-1 ring-bad-200">
      <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{children}</span>
    </p>
  );
}

export function FormNotice({ children }: { children: React.ReactNode }) {
  if (!children) return null;
  return <p className="rounded-lg bg-ok-50 px-3 py-2.5 text-sm text-ok-700 ring-1 ring-ok-200">{children}</p>;
}

/** Password input with a show/hide toggle and (for new passwords) a strength meter. */
export function PasswordField(props: { id: string; label: string; value: string; onChange: (v: string) => void; isNew?: boolean; autoFocus?: boolean }) {
  const t = useT();
  const [show, setShow] = useState(false);
  const s = passwordStrength(props.value);
  const bar = ["bg-slate-200", "bg-red-500", "bg-amber-500", "bg-lime-500", "bg-emerald-600"][s.score];
  const text = ["text-slate-500", "text-red-600", "text-amber-700", "text-lime-700", "text-emerald-700"][s.score];
  return (
    <div>
      <label className="label" htmlFor={props.id}>
        {props.label}
      </label>
      <div className="relative">
        <input
          id={props.id}
          className="input h-11 pr-11"
          type={show ? "text" : "password"}
          autoComplete={props.isNew ? "new-password" : "current-password"}
          minLength={props.isNew ? PASSWORD_MIN : undefined}
          maxLength={72}
          required
          autoFocus={props.autoFocus}
          value={props.value}
          onChange={(e) => props.onChange(e.target.value)}
          aria-describedby={props.isNew ? `${props.id}-strength` : undefined}
        />
        <button
          type="button"
          className="absolute top-1/2 right-1.5 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          onClick={() => setShow(!show)}
          aria-label={show ? t("Hide password") : t("Show password")}
          aria-pressed={show}
        >
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
      {props.isNew && (
        <div id={`${props.id}-strength`} className="mt-2" aria-live="polite">
          <div className="flex gap-1" aria-hidden>
            {[1, 2, 3, 4].map((i) => (
              <span key={i} className={`h-1 flex-1 rounded-full transition-colors ${i <= s.score ? bar : "bg-slate-200"}`} />
            ))}
          </div>
          <p className={`mt-1.5 text-xs ${text}`}>
            {/* Dynamic keys from src/lib/onboardingLogic.ts (lib-strings area). */}
            {s.label && <span className="font-medium">{t(s.label)}. </span>}
            <span className={s.label ? "text-slate-500" : ""}>{t(s.hint)}</span>
          </p>
        </div>
      )}
    </div>
  );
}

export const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));
