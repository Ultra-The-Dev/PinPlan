// The personal trial lookup (solo_billing) is tried again after a failure, instead of waiting for a reload.
import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.hoisted(() => ({
  calls: 0,
  answer: [] as ({ data: unknown; error: null } | { data: null; error: { code?: string; message: string } } | "throw")[],
}));

vi.mock("@/lib/supabase", () => ({
  supabaseConfigured: true,
  PLANS_BUCKET: "plans",
  getSupabase: () => ({
    rpc: async () => {
      rpc.calls += 1;
      const a = rpc.answer.shift() ?? { data: null, error: null };
      if (a === "throw") throw new TypeError("Failed to fetch");
      return a;
    },
  }),
}));

import { __resetSoloBillingForTests, checkSoloBilling, SOLO_RETRY_MS, useSoloBilling } from "@/lib/canEdit";
import type { TeamState } from "@/lib/team";

const solo: TeamState = { ready: true, userId: "u1", team: null, role: null, members: [], billing: null, needsMigration: false, error: null };
const settle = () => new Promise((r) => setTimeout(r, 0));
const ended = { trial_ends_at: "2026-11-01T00:00:00Z", enforce: true };

beforeEach(() => {
  rpc.calls = 0;
  rpc.answer = [];
  __resetSoloBillingForTests();
});

describe("personal trial lookup", () => {
  it("tries again after a failed lookup, not on every team change", async () => {
    const t0 = Date.now();
    rpc.answer = ["throw", { data: ended, error: null }];
    checkSoloBilling(solo, { now: t0 });
    await settle();
    expect(rpc.calls).toBe(1);
    expect(useSoloBilling.getState()).toMatchObject({ userId: "u1", solo: null });
    // A burst of team updates right after doesn't hammer the server...
    checkSoloBilling(solo, { now: Date.now() + 1000 });
    await settle();
    expect(rpc.calls).toBe(1);
    // ...but a later one (or the next sync) tries again, and the answer sticks.
    checkSoloBilling(solo, { now: Date.now() + SOLO_RETRY_MS + 1 });
    await settle();
    expect(rpc.calls).toBe(2);
    expect(useSoloBilling.getState().solo).toMatchObject({ enforce: true });
    checkSoloBilling(solo, { now: Date.now() + 10 * SOLO_RETRY_MS });
    await settle();
    expect(rpc.calls).toBe(2);
  });

  it("reconnecting retries straight away", async () => {
    rpc.answer = [{ data: null, error: { message: "upstream timeout" } }, { data: ended, error: null }];
    checkSoloBilling(solo);
    await settle();
    expect(rpc.calls).toBe(1);
    checkSoloBilling(solo, { force: true });
    await settle();
    expect(rpc.calls).toBe(2);
    expect(useSoloBilling.getState().solo).not.toBeNull();
  });

  it("a database without the function counts as answered (never locks, no retries)", async () => {
    rpc.answer = [{ data: null, error: { code: "PGRST202", message: "Could not find the function public.solo_billing" } }];
    checkSoloBilling(solo);
    await settle();
    checkSoloBilling(solo, { force: true });
    await settle();
    expect(rpc.calls).toBe(1);
    expect(useSoloBilling.getState().solo).toBeNull();
  });

  it("isn't looked up on a team, or before the team has loaded", async () => {
    checkSoloBilling({ ...solo, ready: false });
    checkSoloBilling({ ...solo, team: { id: "t1", name: "Co", ownerId: "u1" } });
    checkSoloBilling({ ...solo, needsMigration: true });
    await settle();
    expect(rpc.calls).toBe(0);
  });
});
