// Settings › Business saves through the company settings (one copy for the whole company), and a technician's
// device never adds price-list items when a trade is switched on.
import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const fake = vi.hoisted(() => ({
  signedIn: true,
  upserts: [] as Record<string, unknown>[],
  fail: null as string | null,
}));

vi.mock("@/lib/supabase", () => {
  const client = {
    auth: { getSession: async () => ({ data: { session: fake.signedIn ? { user: { id: "u1" } } : null } }) },
    rpc: async (name: string) => (name === "my_billing_owner" ? { data: "owner-1", error: null } : { data: null, error: null }),
    from: () => ({
      upsert: async (row: Record<string, unknown>) => {
        if (fake.fail) return { error: { message: fake.fail } };
        fake.upserts.push(row);
        return { error: null };
      },
    }),
  };
  return { supabaseConfigured: true, getSupabase: () => client, PLANS_BUCKET: "plans" };
});

import { saveSettingsAndCompany } from "@/lib/companySettings";
import { db, getCatalog, getSettings } from "@/lib/db";
import { useTeam } from "@/lib/team";
import { addTradePack } from "@/lib/useTrades";

beforeEach(async () => {
  fake.signedIn = true;
  fake.upserts.length = 0;
  fake.fail = null;
  useTeam.setState({ role: "owner", userId: "u1", ready: true });
  await db().delete();
  await db().open();
});

describe("Settings › Business saves through the company settings", () => {
  it("sends the company's details (trimmed) for everyone when they changed", async () => {
    const before = await getSettings();
    const next = { ...before, business: { ...before.business, name: " Acme Low Voltage ", phone: "555-0100", brandColor: "#123456" } };
    const r = await saveSettingsAndCompany(next, before);
    expect(r.cloud).toBe(true);
    expect(fake.upserts).toHaveLength(1);
    expect(fake.upserts[0]).toMatchObject({ owner_id: "owner-1", business_name: "Acme Low Voltage", phone: "555-0100" });
    // This device keeps its colours, and the stored copy is what the form shows next.
    expect(r.settings.business).toMatchObject({ name: "Acme Low Voltage", brandColor: "#123456" });
    expect((await getSettings()).business.name).toBe("Acme Low Voltage");
  });

  it("doesn't touch the company's copy when only this device's settings changed", async () => {
    const before = await getSettings();
    const next = { ...before, business: { ...before.business, brandColor: "#654321" }, pricing: { ...before.pricing, markupPct: 42 } };
    const r = await saveSettingsAndCompany(next, before);
    expect(fake.upserts).toHaveLength(0);
    expect(r.cloud).toBe(false);
    expect((await getSettings()).pricing.markupPct).toBe(42);
  });

  it("keeps the change on this device when the cloud refuses it (the next sync sends it)", async () => {
    fake.fail = "network down";
    const before = await getSettings();
    const r = await saveSettingsAndCompany({ ...before, business: { ...before.business, name: "Acme" } }, before);
    expect(r).toMatchObject({ cloud: false, error: "network down" });
    expect((await getSettings()).business.name).toBe("Acme");
  });

  it("a technician's save stays on the device", async () => {
    useTeam.setState({ role: "tech" });
    const before = await getSettings();
    const r = await saveSettingsAndCompany({ ...before, business: { ...before.business, name: "Acme" } }, before);
    expect(r.cloud).toBe(false);
    expect(fake.upserts).toHaveLength(0);
  });
});

describe("addTradePack", () => {
  it("adds nothing to the price list on a technician's device", async () => {
    useTeam.setState({ role: "tech" });
    const n = (await getCatalog()).length;
    expect(await addTradePack("electrical", { unarchive: true })).toEqual({ types: 0, wirePrices: 0, checklists: 0 });
    expect(await getCatalog()).toHaveLength(n);
    expect(await db().syncQueue.where("table").equals("deviceTypes").count()).toBe(0);
  });

  it("adds the trade's items in the office", async () => {
    const n = (await getCatalog()).length;
    const a = await addTradePack("electrical", { unarchive: true });
    expect(a.types).toBeGreaterThan(0);
    expect((await getCatalog()).length).toBe(n + a.types);
  });
});
