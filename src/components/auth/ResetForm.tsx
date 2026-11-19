"use client";
// /reset: ask for a reset email, then (arriving from that email with a recovery session) choose a new password.
import { ArrowRight, CheckCircle2, KeyRound, Loader2, Mail } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { authErrorMessage } from "@/lib/onboardingLogic";
import { PRODUCT_NAME } from "@/lib/plans";
import { getSupabase, supabaseConfigured } from "@/lib/supabase";
import { useSyncStatus } from "@/lib/sync";
import { linkErrorFrom, useArrivalParams } from "@/lib/useArrivalUrl";
import { PASSWORD_MIN } from "@/lib/teamLogic";
import { AuthCard, AuthShell, AuthTitle, errText, FormError, PasswordField } from "./AuthShell";

export default function ResetForm() {
  const params = useSearchParams();
  const sync = useSyncStatus();
  const [email, setEmail] = useState(() => params.get("email") ?? "");
  const [sent, setSent] = useState(false);
  // Arriving from the reset email: Supabase puts type=recovery in the hash (or ?code= with PKCE) and then says
  // PASSWORD_RECOVERY once the session is ready.
  const arrival = useArrivalParams();
  const [recoveryEvent, setRecoveryEvent] = useState(false);
  const recovery = recoveryEvent || arrival?.hash.get("type") === "recovery" || !!arrival?.search.has("code");
  const [timedOut, setTimedOut] = useState(false);
  const linkError =
    linkErrorFrom(arrival?.hash, "That reset link has expired or was already used. Send yourself a new one below.") ??
    (timedOut ? "Couldn’t open that reset link. Send yourself a new one below and open it in this browser." : null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    const sub = getSupabase()?.auth.onAuthStateChange((evt) => {
      if (evt === "PASSWORD_RECOVERY") setRecoveryEvent(true);
    });
    return () => sub?.data.subscription.unsubscribe();
  }, []);

  // A link that never turns into a session (expired, opened in another browser): stop waiting and say so.
  const signedIn = sync.signedIn;
  useEffect(() => {
    if (!recovery || signedIn) return;
    const t = window.setTimeout(() => setTimedOut(true), 10_000);
    return () => window.clearTimeout(t);
  }, [recovery, signedIn]);

  if (!supabaseConfigured) {
    return (
      <AuthShell>
        <AuthCard>
          <AuthTitle title="Accounts aren’t available here" sub={`This copy of ${PRODUCT_NAME} isn’t connected to the cloud, so there’s no password to reset.`} />
        </AuthCard>
      </AuthShell>
    );
  }

  // Arrived from the email (or already signed in): choose a new password.
  const setting = sync.authReady && sync.signedIn;
  if (done) {
    return (
      <AuthShell>
        <AuthCard>
          <AuthTitle icon={<CheckCircle2 />} title="Password updated" sub={`Use your new password to sign in on the iPad, iPhone and web.`} />
          <Link href="/" className="btn btn-brand h-11 w-full">
            Continue to {PRODUCT_NAME} <ArrowRight />
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
            title="Choose a new password"
            sub={
              <>
                {recovery ? "For" : "Signed in as"} <span className="font-medium break-all text-slate-700">{sync.email}</span>.
              </>
            }
          />
          <form
            className="space-y-4"
            onSubmit={async (e) => {
              e.preventDefault();
              if (pw.length < PASSWORD_MIN) return setError(`Use at least ${PASSWORD_MIN} characters.`);
              if (pw !== pw2) return setError("The two passwords don’t match.");
              setBusy(true);
              setError(null);
              try {
                const { error } = await getSupabase()!.auth.updateUser({ password: pw });
                if (error) setError(/different from the old/i.test(error.message) ? "Choose a password you haven’t used before." : authErrorMessage(error.message));
                else setDone(true);
              } catch (err) {
                setError(authErrorMessage(errText(err)));
              } finally {
                setBusy(false);
              }
            }}
          >
            <PasswordField id="rs-new" label="New password" isNew autoFocus value={pw} onChange={setPw} />
            <div>
              <label className="label" htmlFor="rs-repeat">Repeat new password</label>
              <input id="rs-repeat" className="input h-11" type="password" autoComplete="new-password" required value={pw2} onChange={(e) => setPw2(e.target.value)} />
              {mismatch && <p className="mt-1.5 text-xs text-amber-700">The two passwords don’t match yet.</p>}
            </div>
            <FormError>{error}</FormError>
            <button className="btn btn-brand h-11 w-full text-[15px]" disabled={busy || pw.length < PASSWORD_MIN || pw !== pw2}>
              {busy && <Loader2 className="animate-spin" />} Save new password
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
          <Loader2 className="h-4 w-4 animate-spin" /> {recovery ? "Opening your reset link…" : "Loading…"}
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
            title="Check your email"
            sub={
              <>
                If <span className="font-medium break-all text-slate-700">{email.trim()}</span> has a {PRODUCT_NAME} account, a reset link is on its way.
              </>
            }
          />
          <ul className="mb-5 space-y-1.5 text-sm text-slate-500">
            <li>· The email may take a few minutes to arrive — check spam too.</li>
            <li>· Open the link on this device to choose a new password.</li>
          </ul>
          <div className="space-y-2">
            <Link href="/login" className="btn h-11 w-full">
              Back to sign in
            </Link>
            <button className="btn btn-ghost h-10 w-full text-slate-500" onClick={() => setSent(false)}>
              Use a different email
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
          Sign in
        </Link>
      }
    >
      <AuthCard>
        <AuthTitle icon={<KeyRound />} title="Reset your password" sub="Enter the email you sign in with and we’ll send you a link to choose a new password. It may take a few minutes to arrive." />
        {linkError && (
          <div className="mb-4">
            <FormError>{linkError}</FormError>
          </div>
        )}
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setError("Enter a valid email address.");
            setBusy(true);
            setError(null);
            try {
              const { error } = await getSupabase()!.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/reset` });
              if (error) setError(authErrorMessage(error.message));
              else setSent(true);
            } catch (err) {
              setError(authErrorMessage(errText(err)));
            } finally {
              setBusy(false);
            }
          }}
        >
          <div>
            <label className="label" htmlFor="rs-email">Email</label>
            <input id="rs-email" className="input h-11" type="email" inputMode="email" autoComplete="email" autoCapitalize="none" spellCheck={false} required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <FormError>{error}</FormError>
          <button className="btn btn-brand h-11 w-full text-[15px]" disabled={busy || !email.trim()}>
            {busy ? <Loader2 className="animate-spin" /> : <Mail />} Send reset link
          </button>
        </form>
      </AuthCard>
    </AuthShell>
  );
}
