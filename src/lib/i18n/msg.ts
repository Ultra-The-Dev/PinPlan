/**
 * Mark English text that is translated later, where it is shown: `const NAV = [{ label: msg("Pricing") }]` then
 * `t(n.label)` or `<T>{n.label}</T>`. Returns the text unchanged; it exists so scripts/check-i18n.mjs finds the key.
 * Safe to import anywhere, server components included (no React, no state).
 */
export function msg<S extends string>(text: S): S {
  return text;
}
