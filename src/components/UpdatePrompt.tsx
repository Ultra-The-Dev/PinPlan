"use client";
// Registers the service worker (production only) and, when a new version of the app has downloaded, offers
// "Update ready – Reload". The new version never takes over an open tab by itself (public/sw.js waits), so a deploy
// can't swap code under someone mid-job; tapping Reload activates it and reloads once it is in control.
import { RotateCw, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useT } from "@/lib/i18n";

/** Check for a new deploy this often while the app stays open (and whenever the tab comes back to the front). */
const CHECK_EVERY_MS = 60 * 60_000;

export default function UpdatePrompt() {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  const [hidden, setHidden] = useState(false);
  const reloading = useRef(false);
  const t = useT();

  useEffect(() => {
    if (!("serviceWorker" in navigator) || process.env.NODE_ENV !== "production") return;
    const sw = navigator.serviceWorker;
    let reg: ServiceWorkerRegistration | null = null;
    let cancelled = false;
    // Only a new version replacing an old one is an update; the very first install just starts caching.
    const offer = (w: ServiceWorker | null) => {
      if (w && sw.controller && !cancelled) {
        setWaiting(w);
        setHidden(false);
      }
    };
    const track = (w: ServiceWorker | null) => {
      if (!w) return;
      if (w.state === "installed") return offer(w);
      w.addEventListener("statechange", () => w.state === "installed" && offer(w));
    };
    const onFound = () => track(reg?.installing ?? null);
    // Reload once the new version is in control, but only when the person asked for it.
    const onControl = () => {
      if (!reloading.current) return;
      reloading.current = false;
      location.reload();
    };
    const check = () => {
      if (document.visibilityState === "visible" && navigator.onLine !== false) reg?.update().catch(() => undefined);
    };
    sw.addEventListener("controllerchange", onControl);
    sw.register("/sw.js")
      .then((r) => {
        if (cancelled || !r) return;
        reg = r;
        offer(r.waiting);
        track(r.installing);
        r.addEventListener("updatefound", onFound);
      })
      .catch(console.error);
    const timer = setInterval(check, CHECK_EVERY_MS);
    document.addEventListener("visibilitychange", check);
    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", check);
      sw.removeEventListener("controllerchange", onControl);
      reg?.removeEventListener("updatefound", onFound);
    };
  }, []);

  if (!waiting || hidden) return null;
  const update = () => {
    reloading.current = true;
    waiting.postMessage({ type: "SKIP_WAITING" });
    // If the new version was already activated by another tab, controllerchange may have fired already.
    setTimeout(() => reloading.current && location.reload(), 3000);
  };
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex justify-center px-4" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
      <div role="status" className="pointer-events-auto flex items-center gap-2 rounded-xl bg-ink/95 py-2 pr-2 pl-3.5 text-sm text-white shadow-pop backdrop-blur animate-in">
        <span>{t("Update ready")}</span>
        <button className="inline-flex items-center gap-1.5 rounded-lg bg-white px-2.5 py-1 text-sm font-semibold text-slate-900 hover:bg-slate-100" onClick={update}>
          <RotateCw className="h-3.5 w-3.5" /> {t("Reload")}
        </button>
        <button className="rounded-md p-1 text-white/60 hover:bg-white/10 hover:text-white" onClick={() => setHidden(true)} aria-label={t("Later")}>
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
