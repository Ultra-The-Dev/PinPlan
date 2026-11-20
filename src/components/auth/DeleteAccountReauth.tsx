"use client";
// Deleting an account needs proof it's really the person (DELETE /api/account answers 403 reauth_required unless the
// sign-in is fresh or the account's email is typed again). This hook makes the request and, when the server asks,
// shows a password field (a fresh sign-in, with the bot check when it's on) or, for logins without a password, an
// email field. The delete dialog (Settings › Account) renders `fields` and calls `request()` on submit.
import { useState } from "react";
import { useCaptcha } from "@/lib/captcha";
import { authErrorMessage } from "@/lib/onboardingLogic";
import { getSupabase } from "@/lib/supabase";
import { accountDeleteReply } from "@/lib/teamLogic";

export function useAccountDelete(email: string | null) {
  const [reauth, setReauth] = useState<string | null>(null);
  const [mode, setMode] = useState<"password" | "email">("password");
  const [password, setPassword] = useState("");
  const [typedEmail, setTypedEmail] = useState("");
  const { mount: captchaMount, error: captchaError, take: takeCaptcha } = useCaptcha("reauth");

  /** True when the account was deleted; false when the person must prove it's them first (the fields now show). */
  const request = async (): Promise<boolean> => {
    const sb = getSupabase();
    if (!sb) throw new Error("Not connected to the cloud.");
    let body: string | undefined;
    if (reauth) {
      if (mode === "password") {
        if (!email) throw new Error("Sign out, sign in again, then delete your account.");
        if (!password) throw new Error("Enter your password.");
        const { error } = await sb.auth.signInWithPassword({ email, password, options: { captchaToken: await takeCaptcha() } });
        if (error) throw new Error(/invalid login/i.test(error.message) ? "That password isn’t right. Try again, or type your email instead." : authErrorMessage(error.message));
      } else {
        if (!typedEmail.trim()) throw new Error("Type the email you sign in with.");
        body = JSON.stringify({ confirmEmail: typedEmail.trim() });
      }
    }
    const token = (await sb.auth.getSession()).data.session?.access_token;
    if (!token) {
      setReauth("Your sign-in has expired. Enter your password to continue.");
      setMode("password");
      return false;
    }
    const r = await fetch("/api/account", {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
      body,
    });
    const reply = accountDeleteReply(r.status, (await r.json().catch(() => ({}))) as Parameters<typeof accountDeleteReply>[1]);
    if (reply.kind === "deleted") return true;
    if (reply.kind === "reauth") {
      setReauth(reply.message);
      setPassword("");
      return false;
    }
    throw new Error(reply.message);
  };

  const fields = reauth ? (
    <div className="space-y-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-200" role="alert">
      <p className="font-medium">Confirm it’s you</p>
      <p>{reauth}</p>
      {mode === "password" ? (
        <div>
          <label className="label" htmlFor="del-password">
            Your password
          </label>
          <input
            id="del-password"
            className="input"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
          />
        </div>
      ) : (
        <div>
          <label className="label" htmlFor="del-email">
            The email you sign in with
          </label>
          <input
            id="del-email"
            className="input"
            type="email"
            autoComplete="off"
            inputMode="email"
            value={typedEmail}
            onChange={(e) => setTypedEmail(e.target.value)}
            autoFocus
          />
        </div>
      )}
      <button type="button" className="text-xs font-medium text-amber-900 underline" onClick={() => setMode(mode === "password" ? "email" : "password")}>
        {mode === "password" ? "No password? Type your email instead" : "Use my password instead"}
      </button>
      <div ref={captchaMount} className="flex justify-center empty:hidden" />
      {captchaError && <p className="text-xs text-red-700">{captchaError}</p>}
    </div>
  ) : null;

  return { request, fields, reauthNeeded: !!reauth };
}
