"use client";
// Replaces the root layout when the layout itself fails, so it brings its own <html>, <body> and styles.
import { useEffect, useState } from "react";
import { ErrorFallback } from "@/components/ErrorBoundary";
import { isChunkLoadError, reloadOnceForChunkError } from "@/lib/chunkError";
import "./globals.css";

export default function GlobalError({ error, retry }: { error: unknown; retry: () => void }) {
  // A chunk from an older deploy that no longer exists: reload once into the new build instead of showing an error.
  const [reloading, setReloading] = useState(() => isChunkLoadError(error));
  useEffect(() => {
    // Not reloading (not a chunk error, or it already reloaded once): show the error page.
    if (!reloadOnceForChunkError(error)) void Promise.resolve().then(() => setReloading(false));
  }, [error]);
  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex h-full flex-col bg-slate-50 text-slate-900">
        <title>Something went wrong · Northpin</title>
        {!reloading && <ErrorFallback error={error} retry={retry} />}
      </body>
    </html>
  );
}
