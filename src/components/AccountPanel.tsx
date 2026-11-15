"use client";
import { CheckCircle2, CircleAlert } from "lucide-react";
import { useState } from "react";
import { checkCloudSetup, type CheckResult } from "@/lib/cloudCheck";
import { getSupabase } from "@/lib/supabase";
import { useSyncStatus } from "@/lib/sync";

/** Account + sync settings. Local-only mode when Supabase env vars are missing. */
export default function AccountPanel() {
  const s = useSyncStatus();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  if (!s.configured) {
    return (
      <section id="account" className="space-y-2">
        <h2 className="text-lg font-semibold">Account &amp; sync</h2>
        <p className="text-sm text-slate-600">
          <span className="font-medium">Local only</span> (Supabase not configured). Everything is saved on this device and works offline.
          To share plans with your team, set <code>NEXT_PUBLIC_SUPABASE_URL</code> and <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> and run the
          migration in <code>supabase/migrations</code>.
        </p>
      </section>
    );
  }

  const sb = getSupabase();
  const run = async (fn: () => Promise<{ error: { message: string } | null }>, ok: string) => {
    setBusy(true);
    setMsg(null);
    try {
      const { error } = await fn();
      setMsg(error ? error.message : ok);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section id="account" className="space-y-3">
      <h2 className="text-lg font-semibold">Account &amp; sync</h2>
      <CloudCheck />
      {!s.authReady ? (
        <p className="text-sm text-slate-500">Checking sign-in…</p>
      ) : s.signedIn ? (
        <div className="space-y-3">
          <p className="text-sm">
            Signed in as <span className="font-medium">{s.email}</span>
          </p>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="text-slate-500">Connection</dt>
            <dd>{s.online ? "Online" : "Offline — changes are queued"}</dd>
            <dt className="text-slate-500">Pending changes</dt>
            <dd>{s.pending}</dd>
            <dt className="text-slate-500">Last sync</dt>
            <dd>{s.lastSyncAt ? new Date(s.lastSyncAt).toLocaleString() : "—"}</dd>
            {s.error && (
              <>
                <dt className="text-slate-500">Error</dt>
                <dd className="text-red-600">{s.error}</dd>
              </>
            )}
          </dl>
          <div className="flex gap-2">
            <button className="btn btn-primary" disabled={s.syncing || !s.online} onClick={() => s.syncNow()}>
              {s.syncing ? "Syncing…" : "Sync now"}
            </button>
            <button className="btn" onClick={() => sb?.auth.signOut()}>
              Sign out
            </button>
          </div>
        </div>
      ) : (
        <form
          className="max-w-sm space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            void run(() => sb!.auth.signInWithPassword({ email, password }), "Signed in.");
          }}
        >
          <p className="text-sm text-slate-600">Sign in to sync plans across devices and share them with your crew.</p>
          <input className="input" type="email" required placeholder="Email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <input className="input" type="password" placeholder="Password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={busy || !password} className="btn btn-primary">
              Sign in
            </button>
            <button type="button" disabled={busy || !password} className="btn" onClick={() => run(() => sb!.auth.signUp({ email, password }), "Account created. Check your email to confirm.")}>
              Create account
            </button>
            <button
              type="button"
              disabled={busy || !email}
              className="btn"
              onClick={() => run(() => sb!.auth.signInWithOtp({ email, options: { emailRedirectTo: `${window.location.origin}/settings` } }), "Magic link sent — check your email.")}
            >
              Email me a link
            </button>
          </div>
          {msg && <p className="text-sm text-slate-700">{msg}</p>}
        </form>
      )}
    </section>
  );
}

/** Tests each piece of the cloud setup (keys, sign-in, tables, functions, storage, saving) and says what to fix. */
function CloudCheck() {
  const [results, setResults] = useState<CheckResult[] | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
      <div className="flex items-center gap-3">
        <span className="flex-1 text-sm text-slate-600">Something not syncing or proposals failing? Check every part of the cloud setup.</span>
        <button
          type="button"
          className="btn btn-sm"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              setResults(await checkCloudSetup());
            } catch (e) {
              setResults([{ name: "Cloud check", ok: false, fix: (e as Error).message }]);
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Checking…" : "Check cloud setup"}
        </button>
      </div>
      {results && (
        <ul className="mt-3 space-y-2">
          {results.map((r) => (
            <li key={r.name} className="flex gap-2 text-sm">
              {r.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> : <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />}
              <div>
                <span className="font-medium">{r.name}</span>
                {r.detail && r.ok && <span className="text-slate-500"> · {r.detail}</span>}
                {!r.ok && r.fix && <div className="text-slate-600">{r.fix}</div>}
                {!r.ok && r.detail && <div className="text-xs text-slate-400">{r.detail}</div>}
              </div>
            </li>
          ))}
          {results.every((r) => r.ok) && <li className="text-sm font-medium text-emerald-700">All good — sync and proposal links are ready.</li>}
        </ul>
      )}
    </div>
  );
}
