"use client";
// The measure toolbar: closed, a "Measure" button under the sheet title; open, a strip with Length / Run / Area, the
// group label (with recent labels), colour, show/hide and the totals panel.
import { Eye, EyeOff, ListOrdered, Pentagon, Ruler, Spline, Tag, X } from "lucide-react";
import { useId, useState } from "react";
import { KIND_NAMES } from "@/lib/measure";
import type { MeasurementKind } from "@/lib/types";
import { MEASURE_COLORS, useMeasureUi } from "./measureUi";

const KIND_ICONS: Record<MeasurementKind, typeof Ruler> = { length: Ruler, polyline: Spline, area: Pentagon };
const KINDS: MeasurementKind[] = ["length", "polyline", "area"];
const KIND_HINTS: Record<MeasurementKind, string> = { length: "Straight length: tap two points", polyline: "Run: tap each bend, double-tap or Done to finish", area: "Area: tap each corner, tap the first one to close" };

const shell = "pointer-events-auto absolute top-[60px] left-2 z-[13] sm:top-[68px] sm:left-3";
const glass = "rounded-xl bg-white/95 shadow-pop ring-1 ring-black/5 backdrop-blur-md";

export default function MeasureToolbar({ count, recent, hidden, colorFor }: { count: number; recent: string[]; hidden?: boolean; colorFor: (label: string) => string | null }) {
  const ui = useMeasureUi();
  const listId = useId();
  const [colors, setColors] = useState(false);

  if (!ui.active) {
    if (hidden) return null;
    return (
      <div className={`${shell} flex gap-1.5`} data-plan-ui>
        <button
          className={`${glass} flex h-11 items-center gap-2 px-3 text-sm font-semibold text-slate-700 hover:text-slate-900`}
          onClick={() => ui.setActive(true)}
          title="Measure and save lengths, runs and areas"
          aria-label="Measure takeoff"
          data-testid="measure-open"
        >
          <Ruler className="h-4 w-4 text-brand-600" />
          <span className="hidden sm:inline">Measure</span>
          {count > 0 && <span className="rounded-full bg-slate-100 px-1.5 text-[11px] font-semibold text-slate-600 tabular-nums">{count}</span>}
        </button>
        {count > 0 && (
          <>
            <button className={`${glass} flex h-11 w-11 items-center justify-center text-slate-600 hover:text-slate-900`} onClick={() => ui.setVisible(!ui.visible)} title={ui.visible ? "Hide measurements" : "Show measurements"} aria-label={ui.visible ? "Hide measurements" : "Show measurements"} aria-pressed={!ui.visible}>
              {ui.visible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
            </button>
            <button className={`${glass} flex h-11 w-11 items-center justify-center ${ui.panelOpen ? "text-brand-700" : "text-slate-600 hover:text-slate-900"}`} onClick={() => ui.setPanelOpen(!ui.panelOpen)} title="Measurement totals" aria-label="Measurement totals" aria-expanded={ui.panelOpen} data-testid="measure-panel-toggle">
              <ListOrdered className="h-4 w-4" />
            </button>
          </>
        )}
      </div>
    );
  }

  return (
    <div className={`${shell} right-2 sm:right-auto`} data-plan-ui data-testid="measure-toolbar">
      <div className={`${glass} flex max-w-full flex-wrap items-center gap-1 p-1 sm:flex-nowrap`}>
        <div className="flex shrink-0 rounded-lg bg-slate-100 p-0.5" role="radiogroup" aria-label="Measure">
          {KINDS.map((k) => {
            const Icon = KIND_ICONS[k];
            const on = ui.kind === k;
            return (
              <button
                key={k}
                role="radio"
                aria-checked={on}
                className={`flex h-9 items-center gap-1.5 rounded-md px-2.5 text-[13px] font-semibold transition ${on ? "bg-white text-brand-700 shadow-sm" : "text-slate-600 hover:text-slate-900"}`}
                onClick={() => ui.setKind(k)}
                title={KIND_HINTS[k]}
                data-testid={`measure-kind-${k}`}
              >
                <Icon className="h-4 w-4" />
                <span className="hidden sm:inline">{KIND_NAMES[k]}</span>
              </button>
            );
          })}
        </div>
        <label className="relative order-last flex h-10 w-full items-center sm:order-none sm:w-auto sm:shrink-0">
          <Tag className="pointer-events-none absolute left-2.5 h-3.5 w-3.5 text-slate-400" />
          <input
            className="input h-10 w-full pl-7 text-[13px] sm:w-40"
            placeholder="Group, e.g. 3/4″ EMT"
            value={ui.label}
            list={listId}
            onChange={(e) => {
              ui.setLabel(e.target.value);
              // Picking an existing group keeps its colour.
              const c = colorFor(e.target.value);
              if (c) ui.setColor(c);
            }}
            aria-label="Group label"
            enterKeyHint="done"
            data-testid="measure-label"
          />
          <datalist id={listId}>
            {recent.map((l) => (
              <option key={l} value={l} />
            ))}
          </datalist>
        </label>
        <div className="relative shrink-0">
          <button className="flex h-10 w-10 items-center justify-center rounded-lg hover:bg-slate-100" onClick={() => setColors((o) => !o)} aria-label="Colour" aria-expanded={colors} title="Colour">
            <span className="h-5 w-5 rounded-full ring-2 ring-white" style={{ background: ui.color, boxShadow: `0 0 0 1px ${ui.color}` }} />
          </button>
        </div>
        <button className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100" onClick={() => ui.setVisible(!ui.visible)} title={ui.visible ? "Hide saved measurements" : "Show saved measurements"} aria-label={ui.visible ? "Hide saved measurements" : "Show saved measurements"} aria-pressed={!ui.visible}>
          {ui.visible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
        </button>
        <button className={`flex h-10 shrink-0 items-center gap-1 rounded-lg px-2.5 text-[13px] font-semibold ${ui.panelOpen ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:bg-slate-100"}`} onClick={() => ui.setPanelOpen(!ui.panelOpen)} title="Totals" aria-label="Measurement totals" aria-expanded={ui.panelOpen} data-testid="measure-panel-toggle">
          <ListOrdered className="h-4 w-4" />
          {count > 0 && <span className="tabular-nums">{count}</span>}
        </button>
        <span className="flex-1 sm:hidden" />
        <span className="mx-0.5 hidden h-6 w-px shrink-0 bg-slate-200 sm:block" />
        <button className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100" onClick={() => ui.setActive(false)} title="Done measuring (Esc)" aria-label="Done measuring" data-testid="measure-close">
          <X className="h-4 w-4" />
        </button>
      </div>
      {colors && (
        <div className={`${glass} animate-in mt-1.5 flex w-max gap-1.5 p-1.5`} role="radiogroup" aria-label="Colour">
          {MEASURE_COLORS.map((c) => (
            <button
              key={c}
              role="radio"
              aria-checked={ui.color === c}
              aria-label={`Colour ${c}`}
              className={`flex h-9 w-9 items-center justify-center rounded-full ${ui.color === c ? "ring-2 ring-slate-900/70" : ""}`}
              onClick={() => {
                ui.setColor(c);
                setColors(false);
              }}
            >
              <span className="h-6 w-6 rounded-full" style={{ background: c }} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
