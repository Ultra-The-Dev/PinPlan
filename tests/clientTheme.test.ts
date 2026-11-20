import { describe, expect, it } from "vitest";
import { CLIENT_INK, CLIENT_PAPER, CLIENT_WHITE, clientTheme, clientThemeVars, contrast, ensureContrast, luminance, mix, onColor, parseHex } from "@/lib/clientTheme";
import { DOC_DEFAULT_ACCENT, DOC_DEFAULT_BRAND } from "@/lib/brandDefaults";

// Colours companies really pick: the default ink, navy, a bright green, a neon green, yellow, sky blue, a mid grey,
// red, orange, purple, near-white and near-black, plus junk that must fall back to the default.
const BRANDS = [
  DOC_DEFAULT_BRAND,
  "#0f2340",
  "#16a34a",
  "#13e57c",
  "#facc15",
  "#fde68a",
  "#38bdf8",
  "#808080",
  "#e11d48",
  "#f97316",
  "#7c3aed",
  "#fafafa",
  "#000",
  "#ffffff",
  "",
  "not a colour",
];

describe("colour maths", () => {
  it("parses short and long hex, ignores alpha, rejects junk", () => {
    expect(parseHex("#fff")).toEqual([255, 255, 255]);
    expect(parseHex("#0F2340")).toEqual([15, 35, 64]);
    expect(parseHex("#0F234080")).toEqual([15, 35, 64]);
    expect(parseHex("blue")).toBeNull();
    expect(parseHex("#12345")).toBeNull();
  });
  it("matches the WCAG reference values", () => {
    expect(luminance("#000")).toBe(0);
    expect(luminance("#fff")).toBeCloseTo(1, 5);
    expect(contrast("#000", "#fff")).toBeCloseTo(21, 3);
    expect(contrast("#0B6FE0", "#fff")).toBeCloseTo(4.8, 1);
    expect(contrast("#777777", "#fff")).toBeCloseTo(4.48, 2);
  });
  it("mixes in sRGB", () => {
    expect(mix("#000000", "#FFFFFF", 0.5)).toBe("#808080");
    expect(mix("#123456", "#FFFFFF", 0)).toBe("#123456");
  });
  it("nudges a colour until it reaches the ratio, and leaves it alone when it already does", () => {
    expect(ensureContrast("#0F2340", "#FFFFFF", 4.5)).toBe("#0F2340");
    const fixed = ensureContrast("#FACC15", "#FFFFFF", 4.5);
    expect(contrast(fixed, "#FFFFFF")).toBeGreaterThanOrEqual(4.5);
  });
});

describe("text on any brand colour", () => {
  it.each(BRANDS)("%s: band text and secondary text reach AA", (c) => {
    const s = onColor(c || DOC_DEFAULT_BRAND);
    expect(contrast(s.text, s.bg)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(s.muted, s.bg)).toBeGreaterThanOrEqual(4.5);
  });
  it("keeps the brand colour when it already works, white text on dark", () => {
    expect(onColor("#0F2340")).toMatchObject({ bg: "#0F2340", text: CLIENT_WHITE });
  });
  it("pale colours keep their colour and take ink text", () => {
    expect(onColor("#FACC15")).toMatchObject({ bg: "#FACC15", text: CLIENT_INK });
    expect(onColor("#38BDF8").text).toBe(CLIENT_INK);
  });
  it("a saturated green is deepened a little for white text instead of ink on green", () => {
    const g = onColor("#16A34A");
    expect(g.text).toBe(CLIENT_WHITE);
    expect(g.bg).not.toBe("#16A34A");
    expect(contrast(g.bg, "#16A34A")).toBeLessThan(1.8);
  });
});

describe("clientTheme", () => {
  it.each(BRANDS.flatMap((b) => [[b, ""], [b, DOC_DEFAULT_ACCENT], [b, "#fde68a"], [b, "#16a34a"], [b, "#13e57c"]]))("brand %s accent %s: every pairing is readable", (b, a) => {
    const t = clientTheme(b, a);
    expect(contrast(t.onBand, t.band)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(t.onBandMuted, t.band)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(t.brandInk, CLIENT_WHITE)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(t.brandInk, CLIENT_PAPER)).toBeGreaterThanOrEqual(4.2);
    expect(contrast(t.onAction, t.action)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(t.onAction, t.actionHover)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(t.actionEdge, CLIENT_WHITE)).toBeGreaterThanOrEqual(3);
    expect(contrast(t.focus, CLIENT_WHITE)).toBeGreaterThanOrEqual(3);
    expect(contrast(CLIENT_INK, t.brandTint)).toBeGreaterThanOrEqual(4.5);
  });
  it("defaults to Blueprint Ink: ink band with white text, action-blue button", () => {
    const t = clientTheme(null, null);
    expect(t.band).toBe(DOC_DEFAULT_BRAND);
    expect(t.onBand).toBe(CLIENT_WHITE);
    expect(t.action).toBe(DOC_DEFAULT_ACCENT.toUpperCase());
    expect(t.onAction).toBe(CLIENT_WHITE);
  });
  it("uses the company's accent for the button", () => {
    expect(clientTheme("#0f2340", "#7c3aed").action).toBe("#7C3AED");
  });
  it("a pale accent on a white page gives way to the brand colour", () => {
    expect(clientTheme("#0f2340", "#fde68a").action).toBe("#0F2340");
  });
  it("exposes CSS variables", () => {
    expect(Object.keys(clientThemeVars(clientTheme(null, null)))).toContain("--cp-band");
  });
});
