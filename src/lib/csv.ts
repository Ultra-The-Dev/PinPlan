// One CSV cell, safe to open in a spreadsheet. Shared by every CSV export (takeoff, wiring, price list, hours,
// accounting…); kept in its own module so the takeoff code doesn't pull in the documents code to use it.

/**
 * Spreadsheet-safe CSV cell: text starting with = + - @ (or a tab / CR) is prefixed with ' so it is never a formula,
 * unless it is a plain number (-5, -1.25). Numbers stay numbers. Quoted when it holds a quote, comma or line break.
 */
export function csvCell(v: unknown): string {
  const s = v == null ? "" : String(v);
  const safe = /^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** Undo csvCell's ' prefix on a value read back from one of our files (only where csvCell would have added it). */
export const csvUnescape = (s: string) => (/^'[=+\-@\t\r]/.test(s) ? s.slice(1) : s);
