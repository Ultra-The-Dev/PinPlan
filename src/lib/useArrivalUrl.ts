"use client";
import { useSyncExternalStore } from "react";

// The URL a page was opened with, hash included. Supabase reads sign-in / recovery links from the hash and then
// clears it, so the first value seen for each page is kept. Empty during prerender.
const seen = new Map<string, string>();
function snapshot(): string {
  const key = window.location.pathname + window.location.search;
  if (!seen.has(key)) seen.set(key, window.location.href);
  return seen.get(key)!;
}
const subscribe = () => () => {};

/** Search + hash parameters the page arrived with (null before hydration). */
export function useArrivalParams(): { search: URLSearchParams; hash: URLSearchParams } | null {
  const href = useSyncExternalStore(subscribe, snapshot, () => "");
  if (!href) return null;
  const u = new URL(href);
  return { search: u.searchParams, hash: new URLSearchParams(u.hash.slice(1)) };
}

/** Supabase's error for a failed email link (expired / already used), in plain words, or null. */
export function linkErrorFrom(hash: URLSearchParams | undefined, expired: string): string | null {
  const d = hash?.get("error_description");
  if (!d) return null;
  return /expired|invalid/i.test(d) ? expired : d.replace(/\+/g, " ");
}
