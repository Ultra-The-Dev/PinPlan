"use client";
// Is Billdu connected for this company? One cached GET /api/billdu/credentials per page (refreshed when the
// connection or the signed-in user changes), so money screens show Billdu cards and wording only when it is set up.
import { useEffect, useState } from "react";
import { apiFetch } from "./api";

/** Fired by Settings → Billdu after connecting or disconnecting. */
export const BILLDU_EVENT = "pinplan:billdu-changed";
const AUTH_EVENT = "pinplan:auth-changed";
const TTL = 5 * 60_000;

let cache: { at: number; value: Promise<boolean> } | null = null;

async function load(): Promise<boolean> {
  try {
    const r = await apiFetch("/api/billdu/credentials", { cache: "no-store" });
    if (!r.ok) return false; // signed out, a technician, or no server: not connected for this person
    const j = (await r.json().catch(() => ({}))) as { configured?: boolean };
    return !!j.configured;
  } catch {
    return false; // offline: nothing can be sent to Billdu anyway
  }
}

/** Billdu connected? Cached for a few minutes; `force` asks the server again. */
export function billduConfigured(force = false): Promise<boolean> {
  if (force || !cache || Date.now() - cache.at > TTL) cache = { at: Date.now(), value: load() };
  return cache.value;
}

/** Forget the cached answer and tell the screens (call after connecting or disconnecting Billdu). */
export function billduChanged() {
  cache = null;
  if (typeof window !== "undefined") window.dispatchEvent(new Event(BILLDU_EVENT));
}

/** True when Billdu is connected; false while unknown or not connected (so nothing about Billdu flashes up). */
export function useBilldu(): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    let live = true;
    const read = () => void billduConfigured().then((v) => live && setOn(v));
    read();
    // Several screens listen: the first one to hear it asks the server, the others share that answer.
    const again = () => {
      if (cache && Date.now() - cache.at > 1000) cache = null;
      read();
    };
    window.addEventListener(BILLDU_EVENT, again);
    window.addEventListener(AUTH_EVENT, again);
    return () => {
      live = false;
      window.removeEventListener(BILLDU_EVENT, again);
      window.removeEventListener(AUTH_EVENT, again);
    };
  }, []);
  return on;
}
