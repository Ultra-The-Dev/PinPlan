"use client";
// /reset: ask for a reset email, then (arriving from that email with a recovery session) choose a new password.
import { ArrowRight, CheckCircle2, KeyRound, Loader2, Mail } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useCaptcha } from "@/lib/captcha";
import { useT } from "@/lib/i18n";
import { changePassword } from "@/lib/onboarding";
import { authErrorMessage, isRecoverySession } from "@/lib/onboardingLogic";
import { PRODUCT_NAME } from "@/lib/plans";
import { getSupabase, supabaseConfigured } from "@/lib/supabase";
import { useSyncStatus } from "@/lib/sync";
import { linkErrorFrom, useArrivalParams } from "@/lib/useArrivalUrl";
import { PASSWORD_MIN } from "@/lib/teamLogic";
import { AuthCard, AuthShell, AuthTitle, errText, FormError, PasswordField } from "./AuthShell";
import { rich } from "./rich";

export default function ResetForm() {
  const t = useT();
  const params = useSearchParams();
  const sync = useSyncStatus();
  const [email, setEmail] = useState(() => params.get("email") ?? "");
  const [sent, setSent] = useState(false);
  // Arriving from the reset email: Supabase puts type=recovery in the hash (or ?code= with PKCE) and then says
  // PASSWORD_RECOVERY once the session is ready.
  const arrival = useArrivalParams();
  const [recoveryEvent, setRecoveryEvent] = useState(false);
  // The session itself says it came from a reset link (its amr), in case PASSWORD_RECOVERY fired before this page
  // listened. Only these prove it: being signed in, or a ?code= in the address, doesn't let anyone set a new password.
  const [recoverySession, setRecoverySession] = useState(false);
  const proven = recoveryEvent || recoverySession || arrival?.hash.get("type") === "recovery";
  const recovery = proven || !!arrival?.search.has("code");
  const [timedOut, setTimedOut] = useState(false);
  const linkError =
    linkErrorFrom(arrival?.hash, t("That reset link has expired or was already used. Send yourself a new one below.")) ??
    (timedOut ? t("Couldn’t open that reset link. Send yourself a new one below and open it in this browser.") : null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  /** Supabase asked for the emailed code before changing the password: null until then. */
  const [code, setCode] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const { mount: captchaMount, error: captchaError, take: takeCaptcha } = useCaptcha("reset");

  useEffect(() => {
    const sub = getSupabase()?.auth.onAuthStateChange((evt, session) => {
      if (evt === "PASSWORD_RECOVERY") setRecoveryEvent(true);
      if (isRecoverySession(session?.access_token)) setRecoverySession(true);
    });
    return () => sub?.data.subscription.unsubscribe();
  }, []);

  // A link that never turns into a session (expired, opened in another browser): stop waiting and say so.
  const signedIn = sync.signedIn;
  useEffect(() => {
    if (!signedIn) return;
    void getSupabase()
      ?.auth.getSession()
      .then(({ data }) => setRecoverySession(isRecoverySession(data.session?.access_token)));
  }, [signedIn]);
  useEffect(() => {
    if (!recovery || (signedIn && proven)) return;
    const timer = window.setTimeout(() => setTimedOut(true), 10_000);
    return () => window.clearTimeout(timer);
  }, [recovery, signedIn, proven]);

  if (!supabaseConfigured) {
    return (
      <AuthShell>
        <AuthCard>
          <AuthTitle
            title={t("Accounts aren’t available here")}
            sub={t("This copy of {product} isn’t connected to the cloud, so there’s no password to reset.", { product: PRODUCT_NAME })}
          />
        </AuthCard>
      </AuthShell>
    );
  }

  // Arrived from the reset email: choose a new password. (Signed in some other way, the change is in Settings › Account,
  // which asks for the current password first; here they can send themselves a reset link.)
  const setting = sync.authReady && sync.signedIn && proven;
  if (done) {
    return (
      <AuthShell>
        <AuthCard>
          <AuthTitle icon={<CheckCircle2 />} title={t("Password updated")} sub={t("Use your new password to sign in on the iPad, iPhone and web.")} />
          <Link href="/jobs" className="btn btn-brand h-11 w-full">
            {t("Continue to {product}", { product: PRODUCT_NAME })} <ArrowRight />
          </Link>
        </AuthCard>
      </AuthShell>
    );
  }

  if (setting) {
    const mismatch = pw2.length > 0 && pw !== pw2;
    return (
      <AuthShell>
        <AuthCard>
          <AuthTitle
            icon={<KeyRound />}
            title={t("Choose a new password")}
            sub={rich(recovery ? t("For {email}.") : t("Signed in as {email}."), {
              email: <span className="font-medium break-all text-slate-700">{sync.email}</span>,
            })}
          />
          <form
            className="space-y-4"
            onSubmit={async (e) => {
              e.preventDefault();
              if (pw.length < PASSWORD_MIN) return setError(t.tn("Use at least {n} character.", "Use at least {n} characters.", PASSWORD_MIN));
              if (pw !== pw2) return setError(t("The two passwords don’t match."));
              setBusy(true);
              setError(null);
              try {
                // The reset link is the proof; Supabase may still want the emailed code ("Secure password change").
                // Every other session is signed out afterwards.
                const r = await changePassword({ email: sync.email, password: pw, recovery: true, nonce: code ?? undefined });
                if (r.ok) setDone(true);
                else if ("codeSent" in r) {
                  setCode("");
                  setError(t("Enter the code to confirm it's you."));
                } else setError(r.error);
              } catch (err) {
                setError(t(authErrorMessage(errText(err))));
              } finally {
                setBusy(false);
              }
            }}
          >
            <PasswordField id="rs-new" label={t("New password")} isNew autoFocus value={pw} onChange={setPw} />
            <div>
              <label className="label" htmlFor="rs-repeat">{t("Repeat new password")}</label>
              <input id="rs-repeat" className="input h-11" type="password" autoComplete="new-password" required value={pw2} onChange={(e) => setPw2(e.target.value)} />
              {mismatch && <p className="mt-1.5 text-xs text-amber-700">{t("The two passwords don’t match yet.")}</p>}
            </div>
            {code !== null && (
              <div>
                <label className="label" htmlFor="rs-code">{t("Your code")}</label>
                <input id="rs-code" className="input h-11" inputMode="numeric" autoComplete="one-time-code" required value={code} onChange={(e) => setCode(e.target.value)} autoFocus />
              </div>
            )}
            <FormError>{error}</FormError>
            <button className="btn btn-brand h-11 w-full text-[15px]" disabled={busy || pw.length < PASSWORD_MIN || pw !== pw2 || (code !== null && !code.trim())}>
              {busy && <Loader2 className="animate-spin" />} {t("Save new password")}
            </button>
          </form>
        </AuthCard>
      </AuthShell>
    );
  }

  if (!sync.authReady || (recovery && !linkError)) {
    return (
      <AuthShell>
        <p className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> {recovery ? t("Opening your reset link…") : t("Loading…")}
        </p>
      </AuthShell>
    );
  }

  if (sent) {
    return (
      <AuthShell>
        <AuthCard>
          <AuthTitle
            icon={<Mail />}
            title={t("Check your email")}
            sub={rich(t("If {email} has a {product} account, a reset link is on its way.", { product: PRODUCT_NAME }), {
              email: <span className="font-medium break-all text-slate-700">{email.trim()}</span>,
            })}
          />
          <ul className="mb-5 space-y-1.5 text-sm text-slate-500">
            <li>· {t("The email may take a few minutes to arrive — check spam too.")}</li>
            <li>· {t("Open the link in this browser to choose a new password.")}</li>
          </ul>
          <div className="space-y-2">
            <Link href="/login" className="btn h-11 w-full">
              {t("Back to sign in")}
            </Link>
            <button className="btn btn-ghost h-10 w-full text-slate-500" onClick={() => setSent(false)}>
              {t("Use a different email")}
            </button>
          </div>
        </AuthCard>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      aside={
        <Link href="/login" className="font-medium text-slate-900 hover:underline">
          {t("Sign in")}
        </Link>
      }
    >
      <AuthCard>
        <AuthTitle
          icon={<KeyRound />}
          title={t("Reset your password")}
          sub={t("Enter the email you sign in with and we’ll send you a link to choose a new password. It may take a few minutes to arrive.")}
        />
        {linkError && (
          <div className="mb-4">
            <FormError>{linkError}</FormError>
          </div>
        )}
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setError(t("Enter a valid email address."));
            setBusy(true);
            setError(null);
            try {
              const { error } = await getSupabase()!.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/reset`, captchaToken: await takeCaptcha() });
              if (error) setError(t(authErrorMessage(error.message)));
              else setSent(true);
            } catch (err) {
              setError(t(authErrorMessage(errText(err))));
            } finally {
              setBusy(false);
            }
          }}
        >
          <div>
            <label className="label" htmlFor="rs-email">{t("Email")}</label>
            <input id="rs-email" className="input h-11" type="email" inputMode="email" autoComplete="email" autoCapitalize="none" spellCheck={false} required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div ref={captchaMount} className="flex justify-center empty:hidden" />
          <FormError>{error ?? captchaError}</FormError>
          <button className="btn btn-brand h-11 w-full text-[15px]" disabled={busy || !email.trim()}>
            {busy ? <Loader2 className="animate-spin" /> : <Mail />} {t("Send reset link")}
          </button>
        </form>
      </AuthCard>
    </AuthShell>
  );
}
