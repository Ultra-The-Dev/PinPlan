import { describe, expect, it } from "vitest";
import { syncBadgeState } from "@/components/SyncBadge";

const ok = { configured: true, signedIn: true, online: true, syncing: false, pending: 0, refused: 0, error: null, readOnly: false, ownerMismatch: null };

describe("syncBadgeState", () => {
  it("is quiet on phones when all is fine", () => {
    expect(syncBadgeState(ok)).toMatchObject({ text: "Synced", quiet: true });
    expect(syncBadgeState({ ...ok, syncing: true })).toMatchObject({ text: "Syncing…", quiet: true });
    expect(syncBadgeState({ ...ok, configured: false })).toMatchObject({ text: "Local only", quiet: true });
  });

  it("says in words what needs attention, short on phones", () => {
    expect(syncBadgeState({ ...ok, online: false, pending: 3 })).toMatchObject({ text: "Offline · 3 pending", short: "Offline", quiet: false });
    expect(syncBadgeState({ ...ok, online: false, configured: false })).toMatchObject({ text: "Offline", short: "Offline", quiet: false });
    expect(syncBadgeState({ ...ok, pending: 2 })).toMatchObject({ text: "2 pending", short: "2 pending", quiet: false });
    expect(syncBadgeState({ ...ok, signedIn: false })).toMatchObject({ short: "Sign in", quiet: false });
    expect(syncBadgeState({ ...ok, refused: 1 })).toMatchObject({ text: "1 change not accepted", short: "Not saved", quiet: false });
    expect(syncBadgeState({ ...ok, error: "boom" })).toMatchObject({ text: "Sync error", quiet: false });
    expect(syncBadgeState({ ...ok, readOnly: true, pending: 4 })).toMatchObject({ text: "Read-only · 4 kept here", short: "Read-only", quiet: false });
    expect(syncBadgeState({ ...ok, ownerMismatch: { email: null } })).toMatchObject({ text: "Sync paused", short: "Paused", quiet: false });
  });

  it("every phone label is a word, never empty", () => {
    for (const s of [ok, { ...ok, online: false }, { ...ok, pending: 1 }, { ...ok, error: "x" }]) expect(syncBadgeState(s).short.length).toBeGreaterThan(2);
  });
});
