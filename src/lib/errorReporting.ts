// Client error reporting without a third-party service: uncaught errors, unhandled promise rejections and
// React error-boundary errors are inserted into Supabase `public.app_errors` (insert-only; see
// supabase/migrations/20261121020000_ops.sql for the columns, which the iOS app can use too).
// Without Supabase configured this is a no-op apart from the console.
// The pure parts (scrubbing, buildReport) are shared with server error capture (src/lib/server/serverErrors.ts), so
// this module has no "use client" and loads the browser Supabase client only when a report is actually sent.
//
// Privacy: URLs lose their query string and hash (proposal tokens, auth fragments), and messages/stacks are
// scrubbed of JWTs, bearer tokens, long opaque ids and email addresses before anything leaves the device.
export type ErrorKind = "onerror" | "unhandledrejection" | "boundary" | "manual" | "server";

export interface ErrorReport {
  message: string;
  stack: string | null;
  url: string | null;
  user_agent: string | null;
  app_version: string;
  platform: "web" | "server";
  context: Record<string, unknown>;
}

/** Most reports one page session sends (reloads included, via sessionStorage). */
export const MAX_REPORTS_PER_SESSION = 15;
const SESSION_KEY = "pinplan.errorReports";

export const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION || process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA?.slice(0, 12) || "dev";

/** Drop the query string and hash: they carry proposal tokens, invite codes and auth fragments. */
export function sanitizeUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw, typeof location !== "undefined" ? location.href : "http://localhost");
    return `${u.origin}${u.pathname}`.slice(0, 2000);
  } catch {
    return raw.split(/[?#]/)[0].slice(0, 2000);
  }
}

/** Remove things that look like credentials or personal data from free text (messages, stacks). */
export function scrubText(s: string): string {
  return s
    .replace(/(https?:\/\/[^\s?#)"']+)[?#][^\s)"']*/g, "$1") // query strings / fragments inside URLs
    .replace(/eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, "[jwt]")
    .replace(/\bBearer\s+[^\s'",]+/gi, "Bearer [redacted]")
    .replace(/\b(apikey|access_token|refresh_token|token|code|key|secret|password)(=|":\s*"|:\s+)[^\s&#,;'"]+/gi, "$1$2[redacted]")
    .replace(/\b(sk|pk|rk|whsec|sb_secret|sb_publishable)_[A-Za-z0-9_-]{8,}/g, "[key]")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
    .replace(/\b[A-Za-z0-9_-]{40,}\b/g, "[id]");
}

function clip(s: string | null | undefined, n: number): string | null {
  if (!s) return null;
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

/** Errors that are noise (browser quirks, extensions, aborted requests) rather than Northpin bugs. */
export function isNoise(message: string, stack: string | null): boolean {
  if (!message || message === "Script error." || message === "Script error") return true;
  if (/ResizeObserver loop|AbortError|The (operation|user) aborted|Load failed$|NetworkError when attempting|Failed to fetch$/i.test(message)) return true;
  if (stack && /(chrome|moz|safari(-web)?)-extension:\/\//.test(stack)) return true;
  return false;
}

function toParts(error: unknown): { message: string; stack: string | null } {
  if (error instanceof Error) return { message: `${error.name && error.name !== "Error" ? `${error.name}: ` : ""}${error.message}`, stack: error.stack ?? null };
  if (typeof error === "string") return { message: error, stack: null };
  try {
    return { message: JSON.stringify(error) ?? String(error), stack: null };
  } catch {
    return { message: String(error), stack: null };
  }
}

/** Build the row to insert (pure; exported for tests). */
export function buildReport(error: unknown, kind: ErrorKind, extra: Record<string, unknown> = {}, href?: string, ua?: string, platform: ErrorReport["platform"] = "web"): ErrorReport {
  const { message, stack } = toParts(error);
  const digest = (error as { digest?: unknown })?.digest;
  let context: Record<string, unknown> = { kind, ...extra, ...(typeof digest === "string" ? { digest } : {}) };
  for (const [k, v] of Object.entries(context)) if (typeof v === "string") context[k] = clip(scrubText(v), 2000);
  if (JSON.stringify(context).length > 6000) context = { kind, truncated: true };
  return {
    message: clip(scrubText(message), 2000) || "Unknown error",
    stack: clip(stack ? scrubText(stack) : null, 16000),
    url: sanitizeUrl(href),
    user_agent: clip(ua ?? null, 512),
    app_version: APP_VERSION,
    platform,
    context,
  };
}

const seen = new Set<string>();
let sent = 0;

function sessionCount(): number {
  try {
    return Number(sessionStorage.getItem(SESSION_KEY)) || 0;
  } catch {
    return sent;
  }
}
function bumpSessionCount() {
  sent++;
  try {
    sessionStorage.setItem(SESSION_KEY, String(sessionCount() + 1));
  } catch {
    /* storage unavailable: the in-memory count still applies */
  }
}

/** Report an error (deduped by message + top stack frame, capped per session). Never throws. */
export function reportError(error: unknown, kind: ErrorKind = "manual", extra: Record<string, unknown> = {}): void {
  try {
    if (typeof window === "undefined") return;
    const report = buildReport(error, kind, { online: navigator.onLine, ...extra }, location.href, navigator.userAgent);
    if (isNoise(report.message, report.stack)) return;
    const key = `${report.message}|${(report.stack ?? "").split("\n").slice(0, 2).join("|")}`;
    if (seen.has(key)) return;
    seen.add(key);
    if (sent >= MAX_REPORTS_PER_SESSION || sessionCount() >= MAX_REPORTS_PER_SESSION) return;
    bumpSessionCount();
    void import("./supabase")
      .then(({ getSupabase, supabaseConfigured }) => {
        const sb = supabaseConfigured ? getSupabase() : null;
        // No .select(): the table is insert-only for app users.
        return sb ? sb.from("app_errors").insert(report) : undefined;
      })
      .then(
        () => undefined,
        () => undefined,
      );
  } catch {
    /* reporting must never cause another error */
  }
}

let installed = false;

/** Listen for uncaught errors and unhandled rejections. Idempotent; returns a cleanup function. */
export function installErrorReporting(): () => void {
  if (typeof window === "undefined" || installed) return () => undefined;
  installed = true;
  const onError = (e: ErrorEvent) => reportError(e.error ?? e.message, "onerror", e.filename ? { source: sanitizeUrl(e.filename), line: e.lineno, col: e.colno } : {});
  const onRejection = (e: PromiseRejectionEvent) => reportError(e.reason, "unhandledrejection");
  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onRejection);
  return () => {
    installed = false;
    window.removeEventListener("error", onError);
    window.removeEventListener("unhandledrejection", onRejection);
  };
}

/** Plain-text details for the "Copy details" button and support emails. */
export function errorDetails(error: unknown): string {
  const r = buildReport(error, "boundary", {}, typeof location !== "undefined" ? location.href : undefined, typeof navigator !== "undefined" ? navigator.userAgent : undefined);
  return [
    `Error: ${r.message}`,
    r.context.digest ? `Digest: ${r.context.digest}` : null,
    `Page: ${r.url ?? "?"}`,
    `Time: ${new Date().toISOString()}`,
    `App version: ${r.app_version}`,
    `Browser: ${r.user_agent ?? "?"}`,
    r.stack ? `\n${r.stack}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}
