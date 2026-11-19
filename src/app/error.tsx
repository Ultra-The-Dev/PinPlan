"use client";
import { useEffect, useState } from "react";
import { ErrorFallback } from "@/components/ErrorBoundary";
import { isChunkLoadError, reloadOnceForChunkError } from "@/lib/chunkError";

export default function Error({ error, retry }: { error: unknown; retry: () => void }) {
  // A chunk from an older deploy that no longer exists: reload once into the new build instead of showing an error.
  const [reloading, setReloading] = useState(() => isChunkLoadError(error));
  useEffect(() => {
    // Not reloading (not a chunk error, or it already reloaded once): show the error page.
    if (!reloadOnceForChunkError(error)) void Promise.resolve().then(() => setReloading(false));
  }, [error]);
  if (reloading) return null;
  return <ErrorFallback error={error} retry={retry} />;
}
