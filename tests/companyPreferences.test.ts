import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "@/lib/catalog";
import { TRADE_PACKS } from "@/lib/trades";
import { applyPulled, fingerprint, SECTIONS, planPreferences, sectionAction, sectionFrom, stableJson, unsentSections, withoutCompanySetup, type PrefMark, type PrefPlanInput, type PrefSection } from "@/lib/companyPreferences";
import type { AppSettings } from "@/lib/types";

const T0 = "2026-11-20T10:00:00.000Z";
const T1 = "2026-11-21T10:00:00.000Z";
const T2 = "2026-11-22T10:00:00.000Z";

const base = (): AppSettings => structuredClone({ ...DEFAULT_SETTINGS, updatedAt: T0 });
const withPricing = (s: AppSettings, p: Partial<AppSettings["pricing"]>, at = s.updatedAt): AppSettings => ({ ...s, pricing: { ...s.pricing, ...p }, updatedAt: at });
const tpl = (id: string, name = id) => ({ id, name, items: [{ text: "Check" }], custom: true });

/** The database's merge (merge_preferences in 20261125004000_company_preferences.sql): newer sections win, others stay. */
function serverMerge(old: Record<string, PrefSection>, incoming: Partial<Record<string, PrefSection>>): Record<string, PrefSection> {
  const out = { ...old };
  for (const [k, v] of Object.entries(incoming)) {
    const s = sectionFrom(v);
    if (!s) continue;
    if (!out[k] || Date.parse(s.updatedAt) > Date.parse(out[k].updatedAt)) out[k] = s;
  }
  return out;
}

describe("stableJson / fingerprint", () => {
  it("the same value reads the same whatever the key order", () => {
    expect(stableJson({ b: 1, a: [{ d: 2, c: 3 }] })).toBe(stableJson({ a: [{ c: 3, d: 2 }], b: 1 }));
    expect(stableJson({ a: undefined, b: 1 })).toBe('{"b":1}');
    expect(fingerprint("abc")).toBe(fingerprint("abc"));
    expect(fingerprint("abc")).not.toBe(fingerprint("abd"));
  });
});

describe("sectionAction", () => {
  const local = '{"markupPct":20}';
  const other = '{"markupPct":30}';
  const mark = (v: string, at = T0) => ({ updatedAt: at, hash: fingerprint(v) });
  it("already the same: nothing to do", () => {
    expect(sectionAction({ local, isDefault: false, localSavedAt: T2, mark: null, remote: { local, updatedAt: T0 }, canWrite: true })).toBe("none");
  });
  it("a fresh device never seeds the company's copy with defaults", () => {
    expect(sectionAction({ local, isDefault: true, localSavedAt: T2, mark: null, remote: null, canWrite: true })).toBe("none");
  });
  it("the first device with a real setup sends it", () => {
    expect(sectionAction({ local, isDefault: false, localSavedAt: T0, mark: null, remote: null, canWrite: true })).toBe("push");
  });
  it("technicians never send", () => {
    expect(sectionAction({ local, isDefault: false, localSavedAt: T2, mark: null, remote: null, canWrite: false })).toBe("none");
    expect(sectionAction({ local, isDefault: false, localSavedAt: T2, mark: mark(other), remote: { local: other, updatedAt: T0 }, canWrite: false })).toBe("pull");
  });
  it("first sync on this device: the company's copy wins over whatever was here", () => {
    expect(sectionAction({ local, isDefault: false, localSavedAt: T2, mark: null, remote: { local: other, updatedAt: T0 }, canWrite: true })).toBe("pull");
  });
  it("unchanged here, changed elsewhere: take it", () => {
    expect(sectionAction({ local, isDefault: false, localSavedAt: T2, mark: mark(local), remote: { local: other, updatedAt: T1 }, canWrite: true })).toBe("pull");
  });
  it("changed in both places: the newer change wins", () => {
    expect(sectionAction({ local, isDefault: false, localSavedAt: T2, mark: mark(other), remote: { local: '{"markupPct":40}', updatedAt: T1 }, canWrite: true })).toBe("push");
    expect(sectionAction({ local, isDefault: false, localSavedAt: T0, mark: mark(other), remote: { local: '{"markupPct":40}', updatedAt: T1 }, canWrite: true })).toBe("pull");
  });
  it("changed here since the last sync: send it", () => {
    expect(sectionAction({ local, isDefault: false, localSavedAt: T2, mark: mark(other, T1), remote: { local: other, updatedAt: T1 }, canWrite: true })).toBe("push");
  });
});

describe("planPreferences", () => {
  const input = (p: Partial<PrefPlanInput>): PrefPlanInput => ({ settings: base(), localSavedAt: T0, mark: null, userId: "u1", shared: null, office: null, canWrite: true, trades: true, ...p });

  it("sends a real setup to the right place: prices to the office copy, the rest to the team's", () => {
    let s = withPricing(base(), { markupPct: 25, wireSlackPct: 15 });
    s = { ...s, checklistTemplates: [tpl("t1")], billduDocType: "invoice", business: { ...s.business, tagline: "We wire it" } };
    const plan = planPreferences(input({ settings: s }));
    expect(Object.keys(plan.push.office).sort()).toEqual(["billduDocType", "pricing"]);
    expect(Object.keys(plan.push.shared).sort()).toEqual(["branding", "checklistTemplates", "takeoff"]);
    expect((plan.push.office.pricing!.value as { markupPct: number }).markupPct).toBe(25);
    // Prices never go to the copy technicians read.
    expect(JSON.stringify(plan.push.shared)).not.toContain("markupPct");
    expect(JSON.stringify(plan.push.shared)).not.toContain("wirePrices");
    expect(plan.mark.sections.pricing?.hash).toBe(fingerprint(stableJson(plan.push.office.pricing!.value)));
  });

  it("office sections are left alone when this device doesn't sync them (technicians)", () => {
    const s = withPricing(base(), { markupPct: 25 });
    const plan = planPreferences(input({ settings: s, office: undefined, canWrite: false, shared: { pricing: { value: { markupPct: 1 }, updatedAt: T1 } } }));
    expect(plan.pull).toEqual({});
    expect(plan.push.office).toEqual({});
  });

  it("a team's trades stay on the team row", () => {
    const s = { ...base(), trades: ["electrical" as const] };
    expect(planPreferences(input({ settings: s, trades: false })).push.shared.trades).toBeUndefined();
    expect(planPreferences(input({ settings: s, trades: true })).push.shared.trades?.value).toEqual(["electrical"]);
  });

  it("checks what comes from the cloud", () => {
    const shared = { installPhotoRequired: { value: ["tested", "bogus"], updatedAt: T1 }, checklistTemplates: { value: [{ id: "x" }, tpl("t2")], updatedAt: T1 }, junk: 5 };
    const office = { pricing: { value: { markupPct: "lots", taxPct: 8, laborMode: "weird", wirePrices: { Cat6: 0.5, Bad: -1 } }, updatedAt: T1 } };
    const plan = planPreferences(input({ shared, office }));
    const next = applyPulled(base(), plan.pull);
    expect(next.installPhotoRequired).toEqual(["tested"]);
    expect(next.checklistTemplates?.map((t) => t.id)).toEqual(["t2"]);
    expect(next.pricing.markupPct).toBe(0);
    expect(next.pricing.taxPct).toBe(8);
    expect(next.pricing.laborMode).toBe("combined");
    expect(next.pricing.wirePrices).toEqual({ Cat6: 0.5 });
  });

  it("another account's record of what it synced is ignored", () => {
    const s = withPricing(base(), { markupPct: 25 });
    const mark: PrefMark = { userId: "someone-else", sections: { pricing: { updatedAt: T0, hash: fingerprint(stableJson({})) } } };
    const plan = planPreferences(input({ settings: s, mark, office: { pricing: { value: { markupPct: 10 }, updatedAt: T0 } } }));
    expect(Object.keys(plan.pull)).toEqual(["pricing"]);
    expect(plan.mark.userId).toBe("u1");
  });
});

describe("two devices and the cloud (the database merges section by section)", () => {
  /** One sync of a device against the cloud rows; returns the device's new settings and mark. */
  function sync(dev: { settings: AppSettings; mark: PrefMark | null }, cloud: { shared: Record<string, PrefSection>; office: Record<string, PrefSection> }, opts: { canWrite?: boolean } = {}) {
    const canWrite = opts.canWrite ?? true;
    const plan = planPreferences({ settings: dev.settings, localSavedAt: dev.settings.updatedAt, mark: dev.mark, userId: "u1", shared: cloud.shared, office: canWrite ? cloud.office : undefined, canWrite, trades: true });
    cloud.shared = serverMerge(cloud.shared, plan.push.shared);
    cloud.office = serverMerge(cloud.office, plan.push.office);
    return { settings: applyPulled(dev.settings, plan.pull), mark: plan.mark };
  }

  it("a new device signs in and gets the whole setup back", () => {
    const cloud = { shared: {}, office: {} };
    const office: AppSettings = { ...withPricing(base(), { markupPct: 25, taxPct: 7, wirePrices: { Cat6: 0.42 }, floorHeightFt: 12 }), checklistTemplates: [tpl("t1", "Rough-in")], installPhotoRequired: ["installed" as const, "tested" as const], billduDocType: "order" };
    sync({ settings: office, mark: null }, cloud);
    let phone = { settings: base(), mark: null as PrefMark | null };
    phone = sync(phone, cloud);
    expect(phone.settings.pricing.markupPct).toBe(25);
    expect(phone.settings.pricing.taxPct).toBe(7);
    expect(phone.settings.pricing.wirePrices.Cat6).toBe(0.42);
    expect(phone.settings.pricing.floorHeightFt).toBe(12);
    expect(phone.settings.checklistTemplates?.map((t) => t.name)).toEqual(["Rough-in"]);
    expect(phone.settings.installPhotoRequired).toEqual(["installed", "tested"]);
    expect(phone.settings.billduDocType).toBe("order");
    // Nothing left to do on either side.
    const again = planPreferences({ settings: phone.settings, localSavedAt: phone.settings.updatedAt, mark: phone.mark, userId: "u1", shared: cloud.shared, office: cloud.office, canWrite: true, trades: true });
    expect(again.pull).toEqual({});
    expect(again.push).toEqual({ shared: {}, office: {} });
  });

  it("rollout order: a fresh device that syncs first never wipes the office's real prices", () => {
    const cloud = { shared: {}, office: {} };
    let fresh = { settings: base(), mark: null as PrefMark | null };
    fresh = sync(fresh, cloud);
    expect(cloud.office).toEqual({});
    let real = { settings: withPricing(base(), { markupPct: 30 }), mark: null as PrefMark | null };
    real = sync(real, cloud);
    fresh = sync(fresh, cloud);
    expect(real.settings.pricing.markupPct).toBe(30);
    expect(fresh.settings.pricing.markupPct).toBe(30);
  });

  it("edits to different parts on two devices both survive", () => {
    const cloud = { shared: {}, office: {} };
    let a = { settings: withPricing(base(), { markupPct: 10 }), mark: null as PrefMark | null };
    a = sync(a, cloud);
    let b = { settings: base(), mark: null as PrefMark | null };
    b = sync(b, cloud);
    // A changes the prices, B adds a template (later), with an old copy of the prices.
    a = { ...a, settings: withPricing(a.settings, { markupPct: 20 }, T1) };
    b = { ...b, settings: { ...b.settings, checklistTemplates: [tpl("t9")], updatedAt: T2 } };
    a = sync(a, cloud);
    b = sync(b, cloud);
    a = sync(a, cloud);
    expect(b.settings.pricing.markupPct).toBe(20);
    expect(a.settings.checklistTemplates?.map((t) => t.id)).toEqual(["t9"]);
  });

  it("the same part changed on both: the newer change wins everywhere", () => {
    const cloud = { shared: {}, office: {} };
    let a = { settings: withPricing(base(), { markupPct: 10 }), mark: null as PrefMark | null };
    a = sync(a, cloud);
    let b = { settings: base(), mark: null as PrefMark | null };
    b = sync(b, cloud);
    a = { ...a, settings: withPricing(a.settings, { markupPct: 20 }, T1) };
    b = { ...b, settings: withPricing(b.settings, { markupPct: 50 }, T2) };
    a = sync(a, cloud); // older: goes up first
    b = sync(b, cloud); // newer: replaces it
    a = sync(a, cloud);
    expect(a.settings.pricing.markupPct).toBe(50);
    expect(b.settings.pricing.markupPct).toBe(50);
  });

  it("a technician reads the team's parts but never the prices, and never sends", () => {
    const cloud = { shared: {}, office: {} };
    sync({ settings: { ...withPricing(base(), { markupPct: 25, wireDropFt: 20 }), formTemplates: [], checklistTemplates: [tpl("t1")] }, mark: null }, cloud);
    let tech = { settings: withPricing(base(), { markupPct: 99 }), mark: null as PrefMark | null };
    const before = JSON.stringify(cloud);
    tech = sync(tech, cloud, { canWrite: false });
    expect(JSON.stringify(cloud)).toBe(before);
    expect(tech.settings.checklistTemplates?.map((t) => t.id)).toEqual(["t1"]);
    expect(tech.settings.pricing.wireDropFt).toBe(20);
    expect(tech.settings.pricing.markupPct).toBe(99); // its own copy; prices never come down for a technician
  });
});

describe("withoutCompanySetup", () => {
  it("clears every company part", () => {
    const s: AppSettings = { ...withPricing(base(), { markupPct: 40 }), business: { ...base().business, name: "A", tagline: "x" }, checklistTemplates: [tpl("t")], formTemplates: [], billduDocType: "invoice", trades: ["electrical"], installPhotoRequired: ["tested"] };
    const r = withoutCompanySetup(s);
    expect(r.business.name).toBe("");
    expect(r.pricing.markupPct).toBe(0);
    expect(r.checklistTemplates).toEqual([]);
    expect(r.trades).toBeUndefined();
    expect(r.billduDocType).toBe("estimate");
    expect(r.installPhotoRequired).toBeUndefined();
    expect(r.id).toBe("app");
  });
});

describe("sections", () => {
  it("have the same names and homes as the iPhone app's (PinPlanCore PrefKey)", () => {
    expect(SECTIONS.map((s) => s.key).sort()).toEqual(["billduDocType", "branding", "checklistTemplates", "formTemplates", "installPhotoRequired", "pricing", "takeoff", "trades"]);
    expect(SECTIONS.filter((s) => s.scope === "office").map((s) => s.key).sort()).toEqual(["billduDocType", "pricing"]);
  });
});

describe("audit: clock skew, trade-pack prices, unsent changes", () => {
  const plan = (p: Partial<PrefPlanInput>) => planPreferences({ settings: base(), localSavedAt: T0, mark: null, userId: "u1", shared: {}, office: {}, canWrite: true, trades: true, ...p });

  it("a device whose clock ran ahead doesn't undo a later edit made elsewhere (the company's copy is the one this device last saw)", () => {
    // Device B's clock is a day ahead: its pricing went up dated T2. Device A took it (mark = T2), then the office
    // edits the markup on A, at A's correct time T1 (< T2).
    const cloud = { shared: {} as Record<string, PrefSection>, office: { pricing: { value: { markupPct: 10 }, updatedAt: T2 } } as Record<string, PrefSection> };
    const first = plan({ office: cloud.office });
    let a = applyPulled(base(), first.pull);
    expect(a.pricing.markupPct).toBe(10);
    a = withPricing(a, { markupPct: 35 }, T1);
    const p = plan({ settings: a, localSavedAt: T1, mark: first.mark, office: cloud.office });
    expect(p.pull).toEqual({});
    expect(p.push.office.pricing).toBeTruthy();
    // Dated after the copy it replaces, so the database's merge keeps it.
    cloud.office = serverMerge(cloud.office, p.push.office);
    expect((cloud.office.pricing.value as { markupPct: number }).markupPct).toBe(35);
    // And the next sync on A sees nothing to do.
    const again = plan({ settings: a, localSavedAt: T1, mark: p.mark, office: cloud.office });
    expect(again.pull).toEqual({});
    expect(again.push.office).toEqual({});
  });

  it("a real conflict (changed in both places since this device last synced) is still newest-wins", () => {
    const office = { pricing: { value: { markupPct: 40 }, updatedAt: T2 } };
    const mark: PrefMark = { userId: "u1", sections: { pricing: { updatedAt: T0, hash: fingerprint(stableJson(SECTIONS.find((d) => d.key === "pricing")!.read(base()))) } } };
    const p = plan({ settings: withPricing(base(), { markupPct: 35 }, T1), localSavedAt: T1, mark, office });
    expect(Object.keys(p.pull)).toEqual(["pricing"]);
  });

  it("a fresh device whose team's trades added their starting wire prices doesn't seed the company's prices", () => {
    const pack = TRADE_PACKS.find((t) => t.id === "electrical")!;
    const s = withPricing(base(), { wirePrices: { ...base().pricing.wirePrices, ...pack.wirePrices } });
    expect(plan({ settings: s }).push.office.pricing).toBeUndefined();
    // …but a real price change does go up.
    expect(plan({ settings: withPricing(s, { wirePrices: { ...s.pricing.wirePrices, [pack.wireTypes[0]]: 9.99 } }) }).push.office.pricing).toBeTruthy();
    expect(plan({ settings: withPricing(s, { markupPct: 12 }) }).push.office.pricing).toBeTruthy();
  });

  it("rollout: the office's real prices survive a fresh team device (with pack prices) syncing first", () => {
    const pack = TRADE_PACKS.find((t) => t.id === "fire")!;
    const cloud = { shared: {} as Record<string, PrefSection>, office: {} as Record<string, PrefSection> };
    const fresh = withPricing(base(), { wirePrices: { ...base().pricing.wirePrices, ...pack.wirePrices } });
    const pf = plan({ settings: fresh, localSavedAt: null, office: cloud.office, shared: cloud.shared });
    cloud.office = serverMerge(cloud.office, pf.push.office);
    const real = withPricing(base(), { markupPct: 30, taxPct: 8 });
    const pr = plan({ settings: real, office: cloud.office, shared: cloud.shared });
    expect(pr.pull.pricing).toBeUndefined();
    cloud.office = serverMerge(cloud.office, pr.push.office);
    expect((cloud.office.pricing.value as { markupPct: number }).markupPct).toBe(30);
  });

  it("unsentSections: only sections changed here since this device last synced them", () => {
    const s = withPricing(base(), { markupPct: 20 });
    const synced = plan({ settings: s });
    expect(unsentSections(s, synced.mark, "u1")).toEqual([]);
    const edited = withPricing(s, { markupPct: 22 }, T1);
    expect(unsentSections(edited, synced.mark, "u1")).toEqual(["pricing"]);
    expect(unsentSections(edited, synced.mark, "someone-else")).toEqual([]);
    expect(unsentSections(edited, null, "u1")).toEqual([]);
  });
});
