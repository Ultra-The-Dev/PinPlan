"use client";
// Find similar as a plan overlay (src/lib/planOverlays.ts, docs/find-similar.md): ghost pins and the picked box
// (Konva), the card in the status slot (HTML), taps and box drags while picking. Edit mode only. Opened from the plan
// toolbar; it owns plan taps like Measure or Markups do (claimPlanInput("find-similar")), so starting another tool
// closes it (its suggestions stay until cleared or the plan changes).
import { createElement } from "react";
import { registerPlanInput, registerPlanOverlay } from "@/lib/planOverlays";
import FindSimilarLayer from "./FindSimilarLayer";
import FindSimilarPanel from "./FindSimilarPanel";
import { findCapturing, onFindDragEnd, onFindDragMove, onFindDragStart, onFindTap } from "./findSimilarInput";
import { useFindSimilar } from "./findSimilarStore";

registerPlanOverlay({
  id: "find-similar",
  order: 230,
  enabled: (ctx) => ctx.editing,
  konva: (ctx) => createElement(FindSimilarLayer, { sheet: ctx.sheet, viewport: ctx.viewport }),
  html: (ctx) => createElement(FindSimilarPanel, { sheet: ctx.sheet, viewport: ctx.viewport }),
  onTap: onFindTap,
  onDragStart: onFindDragStart,
  onDragMove: onFindDragMove,
  onDragEnd: onFindDragEnd,
  capturing: findCapturing,
});

registerPlanInput("find-similar", () => {
  if (useFindSimilar.getState().open) useFindSimilar.getState().setOpen(false);
});
