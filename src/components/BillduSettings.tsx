"use client";
// Settings → Billdu: connect this company's own Billdu account (owner/admin; technicians never see this section).
import { apiFetch } from "@/lib/api";
import { fmtDate, msg, useT } from "@/lib/i18n";
import { getSupabase } from "@/lib/supabase";
import { useEffect, useState } from "react";
import { getSettings, saveSettings } from "@/lib/db";
import type { AppSettings } from "@/lib/types";
import { billduChanged } from "@/lib/useBilldu";
import { rich } from "./ui/richText";

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

const when = (iso: string | null | undefined) => (iso ? fmtDate(iso, { dateStyle: "medium", timeStyle: "short" }) : "");
const isServer = (s: Source) => s === "env" || s === "file" || s === "database";

export default function BillduSettings() {
  const [status, setStatus] = useState<Status | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const t = useT();

  async function refresh() {
    try {
      setStatus(await loadStatus());
    } catch (e) {
      setNote({ ok: false, text: (e as Error).message || t("Can't reach the server (offline?).") });
    }
  }
  useEffect(() => {
    let alive = true;
    const load = () =>
      loadStatus()
        .then((j) => alive && setStatus(j))
        .catch(() => alive && setNote({ ok: false, text: msg("Can't reach the server (offline?).") }));
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
    setNote(null);
    try {
      const r = await apiFetch(path, { ...init, headers: { "Content-Type": "application/json" } });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Request failed");
      setStatus(j as Status);
      // Money screens show Billdu only while it's connected.
      billduChanged();
      setNote({ ok: true, text: done });
      return true;
    } catch (err) {
      setNote({ ok: false, text: (err as Error).message });
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (await call({ method: "POST", body: JSON.stringify({ apiKey, apiSecret }) }, t("Saved (encrypted on the server). Press Test connection to check it."))) {
      setApiKey("");
      setApiSecret("");
    }
  }

  async function disconnect() {
    const question =
      status?.mode === "single_company"
        ? t("Disconnect Billdu for this server? Sending to Billdu stops until someone connects it again.")
        : t("Disconnect Billdu for your company? Sending to Billdu stops until someone connects it again.");
    if (!confirm(question)) return;
    await call({ method: "DELETE" }, t("Disconnected."));
  }

  async function moveServer() {
    if (!confirm(t("Copy the server-wide Billdu credentials into your company's own settings?"))) return;
    await call({ method: "POST", body: JSON.stringify({ action: "move_server_credentials" }) }, t("Moved. Your company now uses its own copy of these credentials."));
  }

  async function removeServer() {
    if (!confirm(t("Remove the server-wide Billdu credentials? Devices that sign in with only the access code (the iPad app) can't send to Billdu after this."))) return;
    await call({ method: "DELETE" }, t("Server-wide credentials removed."), "/api/billdu/credentials?target=server");
  }

  async function test() {
    setBusy(true);
    setNote(null);
    try {
      const r = await apiFetch("/api/billdu/test", { method: "POST" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Connection failed");
      setNote({ ok: true, text: j.canRead ? t("Connected. Reading data back from Billdu works.") : t("Connected, but Billdu returned no readable data.") });
    } catch (err) {
      setNote({ ok: false, text: (err as Error).message });
    } finally {
      setBusy(false);
      refresh();
    }
  }

  async function setDocType(docType: AppSettings["billduDocType"]) {
    if (!settings) return;
    const next = { ...settings, billduDocType: docType };
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
        {status?.teamName
          ? t("Each company connects its own Billdu account. Estimates, orders and invoices you send go to the Billdu account connected here for {team}, never to anyone else's.", { team: status.teamName })
          : t("Each company connects its own Billdu account. Estimates, orders and invoices you send go to the Billdu account connected here, never to anyone else's.")}
      </p>
      <div className="space-y-1 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`inline-block h-2.5 w-2.5 rounded-full ${status?.configured ? "bg-emerald-500" : own?.error ? "bg-red-500" : "bg-slate-300"}`} />
          {status?.configured ? (
            <span>
              {t("Connected — key ends in …{hint}", { hint: (status.keyHint ?? "").slice(-4) })}
              {usingServer && company ? ` ${t("(the server-wide founder credentials)")}` : ""}
              {status.source === "env" && !company ? ` ${t("(from server environment variables)")}` : ""}
            </span>
          ) : (
            <span className="text-slate-600">{t("Not connected")}</span>
          )}
        </div>
        {own?.updatedAt && (
          <p className="text-xs text-slate-500">
            {own.updatedBy ? t("Saved by {name} on {date}", { name: own.updatedBy, date: when(own.updatedAt) }) : t("Saved on {date}", { date: when(own.updatedAt) })}
            {" · "}
            {own.lastTest
              ? own.lastTest.ok
                ? t("last test {date}: worked", { date: when(own.lastTest.at) })
                : own.lastTest.message
                  ? t("last test {date}: failed ({error})", { date: when(own.lastTest.at), error: own.lastTest.message })
                  : t("last test {date}: failed", { date: when(own.lastTest.at) })
              : t("not tested yet")}
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
          {rich(t("The server has no {enc}. Set it (any long random string) so the key and secret can be stored encrypted, or set {key} / {secret} directly."), {
            enc: <code>PINPLAN_ENCRYPTION_KEY</code>,
            key: <code>BILLDU_API_KEY</code>,
            secret: <code>BILLDU_API_SECRET</code>,
          })}
        </p>
      )}
      {status?.canMoveServer && (
        <div className="space-y-2 rounded-lg bg-sky-50 p-3 text-sm text-sky-900 ring-1 ring-sky-200">
          <p>
            {t("Your company (the founder account) is using the server-wide Billdu credentials (key …{hint}). Move them into your company's own settings so they work like every other company's.", { hint: (status.server?.keyHint ?? "").slice(-4) })}
          </p>
          <button type="button" onClick={moveServer} disabled={busy} className="btn">
            {t("Move these credentials to my company")}
          </button>
        </div>
      )}
      {company && own && status?.server?.configured && (
        <div className="space-y-2 rounded-lg bg-slate-50 p-3 text-sm text-slate-700 ring-1 ring-slate-200">
          <p>
            {t("The server still has server-wide Billdu credentials (key …{hint}). Your company now uses its own. Keep the server-wide ones while the iPad app signs in with only the access code; it still uses them.", { hint: (status.server.keyHint ?? "").slice(-4) })}
          </p>
          {status.server.removable ? (
            <button type="button" onClick={removeServer} disabled={busy} className="btn btn-danger">
              {t("Remove the server-wide credentials")}
            </button>
          ) : (
            <p className="text-xs">
              {rich(t("They come from the {key} / {secret} environment variables: delete those on the host and redeploy to remove them."), {
                key: <code>BILLDU_API_KEY</code>,
                secret: <code>BILLDU_API_SECRET</code>,
              })}
            </p>
          )}
        </div>
      )}
      {canEdit && (
        <form onSubmit={save} className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            <span className="label">{t("API key")}</span>
            <input className={input} value={apiKey} onChange={(e) => setApiKey(e.target.value)} autoComplete="off" placeholder={t("Billdu → Settings → API")} />
          </label>
          <label className="text-sm">
            <span className="label">{t("API secret")}</span>
            <input className={input} type="password" value={apiSecret} onChange={(e) => setApiSecret(e.target.value)} autoComplete="new-password" />
          </label>
          <div className="flex flex-wrap gap-2 sm:col-span-2">
            <button disabled={busy || !apiKey || !apiSecret} className="btn btn-brand">
              {own || (!company && status?.configured) ? t("Replace credentials") : t("Connect Billdu")}
            </button>
            <button type="button" onClick={test} disabled={busy || !status?.configured} className="btn">
              {t("Test connection")}
            </button>
            {canDisconnect && (
              <button type="button" onClick={disconnect} disabled={busy} className="btn btn-danger">
                {t("Disconnect")}
              </button>
            )}
          </div>
        </form>
      )}
      {note && <p className={`text-sm ${note.ok ? "text-emerald-700" : "text-red-700"}`}>{t(note.text)}</p>}
      {status?.configured && (
        <label className="block text-sm">
          <span className="label">{t("First Billdu document for a new job")}</span>
          <select className={input + " max-w-xs"} value={settings?.billduDocType ?? "estimate"} onChange={(e) => setDocType(e.target.value as AppSettings["billduDocType"])}>
            <option value="estimate">{t("Estimate")}</option>
            <option value="order">{t("Order")}</option>
            <option value="invoice">{t("Invoice")}</option>
          </select>
        </label>
      )}
      <p className="text-xs text-slate-500">
        {t("Only the Billdu account owner can see the API key and secret (Billdu → Settings → API). They are sent to this app's server once, stored encrypted for your company and never shown again or stored in the browser.")}
      </p>
    </div>
  );
}
