// Default colours for customer-facing documents (quotes, invoices, PDFs, share pages) when a company hasn't set its
// own in Settings → Your business. Blueprint Ink (docs/brand.md): ink navy for headings and rules, action blue for
// accents. Plain constants so PDF renderers, public pages and the server can all import them.

/** Headings, rules and table headers on documents. Ink navy. */
export const DOC_DEFAULT_BRAND = "#0F2340";
/** Buttons, totals and highlights on documents. Action blue (white text on it is 4.8:1). */
export const DOC_DEFAULT_ACCENT = "#0B6FE0";

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

/** True for a CSS hex colour (#rgb, #rgba, #rrggbb, #rrggbbaa). */
export const isHexColor = (v: unknown): v is string => typeof v === "string" && HEX.test(v.trim());

/** The company's brand colour when it is a valid hex colour, else the default ink. */
export const docBrand = (color?: string | null): string => (isHexColor(color) ? color.trim() : DOC_DEFAULT_BRAND);

/** The company's accent colour when it is a valid hex colour, else the default action blue. */
export const docAccent = (color?: string | null): string => (isHexColor(color) ? color.trim() : DOC_DEFAULT_ACCENT);
