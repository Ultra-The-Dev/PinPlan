// Signed-out roles, invites waiting for a sign-in, and the delete-account reply (web-session security fixes).
import { describe, expect, it } from "vitest";
import { accountDeleteReply, can, effectiveRole, inviteEmail, pendingInviteAction, type RoleContext } from "@/lib/teamLogic";

describe("effectiveRole / can while signed out", () => {
  const out = (owner: string | null, cached: RoleContext["cached"]): RoleContext => ({ signedIn: false, owner, cached });

  it("signed out with a recorded owner and nothing cached: no prices (fails closed)", () => {
    const ctx = out("u1", null);
    expect(effectiveRole(null, ctx)).toBe("tech");
    expect(can(null, "prices", ctx)).toBe(false);
    expect(can(null, "manageTeam", ctx)).toBe(false);
    expect(can(null, "deleteJob", ctx)).toBe(false);
  });

  it("uses the owner's last cached role, never another account's", () => {
    expect(can(null, "prices", out("u1", { userId: "u1", role: "tech" }))).toBe(false);
    expect(can(null, "prices", out("u1", { userId: "u1", role: "admin" }))).toBe(true);
    // The cache belongs to someone else: unknown, so closed.
    expect(can(null, "prices", out("u1", { userId: "u2", role: "owner" }))).toBe(false);
    // Cached as not on a team (solo): their own data, full access as before.
    expect(effectiveRole(null, out("u1", { userId: "u1", role: null }))).toBeNull();
    // A cache entry without a role field says nothing: closed.
    expect(can(null, "prices", out("u1", { userId: "u1" }))).toBe(false);
  });

  it("data that never had an owner (solo, demo) keeps full access", () => {
    expect(can(null, "prices", out(null, null))).toBe(true);
    expect(effectiveRole(null, out(null, { userId: "u9", role: "tech" }))).toBeNull();
  });

  it("signed in, the account's own role counts", () => {
    const ctx: RoleContext = { signedIn: true, owner: "u1", cached: null };
    expect(can(null, "prices", ctx)).toBe(true);
    expect(can("tech", "prices", ctx)).toBe(false);
    expect(can("admin", "prices")).toBe(true);
  });
});

describe("pendingInviteAction", () => {
  it("joins automatically only for the email the invite was started with (any case)", () => {
    expect(pendingInviteAction({ code: "K7QMXR4TPA", name: "Sam", email: "sam@example.com" }, "Sam@Example.com")).toBe("accept");
  });
  it("keeps the invite for the person to confirm when someone else signs in", () => {
    expect(pendingInviteAction({ code: "K7QMXR4TPA", name: "Sam", email: "sam@example.com" }, "next@example.com")).toBe("confirm");
  });
  it("an invite remembered without an email (older notes) is never accepted on its own", () => {
    expect(pendingInviteAction({ code: "K7QMXR4TPA", name: "" }, "sam@example.com")).toBe("confirm");
    expect(pendingInviteAction({ code: "K7QMXR4TPA", name: "", email: null }, "sam@example.com")).toBe("confirm");
    expect(pendingInviteAction({ code: "K7QMXR4TPA", name: "", email: "sam@example.com" }, null)).toBe("confirm");
  });
  it("nothing remembered", () => {
    expect(pendingInviteAction(null, "sam@example.com")).toBe("none");
  });
});

describe("inviteEmail", () => {
  it("stores invites' addresses trimmed and lower case (the database's check)", () => {
    expect(inviteEmail("  Sam@Example.COM ")).toBe("sam@example.com");
  });
  it("no address, or not an address: none", () => {
    expect(inviteEmail("")).toBeNull();
    expect(inviteEmail(undefined)).toBeNull();
    expect(inviteEmail("not an email")).toBeNull();
  });
});

describe("accountDeleteReply", () => {
  it("401 reauth_required (a sign-in that isn't fresh) asks for the password again", () => {
    const r = accountDeleteReply(401, { code: "reauth_required", error: "To keep your account safe, enter your password again, then delete your account." });
    expect(r).toEqual({ kind: "reauth", message: "To keep your account safe, enter your password again, then delete your account." });
    expect(accountDeleteReply(401, { code: "reauth_required" }).kind).toBe("reauth");
  });
});
