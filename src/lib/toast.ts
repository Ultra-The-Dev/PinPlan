"use client";
import { create } from "zustand";

export type ToastKind = "success" | "error" | "info";
interface Toast {
  id: number;
  kind: ToastKind;
  text: string;
}
interface ToastState {
  toasts: Toast[];
  push(text: string, kind?: ToastKind): void;
  dismiss(id: number): void;
}
let seq = 0;
export const useToasts = create<ToastState>((set, get) => ({
  toasts: [],
  push(text, kind = "success") {
    const id = ++seq;
    set({ toasts: [...get().toasts.slice(-3), { id, kind, text }] });
    setTimeout(() => get().dismiss(id), kind === "error" ? 6000 : 2800);
  },
  dismiss(id) {
    set({ toasts: get().toasts.filter((t) => t.id !== id) });
  },
}));

export const toast = (text: string, kind?: ToastKind) => useToasts.getState().push(text, kind);
