// Percentages (tax rates, markup) are kept and shown with at most two decimals: 8.875 -> 8.88.
export const roundPct = (n: number): number => (Number.isFinite(n) ? Math.round(n * 100) / 100 : 0);

/** "8.88", "8.5", "8" — never more than two decimals and no trailing zeros. */
export const fmtPct = (n: number | null | undefined): string => String(roundPct(n ?? 0));
