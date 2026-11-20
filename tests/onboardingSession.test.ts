// "/" while signed out with an account's jobs, reset-link sessions, password-change proof and the terms RPC.
import { describe, expect, it } from "vitest";
import { isRecoverySession, landingDecision, missingFunction, needsReauthCode, passwordChangeProof } from "@/lib/onboardingLogic";

const token = (claims: Record<string, unknown>) => `h.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.sig`;

describe("landingDecision with an owner on this device", () => {
  const base = { configured: true, authReady: true, signedIn: false, localJobs: 3, demo: false, hasTeam: null };
  it("signed out with a recorded owner: / goes to /login instead of the jobs", () => {
    expect(landingDecision({ ...base, hasOwner: true })).toBe("login");
    // Demo mode doesn't open an account's jobs either.
    expect(landingDecision({ ...base, hasOwner: true, demo: true })).toBe("login");
    expect(landingDecision({ ...base, hasOwner: true, localJobs: 0 })).toBe("login");
  });
  it("data that never had an owner stays (solo / demo)", () => {
    expect(landingDecision({ ...base, hasOwner: false })).toBe("stay");
    expect(landingDecision({ ...base, localJobs: 0, demo: true })).toBe("stay");
  });
  it("signed in, or before the sign-in is read, nothing changes", () => {
    expect(landingDecision({ ...base, signedIn: true, hasTeam: true, hasOwner: true })).toBe("stay");
    expect(landingDecision({ ...base, authReady: false, localJobs: null, hasOwner: true })).toBe("wait");
  });
  it("a local-only copy (no accounts) is just the app", () => {
    expect(landingDecision({ ...base, configured: false, hasOwner: true })).toBe("stay");
  });
});

describe("isRecoverySession", () => {
  const now = Date.UTC(2026, 10, 20, 12) as number;
  const s = now / 1000;
  it("a session from a reset link (amr recovery) in the last hour", () => {
    expect(isRecoverySession(token({ amr: [{ method: "recovery", timestamp: s - 60 }] }), now)).toBe(true);
  });
  it("any other sign-in, an old reset, or no token: not one", () => {
    expect(isRecoverySession(token({ amr: [{ method: "password", timestamp: s - 60 }] }), now)).toBe(false);
    expect(isRecoverySession(token({ amr: [{ method: "recovery", timestamp: s - 2 * 3600 }] }), now)).toBe(false);
    expect(isRecoverySession(token({ iat: s }), now)).toBe(false);
    expect(isRecoverySession(null, now)).toBe(false);
    expect(isRecoverySession("garbage", now)).toBe(false);
  });
});

describe("passwordChangeProof", () => {
  it("a typed current password is checked first", () => {
    expect(passwordChangeProof({ current: "old password" })).toBe("current");
  });
  it("no current password (a sign-in-link login): an emailed code", () => {
    expect(passwordChangeProof({})).toBe("code");
    expect(passwordChangeProof({ current: "" })).toBe("code");
  });
  it("the code once entered, or a reset link", () => {
    expect(passwordChangeProof({ nonce: "123456" })).toBe("nonce");
    expect(passwordChangeProof({ recovery: true })).toBe("recovery");
    expect(passwordChangeProof({ recovery: true, nonce: "123456" })).toBe("nonce");
  });
  it("is never 'no proof'", () => {
    for (const i of [{}, { current: "" }, { nonce: " " }]) expect(passwordChangeProof(i)).not.toBe("recovery");
  });
});

describe("needsReauthCode / missingFunction", () => {
  it("recognises Supabase asking for the reauthentication code", () => {
    expect(needsReauthCode({ code: "reauthentication_needed", message: "Password update requires reauthentication" })).toBe(true);
    expect(needsReauthCode({ code: "reauth_nonce_missing" })).toBe(true);
    expect(needsReauthCode({ code: "same_password", message: "New password should be different from the old password." })).toBe(false);
    expect(needsReauthCode(null)).toBe(false);
  });
  it("a database without accept_terms yet is tolerated (PGRST202)", () => {
    expect(missingFunction({ code: "PGRST202", message: "Could not find the function public.accept_terms(p_version) in the schema cache" })).toBe(true);
    expect(missingFunction({ code: "42501", message: "permission denied" })).toBe(false);
  });
});
