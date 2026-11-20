"use client";
// "?" on the plan: the keyboard shortcuts, and a switch for the single-letter ones (off: only ⌘ / Ctrl keys, Esc,
// arrows and Delete work, so typing into the page never moves the plan by surprise). Remembered on this device.
import { X } from "lucide-react";
import { useEffect, useId, useRef } from "react";
import { msg, useT } from "@/lib/i18n";
import { setLetterShortcuts, useLetterShortcuts } from "@/lib/planOverlays";

const GROUPS: { title: string; keys: [string, string][] }[] = [
  {
    title: msg("Move around"),
    keys: [
      ["+  −", msg("Zoom in / out")],
      ["0", msg("Fit the sheet")],
      ["W", msg("Fit the width")],
      ["1", msg("Actual size")],
      [msg("Arrows"), msg("Pan (Shift: further)")],
      ["[  ]", msg("Previous / next sheet")],
      ["⌘ +  ⌘ −  ⌘ 0", msg("Zoom the plan (when the plan has focus)")],
    ],
  },
  {
    title: msg("Tools"),
    keys: [
      ["E", msg("View / Edit")],
      ["V  Esc", msg("Select, or close what's open")],
      ["M", msg("Measure")],
      ["L", msg("Device labels")],
      ["F", msg("Fit")],
      ["Shift T", msg("Drop a task")],
      ["Enter", msg("Finish a run being drawn")],
      ["Delete", msg("Delete what's selected (Edit)")],
      ["⌘ Z  ⇧⌘ Z", msg("Undo / redo")],
      ["?", msg("This list")],
    ],
  },
];

export default function ShortcutSheet({ onClose }: { onClose: () => void }) {
  const t = useT();
  const letters = useLetterShortcuts();
  const switchId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-slate-900/30 p-3 backdrop-blur-[2px] sm:items-center" onClick={onClose} data-plan-ui>
      <div role="dialog" aria-modal="true" aria-label={t("Keyboard shortcuts")} className="card animate-in flex max-h-[85dvh] w-full max-w-md flex-col shadow-pop" onClick={(e) => e.stopPropagation()} data-testid="shortcut-sheet">
        <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3">
          <h2 className="flex-1 text-base font-semibold">{t("Keyboard shortcuts")}</h2>
          <button ref={closeRef} className="btn btn-sm btn-icon btn-ghost" onClick={onClose} aria-label={t("Close")}>
            <X />
          </button>
        </div>
        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-4 py-3">
          <div className="mb-3 flex items-center gap-3 rounded-xl bg-slate-50 p-3">
            <label htmlFor={switchId} className="min-w-0 flex-1 text-sm">
              <span className="block font-medium text-slate-800">{t("Single-key shortcuts")}</span>
              <span className="block text-xs text-slate-500">{t("Off: only ⌘ / Ctrl keys, Esc, arrows and Delete work.")}</span>
            </label>
            <input id={switchId} type="checkbox" role="switch" className="h-5 w-5 accent-brand-600" checked={letters} onChange={(e) => setLetterShortcuts(e.target.checked)} data-testid="letter-shortcuts" />
          </div>
          {GROUPS.map((g) => (
            <section key={g.title} className="mb-3">
              <h3 className="mb-1 text-xs font-medium text-slate-500">{t(g.title)}</h3>
              <dl className="divide-y divide-slate-100">
                {g.keys.map(([k, what]) => (
                  <div key={k} className="flex items-center gap-3 py-1.5 text-sm">
                    <dt className="w-28 shrink-0">
                      <kbd className="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-700 ring-1 ring-slate-200">{t(k)}</kbd>
                    </dt>
                    <dd className="min-w-0 flex-1 text-slate-700">{t(what)}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
