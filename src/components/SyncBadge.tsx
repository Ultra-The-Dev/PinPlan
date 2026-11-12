"use client";
import Link from "next/link";
import { useSyncExternalStore } from "react";
import { useSyncStatus } from "@/lib/sync";

/** Small header indicator: offline / local only / pending N / synced. */
export default function SyncBadge() {
  const { configured, signedIn, online, syncing, pending, error } = useSyncStatus();
  // Sync state only exists in the browser; render a neutral badge for the server/hydration pass.
  const hydrated = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  if (!hydrated) return <span className="inline-block h-6 w-20 rounded-md bg-slate-100" aria-hidden />;
  let text: string;
  let cls: string;
  if (!online) {
    text = pending && configured ? `Offline · ${pending} pending` : "Offline";
    cls = "bg-amber-100 text-amber-800";
  } else if (!configured) {
    text = "Local only";
    cls = "bg-slate-100 text-slate-600";
  } else if (!signedIn) {
    text = "Not signed in";
    cls = "bg-slate-100 text-slate-600";
  } else if (error) {
    text = "Sync error";
    cls = "bg-red-100 text-red-700";
  } else if (syncing) {
    text = "Syncing…";
    cls = "bg-blue-100 text-blue-700";
  } else if (pending) {
    text = `${pending} pending`;
    cls = "bg-amber-100 text-amber-800";
  } else {
    text = "Synced";
    cls = "bg-emerald-100 text-emerald-700";
  }
  return (
    <Link href="/settings#account" title={error ?? text} aria-label={`Sync: ${text}`} className={`inline-flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium whitespace-nowrap sm:px-2.5 sm:py-1 ${cls}`}>
      <span className={`h-1.5 w-1.5 rounded-full bg-current ${syncing ? "animate-pulse" : ""}`} />
      <span className="hidden sm:inline">{text}</span>
    </Link>
  );
}
