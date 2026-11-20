"use client";
// Deleting an account needs proof it's really the person: DELETE /api/account answers 401 reauth_required unless the
// sign-in is fresh (a password, emailed code or sign-in link in the last 5 minutes, checked on the server from the
// token). This hook makes the request and, when the server asks, shows a password field (a fresh sign-in, with the bot
// check when it's on) or, for logins without a password, sends a sign-in link; after opening it, they try again. The
// delete dialog (Settings › Account) renders `fields` and calls `request()` on submit.
import { useState } from "react";
import { useCaptcha } from "@/lib/captcha";
import { authErrorMessage } from "@/lib/onboardingLogic";
import { getSupabase } from "@/lib/supabase";
import { accountDeleteReply } from "@/lib/teamLogic";

export function useAccountDelete(email: string | null) {
  const [reauth, setReauth] = useState<string | null>(null);
  const [mode, setMode] = useState<"password" | "link">("password");
  const [password, setPassword] = useState("");
  const [linkNote, setLinkNote] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [expired, setExpired] = useState(false);
  const { mount: captchaMount, error: captchaError, take: takeCaptcha } = useCaptcha("reauth");

  /** True when the account was deleted; false when the person must prove it's them first (the fields now show). */
  const request = async (): Promise<boolean> => {
    const sb = getSupabase();
    if (!sb) throw new Error("Not connected to the cloud.");
    if (reauth && mode === "password") {
      if (!email) throw new Error("Sign out, sign in again, then delete your account.");
      if (!password) throw new Error("Enter your password.");
      const { error } = await sb.auth.signInWithPassword({ email, password, options: { captchaToken: await takeCaptcha() } });
      if (error) throw new Error(authErrorMessage(error.message));
    }
    // With a sign-in link, the session it made (in this browser, shared between tabs) is the fresh sign-in.
    const token = (await sb.auth.getSession()).data.session?.access_token;
    if (!token) {
      setReauth("Your sign-in has expired. Sign out, sign in again, then delete your account.");
      setExpired(true);
      setMode("password");
      return false;
    }
    const r = await fetch("/api/account", { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
    const body = (await r.json().catch(() => ({}))) as Parameters<typeof accountDeleteReply>[1];
    const reply = accountDeleteReply(r.status, body);
    if (reply.kind === "deleted") return true;
    if (reply.kind === "reauth") {
      setReauth(reply.message);
      // 401 reauth_required: signed in, just not recently. Any other 401: the sign-in itself is gone.
      setExpired(r.status === 401 && body?.code !== "reauth_required");
      setPassword("");
      return false;
    }
    throw new Error(reply.message);
  };

  /** Logins without a password: a sign-in link to the account's own address is the fresh sign-in. */
  const sendLink = async () => {
    const sb = getSupabase();
    if (!sb || !email) return;
    setSending(true);
    setLinkNote(null);
    try {
      const { error } = await sb.auth.signInWithOtp({
        email,
        options: { shouldCreateUser: false, emailRedirectTo: `${window.location.origin}/settings`, captchaToken: await takeCaptcha() },
      });
      setMode("link");
      setLinkNote(
        !error || /signups? not allowed for otp/i.test(error.message)
          ? "If there’s an account for this email, a sign-in link is on its way — check your email."
          : authErrorMessage(error.message),
      );
    } catch (e) {
      setLinkNote(authErrorMessage(e instanceof Error ? e.message : String(e)));
    } finally {
      setSending(false);
    }
  };

  const fields = reauth ? (
    <div className="space-y-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-200" role="alert">
      <p className="font-medium">Confirm it’s you</p>
      <p>{expired ? "Your sign-in has expired. Enter your password to continue." : "To keep your account safe, enter your password again."}</p>
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
        linkNote && <p>{linkNote}</p>
      )}
      {mode === "password" ? (
        <button type="button" className="text-xs font-medium text-amber-900 underline" disabled={sending || !email} onClick={() => void sendLink()}>
          Email me a sign-in link
        </button>
      ) : (
        <button type="button" className="text-xs font-medium text-amber-900 underline" onClick={() => setMode("password")}>
          Use my password instead
        </button>
      )}
      <div ref={captchaMount} className="flex justify-center empty:hidden" />
      {captchaError && <p className="text-xs text-red-700">{captchaError}</p>}
    </div>
  ) : null;

  return { request, fields, reauthNeeded: !!reauth };
}
