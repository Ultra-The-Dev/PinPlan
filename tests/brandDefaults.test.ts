import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, FOUNDER_BUSINESS, NEUTRAL_BUSINESS } from "@/lib/catalog";
import { businessDefaults, db, getSettings, saveSettings } from "@/lib/db";

describe("business defaults for customers vs the founder", () => {
  beforeEach(async () => {
    await db().settings.clear();
  });
  it("a fresh install starts blank (no founder details)", async () => {
    const s = await getSettings();
    expect(s.brandDefaults).toBe("neutral");
    expect(s.business.name).toBe("");
    expect(s.business.phone).toBe("");
    expect(s.business.logo).toBe("");
    expect(JSON.stringify(s.business)).not.toContain(FOUNDER_BUSINESS.phone);
  });
  it("an older install (no marker) keeps the founder's details, also after saving", async () => {
    const { brandDefaults: _omit, ...legacy } = { ...DEFAULT_SETTINGS, business: { ...NEUTRAL_BUSINESS } };
    void _omit;
    await db().settings.put(legacy);
    const s = await getSettings();
    expect(s.business.name).toBe(FOUNDER_BUSINESS.name);
    await saveSettings(s);
    expect((await getSettings()).business.phone).toBe(FOUNDER_BUSINESS.phone);
    expect((await db().settings.get("app"))?.brandDefaults).toBe("founder");
  });
  it("a comped (founder) team gets the founder's details on a new device", () => {
    expect(businessDefaults({ brandDefaults: "neutral" }, true)).toBe(FOUNDER_BUSINESS);
    expect(businessDefaults({ brandDefaults: "neutral" }, false)).toBe(NEUTRAL_BUSINESS);
    expect(businessDefaults({}, false)).toBe(FOUNDER_BUSINESS);
  });
});
