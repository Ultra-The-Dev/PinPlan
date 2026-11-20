// Percentages (tax rates, markup) are kept and shown with at most three decimals, so NYC's 8.875% stays exact
// while float noise (8.875000000001) and over-long input are trimmed.
export const roundPct = (n: number): number => (Number.isFinite(n) ? Math.round(n * 1000) / 1000 : 0);

/** "8.875", "8.5", "8" — never more than three decimals and no trailing zeros. */
export const fmtPct = (n: number | null | undefined): string => String(roundPct(n ?? 0));
