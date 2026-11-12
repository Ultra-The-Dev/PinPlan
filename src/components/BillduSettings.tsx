"use client";
import { useEffect, useState } from "react";
import { getSettings, saveSettings } from "@/lib/db";
import type { AppSettings } from "@/lib/types";

interface Status {
  configured: boolean;
  source: "env" | "file" | null;
  keyHint: string | null;
  encryptionKeySet?: boolean;
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
      const r = await fetch("/api/billdu/credentials", { cache: "no-store" });
      setStatus(await r.json());
    } catch {
      setStatus(null);
      setMsg({ ok: false, text: "Can't reach the server (offline?)." });
    }
  }
  useEffect(() => {
    let alive = true;
    fetch("/api/billdu/credentials", { cache: "no-store" })
      .then((r) => r.json())
      .then((j: Status) => alive && setStatus(j))
      .catch(() => alive && setMsg({ ok: false, text: "Can't reach the server (offline?)." }));
    getSettings().then((s) => alive && setSettings(s));
    return () => {
      alive = false;
    };
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch("/api/billdu/credentials", {
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
    await fetch("/api/billdu/credentials", { method: "DELETE" });
    setMsg({ ok: true, text: "Removed." });
    refresh();
  }

  async function test() {
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch("/api/billdu/test", { method: "POST" });
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

  const input = "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none";
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
      {status && !status.encryptionKeySet && status.source !== "env" && (
        <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
          The server has no <code>PINPLAN_ENCRYPTION_KEY</code>. Set it (any long random string) so the key and secret can be stored encrypted, or set <code>BILLDU_API_KEY</code> / <code>BILLDU_API_SECRET</code> directly.
        </p>
      )}
      <form onSubmit={save} className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">
          <span className="mb-1 block text-slate-600">API key</span>
          <input className={input} value={apiKey} onChange={(e) => setApiKey(e.target.value)} autoComplete="off" placeholder="Billdu → Settings → API" />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-slate-600">API secret</span>
          <input className={input} type="password" value={apiSecret} onChange={(e) => setApiSecret(e.target.value)} autoComplete="off" />
        </label>
        <div className="flex flex-wrap gap-2 sm:col-span-2">
          <button disabled={busy || !apiKey || !apiSecret} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-40">
            Save credentials
          </button>
          <button type="button" onClick={test} disabled={busy || !status?.configured} className="rounded-lg border border-slate-300 px-4 py-2 text-sm disabled:opacity-40">
            Test connection
          </button>
          {status?.source === "file" && (
            <button type="button" onClick={disconnect} className="rounded-lg border border-red-200 px-4 py-2 text-sm text-red-700">
              Disconnect
            </button>
          )}
        </div>
      </form>
      {msg && <p className={`text-sm ${msg.ok ? "text-emerald-700" : "text-red-700"}`}>{msg.text}</p>}
      <label className="block text-sm">
        <span className="mb-1 block text-slate-600">First Billdu document for a new project</span>
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
