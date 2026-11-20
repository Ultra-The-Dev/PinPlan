"use client";
// The language picker. Saved on this device, and on the account when signed in (src/lib/i18n/account.ts).
import { ChevronDown, Languages } from "lucide-react";
import { LOCALES, setLocale, useT, type Locale } from "@/lib/i18n";
import { saveLocaleToAccount } from "@/lib/i18n/account";

export function chooseLocale(locale: Locale) {
  setLocale(locale);
  void saveLocaleToAccount(locale);
}

/**
 * A compact dropdown with each language in its own name (people find theirs whatever language the page is in now).
 * `tone="dark"` for dark footers. Each option carries its own `lang` so screen readers pronounce it right.
 */
export default function LanguageSwitcher({ className = "", tone = "light", showIcon = true }: { className?: string; tone?: "light" | "dark"; showIcon?: boolean }) {
  const t = useT();
  const dark = tone === "dark";
  return (
    <label className={`relative inline-flex items-center gap-1 text-xs ${className}`}>
      {showIcon && <Languages aria-hidden className={`h-4 w-4 shrink-0 ${dark ? "text-white/60" : "text-slate-400"}`} />}
      <span className="sr-only">{t("Language")}</span>
      <select
        value={t.locale}
        onChange={(e) => chooseLocale(e.target.value as Locale)}
        className={`min-h-8 cursor-pointer appearance-none rounded-md py-1 pr-7 pl-2.5 font-medium transition focus-visible:outline-2 focus-visible:outline-offset-2 ${
          dark ? "bg-white/10 text-white hover:bg-white/15 focus-visible:outline-white [&>option]:text-slate-900" : "bg-slate-100 text-slate-700 hover:bg-slate-200/70 focus-visible:outline-blue-600"
        }`}
      >
        {LOCALES.map((l) => (
          <option key={l.code} value={l.code} lang={l.code}>
            {l.label}
          </option>
        ))}
      </select>
      <ChevronDown aria-hidden className={`pointer-events-none absolute right-2 h-3.5 w-3.5 ${dark ? "text-white/70" : "text-slate-500"}`} />
    </label>
  );
}
