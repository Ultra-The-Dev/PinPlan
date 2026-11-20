// Colours for the pages a contractor's client opens by link (quote, plan review, document, change order, photo
// report, question). They carry the company's own brand colour and accent from Settings, which can be anything:
// pale yellow, neon green, navy, mid grey. Everything here is derived so text always meets WCAG AA (4.5:1) and the
// action button stands out from the white page (3:1), whatever the company picked. Pure: no DOM, safe on the server.
import { docAccent, docBrand } from "./brandDefaults";

/** Neutrals (Blueprint Ink, docs/brand.md). */
export const CLIENT_INK = "#0F2340";
export const CLIENT_PAPER = "#F2F6FA";
export const CLIENT_WHITE = "#FFFFFF";

type Rgb = [number, number, number];

/** "#abc", "#aabbcc" (alpha ignored) → [r, g, b] 0–255. Anything else → null. */
export function parseHex(hex: string): Rgb | null {
  const h = hex.trim().replace(/^#/, "");
  if (!/^[0-9a-f]+$/i.test(h)) return null;
  const full = h.length === 3 || h.length === 4 ? h.slice(0, 3).split("").map((c) => c + c).join("") : h.length === 6 || h.length === 8 ? h.slice(0, 6) : null;
  if (!full) return null;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) as Rgb;
}

const toHex = (c: Rgb) => `#${c.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0")).join("")}`.toUpperCase();

/** WCAG relative luminance (0 black … 1 white). */
export function luminance(hex: string): number {
  const c = parseHex(hex) ?? [0, 0, 0];
  const lin = c.map((v) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

/** WCAG contrast ratio between two colours (1 … 21). */
export function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}

/** Mix `a` toward `b` by `t` (0 = a, 1 = b), in sRGB. */
export function mix(a: string, b: string, t: number): string {
  const p = parseHex(a) ?? [0, 0, 0];
  const q = parseHex(b) ?? [0, 0, 0];
  return toHex(p.map((v, i) => v + (q[i] - v) * t) as Rgb);
}

/**
 * The colour nearest to `color` (mixed toward `toward`, in small steps) that reaches `ratio` against `against`.
 * Returns `color` itself when it already does.
 */
export function ensureContrast(color: string, against: string, ratio: number, toward = luminance(against) > 0.18 ? "#000000" : "#FFFFFF"): string {
  if (contrast(color, against) >= ratio) return toHex(parseHex(color) ?? [0, 0, 0]);
  for (let t = 0.04; t < 1; t += 0.04) {
    const c = mix(color, toward, t);
    if (contrast(c, against) >= ratio) return c;
  }
  return toward.toUpperCase();
}

/** A surface in `color` with the text that reads on it: white or ink, and the surface nudged darker if neither reaches AA. */
export function onColor(color: string): { bg: string; text: string; muted: string } {
  const bg0 = toHex(parseHex(color) ?? parseHex(CLIENT_INK)!);
  const white = contrast(bg0, CLIENT_WHITE);
  const ink = contrast(bg0, CLIENT_INK);
  let bg = bg0;
  let text: string;
  // Saturated mid-tones (#16A34A green, #E11D48 red) look stronger a shade darker with white text than with ink on
  // them; pale colours (yellow, sky) keep their colour and take ink.
  const darker = ensureContrast(bg0, CLIENT_WHITE, 4.5, "#000000");
  const shift = 1 - Math.sqrt(luminance(darker) / Math.max(luminance(bg0), 1e-6));
  if (white >= 4.5) text = CLIENT_WHITE;
  else if (shift <= 0.35 || ink < 4.5) {
    bg = darker;
    text = CLIENT_WHITE;
  } else text = CLIENT_INK;
  // Secondary text on the surface: part-way to the surface colour, but never below AA.
  let muted = text;
  for (const t of [0.3, 0.22, 0.15]) {
    const m = mix(text, bg, t);
    if (contrast(m, bg) >= 4.5) {
      muted = m;
      break;
    }
  }
  return { bg, text, muted };
}

export interface ClientTheme {
  /** The company's colour as entered (after the default fallback). */
  brand: string;
  /** Cover band: background, text, secondary text. */
  band: string;
  onBand: string;
  onBandMuted: string;
  /** True when the band is light (ink text): it then gets a hairline under it. */
  bandLight: boolean;
  /** The brand colour as text or thin lines on white: ≥ 4.5:1. */
  brandInk: string;
  /** Very light brand tint for selected rows and the signature box. */
  brandTint: string;
  /** Primary button: fill, label, and an edge colour that stands out from white (≥ 3:1). */
  action: string;
  onAction: string;
  actionEdge: string;
  /** Darker action fill for hover / pressed. */
  actionHover: string;
  /** Focus ring (≥ 3:1 on white). */
  focus: string;
}

/**
 * Everything a client page needs from the company's two colours. The brand colour is the cover band; the accent is
 * the primary button (blank → the default action blue, like documents; the brand colour when the accent is too close
 * to white to see on the page).
 */
export function clientTheme(brandColor?: string | null, accentColor?: string | null): ClientTheme {
  const brand = docBrand(brandColor);
  const accent0 = docAccent(accentColor);
  const band = onColor(brand);
  // A pale accent (e.g. #FDE68A) on a white page is a button nobody sees: use the brand instead if it's stronger.
  const accent = contrast(accent0, CLIENT_WHITE) < 1.6 && contrast(brand, CLIENT_WHITE) > contrast(accent0, CLIENT_WHITE) ? brand : accent0;
  const act = onColor(accent);
  const actionEdge = contrast(act.bg, CLIENT_WHITE) >= 3 ? act.bg : ensureContrast(act.bg, CLIENT_WHITE, 3, CLIENT_INK);
  // Pale brands (yellow, sky) turn muddy when darkened to text strength: they use ink for text instead.
  const brandInk = luminance(brand) > 0.4 ? CLIENT_INK : ensureContrast(brand, CLIENT_WHITE, 4.5, CLIENT_INK);
  return {
    brand,
    band: band.bg,
    onBand: band.text,
    onBandMuted: band.muted,
    bandLight: band.text === CLIENT_INK,
    brandInk,
    brandTint: mix(brandInk, CLIENT_WHITE, 0.93),
    action: act.bg,
    onAction: act.text,
    actionEdge,
    actionHover: act.text === CLIENT_WHITE ? mix(act.bg, "#000000", 0.14) : mix(act.bg, CLIENT_INK, 0.1),
    focus: ensureContrast(accent, CLIENT_WHITE, 3, CLIENT_INK),
  };
}

/** The theme as CSS custom properties for the page wrapper (read by src/components/client/client.css). */
export function clientThemeVars(t: ClientTheme): Record<string, string> {
  return {
    "--cp-band": t.band,
    "--cp-on-band": t.onBand,
    "--cp-on-band-muted": t.onBandMuted,
    "--cp-brand-ink": t.brandInk,
    "--cp-brand-tint": t.brandTint,
    "--cp-action": t.action,
    "--cp-on-action": t.onAction,
    "--cp-action-edge": t.actionEdge,
    "--cp-action-hover": t.actionHover,
    "--cp-focus": t.focus,
  };
}
