// The team store while signed out (role kept for the device's owner, closed when unknown), invites made for an
// address, and remembered invites only joining for the email they were started with.
import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";

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
(globalThis as { localStorage?: unknown }).localStorage = new Proxy(storage, {
  ownKeys: () => [...Array(storage.length).keys()].map((i) => storage.key(i)!),
  getOwnPropertyDescriptor: (_t, k) => (typeof k === "string" && storage.getItem(k) != null ? { enumerable: true, configurable: true, value: storage.getItem(k) } : undefined),
});

const sb = vi.hoisted(() => ({
  session: null as { user: { id: string; email: string } } | null,
  rpc: [] as { fn: string; args: unknown }[],
  inserts: [] as { table: string; row: Record<string, unknown> }[],
}));
vi.mock("@/lib/supabase", () => {
  const client = {
    auth: { getSession: async () => ({ data: { session: sb.session } }) },
    rpc: async (fn: string, args: unknown) => {
      sb.rpc.push({ fn, args });
      if (fn === "accept_team_invite") return { data: { team: "Acme", role: "tech" }, error: null };
      return { data: null, error: null };
    },
    from: (table: string) => {
      const q = {
        select: () => q,
        eq: () => q,
        order: () => q,
        maybeSingle: async () => ({ data: null, error: null }),
        insert: async (row: Record<string, unknown>) => {
          sb.inserts.push({ table, row });
          return { error: null };
        },
        then: (ok: (v: { data: unknown[]; error: null }) => unknown) => Promise.resolve({ data: [], error: null }).then(ok),
      };
      return q;
    },
  };
  return { getSupabase: () => client, supabaseConfigured: true };
});

import { can } from "@/lib/teamLogic";
import { writeLocalOwner } from "@/lib/localOwner";
import { createInvite, finishPendingInvite, loadTeam, pendingInvite, rememberPendingInvite, useTeam } from "@/lib/team";

beforeEach(() => {
  storage.clear();
  sb.session = null;
  sb.rpc = [];
  sb.inserts = [];
  useTeam.setState({ ready: false, userId: null, team: null, role: null, members: [], billing: null, needsMigration: false, error: null }, true);
});

describe("signed out", () => {
  it("with a recorded owner and no cached role: can('prices') is false", async () => {
    writeLocalOwner({ userId: "u1", email: "office@example.com" });
    await loadTeam(null);
    expect(can(useTeam.getState().role, "prices")).toBe(false);
  });

  it("keeps the owner's last cached role (signing out doesn't erase it)", async () => {
    writeLocalOwner({ userId: "u1", email: "tech@example.com" });
    storage.setItem("pinplan.team", JSON.stringify({ userId: "u1", team: { id: "t1", name: "Acme", ownerId: "boss" }, role: "tech", members: [], billing: null }));
    await loadTeam(null);
    expect(useTeam.getState().role).toBe("tech");
    expect(storage.getItem("pinplan.team")).not.toBeNull();
    storage.setItem("pinplan.team", JSON.stringify({ userId: "u1", role: "admin" }));
    await loadTeam(null);
    expect(can(useTeam.getState().role, "prices")).toBe(true);
  });

  it("an owner found only from an older install's sync keys counts too", async () => {
    storage.setItem("pinplan.sync.pull.u7.projects", "2026-11-01T00:00:00Z");
    await loadTeam(null);
    expect(can(useTeam.getState().role, "prices")).toBe(false);
  });

  it("data that never had an owner keeps full access (solo, demo)", async () => {
    await loadTeam(null);
    expect(useTeam.getState().role).toBeNull();
    expect(can(useTeam.getState().role, "prices")).toBe(true);
  });
});

describe("invites", () => {
  it("createInvite is a technician's by default and stores the address it's for", async () => {
    useTeam.setState({ team: { id: "t1", name: "Acme", ownerId: "boss" } });
    await createInvite();
    await createInvite("admin", "Pat", "  Pat@Example.COM ");
    expect(sb.inserts[0].row).toMatchObject({ team_id: "t1", role: "tech", name: "" });
    expect(sb.inserts[0].row).not.toHaveProperty("email");
    expect(sb.inserts[1].row).toMatchObject({ role: "admin", name: "Pat", email: "pat@example.com" });
  });

  it("a remembered invite joins only for the email it was started with", async () => {
    rememberPendingInvite("k7qm-xr4t-pa", "Sam", "Sam@Example.com");
    expect(pendingInvite()).toEqual({ code: "K7QMXR4TPA", name: "Sam", email: "sam@example.com" });
    useTeam.setState({ userId: "u2" });
    sb.session = { user: { id: "u2", email: "next.person@example.com" } };
    expect(await finishPendingInvite()).toBeNull();
    expect(sb.rpc.some((c) => c.fn === "accept_team_invite")).toBe(false);
    // Kept for the person to confirm on /join.
    expect(pendingInvite()?.code).toBe("K7QMXR4TPA");

    useTeam.setState({ userId: "u3" });
    sb.session = { user: { id: "u3", email: "sam@example.com" } };
    expect(await finishPendingInvite()).toBe("Acme");
    expect(sb.rpc.filter((c) => c.fn === "accept_team_invite")).toHaveLength(1);
    expect(pendingInvite()).toBeNull();
  });

  it("an invite remembered without an email is never joined automatically", async () => {
    storage.setItem("pinplan.pendingInvite", JSON.stringify({ code: "K7QMXR4TPA", name: "" }));
    useTeam.setState({ userId: "u2" });
    sb.session = { user: { id: "u2", email: "anyone@example.com" } };
    expect(await finishPendingInvite()).toBeNull();
    expect(sb.rpc).toHaveLength(0);
  });
});
