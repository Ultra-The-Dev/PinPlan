import "fake-indexeddb/auto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { DOC_DEFAULT_ACCENT, DOC_DEFAULT_BRAND, docAccent, docBrand, isHexColor } from "@/lib/brandDefaults";
import { DEFAULT_ESTIMATE_TERMS, DEFAULT_SETTINGS, FOUNDER_BUSINESS, NEUTRAL_BUSINESS } from "@/lib/catalog";
import { businessDefaults, db, getSettings, saveSettings } from "@/lib/db";

// The old hard-coded document colours. Company details themselves are checked by asserting the defaults are blank.
const LEAKS = ["0a1b54", "13e57c"];

describe("business defaults ship no one's details", () => {
  beforeEach(async () => {
    await db().settings.clear();
  });
  it("a fresh install starts blank with the default document colours", async () => {
    const s = await getSettings();
    expect(s.brandDefaults).toBe("neutral");
    expect(s.business.name).toBe("");
    expect(s.business.phone).toBe("");
    expect(s.business.email).toBe("");
    expect(s.business.logo).toBe("");
    expect(s.business.brandColor).toBe(DOC_DEFAULT_BRAND);
    expect(s.business.accentColor).toBe(DOC_DEFAULT_ACCENT);
    expect(s.business.estimateTerms).toBe(DEFAULT_ESTIMATE_TERMS);
  });
  it("an older install (no marker) also falls back to blank details, and keeps its own after saving", async () => {
    const { brandDefaults: _omit, ...legacy } = { ...DEFAULT_SETTINGS, business: { ...NEUTRAL_BUSINESS, name: "Acme Electric" } };
    void _omit;
    await db().settings.put(legacy);
    const s = await getSettings();
    expect(s.business.name).toBe("Acme Electric");
    expect(s.business.phone).toBe("");
    await saveSettings(s);
    expect((await getSettings()).business.name).toBe("Acme Electric");
    expect((await db().settings.get("app"))?.brandDefaults).toBe("founder");
  });
  it("every path gives the same blank defaults", () => {
    expect(businessDefaults({ brandDefaults: "neutral" }, true)).toBe(NEUTRAL_BUSINESS);
    expect(businessDefaults({ brandDefaults: "neutral" }, false)).toBe(NEUTRAL_BUSINESS);
    expect(businessDefaults({}, false)).toBe(NEUTRAL_BUSINESS);
    expect(FOUNDER_BUSINESS).toBe(NEUTRAL_BUSINESS);
  });
  it("the defaults hold no company's details", () => {
    for (const k of ["name", "address", "phone", "email", "website", "tagline", "logo", "serviceArea"] as const) expect(NEUTRAL_BUSINESS[k]).toBe("");
    const text = JSON.stringify({ NEUTRAL_BUSINESS, DEFAULT_SETTINGS }).toLowerCase();
    for (const leak of LEAKS) expect(text).not.toContain(leak);
  });
});

describe("document colour fallbacks", () => {
  it("uses the company's colour when it is a hex colour", () => {
    expect(docBrand("#123456")).toBe("#123456");
    expect(docBrand(" #abc ")).toBe("#abc");
    expect(docAccent("#11223344")).toBe("#11223344");
  });
  it("falls back to Blueprint Ink for blank or invalid colours", () => {
    for (const bad of [undefined, null, "", "red", "#12", "#12345", "url(x)", "#1234567890"]) {
      expect(docBrand(bad)).toBe(DOC_DEFAULT_BRAND);
      expect(docAccent(bad)).toBe(DOC_DEFAULT_ACCENT);
    }
    expect(isHexColor(DOC_DEFAULT_BRAND) && isHexColor(DOC_DEFAULT_ACCENT)).toBe(true);
  });
});

describe("source tree", () => {
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((n) => {
      const p = join(dir, n);
      return statSync(p).isDirectory() ? walk(p) : [p];
    });
  it("has no hard-coded fallback colours from the old defaults", () => {
    const files = walk(join(__dirname, "..", "src")).filter((f) => /\.(tsx?|css)$/.test(f));
    for (const f of files) {
      const text = readFileSync(f, "utf8").toLowerCase();
      for (const leak of LEAKS) expect(text.includes(leak), `${f} contains ${leak}`).toBe(false);
    }
  });
});
