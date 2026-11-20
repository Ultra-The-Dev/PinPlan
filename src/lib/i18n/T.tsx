"use client";
// <T>English text</T>: translated text for places that can't call useT(), above all server components and static
// pages (a server component renders English; this client island swaps in the active language after hydration).
import { normalizeKey } from "./core";
import { useT } from "./index";
import type { Vars } from "./types";

/**
 * Children must be one plain string literal (the key; whitespace is collapsed), so scripts/check-i18n.mjs can read
 * it. For placeholders pass `vars`: `<T vars={{ name }}>{"Hi {name}"}</T>`.
 */
export function T({ children, vars }: { children: string; vars?: Vars }) {
  const t = useT();
  return <>{t(normalizeKey(children), vars)}</>;
}

export default T;
