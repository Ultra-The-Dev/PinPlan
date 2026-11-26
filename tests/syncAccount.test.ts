import "fake-indexeddb/auto";
import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { forAccount, useSyncStatus } from "@/lib/sync";

// forAccount wraps the real supabase-js client (tests/sync.test.ts uses a stand-in): every request a sync makes must
// still be built the usual way, and none may start once another account is signed in.
describe("forAccount", () => {
  const real = () => createClient("https://example.invalid", "anon-key", { auth: { persistSession: false, autoRefreshToken: false } });

  it("passes every call a sync makes through to the real client", () => {
    useSyncStatus.setState({ userId: "u1" });
    const sb = forAccount(real(), "u1");
    expect(typeof sb.from("markers").select("id").gte("synced_at", "1970-01-01T00:00:00Z").order("synced_at").range(0, 9).then).toBe("function");
    expect(typeof sb.from("markers").upsert([{ id: "m1" }], { onConflict: "id" }).then).toBe("function");
    expect(typeof sb.from("sheets").update({ image_path: "p/i" }).eq("image_id", "i").then).toBe("function");
    expect(typeof sb.rpc("my_billing_owner").then).toBe("function");
    expect(typeof sb.storage.from("plans").upload).toBe("function");
    expect(typeof sb.auth.getSession).toBe("function");
  });

  it("refuses to start a request once another account (or nobody) is signed in", () => {
    useSyncStatus.setState({ userId: "u1" });
    const sb = forAccount(real(), "u1");
    useSyncStatus.setState({ userId: "u2" });
    expect(() => sb.from("markers")).toThrow(/Signed out during sync/);
    expect(() => sb.rpc("my_billing_owner")).toThrow(/Signed out during sync/);
    expect(() => sb.storage.from("plans")).toThrow(/Signed out during sync/);
    useSyncStatus.setState({ userId: null });
    expect(() => sb.from("markers")).toThrow(/Signed out during sync/);
  });
});
