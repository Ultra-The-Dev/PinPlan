"use client";
// The plan's floating toolbar. Icon buttons (labels on wide screens), bigger on touch screens. Editing tools only
// show in edit mode; setting the scale is for the office. Measuring lives in the left rail (Measure, M). On phones
// Home runs and Counts sit under "More" (a bottom sheet), so the row fits.
import { Cable, Hand, Layers, ListChecks, Maximize2, Minimize2, MoreHorizontal, Redo2, Ruler, ScanSearch, Sparkles, Tag, Undo2, X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

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
  /** Null for technicians: the office sets sheet scales. */
  onScale: (() => void) | null;
  layersBadge: string | null;
  layersOpen: boolean;
  onLayers: () => void;
  labels: boolean;
  onLabels: () => void;
  onHomeRuns: () => void;
  countsOpen: boolean;
  onCounts: () => void;
  ai?: { open: boolean; onClick: () => void } | null;
  /** Find similar (edit mode): count repeated symbols like doors and windows (docs/find-similar.md). */
  findSimilar?: { open: boolean; onClick: () => void } | null;
  fullscreen: boolean;
  onFullscreen: () => void;
  /** Phones: less used actions go under More. */
  compact?: boolean;
}

export default function PlanToolbar(p: PlanToolbarProps) {
  const [more, setMore] = useState(false);
  // Esc closes the More sheet (it is a modal, so the plan's own keys are off while it is open).
  useEffect(() => {
    if (!more) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      setMore(false);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [more]);
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
          {p.onScale && (
            <>
              {sep}
              <B wide={p.wideLabels} on={p.tool === "calibrate"} warn={!p.scaleSet} title="Set the sheet scale" label={p.scaleSet ? "Scale" : "Set scale"} onClick={p.onScale}>
                <Ruler />
              </B>
            </>
          )}
        </>
      )}
      <B wide={p.wideLabels} on={p.layersOpen} title="Layers & filters" label="Layers" onClick={p.onLayers} badge={p.layersBadge} testId="layers-button">
        <Layers />
      </B>
      <B wide={p.wideLabels} on={p.labels} title="Show device labels (L)" label="Labels" onClick={p.onLabels}>
        <Tag />
      </B>
      {!p.compact && (
        <>
          {p.editing && (
            <B wide={p.wideLabels} title="Draw home runs from every device on this sheet to its closet" label="Home runs" onClick={p.onHomeRuns}>
              <Cable />
            </B>
          )}
          {sep}
          <B wide={p.wideLabels} on={p.countsOpen} title="Floor counts" label="Counts" onClick={p.onCounts}>
            <ListChecks />
          </B>
        </>
      )}
      {p.findSimilar && !p.compact && (
        <B wide={p.wideLabels} on={p.findSimilar.open} title="Find similar: tap a door, window or any symbol to find the others like it" label="Find similar" onClick={p.findSimilar.onClick} testId="find-similar-button">
          <ScanSearch />
        </B>
      )}
      {p.ai && (
        <B wide={p.wideLabels} on={p.ai.open} title="AI scan assist" label="AI scan" onClick={p.ai.onClick}>
          <Sparkles />
        </B>
      )}
      <B wide={p.wideLabels} on={p.fullscreen} title={p.fullscreen ? "Exit full screen" : "Full screen"} onClick={p.onFullscreen} testId="fullscreen-button">
        {p.fullscreen ? <Minimize2 /> : <Maximize2 />}
      </B>
      {p.compact && (
        <B wide={false} on={more || p.countsOpen} title="More" onClick={() => setMore(true)} testId="plan-more">
          <MoreHorizontal />
        </B>
      )}
      {more &&
        createPortal(
          <div className="fixed inset-0 z-[65] flex items-end bg-slate-900/20" onClick={() => setMore(false)} data-plan-ui>
            <div role="dialog" aria-modal="true" aria-label="More plan tools" className="animate-in w-full rounded-t-2xl bg-white p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] shadow-pop" onClick={(e) => e.stopPropagation()} data-testid="plan-more-sheet">
              <div className="flex items-center px-2 pt-1 pb-2">
                <h2 className="flex-1 text-sm font-semibold text-slate-900">More</h2>
                <button className="btn btn-sm btn-icon btn-ghost" onClick={() => setMore(false)} aria-label="Close">
                  <X />
                </button>
              </div>
              <MenuItem
                icon={<ListChecks />}
                label="Floor counts"
                on={p.countsOpen}
                onClick={() => {
                  setMore(false);
                  p.onCounts();
                }}
              />
              {p.findSimilar && (
                <MenuItem
                  icon={<ScanSearch />}
                  label="Find similar (doors, windows…)"
                  on={p.findSimilar.open}
                  onClick={() => {
                    setMore(false);
                    p.findSimilar!.onClick();
                  }}
                />
              )}
              {p.editing && (
                <MenuItem
                  icon={<Cable />}
                  label="Draw home runs to the closet"
                  onClick={() => {
                    setMore(false);
                    p.onHomeRuns();
                  }}
                />
              )}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}

function MenuItem({ icon, label, on, onClick }: { icon: ReactNode; label: string; on?: boolean; onClick: () => void }) {
  return (
    <button className={`flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-left text-sm font-medium [&>svg]:h-5 [&>svg]:w-5 ${on ? "bg-brand-50 text-brand-700" : "text-slate-700 hover:bg-slate-50"}`} onClick={onClick} aria-pressed={on}>
      {icon}
      {label}
    </button>
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
