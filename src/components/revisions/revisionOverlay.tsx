"use client";
// Registers the sheet-revisions plan overlay: the current revision chip and Compare, in the plan rail (HTML only; the
// revisions list and the compare view open as full screens). Shown only on sheets with earlier drawings.
import { registerPlanOverlay } from "@/lib/planOverlays";
import { RailSlot } from "../editor/overlays/PlanRail";
import { RevisionToolbar } from "./SheetRevisionControls";

registerPlanOverlay({
  id: "revisions",
  order: 190,
  enabled: (ctx) => !!ctx.sheet.revisions?.length,
  html: (ctx) => (
    <RailSlot order={30}>
      <RevisionToolbar sheet={ctx.sheet} />
    </RailSlot>
  ),
});
