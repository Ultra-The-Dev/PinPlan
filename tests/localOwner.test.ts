import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { db, put } from "@/lib/db";
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
