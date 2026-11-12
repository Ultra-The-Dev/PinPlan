"use client";
import { KeyRound } from "lucide-react";
import { useEffect, useState } from "react";
import { apiFetch, getAccessCode, setAccessCode } from "@/lib/api";
import { toast } from "@/lib/toast";

/** Shown when the server protects its API with PINPLAN_ACCESS_CODE (deployments without Supabase accounts). */
export default function AccessCodePanel() {
  const [mode, setMode] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [ok, setOk] = useState<boolean | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/auth", { cache: "no-store" })
      .then((r) => r.json())
      .then(async (j: { mode: string }) => {
        if (!alive) return;
        setMode(j.mode);
        setCode(getAccessCode());
        if (j.mode === "access_code") {
          const r = await apiFetch("/api/billdu/credentials", { cache: "no-store" });
          if (alive) setOk(r.status !== 401);
        }
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  if (mode !== "access_code") return null;
  return (
    <section className="card space-y-3 p-6">
      <div className="flex items-center gap-2">
        <KeyRound className="h-4 w-4 text-brand-600" />
        <h2 className="text-lg font-semibold">Team access code</h2>
        {ok != null && <span className={`chip ml-auto ${ok ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}>{ok ? "Unlocked" : "Locked"}</span>}
      </div>
      <p className="text-sm text-slate-500">This server protects Billdu and AI scan with an access code. Enter it once on each device.</p>
      <form
        className="flex gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          setAccessCode(code.trim());
          const r = await apiFetch("/api/billdu/credentials", { cache: "no-store" });
          setOk(r.status !== 401);
          window.dispatchEvent(new Event("pinplan:auth-changed"));
          toast(r.status !== 401 ? "Access code accepted" : "That code didn't work", r.status !== 401 ? "success" : "error");
        }}
      >
        <input className="input" type="password" autoComplete="off" placeholder="Access code" value={code} onChange={(e) => setCode(e.target.value)} />
        <button className="btn btn-brand">Unlock</button>
      </form>
    </section>
  );
}
