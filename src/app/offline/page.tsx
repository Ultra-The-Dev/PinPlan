// Shown by the service worker (public/sw.js) when there's no connection and the page asked for isn't saved on this
// device. Every page is saved after one online visit, so this is rare: mostly a first visit while offline.
import type { Metadata } from "next";
import { WifiOff } from "lucide-react";
import RetryButton from "./RetryButton";

export const metadata: Metadata = { title: "Offline · PinPlan" };

export default function OfflinePage() {
  return (
    <main className="flex flex-1 items-center justify-center p-4 sm:p-8">
      <div className="card w-full max-w-md p-6 text-center sm:p-8">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-500">
          <WifiOff className="h-6 w-6" aria-hidden />
        </div>
        <h1 className="text-lg font-semibold text-slate-900">You’re offline</h1>
        <p className="mt-2 text-sm text-slate-600">
          This page isn’t saved on this device yet. Your jobs, plans and photos are, and anything you change syncs when you’re back online.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          {/* A plain link on purpose: a full page load the service worker answers from its saved copy. */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a className="btn btn-primary" href="/">
            Go to my jobs
          </a>
          <RetryButton />
        </div>
      </div>
    </main>
  );
}
