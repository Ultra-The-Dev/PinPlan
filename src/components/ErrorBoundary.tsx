"use client";
// Error UI shared by app/error.tsx and app/global-error.tsx, plus the listener that reports uncaught errors.
import { AlertTriangle, Check, Copy, RotateCw } from "lucide-react";
import { useEffect, useState } from "react";
import { errorDetails, installErrorReporting, reportError } from "@/lib/errorReporting";
import { useT } from "@/lib/i18n";

/** Mount once in the root layout: reports window errors and unhandled promise rejections. Renders nothing. */
export function ErrorReporter() {
  useEffect(() => installErrorReporting(), []);
  return null;
}

export function ErrorFallback({ error, retry }: { error: unknown; retry?: () => void }) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    console.error(error);
    reportError(error, "boundary");
  }, [error]);

  async function copy() {
    const text = errorDetails(error);
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Clipboard blocked (plain http, permissions): fall back to a hidden textarea.
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <main className="flex flex-1 items-center justify-center p-4 sm:p-8" role="alert">
      <div className="card w-full max-w-md p-6 text-center sm:p-8">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 text-brand-600">
          <AlertTriangle className="h-6 w-6" aria-hidden />
        </div>
        <h1 className="text-lg font-semibold text-slate-900">{t("Something went wrong")}</h1>
        <p className="mt-2 text-sm text-slate-600">
          {t("Northpin hit an unexpected error. Your jobs are saved on this device, so reloading is safe. If it keeps happening, copy the details and send them to support.")}
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button className="btn btn-primary" onClick={() => location.reload()}>
            <RotateCw /> {t("Reload")}
          </button>
          {retry && (
            <button className="btn" onClick={() => retry()}>
              {t("Try again")}
            </button>
          )}
          <button className="btn" onClick={copy}>
            {copied ? <Check /> : <Copy />} {copied ? t("Copied") : t("Copy details")}
          </button>
        </div>
        <p className="mt-5 text-xs text-slate-500">
          {t("Need help?")}{" "}
          <a className="underline underline-offset-2 hover:text-slate-800" href="/support">
            {t("Contact support")}
          </a>
        </p>
      </div>
    </main>
  );
}
