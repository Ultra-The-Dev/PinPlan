"use client";
// Registers the sheet-revisions plan overlay: a toolbar chip with the current revision and Compare. No drawing layer.
import { registerPlanOverlay } from "../editor/overlays/registry";
import { RevisionToolbar } from "./SheetRevisionControls";

registerPlanOverlay({ id: "revisions", order: 90, Layer: () => null, Toolbar: RevisionToolbar });
