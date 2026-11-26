"use client";
// A whole-number stepper for count pins ("Add by count", the device card's Count): − [ 12 ] +, big enough for a
// thumb, and the field takes the keyboard (numeric keypad on phones). 1…9999.
import { Minus, Plus } from "lucide-react";
import { useState } from "react";
import { useT } from "@/lib/i18n";
import { MAX_MARKER_COUNT } from "@/lib/markerCount";

const clamp = (n: number) => Math.min(MAX_MARKER_COUNT, Math.max(1, Math.floor(n)));

export default function CountStepper(props: {
  id?: string;
  value: number;
  /** Called with a whole number 1…9999 when it changes (typed numbers on blur / Enter, the buttons at once). */
  onChange: (n: number) => void;
  /** Also report every keystroke (the add dialog keeps its button up to date). */
  live?: boolean;
  autoFocus?: boolean;
  testId?: string;
}) {
  const t = useT();
  const [text, setText] = useState(String(props.value));
  // A new value from outside (undo, another device selected) replaces what's typed.
  const [seen, setSeen] = useState(props.value);
  if (seen !== props.value) {
    setSeen(props.value);
    setText(String(props.value));
  }
  const commit = (s: string) => {
    const n = Number(s.trim());
    if (!Number.isFinite(n) || n < 1) {
      setText(String(props.value));
      return;
    }
    const v = clamp(n);
    setText(String(v));
    if (v !== props.value) props.onChange(v);
  };
  const step = (d: number) => {
    const cur = Number(text.trim());
    const v = clamp((Number.isFinite(cur) && cur >= 1 ? cur : props.value) + d);
    setText(String(v));
    props.onChange(v);
  };
  return (
    <div className="flex items-center gap-1.5">
      <button type="button" className="btn btn-icon pointer-coarse:h-11 pointer-coarse:w-11" onClick={() => step(-1)} disabled={props.value <= 1 && Number(text) <= 1} aria-label={t("One less")}>
        <Minus />
      </button>
      <input
        id={props.id}
        className="input w-24 text-center text-base font-semibold tabular-nums"
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        autoFocus={props.autoFocus}
        value={text}
        onChange={(e) => {
          const s = e.target.value.replace(/[^0-9]/g, "").slice(0, 4);
          setText(s);
          const n = Number(s);
          if (props.live && s && n >= 1) props.onChange(clamp(n));
        }}
        onFocus={(e) => e.target.select()}
        onBlur={() => commit(text)}
        // Enter takes the number. In a form it then submits as usual ("Add by count" places the pin). Outside one (the
        // device card) a touch screen's keypad closes as before; with a keyboard, focus stays here rather than dropping
        // onto the page.
        onKeyDown={(e) => {
          if (e.key !== "Enter") return;
          commit(text);
          if (!e.currentTarget.form && window.matchMedia?.("(pointer: coarse)").matches) e.currentTarget.blur();
        }}
        data-testid={props.testId}
      />
      <button type="button" className="btn btn-icon pointer-coarse:h-11 pointer-coarse:w-11" onClick={() => step(1)} disabled={props.value >= MAX_MARKER_COUNT} aria-label={t("One more")}>
        <Plus />
      </button>
    </div>
  );
}
