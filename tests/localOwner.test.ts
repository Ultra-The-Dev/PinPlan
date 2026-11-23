import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { db, getSettings, put, saveDocumentSettings, saveSettings } from "@/lib/db";
import { adoptLocalData, checkLocalOwner, hasLocalData, heldSignIn, ownerDecision, readLocalOwner, removeLocalData, writeLocalOwner } from "@/lib/localOwner";

// localStorage for the node test environment.
class MemoryStorage {
  private m = new Map<string, string>();
  get length() {
    return this.m.size;
  }
  key(i: number) {
    return [...this.m.keys()][i] ?? null;
  }
  getItem(k: string) {
    return this.m.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, String(v));
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
  clear() {
    this.m.clear();
  }
}
const storage = new MemoryStorage();
// Object.keys(localStorage) lists the stored keys in browsers: mirror that with a proxy.
(globalThis as { localStorage?: unknown }).localStorage = new Proxy(storage, {
  ownKeys: () => [...Array(storage.length).keys()].map((i) => storage.key(i)!),
  getOwnPropertyDescriptor: (_t, k) => (typeof k === "string" && storage.getItem(k) != null ? { enumerable: true, configurable: true, value: storage.getItem(k) } : undefined),
});

const ts = "2026-11-19T10:00:00.000Z";

beforeEach(async () => {
  storage.clear();
  await db().delete();
  await db().open();
});

describe("heldSignIn", () => {
  it("a stored session for the owner (offline, token not refreshed) counts; anyone else's or a broken one doesn't", () => {
    expect(heldSignIn("a")).toBe(false);
    storage.setItem("sb-test-auth-token", JSON.stringify({ access_token: "x", refresh_token: "r", user: { id: "a" } }));
    expect(heldSignIn("a")).toBe(true);
    expect(heldSignIn("b")).toBe(false);
    expect(heldSignIn(null)).toBe(false);
    storage.setItem("sb-test-auth-token", JSON.stringify({ access_token: "x", user: { id: "a" } }));
    expect(heldSignIn("a")).toBe(false);
    storage.setItem("sb-test-auth-token", "not json");
    expect(heldSignIn("a")).toBe(false);
  });
});

describe("ownerDecision", () => {
  it("the same account carries on", () => {
    expect(ownerDecision({ userId: "a", email: null }, "a", true)).toBe("same");
  });
  it("a first sign-in, or a device with nothing left, claims the data", () => {
    expect(ownerDecision(null, "a", true)).toBe("claim");
    expect(ownerDecision({ userId: "a", email: null }, "b", false)).toBe("claim");
  });
  it("another account's jobs on the device: ask first", () => {
    expect(ownerDecision({ userId: "a", email: "a@example.com" }, "b", true)).toBe("ask");
  });
});

describe("checkLocalOwner", () => {
  it("remembers the first account and pauses for a different one", async () => {
    await put("projects", { id: "p1", clientName: "", address: "1 Test St", status: "estimate", billduDocs: [], createdAt: ts, updatedAt: ts });
    expect(await hasLocalData()).toBe(true);
    expect(await checkLocalOwner("a", "a@example.com")).toBe("claim");
    expect(readLocalOwner()).toEqual({ userId: "a", email: "a@example.com" });
    expect(await checkLocalOwner("a", "a@example.com")).toBe("same");
    expect(await checkLocalOwner("b", "b@example.com")).toBe("ask");
    // Asking doesn't hand the device over.
    expect(readLocalOwner()?.userId).toBe("a");
    adoptLocalData("b", "b@example.com");
    expect(await checkLocalOwner("b", "b@example.com")).toBe("same");
  });

  it("an older install with no owner recorded: the account that synced here last owns its jobs", async () => {
    await put("projects", { id: "p1", clientName: "", address: "1 Test St", status: "estimate", billduDocs: [], createdAt: ts, updatedAt: ts });
    storage.setItem("pinplan.sync.pull.a.projects", ts);
    expect(await checkLocalOwner("b", null)).toBe("ask");
    expect(readLocalOwner()).toBeNull();
    // The account that synced here carries on (and is remembered).
    expect(await checkLocalOwner("a", null)).toBe("claim");
    expect(readLocalOwner()?.userId).toBe("a");
  });

  it("an older install found from the team cache", async () => {
    await put("projects", { id: "p1", clientName: "", address: "1 Test St", status: "estimate", billduDocs: [], createdAt: ts, updatedAt: ts });
    storage.setItem("pinplan.team", JSON.stringify({ userId: "a" }));
    expect(await checkLocalOwner("b", null)).toBe("ask");
  });

  it("an empty device goes to whoever signs in", async () => {
    writeLocalOwner({ userId: "a", email: null });
    expect(await hasLocalData()).toBe(false);
    expect(await checkLocalOwner("b", null)).toBe("claim");
    expect(readLocalOwner()?.userId).toBe("b");
  });

  it("removing the data keeps the sign-in and hands the device to the new account", async () => {
    await put("projects", { id: "p1", clientName: "", address: "1 Test St", status: "estimate", billduDocs: [], createdAt: ts, updatedAt: ts });
    writeLocalOwner({ userId: "a", email: null });
    storage.setItem("pinplan.team", "{}");
    storage.setItem("sb-test-auth-token", "session");
    await removeLocalData({ userId: "b", email: null });
    expect(storage.getItem("pinplan.team")).toBeNull();
    expect(storage.getItem("sb-test-auth-token")).toBe("session");
    expect(readLocalOwner()?.userId).toBe("b");
    await db().open();
    expect(await db().projects.count()).toBe(0);
  });
});

describe("another account's company setup on a shared device", () => {
  it("is put back to a fresh install's when the next account claims the device", async () => {
    writeLocalOwner({ userId: "a", email: "a@example.com" });
    const s = await getSettings();
    await saveSettings({ ...s, business: { ...s.business, name: "A Co", phone: "555", tagline: "A's tagline" }, pricing: { ...s.pricing, markupPct: 33 }, billduDocType: "invoice", installPhotoRequired: ["tested"] });
    await db().deviceTypes.put({ ...(await db().deviceTypes.toArray())[0], id: "a-custom", name: "A's own", unitPrice: 999 });
    storage.setItem("pinplan.trades", JSON.stringify(["electrical"]));
    storage.setItem("pinplan.docnum.invoice.0", "42");
    storage.setItem("pinplan.lang", "ru");
    // A signed out keeping data, but had no jobs: B claims the device.
    expect(await checkLocalOwner("b", "b@example.com")).toBe("claim");
    const after = await getSettings();
    expect(after.business.name).toBe("");
    expect(after.business.tagline).toBe("");
    expect(after.pricing.markupPct).toBe(0);
    expect(after.billduDocType).toBe("estimate");
    expect(after.installPhotoRequired).toBeUndefined();
    expect(await db().deviceTypes.get("a-custom")).toBeUndefined();
    expect(await db().deviceTypes.count()).toBeGreaterThan(0);
    expect(storage.getItem("pinplan.trades")).toBeNull();
    expect(storage.getItem("pinplan.docnum.invoice.0")).toBeNull();
    // Device choices stay.
    expect(storage.getItem("pinplan.lang")).toBe("ru");
  });

  it("B, then A, then B again: B's whole company comes down again (its pull watermarks go with the cleared catalog)", async () => {
    writeLocalOwner({ userId: "b", email: null });
    storage.setItem("pinplan.sync.pull.b.device_types", ts);
    storage.setItem("pinplan.sync.pull.a.device_types", ts);
    expect(await checkLocalOwner("a", null)).toBe("claim");
    expect(storage.getItem("pinplan.sync.pull.a.device_types")).toBeNull();
    storage.setItem("pinplan.sync.pull.a.device_types", ts);
    expect(await checkLocalOwner("b", null)).toBe("claim");
    expect(storage.getItem("pinplan.sync.pull.b.device_types")).toBeNull();
  });

  it("the company's copy coming down keeps the settings' save time; a change made here moves it", async () => {
    const s = await getSettings();
    await saveSettings(s);
    const at = (await db().settings.get("app"))!.updatedAt;
    await new Promise((r) => setTimeout(r, 5));
    await saveDocumentSettings({ ...s.documents!, updatedAt: ts }, { fromCloud: true });
    expect((await db().settings.get("app"))!.updatedAt).toBe(at);
    await saveDocumentSettings({ ...s.documents!, updatedAt: ts });
    expect((await db().settings.get("app"))!.updatedAt).not.toBe(at);
  });

  it("the same account signing back in keeps its setup", async () => {
    writeLocalOwner({ userId: "a", email: null });
    const s = await getSettings();
    await saveSettings({ ...s, business: { ...s.business, name: "A Co" } });
    expect(await checkLocalOwner("a", null)).toBe("same");
    expect((await getSettings()).business.name).toBe("A Co");
  });

  it("a first sign-in on a device used without an account keeps what was set up there", async () => {
    const s = await getSettings();
    await saveSettings({ ...s, business: { ...s.business, name: "Local Co" } });
    expect(await checkLocalOwner("a", null)).toBe("claim");
    expect((await getSettings()).business.name).toBe("Local Co");
  });
});
