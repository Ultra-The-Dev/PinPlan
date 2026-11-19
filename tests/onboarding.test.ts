// Sign-up, first-run and account-deletion rules (src/lib/onboardingLogic.ts).
import { describe, expect, it } from "vitest";
import {
  accountDeletionPlan,
  authErrorMessage,
  companySignupProblem,
  deleteConfirmed,
  landingDecision,
  onboardingDone,
  onboardingProgress,
  passwordStrength,
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
  });
});

describe("passwordStrength", () => {
  it("scores by length and variety", () => {
    expect(passwordStrength("").score).toBe(0);
    expect(passwordStrength("abc").label).toBe("Too short");
    expect(passwordStrength("abcdefgh").label).toBe("Fair");
    expect(passwordStrength("Abcdefgh12").label).toBe("Good");
    expect(passwordStrength("copper-Ladder-91-orchard").label).toBe("Strong");
  });
  it("calls common and repeated passwords weak", () => {
    expect(passwordStrength("password").label).toBe("Weak");
    expect(passwordStrength("12345678").label).toBe("Weak");
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
    expect(companySignupProblem({ ...good, password: "short" })).toMatch(/at least 8/);
    expect(companySignupProblem({ ...good, password: "password" })).toMatch(/less common/);
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
