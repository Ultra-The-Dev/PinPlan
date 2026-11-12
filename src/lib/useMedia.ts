"use client";
import { useSyncExternalStore } from "react";

/** Subscribe to a CSS media query (false during SSR). */
export function useMedia(query: string): boolean {
  return useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia(query);
      m.addEventListener("change", cb);
      return () => m.removeEventListener("change", cb);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

export const WIDE_EDITOR = "(min-width: 1100px)";
