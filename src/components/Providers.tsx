"use client";
import { useEffect } from "react";
import { db, ensureSeeded } from "@/lib/db";
import { startLocaleSync } from "@/lib/i18n/account";
import { startSync } from "@/lib/sync";
import Toaster from "./ui/Toaster";
import UpdatePrompt from "./UpdatePrompt";

/**
 * Load the plan editor's code in the background once the app is idle, so opening a job's Plan tab is instant (and
 * works offline even if the service worker hasn't cached everything yet). Only on devices that have jobs, and not on
 * metered "save data" connections.
 */
function warmPlanEditor() {
  const conn = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  if (conn?.saveData) return () => undefined;
  const run = () => {
    void db()
      .projects.count()
      .then((n) => (n > 0 ? import("./editor/PlanEditor") : null))
      .catch(() => undefined);
  };
  const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void };
  if (w.requestIdleCallback) {
    const id = w.requestIdleCallback(run, { timeout: 8000 });
    return () => w.cancelIdleCallback?.(id);
  }
  const t = setTimeout(run, 3000);
  return () => clearTimeout(t);
}

export default function Providers({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    ensureSeeded().catch(console.error);
    // Persist IndexedDB so the browser doesn't evict plans on low storage.
    navigator.storage?.persist?.().catch(() => undefined);
    const stopWarm = warmPlanEditor();
    const stopSync = startSync();
    // The language saved on the account follows the person to this device on sign-in (docs/i18n.md).
    const stopLocale = startLocaleSync();
    return () => {
      stopWarm();
      stopSync?.();
      stopLocale();
    };
  }, []);
  return (
    <>
      {children}
      <Toaster />
      <UpdatePrompt />
    </>
  );
}
