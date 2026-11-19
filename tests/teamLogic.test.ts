import { describe, expect, it } from "vitest";
import {
  can,
  CODE_ALPHABET,
  CODE_LENGTH,
  formatCode,
  inviteMessage,
  inviteState,
  joinUrl,
  memberInitials,
  memberLabel,
  newInviteCode,
  normalizeCode,
  signupProblem,
  smsHref,
  sortMembers,
  teamErrorMessage,
} from "@/lib/teamLogic";

describe("invite sharing", () => {
  const link = joinUrl("https://pinplan.app", "K7QMXR4TPA");
  it("writes a message with the link and the formatted code", () => {
    const m = inviteMessage({ team: "Acme Low Voltage", from: "Dana", role: "tech", code: "K7QMXR4TPA", link });
    expect(m).toContain("Dana invited you to join Acme Low Voltage");
    expect(m).toContain("(the crew)");
    expect(m).toContain("https://pinplan.app/join?code=K7QMXR4TPA");
    expect(m).toContain("K7QM-XR4T-PA");
    expect(inviteMessage({ team: " ", role: "admin", code: "K7QMXR4TPA", link })).toMatch(/^You're invited to join our team on PinPlan \(the office\)/);
  });
  it("builds an sms link with the text encoded", () => {
    expect(smsHref("Hi & welcome")).toBe("sms:?&body=Hi%20%26%20welcome");
    expect(smsHref("x", "+1 555")).toBe("sms:%2B1%20555?&body=x");
  });
  it("makes avatar initials", () => {
    expect(memberInitials({ name: "Jordan Lee" })).toBe("JL");
    expect(memberInitials({ name: "", email: "pat.kim@x.com" })).toBe("PK");
    expect(memberInitials({ name: "cher" })).toBe("C");
  });
});

describe("sign-up checks", () => {
  const ok = { email: "tech@acme.com", password: "longenough", name: "Sam", code: "k7qm-xr4t-pa" };
  it("accepts a good form", () => expect(signupProblem(ok)).toBeNull());
  it("flags each problem with a friendly message", () => {
    expect(signupProblem({ ...ok, code: "abc" })).toMatch(/invite code/);
    expect(signupProblem({ ...ok, email: "nope" })).toMatch(/valid email/);
    expect(signupProblem({ ...ok, password: "short" })).toMatch(/at least 8/);
    expect(signupProblem({ ...ok, password: "x".repeat(73) })).toMatch(/72/);
    expect(signupProblem({ ...ok, name: "x".repeat(81) })).toMatch(/80/);
    expect(signupProblem({ email: "a@b.co", password: "12345678" })).toBeNull();
  });
});

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
