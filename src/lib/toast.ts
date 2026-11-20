"use client";
import { create } from "zustand";
import { t } from "./i18n";

export type ToastKind = "success" | "error" | "info";
/** A button on the toast that goes somewhere in the app (e.g. "Plan & billing" → /settings#billing). */
export interface ToastAction {
  label: string;
  href: string;
}
export interface Toast {
  id: number;
  kind: ToastKind;
  text: string;
  action?: ToastAction;
}
export interface ToastOptions {
  action?: ToastAction;
}
interface ToastState {
  toasts: Toast[];
  /** True while the pointer is over the toasts or focus is inside them: nothing times out. */
  paused: boolean;
  push(text: string, kind?: ToastKind, opts?: ToastOptions): number;
  dismiss(id: number): void;
  pause(): void;
  resume(): void;
}

/** How long each kind stays up. Errors stay long enough to read (and are kept until dismissed while paused). */
export const TOAST_MS: Record<ToastKind, number> = { success: 2800, info: 4000, error: 10000 };
/** At most this many on screen; the oldest goes first. */
export const MAX_TOASTS = 4;

// Timers live outside the store (they are not state anyone renders).
const timers = new Map<number, { handle: ReturnType<typeof setTimeout> | null; remaining: number; started: number }>();

let seq = 0;
export const useToasts = create<ToastState>((set, get) => {
  const start = (id: number) => {
    const t = timers.get(id);
    if (!t || t.handle) return;
    t.started = Date.now();
    t.handle = setTimeout(() => get().dismiss(id), t.remaining);
  };
  const stop = (id: number) => {
    const t = timers.get(id);
    if (!t?.handle) return;
    clearTimeout(t.handle);
    t.handle = null;
    t.remaining = Math.max(0, t.remaining - (Date.now() - t.started));
  };
  return {
    toasts: [],
    paused: false,
    push(text, kind = "success", opts = {}) {
      const id = ++seq;
      const action = opts.action ?? standingAction(text);
      const all = [...get().toasts, action ? { id, kind, text, action } : { id, kind, text }];
      const dropped = all.slice(0, Math.max(0, all.length - MAX_TOASTS));
      for (const d of dropped) {
        stop(d.id);
        timers.delete(d.id);
      }
      set({ toasts: all.slice(-MAX_TOASTS) });
      timers.set(id, { handle: null, remaining: TOAST_MS[kind], started: 0 });
      if (!get().paused) start(id);
      return id;
    },
    dismiss(id) {
      stop(id);
      timers.delete(id);
      if (get().toasts.some((t) => t.id === id)) set({ toasts: get().toasts.filter((t) => t.id !== id) });
    },
    pause() {
      if (get().paused) return;
      for (const t of get().toasts) stop(t.id);
      set({ paused: true });
    },
    resume() {
      if (!get().paused) return;
      set({ paused: false });
      for (const t of get().toasts) start(t.id);
    },
  };
});

export const toast = (text: string, kind?: ToastKind, opts?: ToastOptions) => useToasts.getState().push(text, kind, opts);

/** Messages that always carry the same button, wherever they are shown from (e.g. the read-only message). */
const standingActions = new Map<string, ToastAction>();
/** The button for a message, which may be shown in English or translated (src/lib/i18n); its label is translated. */
function standingAction(text: string): ToastAction | undefined {
  let a = standingActions.get(text);
  if (!a) for (const [k, v] of standingActions) if (t(k) === text) a = v;
  return a && { ...a, label: t(a.label) };
}
export function setToastAction(text: string, action: ToastAction | null): void {
  if (action) standingActions.set(text, action);
  else standingActions.delete(text);
}
