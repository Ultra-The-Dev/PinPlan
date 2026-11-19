"use client";
// Plan hyperlinks on every plan view, through the viewer's overlay registry (src/lib/planOverlays.ts): the boxes
// (Konva), the controls (HTML) and taps that follow a link. Imported once for its side effect by PlanEditor.
import { registerPlanOverlay, type PlanOverlay } from "@/lib/planOverlays";
import { linkAt } from "@/lib/sheetIndex";
import { useSheetLinks, visibleLinks } from "@/lib/sheetLinks";
import { followLink } from "./follow";
import LinksControls from "./LinksControls";
import LinksLayer from "./LinksLayer";

/** Extra reach around small link boxes, in screen px (a fingertip). */
const TAP_TOLERANCE = { touch: 14, mouse: 4 };

export const sheetLinksOverlay: PlanOverlay = {
  id: "sheet-links",
  order: 60,
  konva: (ctx) => <LinksLayer sheet={ctx.sheet} />,
  html: (ctx) => <LinksControls ctx={ctx} />,
  onTap(e, ctx) {
    const s = useSheetLinks.getState();
    // Devices win over links under them; tools that place things (edit mode) aren't interrupted.
    if (s.drawing || e.hit || (ctx.editing && ctx.tool.kind !== "select")) return false;
    const links = visibleLinks(
      s.links.filter((l) => l.projectId === ctx.sheet.projectId),
      ctx.sheet.id,
      s,
    );
    if (!links.length) return false;
    const px = (e.pointerType === "touch" || e.pointerType === "pen" ? TAP_TOLERANCE.touch : TAP_TOLERANCE.mouse) / ctx.viewport.transform.scale;
    const hit = linkAt(links, e.rel, { x: px / ctx.sheet.width, y: px / ctx.sheet.height });
    if (!hit) return false;
    followLink(hit, e.pointerType === "touch" || e.pointerType === "pen");
    return true;
  },
};

registerPlanOverlay(sheetLinksOverlay);
