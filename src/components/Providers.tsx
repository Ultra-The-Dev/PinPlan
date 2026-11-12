"use client";
import { useEffect } from "react";
import { ensureSeeded } from "@/lib/db";
import { startSync } from "@/lib/sync";

export default function Providers({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    ensureSeeded().catch(console.error);
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js").catch(console.error);
    }
    // Persist IndexedDB so the browser doesn't evict plans on low storage.
    navigator.storage?.persist?.().catch(() => undefined);
    return startSync();
  }, []);
  return <>{children}</>;
}
