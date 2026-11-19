"use client";
// Install progress on the plan, through the shared plan overlay registry (src/lib/planOverlays.ts): status rings and
// run lines (Konva layer), the Progress / walk-mode controls (HTML layer) and walk-mode taps. Imported for its side
// effect by src/components/editor/overlays/index.ts.
import { createElement } from "react";
import { registerPlanOverlay } from "@/lib/planOverlays";
import ProgressLayer from "./ProgressLayer";
import ProgressToolbar from "./ProgressToolbar";
import { walkTap } from "./walk";

registerPlanOverlay({
  id: "install-progress",
  order: 20,
  konva: (ctx) => createElement(ProgressLayer, { sheet: ctx.sheet, viewport: ctx.viewport }),
  html: (ctx) => createElement(ProgressToolbar, { sheet: ctx.sheet, viewport: ctx.viewport }),
  onTap: (e, ctx) => walkTap(e, ctx),
});
