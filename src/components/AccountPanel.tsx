"use client";
import { useState } from "react";
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
      {s.signedIn ? (
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
            <button className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50" disabled={s.syncing || !s.online} onClick={() => s.syncNow()}>
              {s.syncing ? "Syncing…" : "Sync now"}
            </button>
            <button className="rounded-lg border px-4 py-2 text-sm" onClick={() => sb?.auth.signOut()}>
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
          <input className="w-full rounded-lg border px-3 py-2" type="email" required placeholder="Email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <input className="w-full rounded-lg border px-3 py-2" type="password" placeholder="Password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={busy || !password} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
              Sign in
            </button>
            <button type="button" disabled={busy || !password} className="rounded-lg border px-4 py-2 text-sm disabled:opacity-50" onClick={() => run(() => sb!.auth.signUp({ email, password }), "Account created. Check your email to confirm.")}>
              Create account
            </button>
            <button
              type="button"
              disabled={busy || !email}
              className="rounded-lg border px-4 py-2 text-sm disabled:opacity-50"
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
