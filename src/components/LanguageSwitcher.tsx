"use client";
// English / Русский. Saved on this device, and on the account when signed in (src/lib/i18n/account.ts).
import { Languages } from "lucide-react";
import { LOCALES, setLocale, useT, type Locale } from "@/lib/i18n";
import { saveLocaleToAccount } from "@/lib/i18n/account";

export function chooseLocale(locale: Locale) {
  setLocale(locale);
  void saveLocaleToAccount(locale);
}

/**
 * A pair of buttons with each language in its own name. `tone="dark"` for dark footers. Each label carries its own
 * `lang` so screen readers pronounce it right.
 */
export default function LanguageSwitcher({ className = "", tone = "light", showIcon = true }: { className?: string; tone?: "light" | "dark"; showIcon?: boolean }) {
  const t = useT();
  const on = tone === "dark" ? "bg-white/15 text-white" : "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200";
  const off = tone === "dark" ? "text-white/70 hover:text-white" : "text-slate-500 hover:text-slate-800";
  return (
    <div role="group" aria-label={t("Language")} className={`inline-flex items-center gap-1 text-xs ${className}`}>
      {showIcon && <Languages aria-hidden className={`h-4 w-4 ${tone === "dark" ? "text-white/60" : "text-slate-400"}`} />}
      <div className={`inline-flex rounded-md p-0.5 ${tone === "dark" ? "bg-white/5" : "bg-slate-100"}`}>
        {LOCALES.map((l) => (
          <button
            key={l.code}
            type="button"
            lang={l.code}
            aria-pressed={t.locale === l.code}
            className={`min-h-7 rounded px-2 py-1 font-medium transition ${t.locale === l.code ? on : off}`}
            onClick={() => chooseLocale(l.code)}
          >
            {l.label}
          </button>
        ))}
      </div>
    </div>
  );
}
