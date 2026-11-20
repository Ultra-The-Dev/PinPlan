"use client";
// Layers & filters: "Show on plan" switches for what other features draw (measurements, links, markups, task pins,
// progress colours), the company's trade categories plus wiring, closets and labels as layers (with counts on this
// sheet), and filters by device type, status and room. Remembered on this device. Display only.
import { Eye, EyeOff, RotateCcw, X } from "lucide-react";
import { useId } from "react";
import { useMarkups } from "@/components/markups/useMarkups";
import { useMeasureUi } from "@/components/measure/measureUi";
import { useProgressUi } from "@/components/progress/progressStore";
import { useTasks } from "@/components/tasks/taskStore";
import { msg, useT } from "@/lib/i18n";
import { activeFilterCount, type PlanFilters, type PlanStatusFilter } from "@/lib/planFilter";
import { useSheetLinks } from "@/lib/sheetLinks";
import type { DeviceType, Layer } from "@/lib/types";

export interface LayersPanelProps {
  layers: { id: Layer; name: string }[];
  hiddenLayers: Layer[];
  toggleLayer: (l: Layer) => void;
  onlyLayer: (l: Layer | null) => void;
  /** Items per layer on this sheet. */
  layerCounts: Record<string, number>;
  closetCount: number;
  filters: PlanFilters;
  setFilters: (p: Partial<PlanFilters>) => void;
  resetFilters: () => void;
  /** Device types placed on this sheet, with counts. */
  types: { type: DeviceType; count: number; tentative: number }[];
  rooms: string[];
  /** Type of the selected device ("Show only this type"). */
  selectedType: DeviceType | null;
  full: boolean;
  onClose: () => void;
}

export default function LayersPanel(p: LayersPanelProps) {
  const t = useT();
  const f = p.filters;
  const nFilters = activeFilterCount(f);
  const status: { id: PlanStatusFilter; label: string }[] = [
    { id: "all", label: msg("All") },
    { id: "firm", label: msg("Confirmed") },
    { id: "tentative", label: msg("Tentative (?)") },
  ];
  return (
    <>
      <div className="fixed inset-0 z-30" onClick={p.onClose} data-plan-ui />
      <div
        className={`animate-in z-40 flex flex-col bg-white/95 shadow-pop ring-1 ring-black/5 backdrop-blur-md ${
          p.full ? "fixed inset-x-0 bottom-0 max-h-[80dvh] rounded-t-2xl pb-[env(safe-area-inset-bottom)]" : "absolute top-16 right-3 max-h-[calc(100%-5.5rem)] w-80 rounded-xl"
        }`}
        data-plan-ui
        role="dialog"
        aria-label={t("Layers and filters")}
        data-testid="layers-panel"
      >
        <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-2.5">
          <h2 className="flex-1 text-sm font-semibold text-slate-900">{t("Layers & filters")}</h2>
          {(p.hiddenLayers.length > 0 || nFilters > 0 || !f.closets) && (
            <button
              className="btn btn-sm btn-ghost"
              onClick={() => {
                p.onlyLayer(null);
                p.resetFilters();
                p.setFilters({ closets: true });
              }}
            >
              <RotateCcw /> {t("Show all")}
            </button>
          )}
          <button className="btn btn-sm btn-icon btn-ghost" onClick={p.onClose} aria-label={t("Close layers")}>
            <X />
          </button>
        </div>
        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto p-2">
          <ShowOnPlan />

          <section className="mt-3 border-t border-slate-100 pt-2">
            <h3 className="px-2 pt-1 pb-1 text-xs font-medium text-slate-500">{t("Layers")}</h3>
            {p.layers.map((l) => (
              <Row
                key={l.id}
                on={!p.hiddenLayers.includes(l.id)}
                name={t(l.name)}
                count={p.layerCounts[l.id] ?? 0}
                onToggle={() => p.toggleLayer(l.id)}
                onOnly={() => p.onlyLayer(l.id)}
                testId={`layer-${l.id}`}
              />
            ))}
            <Row on={f.closets} name={t("Closets & panels")} count={p.closetCount} onToggle={() => p.setFilters({ closets: !f.closets })} testId="layer-closets" />
            <Row on={f.labels} name={t("Device labels")} onToggle={() => p.setFilters({ labels: !f.labels })} testId="layer-labels" />
          </section>

          <section className="mt-3 border-t border-slate-100 pt-2">
            <h3 className="px-2 pt-1 pb-1.5 text-xs font-medium text-slate-500">{t("Status")}</h3>
            <div className="seg mx-2 flex">
              {status.map((s) => (
                <button key={s.id} className={`tab h-auto min-h-8 flex-1 justify-center px-2 text-center text-xs leading-tight whitespace-normal ${f.status === s.id ? "tab-active" : ""}`} onClick={() => p.setFilters({ status: s.id })} aria-pressed={f.status === s.id}>
                  {t(s.label)}
                </button>
              ))}
            </div>
          </section>

          {p.types.length > 0 && (
            <section className="mt-3 border-t border-slate-100 pt-2">
              <div className="flex items-center px-2 pt-1 pb-1">
                <h3 className="flex-1 text-xs font-medium text-slate-500">{t("Device types on this sheet")}</h3>
                {p.selectedType && f.onlyType !== p.selectedType.id && (
                  <button className="text-[11px] font-medium text-brand-600 hover:underline" onClick={() => p.setFilters({ onlyType: p.selectedType!.id })}>
                    {t("Only selected type")}
                  </button>
                )}
              </div>
              {f.onlyType && (
                <div className="mx-2 mb-1.5 flex items-center gap-2 rounded-lg bg-brand-50 px-2.5 py-1.5 text-xs text-brand-800">
                  <span className="min-w-0 flex-1 truncate">
                    {t("Showing only {name}", { name: p.types.find((x) => x.type.id === f.onlyType)?.type.name ?? p.selectedType?.name ?? t("one type") })}
                  </span>
                  <button className="font-medium underline" onClick={() => p.setFilters({ onlyType: null })}>
                    {t("Clear")}
                  </button>
                </div>
              )}
              {p.types.map(({ type, count, tentative }) => (
                <Row
                  key={type.id}
                  on={!f.hiddenTypes.includes(type.id) && (!f.onlyType || f.onlyType === type.id)}
                  name={type.name}
                  color={type.color}
                  count={tentative ? `${count} (${tentative}?)` : count}
                  onToggle={() =>
                    f.onlyType
                      ? p.setFilters({ onlyType: f.onlyType === type.id ? null : type.id })
                      : p.setFilters({ hiddenTypes: f.hiddenTypes.includes(type.id) ? f.hiddenTypes.filter((x) => x !== type.id) : [...f.hiddenTypes, type.id] })
                  }
                  onOnly={() => p.setFilters({ onlyType: type.id, hiddenTypes: [] })}
                  testId={`type-${type.id}`}
                />
              ))}
            </section>
          )}

          {p.rooms.length > 0 && (
            <section className="mt-3 border-t border-slate-100 pt-2">
              <h3 className="px-2 pt-1 pb-1.5 text-xs font-medium text-slate-500">{t("Rooms")}</h3>
              <div className="flex flex-wrap gap-1.5 px-2 pb-1">
                {p.rooms.map((r) => {
                  const on = f.rooms.includes(r);
                  return (
                    <button
                      key={r}
                      className={`chip h-8 px-2.5 ring-1 ${on ? "bg-ink text-white ring-ink" : "bg-white text-slate-700 ring-slate-200 hover:bg-slate-50"}`}
                      onClick={() => p.setFilters({ rooms: on ? f.rooms.filter((x) => x !== r) : [...f.rooms, r] })}
                      aria-pressed={on}
                    >
                      {r}
                    </button>
                  );
                })}
              </div>
              {f.rooms.length > 0 && <p className="px-2 pt-1 text-[11px] text-slate-500">{f.rooms.length === 1 ? t("Showing devices in this room only.") : t.tn("Showing devices in these {n} room only.", "Showing devices in these {n} rooms only.", f.rooms.length)}</p>}
            </section>
          )}

          <section className="mt-3 border-t border-slate-100 px-2 pt-3 pb-1">
            <label className="flex cursor-pointer items-center gap-2.5 text-sm text-slate-700">
              <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={f.dim} onChange={() => p.setFilters({ dim: !f.dim })} />
              {t("Fade filtered devices instead of hiding them")}
            </label>
            <p className="mt-2 text-[11px] leading-snug text-slate-500">{t("Layers and filters only change what you see. Counts, takeoff and exports always include every device.")}</p>
          </section>
        </div>
      </div>
    </>
  );
}

/** What the plan's other features draw, one switch each (they used to be scattered eye buttons). */
function ShowOnPlan() {
  const t = useT();
  const measure = useMeasureUi((s) => s.visible);
  const links = useSheetLinks((s) => s.visible);
  const auto = useSheetLinks((s) => s.showAuto);
  const markupsHidden = useMarkups((s) => s.allHidden);
  const pins = useTasks((s) => s.showPins);
  const progress = useProgressUi((s) => s.on);
  return (
    <section data-testid="show-on-plan">
      <h3 className="px-2 pt-1 pb-1 text-xs font-medium text-slate-500">{t("Show on plan")}</h3>
      <Switch on={measure} label={t("Measurements")} onChange={(v) => useMeasureUi.getState().setVisible(v)} testId="show-measurements" />
      <Switch on={links} label={t("Links")} onChange={(v) => useSheetLinks.getState().setPrefs({ visible: v })} testId="show-links" />
      {links && <Switch on={auto} label={t("Links found automatically")} sub onChange={(v) => useSheetLinks.getState().setPrefs({ showAuto: v })} testId="show-auto-links" />}
      <Switch on={!markupsHidden} label={t("Markups")} onChange={(v) => useMarkups.getState().setAllHidden(!v)} testId="show-markups" />
      <Switch on={pins} label={t("Task pins")} onChange={(v) => useTasks.getState().set({ showPins: v })} testId="show-task-pins" />
      <Switch on={progress} label={t("Progress colours")} onChange={(v) => useProgressUi.getState().set(v ? { on: true } : { on: false, walk: false })} testId="show-progress" />
    </section>
  );
}

function Switch({ on, label, sub, onChange, testId }: { on: boolean; label: string; sub?: boolean; onChange: (on: boolean) => void; testId?: string }) {
  const id = useId();
  return (
    <div className={`flex min-h-10 items-center gap-2.5 rounded-lg px-2 hover:bg-slate-50 ${sub ? "pl-6" : ""}`}>
      <label htmlFor={id} className={`min-w-0 flex-1 cursor-pointer text-sm leading-snug ${on ? "text-slate-800" : "text-slate-400"}`}>
        {label}
      </label>
      <button
        id={id}
        role="switch"
        aria-checked={on}
        className={`relative h-6 w-10 shrink-0 rounded-full transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 ${on ? "bg-brand-600" : "bg-slate-300"}`}
        onClick={() => onChange(!on)}
        data-testid={testId}
      >
        <span className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform motion-reduce:transition-none ${on ? "translate-x-4" : ""}`} />
      </button>
    </div>
  );
}

function Row(props: { on: boolean; name: string; count?: number | string; color?: string; onToggle: () => void; onOnly?: () => void; testId?: string }) {
  const t = useT();
  return (
    <div className="flex items-center gap-1 rounded-lg pr-1 hover:bg-slate-50">
      <button className="flex min-h-10 min-w-0 flex-1 items-center gap-2.5 px-2 text-left text-sm" onClick={props.onToggle} aria-pressed={props.on} data-testid={props.testId}>
        <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md ${props.on ? "text-slate-700" : "text-slate-300"}`}>{props.on ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}</span>
        {props.color && <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: props.color, opacity: props.on ? 1 : 0.35 }} />}
        <span className={`min-w-0 flex-1 truncate ${props.on ? "text-slate-800" : "text-slate-400 line-through decoration-slate-300"}`}>{props.name}</span>
        {props.count != null && <span className="text-xs text-slate-400 tabular-nums">{props.count}</span>}
      </button>
      {props.onOnly && (
        <button className="rounded-md px-1.5 py-1 text-[11px] font-medium text-brand-600 hover:bg-brand-50" onClick={props.onOnly}>
          {t("Only")}
        </button>
      )}
    </div>
  );
}
