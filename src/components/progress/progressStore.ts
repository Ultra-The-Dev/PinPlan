"use client";
// UI state for install progress on the plan (display only, this device): the Progress view, walk mode, the status a
// walk-mode tap sets, filters, the open device sheet, the undo snackbar and a pending "photo required" capture.
// Data changes go through the editor store (useEditor().updateMarker / updateRun) — see actions.ts.
import { create } from "zustand";
import type { InstallStatus } from "@/lib/types";

export type WalkTarget = "next" | InstallStatus;
export type InstallRef = { table: "markers" | "runs"; id: string };

interface ProgressUi {
  /** The Progress view: status rings on the plan. */
  on: boolean;
  /** Walk mode: a tap on a device sets `target`. */
  walk: boolean;
  target: WalkTarget;
  /** Only these statuses get rings / taps (empty = all). */
  statuses: InstallStatus[];
  /** Only this category (null = all). */
  category: string | null;
  /** Toolbar folded down to its pill (phones). */
  folded: boolean;
  /** Device install sheet. */
  sheet: InstallRef | null;
  /** Last walk-mode change, for the undo snackbar. */
  snack: { n: number; ref: InstallRef; label: string; text: string } | null;
  /** Waiting for a proof photo before setting a status. */
  pendingPhoto: (InstallRef & { to: InstallStatus; label: string }) | null;
  /** Mouse button of the last press on the plan (2 = right-click opens the device sheet in walk mode). */
  lastButton: number;
  set(p: Partial<Omit<ProgressUi, "set">>): void;
}

export const useProgressUi = create<ProgressUi>((set) => ({
  on: false,
  walk: false,
  target: "next",
  statuses: [],
  category: null,
  folded: false,
  sheet: null,
  snack: null,
  pendingPhoto: null,
  lastButton: 0,
  set: (p) => set(p),
}));

let snackSeq = 0;
export function showSnack(ref: InstallRef, label: string, text: string) {
  const n = ++snackSeq;
  useProgressUi.getState().set({ snack: { n, ref, label, text } });
  setTimeout(() => {
    if (useProgressUi.getState().snack?.n === n) useProgressUi.getState().set({ snack: null });
  }, 5000);
}

/** The hidden camera input of the plan overlay (walk mode opens it straight from a tap). */
export const photoInput: { current: HTMLInputElement | null } = { current: null };
