"use client";
// Plan markups as a plan overlay (order 30: above devices, below task pins).
import { registerPlanOverlay } from "@/components/editor/overlays/registry";
import MarkupLayer from "./MarkupLayer";
import MarkupToolbar from "./MarkupToolbar";
import { useMarkups } from "./useMarkups";

registerPlanOverlay({
  id: "markups",
  order: 30,
  Layer: MarkupLayer,
  Toolbar: MarkupToolbar,
  // While the markup toolbar is open a tap belongs to it (it never places a device).
  onTap: () => useMarkups.getState().open,
});
