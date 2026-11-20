// Plan overlays that register themselves (side-effect imports only). PlanEditor imports this module once.
import "./PlanRail";
import "./planInputs";
import "@/components/measure/registerOverlay";
import "@/components/progress/registerOverlay";
import "@/components/sheetIndex/registerOverlay";
import "@/components/tasks/registerOverlay";
import "@/components/markups/registerOverlay";
import "../../revisions/revisionOverlay";
