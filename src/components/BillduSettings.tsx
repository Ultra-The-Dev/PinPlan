"use client";
// Settings → Billdu: connect this company's own Billdu account (owner/admin; technicians never see this section).
import { apiFetch } from "@/lib/api";
import { getSupabase } from "@/lib/supabase";
import { useEffect, useState } from "react";
import { getSettings, saveSettings } from "@/lib/db";
import type { AppSettings } from "@/lib/types";

type Source = "team" | "user" | "env" | "file" | "database" | null;

interface Status {
  /** team: a signed-in owner/admin · solo: signed in, no team · single_company: access code / no accounts on this server. */
  mode?: "team" | "solo" | "single_company";
  teamName?: string | null;
  configured: boolean;
  /** Where the credentials in use come from: the company's own (team/user) or the server-wide ones (env/file/database). */
  source: Source;
  keyHint: string | null;
  own?: {
    keyHint: string | null;
    updatedAt: string | null;
    updatedBy: string | null;
    lastTest: { at: string; ok: boolean; message: string | null } | null;
    error: string | null;
  } | null;
  /** Only for the founder's company and single-company servers. */
  server?: { configured: boolean; source: Source; keyHint: string | null; removable: boolean } | null;
  canMoveServer?: boolean;
  encryptionKeySet?: boolean;
  storage?: "database" | "file" | "company";
  storageReady?: boolean;
  storageMessage?: string | null;
  /** Set when the server refused the request (access code / sign-in needed, or not office staff). */
  locked?: string;
}

async function loadStatus(): Promise<Status> {
  const r = await apiFetch("/api/billdu/credentials", { cache: "no-store" });
  const j = await r.json();
  if (r.status === 401 || r.status === 403) return { configured: false, source: null, keyHint: null, locked: j.error ?? "Sign in first." };
  if (!r.ok) throw new Error(j.error || "Could not load the Billdu status.");
  return j as Status;
}

const when = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "");
const isServer = (s: Source) => s === "env" || s === "file" || s === "database";

export default function BillduSettings() {
  const [status, setStatus] = useState<Status | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [settings, setSettings] = useState<AppSettings | null>(null);

  async function refresh() {
    try {
      setStatus(await loadStatus());
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message || "Can't reach the server (offline?)." });
    }
  }
  useEffect(() => {
    let alive = true;
    const load = () =>
      loadStatus()
        .then((j) => alive && setStatus(j))
        .catch(() => alive && setMsg({ ok: false, text: "Can't reach the server (offline?)." }));
    load();
    window.addEventListener("pinplan:auth-changed", load);
    const sub = getSupabase()?.auth.onAuthStateChange(() => load());
    getSettings().then((s) => alive && setSettings(s));
    return () => {
      alive = false;
      window.removeEventListener("pinplan:auth-changed", load);
      sub?.data.subscription.unsubscribe();
    };
  }, []);

  /** Call the credentials API; the reply is the new status. */
  async function call(init: RequestInit, done: string, path = "/api/billdu/credentials") {
    setBusy(true);
    setMsg(null);
    try {
      const r = await apiFetch(path, { ...init, headers: { "Content-Type": "application/json" } });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Request failed");
      setStatus(j as Status);
      setMsg({ ok: true, text: done });
      return true;
    } catch (err) {
      setMsg({ ok: false, text: (err as Error).message });
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (await call({ method: "POST", body: JSON.stringify({ apiKey, apiSecret }) }, "Saved (encrypted on the server). Press Test connection to check it.")) {
      setApiKey("");
      setApiSecret("");
    }
  }

  async function disconnect() {
    const who = status?.mode === "single_company" ? "this server" : "your company";
    if (!confirm(`Disconnect Billdu for ${who}? Sending to Billdu stops until someone connects it again.`)) return;
    await call({ method: "DELETE" }, "Disconnected.");
  }

  async function moveServer() {
    if (!confirm("Copy the server-wide Billdu credentials into your company's own settings?")) return;
    await call({ method: "POST", body: JSON.stringify({ action: "move_server_credentials" }) }, "Moved. Your company now uses its own copy of these credentials.");
  }

  async function removeServer() {
    if (!confirm("Remove the server-wide Billdu credentials? Devices that sign in with only the access code (the iPad app) can't send to Billdu after this.")) return;
    await call({ method: "DELETE" }, "Server-wide credentials removed.", "/api/billdu/credentials?target=server");
  }

  async function test() {
    setBusy(true);
    setMsg(null);
    try {
      const r = await apiFetch("/api/billdu/test", { method: "POST" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Connection failed");
      setMsg({ ok: true, text: j.canRead ? "Connected. Reading data back from Billdu works." : "Connected, but Billdu returned no readable data." });
    } catch (err) {
      setMsg({ ok: false, text: (err as Error).message });
    } finally {
      setBusy(false);
      refresh();
    }
  }

  async function setDocType(t: AppSettings["billduDocType"]) {
    if (!settings) return;
    const next = { ...settings, billduDocType: t };
    setSettings(next);
    await saveSettings(next);
  }

  const input = "input";
  const company = status?.mode === "team" || status?.mode === "solo";
  const own = status?.own;
  const usingServer = isServer(status?.source ?? null);
  const canEdit = !!status && !status.locked && (status.storageReady ?? true);
  const canDisconnect = company ? !!own : status?.source === "file" || status?.source === "database";
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">
        Each company connects its own Billdu account. Estimates, orders and invoices you send go to the Billdu account connected here
        {status?.teamName ? ` for ${status.teamName}` : ""}, never to anyone else&apos;s.
      </p>
      <div className="space-y-1 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`inline-block h-2.5 w-2.5 rounded-full ${status?.configured ? "bg-emerald-500" : own?.error ? "bg-red-500" : "bg-slate-300"}`} />
          {status?.configured ? (
            <span>
              Connected — key ends in …{(status.keyHint ?? "").slice(-4)}
              {usingServer && company ? " (the server-wide founder credentials)" : ""}
              {status.source === "env" && !company ? " (from server environment variables)" : ""}
            </span>
          ) : (
            <span className="text-slate-600">Not connected</span>
          )}
        </div>
        {own?.updatedAt && (
          <p className="text-xs text-slate-500">
            Saved {own.updatedBy ? `by ${own.updatedBy} ` : ""}on {when(own.updatedAt)}
            {own.lastTest
              ? ` · last test ${when(own.lastTest.at)}: ${own.lastTest.ok ? "worked" : `failed${own.lastTest.message ? ` (${own.lastTest.message})` : ""}`}`
              : " · not tested yet"}
          </p>
        )}
        {own?.error && <p className="text-sm text-red-700">{own.error}</p>}
      </div>
      {status?.locked && <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-700 ring-1 ring-slate-200">🔒 {status.locked}</p>}
      {status && !status.locked && company && status.storageReady === false && (
        <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">{status.storageMessage}</p>
      )}
      {status && !status.locked && !company && !status.encryptionKeySet && status.source !== "env" && (
        <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
          The server has no <code>PINPLAN_ENCRYPTION_KEY</code>. Set it (any long random string) so the key and secret can be stored encrypted, or set <code>BILLDU_API_KEY</code> / <code>BILLDU_API_SECRET</code> directly.
        </p>
      )}
      {status?.canMoveServer && (
        <div className="space-y-2 rounded-lg bg-sky-50 p-3 text-sm text-sky-900 ring-1 ring-sky-200">
          <p>
            Your company (the founder account) is using the server-wide Billdu credentials (key …{(status.server?.keyHint ?? "").slice(-4)}). Move them into your
            company&apos;s own settings so they work like every other company&apos;s.
          </p>
          <button type="button" onClick={moveServer} disabled={busy} className="btn">
            Move these credentials to my company
          </button>
        </div>
      )}
      {company && own && status?.server?.configured && (
        <div className="space-y-2 rounded-lg bg-slate-50 p-3 text-sm text-slate-700 ring-1 ring-slate-200">
          <p>
            The server still has server-wide Billdu credentials (key …{(status.server.keyHint ?? "").slice(-4)}). Your company now uses its own. Keep the server-wide ones
            while the iPad app signs in with only the access code; it still uses them.
          </p>
          {status.server.removable ? (
            <button type="button" onClick={removeServer} disabled={busy} className="btn btn-danger">
              Remove the server-wide credentials
            </button>
          ) : (
            <p className="text-xs">
              They come from the <code>BILLDU_API_KEY</code> / <code>BILLDU_API_SECRET</code> environment variables: delete those on the host and redeploy to remove them.
            </p>
          )}
        </div>
      )}
      {canEdit && (
        <form onSubmit={save} className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            <span className="label">API key</span>
            <input className={input} value={apiKey} onChange={(e) => setApiKey(e.target.value)} autoComplete="off" placeholder="Billdu → Settings → API" />
          </label>
          <label className="text-sm">
            <span className="label">API secret</span>
            <input className={input} type="password" value={apiSecret} onChange={(e) => setApiSecret(e.target.value)} autoComplete="new-password" />
          </label>
          <div className="flex flex-wrap gap-2 sm:col-span-2">
            <button disabled={busy || !apiKey || !apiSecret} className="btn btn-brand">
              {own || (!company && status?.configured) ? "Replace credentials" : "Connect Billdu"}
            </button>
            <button type="button" onClick={test} disabled={busy || !status?.configured} className="btn">
              Test connection
            </button>
            {canDisconnect && (
              <button type="button" onClick={disconnect} disabled={busy} className="btn btn-danger">
                Disconnect
              </button>
            )}
          </div>
        </form>
      )}
      {msg && <p className={`text-sm ${msg.ok ? "text-emerald-700" : "text-red-700"}`}>{msg.text}</p>}
      <label className="block text-sm">
        <span className="label">First Billdu document for a new project</span>
        <select className={input + " max-w-xs"} value={settings?.billduDocType ?? "estimate"} onChange={(e) => setDocType(e.target.value as AppSettings["billduDocType"])}>
          <option value="estimate">Estimate</option>
          <option value="order">Order</option>
          <option value="invoice">Invoice</option>
        </select>
      </label>
      <p className="text-xs text-slate-500">
        Only the Billdu account owner can see the API key and secret (Billdu → Settings → API). They are sent to this app&apos;s server once, stored encrypted for
        your company and never shown again or stored in the browser.
      </p>
    </div>
  );
}
