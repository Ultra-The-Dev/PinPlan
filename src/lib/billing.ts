"use client";
// The billing calls the web app makes (owner/admin): Stripe Checkout, the billing portal and seat changes.
// The server holds the Stripe keys; these only get back a URL to open, or the new seat count.
import { useSyncExternalStore } from "react";
import { apiFetch } from "./api";
import type { SeatAction } from "./billingLogic";
import { reloadTeam, useTeam } from "./team";

// The current minute, for trial countdowns. Null while prerendering (the clock is only read in the browser).
const subscribeMinute = (cb: () => void) => {
  const id = window.setInterval(cb, 30_000);
  return () => window.clearInterval(id);
};
export function useNow(): Date | null {
  const minute = useSyncExternalStore(
    subscribeMinute,
    () => Math.floor(Date.now() / 60_000),
    () => null,
  );
  return minute == null ? null : new Date(minute * 60_000);
}

async function post<T>(path: string, body?: unknown): Promise<T> {
  let r: Response;
  try {
    r = await apiFetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body ?? {}) });
  } catch {
    throw new Error("You're offline. Billing needs a connection.");
  }
  const data = (await r.json().catch(() => ({}))) as T & { error?: string };
  if (!r.ok) throw new Error(data.error || `Billing request failed (${r.status}).`);
  return data;
}

/** Opens Stripe Checkout for the team's subscription (leaves the app; Stripe sends people back to Settings). */
export async function startCheckout(): Promise<void> {
  const { url } = await post<{ url: string }>("/api/billing/checkout");
  window.location.assign(url);
}

/** Opens Stripe's billing portal (card, invoices, cancel). */
export async function openBillingPortal(): Promise<void> {
  const { url } = await post<{ url: string }>("/api/billing/portal");
  window.location.assign(url);
}

/** Changes the subscription's seats, then reloads the team's billing. Returns the new seat count (null: no limit). */
export async function changeSeats(action: SeatAction): Promise<number | null> {
  const { seats } = await post<{ seats: number | null }>("/api/billing/sync-seats", { action });
  await reloadTeam();
  return seats;
}

/** After removing someone: give back the seat they used. Quiet — it never blocks the removal (no billing, offline…). */
export async function releaseSeat(): Promise<void> {
  const b = useTeam.getState().billing;
  if (!b?.hasSubscription || b.seatLimit == null) return;
  await changeSeats("release").catch(() => undefined);
}
