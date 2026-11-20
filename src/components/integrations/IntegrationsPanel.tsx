"use client";
// Settings → Connected apps: connect the company's accounting app (QuickBooks Online, Xero; Billdu has its own section).
// Connect / Disconnect / Last sync up front; mapping and the last 20 events under "More". Office only.
import { Link2 } from "lucide-react";
import { useEffect, useState } from "react";
import { fmtDate, msg, useT } from "@/lib/i18n";
import { getSupabase } from "@/lib/supabase";
import { useRole } from "@/lib/team";
import { can } from "@/lib/teamLogic";
import { rich } from "../ui/richText";
import { ApiError, connectProvider, disconnectProvider, listIntegrations, providerStatus, saveProviderSettings, testProvider, type IntegrationsList, type ProviderStatus } from "./accountingClient";

const when = (iso: string | null | undefined) => (iso ? fmtDate(iso, { dateStyle: "medium", timeStyle: "short" }) : "");

const RESULT_TEXT: Record<string, { ok: boolean; text: string }> = {
  connected: { ok: true, text: msg("Connected.") },
  cancelled: { ok: false, text: msg("Sign-in was cancelled.") },
  expired: { ok: false, text: msg("That sign-in link expired or was already used. Press Connect again.") },
  not_configured: { ok: false, text: msg("This app isn't switched on for this server.") },
  error: { ok: false, text: msg("Connecting didn't work. Try again; the activity list under More says why.") },
};

export default function IntegrationsPanel() {
  const office = can(useRole(), "prices");
  const [list, setList] = useState<IntegrationsList | null>(null);
  const [locked, setLocked] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ provider: string; ok: boolean; text: string } | null>(null);
  const t = useT();

  async function load() {
    try {
      setList(await listIntegrations());
      setLocked(null);
    } catch (e) {
      if (e instanceof ApiError && (e.status === 401 || e.status === 403)) setLocked(e.message);
      else setLocked(msg("Can't reach the server (offline?)."));
    }
  }

  useEffect(() => {
    // Coming back from the provider's sign-in page: ?integration=quickbooks&result=connected
    const q = new URLSearchParams(window.location.search);
    const p = q.get("integration");
    const r = q.get("result");
    const t = window.setTimeout(() => {
      if (p && r && RESULT_TEXT[r]) setNotice({ provider: p, ...RESULT_TEXT[r] });
      void load();
    }, 0);
    window.addEventListener("pinplan:auth-changed", load);
    const sub = getSupabase()?.auth.onAuthStateChange(() => void load());
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("pinplan:auth-changed", load);
      sub?.data.subscription.unsubscribe();
    };
  }, []);

  if (!office) return null;
  const providers = (list?.providers ?? []).filter((p) => p.auth === "oauth2");

  return (
    <div className="mx-auto max-w-5xl px-4 pb-8 sm:px-6 md:grid md:grid-cols-[180px_1fr] md:gap-8">
      <div className="hidden md:block" />
      <section id="integrations" className="card min-w-0 scroll-mt-6 space-y-4 p-6">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Link2 className="h-5 w-5 text-slate-400" /> {t("Connected apps")}
          </h2>
          <p className="text-sm text-slate-500">{t("Send issued invoices, credit notes and payments straight to your accounting app. No app? Use Export for accountant on the Invoices page.")}</p>
        </div>
        {locked && <p className="text-sm text-slate-500">{t(locked)}</p>}
        {list && !list.storageReady && list.mode !== "single_company" && <p className="text-sm text-amber-700">{list.storageMessage}</p>}
        {list?.mode === "single_company" && <p className="text-sm text-slate-500">{t("Sign in with a company account to connect an accounting app.")}</p>}
        {!list && !locked && <p className="text-sm text-slate-500">{t("Loading…")}</p>}
        <div className="divide-y divide-slate-100">
          {providers.map((p) => (
            <ProviderRow key={p.id} p={p} canConnect={!!list?.storageReady && list.mode !== "single_company"} notice={notice?.provider === p.id ? notice : null} onChanged={load} />
          ))}
        </div>
        {list?.providers.some((p) => p.id === "billdu") && (
          <p className="text-xs text-slate-500">
            {rich(t("Billdu is set up in its own section: {link}."), {
              link: (
                <a className="underline" href="#billdu">
                  {t("Settings → Billdu")}
                </a>
              ),
            })}
          </p>
        )}
      </section>
    </div>
  );
}

function StatusChip({ p }: { p: ProviderStatus }) {
  const s = p.connection?.status;
  const t = useT();
  const [text, cls] = !p.enabled
    ? [t("Not available yet"), "bg-slate-100 text-slate-500"]
    : s === "connected"
      ? [t("Connected"), "bg-emerald-50 text-emerald-700"]
      : s === "needs_reconnect"
        ? [t("Connect again"), "bg-amber-50 text-amber-800"]
        : [t("Not connected"), "bg-slate-100 text-slate-600"];
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>{text}</span>;
}

function ProviderRow({ p: initial, canConnect, notice, onChanged }: { p: ProviderStatus; canConnect: boolean; notice: { ok: boolean; text: string } | null; onChanged: () => void }) {
  const [p, setP] = useState(initial);
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(notice);
  const [settings, setSettings] = useState<Record<string, string>>(initial.settings);
  const t = useT();
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setP(initial);
      setSettings(initial.settings);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [initial]);

  async function run(fn: () => Promise<string | void>) {
    setBusy(true);
    setNote(null);
    try {
      const text = await fn();
      if (text) setNote({ ok: true, text });
    } catch (e) {
      setNote({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  async function openMore() {
    const next = !more;
    setMore(next);
    if (next)
      try {
        setP(await providerStatus(p.id));
      } catch {
        /* keep what we have */
      }
  }

  const connected = p.connection?.status === "connected";
  const needsReconnect = p.connection?.status === "needs_reconnect";
  const c = p.connection;

  return (
    <div className="py-4 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-center gap-3">
        <div className="mr-auto min-w-0">
          <div className="flex items-center gap-2 font-medium">
            {p.label}
            {p.beta && <span className="rounded bg-brand-50 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-brand-700 uppercase">{t("Beta")}</span>}
            <StatusChip p={p} />
          </div>
          <div className="mt-0.5 text-xs text-slate-500">
            {c?.companyName && <>{c.companyName}{c.environment === "sandbox" ? ` ${t("(sandbox)")}` : ""} · </>}
            {c?.lastSyncAt ? t("Last sync {date}", { date: when(c.lastSyncAt) }) : connected ? t("Nothing sent yet") : p.enabled ? t("Not connected") : t("Your PinPlan server needs this app's keys first.")}
          </div>
          {c?.lastError && <div className="mt-1 text-xs text-red-600">{c.lastError}</div>}
        </div>
        {p.enabled && canConnect && (
          <div className="flex gap-2">
            {(!connected || needsReconnect) && (
              <button className="btn btn-brand btn-sm" disabled={busy} onClick={() => void run(async () => { window.location.href = (await connectProvider(p.id)).url; })}>
                {needsReconnect ? t("Connect again") : t("Connect")}
              </button>
            )}
            {connected && (
              <button className="btn btn-sm" disabled={busy} onClick={() => void run(async () => (await testProvider(p.id)).message)}>
                {t("Test")}
              </button>
            )}
            {(connected || needsReconnect) && (
              <button
                className="btn btn-sm btn-ghost"
                disabled={busy}
                onClick={() => {
                  if (!confirm(t("Disconnect {app}? Nothing is deleted there; PinPlan just stops sending.", { app: p.label }))) return;
                  void run(async () => {
                    setP(await disconnectProvider(p.id));
                    onChanged();
                    return t("Disconnected.");
                  });
                }}
              >
                {t("Disconnect")}
              </button>
            )}
            <button className="btn btn-sm btn-ghost" onClick={() => void openMore()} aria-expanded={more}>
              {more ? t("Less") : t("More")}
            </button>
          </div>
        )}
      </div>
      {note && <p className={`mt-2 text-sm ${note.ok ? "text-emerald-700" : "text-red-600"}`}>{t(note.text)}</p>}

      {more && (
        <div className="mt-3 space-y-4 rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200">
          {p.settingsFields.length > 0 && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void run(async () => {
                  const out = await saveProviderSettings(p.id, settings);
                  setSettings(out.settings);
                  return t("Mapping saved.");
                });
              }}
            >
              <div className="label">{t("Mapping")}</div>
              <p className="mb-2 text-xs text-slate-500">{t("Where PinPlan’s lines go in {app}. Tax is sent as its own line so totals match to the cent.", { app: p.label })}</p>
              <div className="grid gap-3 sm:grid-cols-2">
                {p.settingsFields.map((f) => (
                  <label key={f.key} className="text-sm">
                    <span className="label">{f.label}</span>
                    <input className="input" value={settings[f.key] ?? ""} placeholder={f.placeholder} onChange={(e) => setSettings({ ...settings, [f.key]: e.target.value })} />
                    {f.help && <span className="mt-1 block text-xs text-slate-500">{f.help}</span>}
                  </label>
                ))}
              </div>
              <button className="btn btn-sm mt-3" disabled={busy}>
                {t("Save mapping")}
              </button>
            </form>
          )}
          <div>
            <div className="label">{t("Recent activity")}</div>
            {p.events.length === 0 ? (
              <p className="text-sm text-slate-500">{t("Nothing yet.")}</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {p.events.map((e, i) => (
                  <li key={`${e.created_at}-${i}`} className="flex gap-2">
                    <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${e.ok ? "bg-emerald-500" : "bg-red-500"}`} aria-label={e.ok ? t("ok") : t("problem")} />
                    <span className="min-w-0 flex-1">{e.message || e.kind}</span>
                    <span className="shrink-0 text-xs text-slate-400">{when(e.created_at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
