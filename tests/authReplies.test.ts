// Join page and delete-account dialog: what they send and how they read the server's answers (src/lib/teamLogic.ts).
import { describe, expect, it } from "vitest";
import { accountDeleteReply, joinReply, joinRequestBody, PASSWORD_MIN, signupProblem } from "@/lib/teamLogic";

describe("password minimum", () => {
  it("is 10 on the web, as on iOS and in Supabase Auth", () => {
    expect(PASSWORD_MIN).toBe(10);
    expect(signupProblem({ email: "a@b.co", password: "123456789" })).toMatch(/at least 10/);
    expect(signupProblem({ email: "a@b.co", password: "1234567890" })).toBeNull();
  });
});

describe("joinRequestBody", () => {
  it("sends the bot-check token as captchaToken, and the terms the person ticked", () => {
    const b = joinRequestBody({ code: "k7qm-xr4t-pa", email: " sam@acme.com ", password: "pw", name: " Sam ", captchaToken: "tok", termsVersion: "2026-11" });
    expect(b).toEqual({ code: "K7QMXR4TPA", email: "sam@acme.com", password: "pw", name: "Sam", captchaToken: "tok", acceptedTerms: true, termsVersion: "2026-11" });
    expect(b).not.toHaveProperty("turnstileToken");
  });
  it("leaves the token out when the check is off", () => {
    expect(joinRequestBody({ code: "K7QMXR4TPA", email: "a@b.co", password: "pw", name: "", termsVersion: "2026-11" })).not.toHaveProperty("captchaToken");
  });
});

describe("joinReply", () => {
  it("an unconfirmed account means: check your email", () => {
    expect(joinReply(200, { ok: true, confirmEmail: true })).toEqual({ kind: "checkEmail" });
  });
  it("a ready account means: sign in now", () => {
    expect(joinReply(200, { ok: true })).toEqual({ kind: "signIn" });
  });
  it("an existing account means: sign in to join", () => {
    expect(joinReply(409, { code: "exists", error: "x" })).toEqual({ kind: "exists" });
  });
  it("falls back to the normal sign-up when the server can't make accounts", () => {
    for (const s of [501, 404, 502, 503]) expect(joinReply(s, { code: "unavailable" })).toEqual({ kind: "fallback" });
  });
  it("shows the server's words for anything else", () => {
    expect(joinReply(400, { code: "captcha_failed", error: "Finish the security check, then try again." })).toEqual({
      kind: "error",
      message: "Finish the security check, then try again.",
    });
    expect(joinReply(429, null)).toMatchObject({ kind: "error" });
  });
});

describe("accountDeleteReply", () => {
  it("deleted", () => {
    expect(accountDeleteReply(200, { ok: true })).toEqual({ kind: "deleted" });
  });
  it("asks to sign in again on reauth_required", () => {
    const r = accountDeleteReply(403, { code: "reauth_required", error: "To keep your account safe, …" });
    expect(r).toEqual({ kind: "reauth", message: "To keep your account safe, …" });
  });
  it("an expired sign-in also asks for the password again", () => {
    expect(accountDeleteReply(401, { code: "unauthorized" }).kind).toBe("reauth");
  });
  it("other refusals are plain errors", () => {
    expect(accountDeleteReply(409, { code: "team_has_members", error: "Remove them first." })).toEqual({ kind: "error", message: "Remove them first." });
    expect(accountDeleteReply(403, { code: "forbidden" }).kind).toBe("error");
    expect(accountDeleteReply(502, null)).toEqual({ kind: "error", message: "Couldn’t delete your account (502)." });
  });
});
