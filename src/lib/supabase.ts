"use client";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** True when Supabase env vars are set. Without them the app runs local-only. */
export const supabaseConfigured = Boolean(url && anonKey);

/** No request waits for ever: a stalled connection would hold the sync (and its lock) until the page is closed. */
export const REST_TIMEOUT_MS = 30_000;
/** File uploads and downloads (plans can be large on a slow site connection). */
export const STORAGE_TIMEOUT_MS = 120_000;

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

/** A signal that fires after `ms`, or when `outer` does. */
function timeoutSignal(ms: number, outer?: AbortSignal | null): { signal: AbortSignal; done: () => void } {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(new DOMException(`timed out after ${ms / 1000}s`, "TimeoutError")), ms);
  const onOuter = () => ctl.abort(outer?.reason);
  if (outer) {
    if (outer.aborted) ctl.abort(outer.reason);
    else outer.addEventListener("abort", onOuter, { once: true });
  }
  return {
    signal: ctl.signal,
    done: () => {
      clearTimeout(timer);
      outer?.removeEventListener("abort", onOuter);
    },
  };
}

/**
 * fetch with a time limit (30 s, 2 min for storage). A request that timed out or was aborted fails like a dropped
 * connection ("Failed to fetch"), so sync keeps the changes queued and tries again instead of setting rows aside.
 */
export async function timedFetch(input: RequestInfo | URL, init?: RequestInit, base: typeof fetch = fetch): Promise<Response> {
  const ms = /\/storage\/v1\//.test(requestUrl(input)) ? STORAGE_TIMEOUT_MS : REST_TIMEOUT_MS;
  const t = timeoutSignal(ms, init?.signal);
  try {
    return await base(input, { ...init, signal: t.signal });
  } catch (e) {
    const name = (e as { name?: string } | null)?.name;
    if (t.signal.aborted || name === "AbortError" || name === "TimeoutError") {
      const reason = (t.signal.reason as { message?: string } | undefined)?.message ?? "aborted";
      throw new TypeError(`Failed to fetch (network request ${reason})`);
    }
    throw e;
  } finally {
    t.done();
  }
}

let client: SupabaseClient | null = null;

/** Lazy browser client, or null when Supabase is not configured. */
export function getSupabase(): SupabaseClient | null {
  if (!supabaseConfigured || typeof window === "undefined") return null;
  if (!client) client = createClient(url!, anonKey!, { auth: { persistSession: true, autoRefreshToken: true }, global: { fetch: (i, o) => timedFetch(i, o) } });
  return client;
}

export const PLANS_BUCKET = "plans";
