import { describe, expect, it } from "vitest";
import { can, CODE_ALPHABET, CODE_LENGTH, formatCode, inviteState, joinUrl, memberLabel, newInviteCode, normalizeCode, sortMembers, teamErrorMessage } from "@/lib/teamLogic";

describe("team roles", () => {
  it("techs do field work only; owners, admins and solo users can do everything", () => {
    for (const a of ["prices", "manageTeam", "deleteJob", "editCatalog"] as const) {
      expect(can("tech", a)).toBe(false);
      expect(can("admin", a)).toBe(true);
      expect(can("owner", a)).toBe(true);
      expect(can(null, a)).toBe(true);
    }
  });
  it("sorts owner, admins, techs, then by name", () => {
    const m = sortMembers([
      { role: "tech" as const, name: "zed" },
      { role: "admin" as const, name: "Bea" },
      { role: "tech" as const, name: "Al" },
      { role: "owner" as const, name: "Olivia" },
    ]);
    expect(m.map((x) => x.name)).toEqual(["Olivia", "Bea", "Al", "zed"]);
    expect(memberLabel({ name: " ", email: "tom@acme.com" })).toBe("tom");
  });
});

describe("invite codes", () => {
  it("are 10 unambiguous characters", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const c = newInviteCode();
      expect(c).toHaveLength(CODE_LENGTH);
      for (const ch of c) expect(CODE_ALPHABET).toContain(ch);
      seen.add(c);
    }
    expect(seen.size).toBe(200);
    expect(CODE_ALPHABET).not.toMatch(/[01OIL]/);
  });
  it("rejects biased bytes and still fills the code", () => {
    let calls = 0;
    const c = newInviteCode((n) => (calls++ === 0 ? new Uint8Array(n).fill(255) : new Uint8Array(n).fill(3)));
    expect(c).toBe("D".repeat(10));
  });
  it("normalise and format what people type", () => {
    expect(normalizeCode(" k7qm-xr4t pa ")).toBe("K7QMXR4TPA");
    expect(formatCode("K7QMXR4TPA")).toBe("K7QM-XR4T-PA");
    expect(joinUrl("https://pinplan.example.com/", "k7qm-xr4t-pa")).toBe("https://pinplan.example.com/join?code=K7QMXR4TPA");
  });
  it("know their state", () => {
    const now = new Date("2026-11-20T12:00:00Z");
    expect(inviteState({ expires_at: "2026-11-21T00:00:00Z" }, now)).toBe("open");
    expect(inviteState({ expires_at: "2026-11-19T00:00:00Z" }, now)).toBe("expired");
    expect(inviteState({ expires_at: "2026-11-21T00:00:00Z", used_by: "u" }, now)).toBe("used");
    expect(inviteState({ expires_at: "2026-11-21T00:00:00Z", revoked: true }, now)).toBe("revoked");
  });
  it("explain a missing migration", () => {
    expect(teamErrorMessage({ message: "Could not find the function public.create_team(p_my_name, p_name) in the schema cache" })).toMatch(/20261120000000_teams\.sql/);
    expect(teamErrorMessage({ message: "That invite has expired. Ask for a new one." })).toBe("That invite has expired. Ask for a new one.");
  });
});
