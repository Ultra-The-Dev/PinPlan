"use client";
// Small modal behaviour for the form sheets until they move to a shared Modal: Escape closes, focus moves into the
// dialog when it opens and goes back to where it was when it closes.
import { useEffect, useRef } from "react";

export function useDialog<T extends HTMLElement = HTMLDivElement>(onClose: () => void) {
  const ref = useRef<T>(null);
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  }, [onClose]);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    // Focus the dialog itself unless something inside asked for focus (autoFocus).
    if (ref.current && !ref.current.contains(document.activeElement)) ref.current.focus({ preventScroll: true });
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      e.stopPropagation();
      close.current();
    };
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("keydown", key);
      prev?.focus?.({ preventScroll: true });
    };
  }, []);
  return ref;
}
