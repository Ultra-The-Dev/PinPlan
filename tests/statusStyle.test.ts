import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { STATUS_LABEL } from "@/lib/documents";
import { RFI_STATUS_LABEL } from "@/lib/rfis";
import { PROJECT_STATUS_HEX, STATUS_TONE, TONE_CHIP, TONE_HEX, statusChip, statusTone, type StatusTone } from "@/lib/statusStyle";

const css = readFileSync(join(__dirname, "..", "src", "app", "globals.css"), "utf8");
const token = (name: string): string => {
  const m = css.match(new RegExp(`--color-${name}:\\s*(#[0-9a-fA-F]{6})`));
  if (!m) throw new Error(`missing token --color-${name}`);
  return m[1];
};
const lum = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

describe("status tones", () => {
  it("follow the brand rules", () => {
    for (const s of ["approved", "paid", "installed", "answered", "accepted"]) expect(statusTone(s)).toBe("ok");
    for (const s of ["sent", "open", "viewed"]) expect(statusTone(s)).toBe("info");
    for (const s of ["estimate", "partially_paid", "partial", "expired"]) expect(statusTone(s)).toBe("warn");
    for (const s of ["declined", "overdue"]) expect(statusTone(s)).toBe("bad");
    expect(statusTone("draft")).toBe("neutral");
    expect(statusTone("void")).toBe("muted");
  });
  it("cover every document and RFI status", () => {
    for (const s of [...Object.keys(STATUS_LABEL), ...Object.keys(RFI_STATUS_LABEL)]) expect(Object.keys(STATUS_TONE)).toContain(s);
  });
  it("fall back to neutral for unknown statuses (and never hit Object.prototype)", () => {
    expect(statusTone("something_new")).toBe("neutral");
    expect(statusTone("constructor")).toBe("neutral");
    expect(statusChip("toString")).toBe(TONE_CHIP.neutral);
  });
  it("chips use the semantic tokens", () => {
    expect(statusChip("paid")).toContain("bg-ok-50");
    expect(statusChip("void")).toContain("line-through");
  });
});

describe("colour tokens", () => {
  const tones: Exclude<StatusTone, "neutral" | "muted">[] = ["ok", "info", "warn", "bad"];
  it("chip text is AA on its ground and on white", () => {
    for (const t of tones) {
      expect(contrast(token(`${t}-700`), token(`${t}-50`)), t).toBeGreaterThanOrEqual(4.5);
      expect(contrast(token(`${t}-700`), "#ffffff"), t).toBeGreaterThanOrEqual(4.5);
    }
  });
  it("map / dot hex values match the 600 tokens", () => {
    for (const t of tones) expect(TONE_HEX[t].toLowerCase()).toBe(token(`${t}-600`).toLowerCase());
    expect(new Set(Object.values(PROJECT_STATUS_HEX)).size).toBe(3);
  });
  it("text greys and the action blue pass AA", () => {
    for (const ground of ["#ffffff", token("slate-50")]) {
      expect(contrast(token("slate-400"), ground)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(token("slate-500"), ground)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(token("ink"), ground)).toBeGreaterThanOrEqual(12);
    }
    expect(contrast("#ffffff", token("brand-600"))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(token("brand-700"), token("brand-50"))).toBeGreaterThanOrEqual(4.5);
  });
});
