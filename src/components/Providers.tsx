"use client";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { Suspense, useEffect, useLayoutEffect, useState, useSyncExternalStore } from "react";
import { markHydrated, useLocale, wantedLocale } from "@/lib/i18n";
import { revealWhenSettled } from "@/lib/i18n/boot";
import { isPublicPage } from "@/lib/publicPages";
import Toaster from "./ui/Toaster";
import UpdatePrompt from "./UpdatePrompt";

// The database, sync, account language and tours: loaded on demand, never on the public website pages.
const AppRuntime = dynamic(() => import("./AppRuntime"), { ssr: false, loading: () => null });

/** Starts the app runtime the first time the address is an app page, and keeps it running after that. */
function RuntimeGate() {
  const path = usePathname() ?? "";
  // False while hydrating, so the server HTML (nothing here) and the first client render match.
  const client = useSyncExternalStore(noSubscribe, () => true, () => false);
  const [started, setStarted] = useState(false);
  if (client && !started && !isPublicPage(path)) setStarted(true);
  return started ? <AppRuntime /> : null;
}
const noSubscribe = () => () => undefined;

/** Shows the page (hidden before paint by the inline script from src/lib/i18n/boot.ts) once its language is on screen. */
function LocaleReveal() {
  const locale = useLocale();
  useLayoutEffect(() => {
    if (locale === wantedLocale()) revealWhenSettled();
  }, [locale]);
  return null;
}

export default function Providers({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    // A language still loading when the page started may now be shown (src/lib/i18n).
    markHydrated();
  }, []);
  return (
    <>
      {children}
      <LocaleReveal />
      <Toaster />
      <UpdatePrompt />
      {/* Reads the address, so behind Suspense. */}
      <Suspense fallback={null}>
        <RuntimeGate />
      </Suspense>
    </>
  );
}
