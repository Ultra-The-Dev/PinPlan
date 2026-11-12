"use client";
import { apiFetch } from "@/lib/api";
import { getSupabase } from "@/lib/supabase";
import { useEffect, useState } from "react";
import { getSettings, saveSettings } from "@/lib/db";
import type { AppSettings } from "@/lib/types";

interface Status {
  configured: boolean;
  source: "env" | "file" | "database" | null;
  keyHint: string | null;
  encryptionKeySet?: boolean;
  storage?: "database" | "file";
  /** Set when the server refused the request (access code / sign-in needed). */
  locked?: string;
}

async function loadStatus(): Promise<Status> {
  const r = await apiFetch("/api/billdu/credentials", { cache: "no-store" });
  const j = await r.json();
  if (r.status === 401) return { configured: false, source: null, keyHint: null, locked: j.error ?? "Sign in first." };
  return j as Status;
}

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
    } catch {
      setStatus(null);
      setMsg({ ok: false, text: "Can't reach the server (offline?)." });
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

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const r = await apiFetch("/api/billdu/credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey, apiSecret }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Save failed");
      setApiKey("");
      setApiSecret("");
      setMsg({ ok: true, text: "Saved (encrypted on the server)." });
      await refresh();
    } catch (err) {
      setMsg({ ok: false, text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    if (!confirm("Remove the stored Billdu credentials from the server?")) return;
    await apiFetch("/api/billdu/credentials", { method: "DELETE" });
    setMsg({ ok: true, text: "Removed." });
    refresh();
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
    }
  }

  async function setDocType(t: AppSettings["billduDocType"]) {
    if (!settings) return;
    const next = { ...settings, billduDocType: t };
    setSettings(next);
    await saveSettings(next);
  }

  const input = "input";
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className={`inline-block h-2.5 w-2.5 rounded-full ${status?.configured ? "bg-emerald-500" : "bg-slate-300"}`} />
        {status?.configured ? (
          <span>
            Connected — key {status.keyHint}
            {status.source === "env" ? " (from server environment variables)" : ""}
          </span>
        ) : (
          <span className="text-slate-600">Not connected</span>
        )}
      </div>
      {status?.locked && <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-700 ring-1 ring-slate-200">🔒 {status.locked}</p>}
      {status && !status.locked && !status.encryptionKeySet && status.source !== "env" && (
        <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
          The server has no <code>PINPLAN_ENCRYPTION_KEY</code>. Set it (any long random string) so the key and secret can be stored encrypted, or set <code>BILLDU_API_KEY</code> / <code>BILLDU_API_SECRET</code> directly.
        </p>
      )}
      <form onSubmit={save} className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">
          <span className="label">API key</span>
          <input className={input} value={apiKey} onChange={(e) => setApiKey(e.target.value)} autoComplete="off" placeholder="Billdu → Settings → API" />
        </label>
        <label className="text-sm">
          <span className="label">API secret</span>
          <input className={input} type="password" value={apiSecret} onChange={(e) => setApiSecret(e.target.value)} autoComplete="off" />
        </label>
        <div className="flex flex-wrap gap-2 sm:col-span-2">
          <button disabled={busy || !apiKey || !apiSecret} className="btn btn-brand">
            Save credentials
          </button>
          <button type="button" onClick={test} disabled={busy || !status?.configured} className="btn">
            Test connection
          </button>
          {(status?.source === "file" || status?.source === "database") && (
            <button type="button" onClick={disconnect} className="btn btn-danger">
              Disconnect
            </button>
          )}
        </div>
      </form>
      {msg && <p className={`text-sm ${msg.ok ? "text-emerald-700" : "text-red-700"}`}>{msg.text}</p>}
      <label className="block text-sm">
        <span className="label">First Billdu document for a new project</span>
        <select className={input + " max-w-xs"} value={settings?.billduDocType ?? "estimate"} onChange={(e) => setDocType(e.target.value as AppSettings["billduDocType"])}>
          <option value="estimate">Estimate</option>
          <option value="order">Order</option>
          <option value="invoice">Invoice</option>
        </select>
      </label>
      <p className="text-xs text-slate-500">Only the Billdu account owner can see the API key and secret (Billdu → Settings → API). They are sent to this app&apos;s server once and never stored in the browser.</p>
    </div>
  );
}
