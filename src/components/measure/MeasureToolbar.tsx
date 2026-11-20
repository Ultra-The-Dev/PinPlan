"use client";
// The measure toolbar, in the plan's left rail (under the sheet title): closed, a "Measure" button; open, a strip with
// Length / Run / Area, the group label (with recent labels), colour and the totals panel. On phones the open strip is a
// bottom sheet (in the status slot) and the rail keeps a pressed Measure button. Show / hide lives in Layers
// ("Show on plan").
import { ListOrdered, Pentagon, Ruler, Spline, Tag, X } from "lucide-react";
import { useId, useState } from "react";
import { msg, useT } from "@/lib/i18n";
import { KIND_NAMES } from "@/lib/measure";
import type { MeasurementKind } from "@/lib/types";
import { StatusSlot } from "../editor/overlays/PlanRail";
import { COLOR_NAMES, MEASURE_COLORS, useMeasureUi } from "./measureUi";

const KIND_ICONS: Record<MeasurementKind, typeof Ruler> = { length: Ruler, polyline: Spline, area: Pentagon };
const KINDS: MeasurementKind[] = ["length", "polyline", "area"];
const KIND_HINTS: Record<MeasurementKind, string> = {
  length: msg("Straight length: tap two points"),
  polyline: msg("Run: tap each bend, double-tap or Done to finish"),
  area: msg("Area: tap each corner, tap the first one to close"),
};

const glass = "rounded-xl bg-white/95 shadow-pop ring-1 ring-black/5 backdrop-blur-md";

export default function MeasureToolbar({ count, recent, hidden, phone, colorFor }: { count: number; recent: string[]; hidden?: boolean; phone: boolean; colorFor: (label: string) => string | null }) {
  const t = useT();
  const ui = useMeasureUi();

  if (!ui.active) {
    if (hidden) return null;
    return (
      <div className="pointer-events-auto flex max-w-full gap-1.5" data-plan-ui>
        <button
          className={`${glass} flex h-11 min-w-11 shrink-0 items-center justify-center gap-2 px-3 text-sm font-semibold text-slate-700 hover:text-slate-900`}
          onClick={() => ui.setActive(true)}
          title={t("Measure and save lengths, runs and areas (M)")}
          aria-label={t("Measure takeoff")}
          data-testid="measure-open"
        >
          <Ruler className="h-4 w-4 text-brand-600" />
          <span className="hidden sm:inline">{t("Measure")}</span>
          {count > 0 && <span className="rounded-full bg-slate-100 px-1.5 text-[11px] font-semibold text-slate-600 tabular-nums">{count}</span>}
        </button>
        {count > 0 && (
          <button className={`${glass} flex h-11 w-11 shrink-0 items-center justify-center ${ui.panelOpen ? "text-brand-700" : "text-slate-600 hover:text-slate-900"}`} onClick={() => ui.setPanelOpen(!ui.panelOpen)} title={t("Measurement totals")} aria-label={t("Measurement totals")} aria-expanded={ui.panelOpen} data-testid="measure-panel-toggle">
            <ListOrdered className="h-4 w-4" />
          </button>
        )}
      </div>
    );
  }

  if (phone) {
    // Phones: the rail keeps a pressed Measure button; the strip is a bottom sheet, so it never covers the plan's top.
    return (
      <>
        <button
          className={`${glass} pointer-events-auto flex h-11 shrink-0 items-center gap-2 px-3 text-sm font-semibold text-brand-700`}
          onClick={() => ui.setActive(false)}
          aria-pressed
          aria-label={t("Done measuring")}
          title={t("Done measuring (Esc)")}
          data-testid="measure-open"
          data-plan-ui
        >
          <Ruler className="h-4 w-4" />
          {count > 0 && <span className="rounded-full bg-brand-50 px-1.5 text-[11px] font-semibold tabular-nums">{count}</span>}
        </button>
        <StatusSlot order={90}>
          <div className="pointer-events-auto w-full rounded-t-2xl bg-white/95 p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] shadow-pop ring-1 ring-black/5 backdrop-blur-md" data-plan-ui data-plan-sheet data-testid="measure-toolbar">
            <Strip count={count} recent={recent} colorFor={colorFor} sheet />
          </div>
        </StatusSlot>
      </>
    );
  }

  return (
    <div className="pointer-events-auto max-w-full" data-plan-ui data-testid="measure-toolbar">
      <Strip count={count} recent={recent} colorFor={colorFor} />
    </div>
  );
}

function Strip({ count, recent, colorFor, sheet }: { count: number; recent: string[]; colorFor: (label: string) => string | null; sheet?: boolean }) {
  const t = useT();
  const ui = useMeasureUi();
  const listId = useId();
  const [colors, setColors] = useState(false);
  return (
    <>
      <div className={`${sheet ? "" : glass} flex max-w-full flex-wrap items-center gap-1 p-1 ${sheet ? "" : "sm:flex-nowrap"}`}>
        <div className="flex shrink-0 rounded-lg bg-slate-100 p-0.5" role="radiogroup" aria-label={t("Measure")}>
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
                title={t(KIND_HINTS[k])}
                data-testid={`measure-kind-${k}`}
              >
                <Icon className="h-4 w-4" />
                <span className={sheet ? "" : "hidden sm:inline"}>{t(KIND_NAMES[k])}</span>
              </button>
            );
          })}
        </div>
        <label className={`relative order-last flex h-10 w-full items-center ${sheet ? "" : "sm:order-none sm:w-auto sm:shrink-0"}`}>
          <Tag className="pointer-events-none absolute left-2.5 h-3.5 w-3.5 text-slate-400" />
          <input
            className={`input h-10 w-full pl-7 text-[13px] ${sheet ? "" : "sm:w-40"}`}
            placeholder={t("Group, e.g. 3/4″ EMT")}
            value={ui.label}
            list={listId}
            onChange={(e) => {
              ui.setLabel(e.target.value);
              // Picking an existing group keeps its colour.
              const c = colorFor(e.target.value);
              if (c) ui.setColor(c);
            }}
            aria-label={t("Group label")}
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
          <button className="flex h-10 w-10 items-center justify-center rounded-lg hover:bg-slate-100" onClick={() => setColors((o) => !o)} aria-label={t("Colour")} aria-expanded={colors} title={t("Colour")}>
            <span className="h-5 w-5 rounded-full ring-2 ring-white" style={{ background: ui.color, boxShadow: `0 0 0 1px ${ui.color}` }} />
          </button>
        </div>
        <button className={`flex h-10 shrink-0 items-center gap-1 rounded-lg px-2.5 text-[13px] font-semibold ${ui.panelOpen ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:bg-slate-100"}`} onClick={() => ui.setPanelOpen(!ui.panelOpen)} title={t("Totals")} aria-label={t("Measurement totals")} aria-expanded={ui.panelOpen} data-testid="measure-panel-toggle">
          <ListOrdered className="h-4 w-4" />
          {count > 0 && <span className="tabular-nums">{count}</span>}
        </button>
        <span className={`flex-1 ${sheet ? "" : "sm:hidden"}`} />
        <span className={`mx-0.5 hidden h-6 w-px shrink-0 bg-slate-200 ${sheet ? "" : "sm:block"}`} />
        <button className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100" onClick={() => ui.setActive(false)} title={t("Done measuring (Esc)")} aria-label={t("Done measuring")} data-testid="measure-close">
          <X className="h-4 w-4" />
        </button>
      </div>
      {colors && (
        <div className={`${glass} animate-in mt-1.5 flex w-max max-w-full flex-wrap gap-1.5 p-1.5`} role="radiogroup" aria-label={t("Colour")}>
          {MEASURE_COLORS.map((c) => (
            <button
              key={c}
              role="radio"
              aria-checked={ui.color === c}
              aria-label={t("Colour: {name}", { name: COLOR_NAMES[c] ? t(COLOR_NAMES[c]) : c })}
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
    </>
  );
}
