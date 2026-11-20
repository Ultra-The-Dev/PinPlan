// Server error capture (server-only): unexpected failures in route handlers and server rendering are written to
// public.app_errors with platform 'server', next to the app reports, so /admin shows them. Uses the service-role key
// (only the service role may file 'server' reports; see supabase/migrations/20261124100800_ops_hardening.sql).
//
// Same privacy rules as the app reports: the message and stack go through scrubText (tokens, keys, emails, long ids),
// the path loses its query string, and only names we choose go into context — never request bodies or headers.
// Never throws and never blocks for long: a failed report is logged to the console and forgotten.
import { buildReport, isNoise, type ErrorReport } from "@/lib/errorReporting";
import { serviceConfigured, serviceFetch } from "./supabaseAdmin";

/** Most reports one server instance sends per 5 minutes (the database has its own cap of 100 for all servers). */
export const MAX_SERVER_REPORTS_PER_WINDOW = 30;
const WINDOW_MS = 5 * 60_000;
/** The same error (message + top frame) is reported at most once per minute per instance. */
const REPEAT_MS = 60_000;

let windowStart = 0;
let windowCount = 0;
const lastSent = new Map<string, number>();

export interface ServerErrorInfo {
  /** Where it happened, e.g. "billing webhook", "account delete", or a route path. */
  where: string;
  /** Request path; the query string is dropped. */
  path?: string | null;
  method?: string;
  /** The signed-in user the failure affected, when known. */
  userId?: string | null;
  /** Extra non-secret detail (event type, route kind…). Strings are scrubbed and clipped. */
  extra?: Record<string, unknown>;
}

/** The row to insert (pure; exported for tests). */
export function buildServerReport(error: unknown, info: ServerErrorInfo): ErrorReport & { user_id?: string } {
  const path = info.path ? info.path.split(/[?#]/)[0].slice(0, 1000) : null;
  const report = buildReport(error, "server", { where: info.where, ...(info.method ? { method: info.method } : {}), ...(info.extra ?? {}) }, undefined, undefined, "server");
  return {
    ...report,
    url: path,
    user_agent: `Northpin-server${process.env.VERCEL_REGION ? ` (${process.env.VERCEL_REGION})` : ""}`,
    ...(info.userId && /^[0-9a-f-]{36}$/i.test(info.userId) ? { user_id: info.userId } : {}),
  };
}

/** Should this report go out now? Applies the per-instance window cap and repeat suppression. */
export function shouldSend(key: string, now = Date.now()): boolean {
  if (now - windowStart >= WINDOW_MS) {
    windowStart = now;
    windowCount = 0;
  }
  const last = lastSent.get(key);
  if (last !== undefined && now - last < REPEAT_MS) return false;
  if (windowCount >= MAX_SERVER_REPORTS_PER_WINDOW) return false;
  windowCount++;
  lastSent.set(key, now);
  if (lastSent.size > 500) for (const [k, t] of lastSent) if (now - t >= REPEAT_MS) lastSent.delete(k);
  return true;
}

/** Test helper: forget the window and repeat state. */
export function resetServerErrorState() {
  windowStart = 0;
  windowCount = 0;
  lastSent.clear();
}

/** Record an unexpected server failure. Always logs (scrubbed) to the console; writes to app_errors when it can. */
export async function reportServerError(error: unknown, info: ServerErrorInfo): Promise<void> {
  try {
    const row = buildServerReport(error, info);
    console.error(`[server error] ${info.where}: ${row.message}`);
    if (isNoise(row.message, null) || !serviceConfigured()) return;
    const key = `${info.where}|${row.message}|${(row.stack ?? "").split("\n").slice(0, 2).join("|")}`;
    if (!shouldSend(key)) return;
    const send = (body: object) =>
      serviceFetch("/rest/v1/app_errors", {
        method: "POST",
        headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(3000),
      });
    let r = await send(row);
    // The user may already be gone (user_id references auth.users): keep the report without them.
    if (!r.ok && row.user_id && r.status < 500) {
      const { user_id: _drop, ...rest } = row;
      void _drop;
      r = await send(rest);
    }
    if (!r.ok) console.error(`[server error] couldn't record the report (${r.status})`);
  } catch {
    /* reporting must never cause another error */
  }
}
