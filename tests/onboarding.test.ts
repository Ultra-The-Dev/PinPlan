// Sign-up, first-run and account-deletion rules (src/lib/onboardingLogic.ts), the bot check's server side
// (src/lib/captcha.ts) and the App Store QR code (src/app/start/qr.ts).
import { describe, expect, it } from "vitest";
import { qrModules, qrPath } from "@/app/start/qr";
import { verifyCaptchaToken } from "@/lib/captcha";
import {
  acceptedTerms,
  accountDeletionPlan,
  appStoreUrl,
  authErrorMessage,
  companyFromMetadata,
  companySignupProblem,
  deleteConfirmed,
  landingDecision,
  onboardingDone,
  onboardingProgress,
  passwordStrength,
  setupCompanyProblem,
  startView,
  termsMetadata,
  TERMS_VERSION,
} from "@/lib/onboardingLogic";

describe("landingDecision", () => {
  const base = { configured: true, authReady: true, signedIn: false, localJobs: 0, demo: false };
  it("sends a signed-out visitor with no jobs to the landing page", () => {
    expect(landingDecision(base)).toBe("welcome");
  });
  it("keeps the jobs list for signed-in users, local jobs and demo mode", () => {
    expect(landingDecision({ ...base, signedIn: true })).toBe("stay");
    expect(landingDecision({ ...base, localJobs: 2 })).toBe("stay");
    expect(landingDecision({ ...base, demo: true })).toBe("stay");
  });
  it("waits until sign-in and the job count are known", () => {
    expect(landingDecision({ ...base, authReady: false })).toBe("wait");
    expect(landingDecision({ ...base, localJobs: null })).toBe("wait");
    // Either fact alone is enough to stay.
    expect(landingDecision({ ...base, authReady: false, localJobs: 1 })).toBe("stay");
    expect(landingDecision({ ...base, signedIn: true, localJobs: null })).toBe("stay");
  });
  it("never redirects a local-only server (no accounts to sign up for)", () => {
    expect(landingDecision({ ...base, configured: false, authReady: false, localJobs: null })).toBe("stay");
    expect(landingDecision({ ...base, configured: false, signedIn: true, hasTeam: false })).toBe("stay");
  });
  it("sends someone signed in without a company to set one up, even with jobs on the device", () => {
    const signedIn = { ...base, signedIn: true };
    expect(landingDecision({ ...signedIn, hasTeam: false })).toBe("setup");
    expect(landingDecision({ ...signedIn, hasTeam: false, localJobs: 5, demo: true })).toBe("setup");
    expect(landingDecision({ ...signedIn, hasTeam: true })).toBe("stay");
  });
  it("waits for the team unless there are jobs to show meanwhile", () => {
    const signedIn = { ...base, signedIn: true };
    expect(landingDecision({ ...signedIn, hasTeam: null })).toBe("wait");
    expect(landingDecision({ ...signedIn, hasTeam: null, localJobs: 2 })).toBe("stay");
    // Signed out, the team doesn't matter.
    expect(landingDecision({ ...base, hasTeam: false })).toBe("welcome");
  });
});

describe("startView", () => {
  const base = { configured: true, authReady: true, signedIn: true, hasTeam: true as boolean | null, role: "owner" as const, finishing: false };
  it("shows the checklist to the owner and office, and a short page to technicians", () => {
    expect(startView(base)).toBe("checklist");
    expect(startView({ ...base, role: "admin" as never })).toBe("checklist");
    expect(startView({ ...base, role: "tech" as never })).toBe("tech");
  });
  it("asks an account without a company to set one up", () => {
    expect(startView({ ...base, hasTeam: false, role: null as never })).toBe("setup");
  });
  it("waits while the sign-in, the team or the company being made is still coming", () => {
    expect(startView({ ...base, authReady: false })).toBe("loading");
    expect(startView({ ...base, hasTeam: null })).toBe("loading");
    expect(startView({ ...base, hasTeam: false, finishing: true })).toBe("finishing");
  });
  it("is just the checklist on a local-only copy or signed out", () => {
    expect(startView({ ...base, configured: false, authReady: false })).toBe("checklist");
    expect(startView({ ...base, signedIn: false, hasTeam: null })).toBe("checklist");
  });
});

describe("the company from a sign-up (user_metadata)", () => {
  it("reads company, name and trades", () => {
    expect(companyFromMetadata({ company: " Brightline ", name: "Sam Lee", trades: ["electrical", "bogus", "lowvoltage"] })).toEqual({
      company: "Brightline",
      name: "Sam Lee",
      trades: ["electrical", "lowvoltage"],
    });
    expect(companyFromMetadata({ company: "Brightline" })).toEqual({ company: "Brightline", name: "", trades: [] });
  });
  it("is nothing for invited workers, or once the company was made", () => {
    expect(companyFromMetadata({ name: "Tom" })).toBeNull();
    expect(companyFromMetadata({ company: "  " })).toBeNull();
    expect(companyFromMetadata({ company: "Brightline", company_created_at: "2026-11-19T10:00:00Z" })).toBeNull();
    expect(companyFromMetadata(null)).toBeNull();
  });
});

describe("setupCompanyProblem", () => {
  const good = { company: "Brightline", name: "Sam Lee", accepted: true };
  it("accepts a complete form and names the first problem", () => {
    expect(setupCompanyProblem(good)).toBeNull();
    expect(setupCompanyProblem({ ...good, company: "" })).toMatch(/company name/);
    expect(setupCompanyProblem({ ...good, name: " " })).toMatch(/your name/);
    expect(setupCompanyProblem({ ...good, accepted: false })).toMatch(/Terms/);
    expect(setupCompanyProblem({ ...good, company: "x".repeat(121) })).toMatch(/120/);
  });
});

describe("terms", () => {
  it("records the version and time, and knows when the current terms were accepted", () => {
    const m = termsMetadata(new Date("2026-11-19T12:00:00Z"));
    expect(m).toEqual({ terms_accepted_at: "2026-11-19T12:00:00.000Z", terms_version: TERMS_VERSION });
    expect(acceptedTerms(m)).toBe(true);
    expect(acceptedTerms({ ...m, terms_version: "2020-01" })).toBe(false);
    expect(acceptedTerms({ name: "Sam" })).toBe(false);
    expect(acceptedTerms(null)).toBe(false);
  });
});

describe("appStoreUrl", () => {
  it("takes only an https link", () => {
    expect(appStoreUrl(" https://apps.apple.com/app/id123 ")).toBe("https://apps.apple.com/app/id123");
    expect(appStoreUrl("http://apps.apple.com/app/id123")).toBe("");
    expect(appStoreUrl("javascript:alert(1)")).toBe("");
    expect(appStoreUrl("not a url")).toBe("");
    expect(appStoreUrl(undefined)).toBe("");
  });
});

describe("passwordStrength", () => {
  it("scores by length and variety", () => {
    expect(passwordStrength("").score).toBe(0);
    expect(passwordStrength("abc").label).toBe("Too short");
    expect(passwordStrength("abcdefgh").label).toBe("Too short");
    expect(passwordStrength("wirepuller").label).toBe("Fair");
    expect(passwordStrength("abcdefghij").label).toBe("Weak");
    expect(passwordStrength("Abcdefgh12").label).toBe("Good");
    expect(passwordStrength("copper-Ladder-91-orchard").label).toBe("Strong");
  });
  it("calls common and repeated passwords weak", () => {
    expect(passwordStrength("password").label).toBe("Too short");
    expect(passwordStrength("password123").label).toBe("Weak");
    expect(passwordStrength("1234567890").label).toBe("Weak");
    expect(passwordStrength("Welcome2026").label).toBe("Weak");
    expect(passwordStrength("aaaaaaaaaaaa").label).toBe("Weak");
  });
});

describe("companySignupProblem", () => {
  const good = { company: "Brightline Integration", name: "Sam Lee", email: "sam@brightline.co", password: "wire-pull-2026", accepted: true };
  it("accepts a complete form", () => expect(companySignupProblem(good)).toBeNull());
  it("names the first problem", () => {
    expect(companySignupProblem({ ...good, company: " " })).toMatch(/company name/);
    expect(companySignupProblem({ ...good, name: "" })).toMatch(/your name/);
    expect(companySignupProblem({ ...good, email: "sam@" })).toMatch(/valid email/);
    expect(companySignupProblem({ ...good, password: "short" })).toMatch(/at least 10/);
    expect(companySignupProblem({ ...good, password: "password123" })).toMatch(/less common/);
    expect(companySignupProblem({ ...good, accepted: false })).toMatch(/Terms/);
    expect(companySignupProblem({ ...good, company: "x".repeat(121) })).toMatch(/120/);
  });
});

describe("authErrorMessage", () => {
  it("turns Supabase errors into plain words", () => {
    expect(authErrorMessage("User already registered")).toMatch(/already an account/);
    expect(authErrorMessage("Invalid login credentials")).toMatch(/don’t match/);
    expect(authErrorMessage("Email not confirmed")).toMatch(/Confirm your email/);
    expect(authErrorMessage("email rate limit exceeded")).toMatch(/Too many/);
    expect(authErrorMessage("Password should be at least 10 characters.")).toBe("Use a password of at least 10 characters.");
    expect(authErrorMessage("captcha protection: request disallowed (timeout-or-duplicate)")).toMatch(/person/);
    expect(authErrorMessage("captcha: the check didn’t finish")).toMatch(/person/);
    expect(authErrorMessage("Something odd")).toBe("Something odd");
  });
});

describe("onboarding checklist", () => {
  it("detects steps from the data and ticks", () => {
    const d = onboardingDone({ businessName: true, hasPlan: false, teamMembers: 1 }, { app: true });
    expect(d).toEqual({ business: true, plan: false, team: false, app: true });
    expect(onboardingProgress(d)).toEqual({ done: 2, total: 4, next: "plan", complete: false });
    expect(onboardingDone({ businessName: false, hasPlan: true, teamMembers: 3 }, {}).team).toBe(true);
    const all = onboardingDone({ businessName: true, hasPlan: true, teamMembers: 1 }, { team: true, app: true });
    expect(onboardingProgress(all)).toMatchObject({ complete: true, next: null });
  });
});

describe("accountDeletionPlan", () => {
  it("deletes a user who isn't on a team", () => {
    expect(accountDeletionPlan({ userId: "u", membership: null, teamOwnerId: null, memberCount: 0 })).toEqual({ ok: true, deleteTeamId: null, transferJobsTo: null });
  });
  it("deletes an owner's team when they're on it alone", () => {
    expect(accountDeletionPlan({ userId: "u", membership: { teamId: "t", role: "owner" }, teamOwnerId: "u", memberCount: 1 })).toEqual({
      ok: true,
      deleteTeamId: "t",
      transferJobsTo: null,
    });
  });
  it("refuses an owner whose team has other people", () => {
    const p = accountDeletionPlan({ userId: "u", membership: { teamId: "t", role: "owner" }, teamOwnerId: "u", memberCount: 3 });
    expect(p.ok).toBe(false);
    if (!p.ok) {
      expect(p.status).toBe(409);
      expect(p.message).toMatch(/2 other people/);
    }
  });
  it("keeps a member's jobs with the company (moved to the owner)", () => {
    expect(accountDeletionPlan({ userId: "u", membership: { teamId: "t", role: "tech" }, teamOwnerId: "boss", memberCount: 4 })).toEqual({
      ok: true,
      deleteTeamId: null,
      transferJobsTo: "boss",
    });
  });
  it("needs the word DELETE typed exactly", () => {
    expect(deleteConfirmed("DELETE")).toBe(true);
    expect(deleteConfirmed(" DELETE ")).toBe(true);
    expect(deleteConfirmed("delete")).toBe(false);
    expect(deleteConfirmed("")).toBe(false);
  });
});

describe("verifyCaptchaToken", () => {
  const reply = (body: unknown) => (async () => new Response(JSON.stringify(body))) as unknown as typeof fetch;
  it("passes everything when no secret is set (the check is off)", async () => {
    expect(await verifyCaptchaToken(undefined, { secret: "" })).toBe(true);
  });
  it("asks Cloudflare when it's on", async () => {
    expect(await verifyCaptchaToken("tok", { secret: "s", fetchImpl: reply({ success: true }) })).toBe(true);
    expect(await verifyCaptchaToken("tok", { secret: "s", fetchImpl: reply({ success: false }) })).toBe(false);
    expect(await verifyCaptchaToken("", { secret: "s", fetchImpl: reply({ success: true }) })).toBe(false);
    expect(await verifyCaptchaToken(42, { secret: "s", fetchImpl: reply({ success: true }) })).toBe(false);
    const down = (async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;
    expect(await verifyCaptchaToken("tok", { secret: "s", fetchImpl: down })).toBe(false);
  });
});

describe("QR code", () => {
  const finderAt = (m: boolean[][], x: number, y: number) =>
    [0, 1, 2, 3, 4, 5, 6].every((i) => m[y][x + i] && m[y + 6][x + i] && m[y + i][x] && m[y + i][x + 6]) && m[y + 3][x + 3] && !m[y + 1][x + 1];
  it("picks the smallest version that fits and draws the three finder patterns", () => {
    for (const [text, size] of [
      ["hi", 21],
      ["https://apps.apple.com/us/app/pinplan/id1234567890", 33],
      ["https://example.com/" + "a".repeat(150), 53],
    ] as const) {
      const m = qrModules(text);
      expect(m.length).toBe(size);
      expect(m.every((r) => r.length === size)).toBe(true);
      expect(finderAt(m, 0, 0) && finderAt(m, size - 7, 0) && finderAt(m, 0, size - 7)).toBe(true);
      // Timing pattern and the always-dark module.
      expect([8, 9, 10, 11, 12].map((i) => m[6][i])).toEqual([true, false, true, false, true]);
      expect(m[size - 8][8]).toBe(true);
    }
  });
  it("is the same every time and refuses text that's too long", () => {
    expect(qrModules("https://example.com")).toEqual(qrModules("https://example.com"));
    expect(() => qrModules("x".repeat(300))).toThrow(/too long/);
  });
  it("draws dark modules as an SVG path inside a quiet zone", () => {
    expect(qrPath([[true, false]], 4)).toBe("M4 4h1v1h-1z");
  });
});
