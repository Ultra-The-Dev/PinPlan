"use client";
// Whether the plan marks devices that have site photos (a small camera badge). Off by default: the plan shows
// devices; switch it on in Layers → Show on plan. The device card always says how many photos a device has.
import { create } from "zustand";

export const usePhotoPins = create<{ visible: boolean; setVisible(v: boolean): void }>((set) => ({
  visible: false,
  setVisible: (visible) => set({ visible }),
}));
