"use client";
// The plan's floating toolbar. Icon buttons (labels on wide screens), bigger on touch screens. Editing tools only
// show in edit mode.
import { Cable, Hand, Layers, ListChecks, Maximize2, Minimize2, Redo2, Ruler, RulerDimensionLine, Sparkles, Tag, Undo2 } from "lucide-react";
import type { ReactNode } from "react";

export interface PlanToolbarProps {
  editing: boolean;
  wideLabels: boolean;
  tool: string;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onSelectTool: () => void;
  scaleSet: boolean;
  onScale: () => void;
  onMeasure: () => void;
  layersBadge: string | null;
  layersOpen: boolean;
  onLayers: () => void;
  labels: boolean;
  onLabels: () => void;
  onHomeRuns: () => void;
  countsOpen: boolean;
  onCounts: () => void;
  ai?: { open: boolean; onClick: () => void } | null;
  fullscreen: boolean;
  onFullscreen: () => void;
}

export default function PlanToolbar(p: PlanToolbarProps) {
  const sep = <span className="mx-0.5 h-5 w-px shrink-0 bg-slate-200" />;
  return (
    <div className="flex h-11 items-center gap-0.5 rounded-xl bg-white/90 p-1 shadow-pop ring-1 ring-black/5 backdrop-blur-md pointer-coarse:h-[52px]" role="toolbar" aria-label="Plan tools" data-plan-ui>
      {p.editing && (
        <>
          <B wide={p.wideLabels} on={p.tool === "select"} title="Select / move (V or Esc)" label="Select" onClick={p.onSelectTool}>
            <Hand />
          </B>
          <B wide={p.wideLabels} title="Undo (⌘Z)" label="Undo" onClick={p.onUndo} disabled={!p.canUndo}>
            <Undo2 />
          </B>
          <B wide={p.wideLabels} title="Redo (⇧⌘Z)" label="Redo" onClick={p.onRedo} disabled={!p.canRedo}>
            <Redo2 />
          </B>
          {sep}
          <B wide={p.wideLabels} on={p.tool === "calibrate"} warn={!p.scaleSet} title="Set the sheet scale" label={p.scaleSet ? "Scale" : "Set scale"} onClick={p.onScale}>
            <Ruler />
          </B>
        </>
      )}
      <B wide={p.wideLabels} on={p.tool === "measure"} title="Measure a distance (M)" label="Measure" onClick={p.onMeasure}>
        <RulerDimensionLine />
      </B>
      <B wide={p.wideLabels} on={p.layersOpen} title="Layers & filters" label="Layers" onClick={p.onLayers} badge={p.layersBadge} testId="layers-button">
        <Layers />
      </B>
      <B wide={p.wideLabels} on={p.labels} title="Show device labels (L)" label="Labels" onClick={p.onLabels}>
        <Tag />
      </B>
      {p.editing && (
        <B wide={p.wideLabels} title="Draw home runs from every device on this sheet to its closet" label="Home runs" onClick={p.onHomeRuns}>
          <Cable />
        </B>
      )}
      {sep}
      <B wide={p.wideLabels} on={p.countsOpen} title="Floor counts" label="Counts" onClick={p.onCounts}>
        <ListChecks />
      </B>
      {p.ai && (
        <B wide={p.wideLabels} on={p.ai.open} title="AI scan assist" label="AI scan" onClick={p.ai.onClick}>
          <Sparkles />
        </B>
      )}
      <B wide={p.wideLabels} on={p.fullscreen} title={p.fullscreen ? "Exit full screen" : "Full screen"} onClick={p.onFullscreen} testId="fullscreen-button">
        {p.fullscreen ? <Minimize2 /> : <Maximize2 />}
      </B>
    </div>
  );
}

function B(props: { wide: boolean; on?: boolean; warn?: boolean; title: string; label?: string; onClick: () => void; disabled?: boolean; children: ReactNode; badge?: string | null; testId?: string }) {
  return (
    <button
      className={`relative flex h-9 min-w-9 shrink-0 items-center justify-center gap-1.5 rounded-lg px-2 text-[13px] font-medium transition pointer-coarse:h-11 pointer-coarse:min-w-11 disabled:opacity-35 ${
        props.on ? "bg-brand-50 text-brand-700 ring-1 ring-brand-200" : props.warn ? "bg-amber-50 text-amber-800 ring-1 ring-amber-200" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
      } [&>svg]:h-4 [&>svg]:w-4`}
      onClick={props.onClick}
      disabled={props.disabled}
      title={props.title}
      aria-label={props.label ?? props.title}
      aria-pressed={props.on}
      data-testid={props.testId}
    >
      {props.children}
      {props.wide && props.label && <span>{props.label}</span>}
      {props.badge && <span className="absolute -top-1 -right-1 rounded-full bg-brand-600 px-1 text-[10px] leading-4 font-semibold text-white tabular-nums">{props.badge}</span>}
    </button>
  );
}
