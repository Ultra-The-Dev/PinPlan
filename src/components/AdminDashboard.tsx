"use client";
// Platform admin dashboard (/admin). The server decides who may see it (PLATFORM_ADMIN_EMAILS); this only renders.
import { RefreshCw, Search } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import type { Overview } from "@/lib/server/admin";

type State = { kind: "loading" } | { kind: "error"; status: number; message: string } | { kind: "ok"; data: Overview };

const fmtDate = (s: string | null) => (s ? new Date(s).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "—");
const fmtTime = (s: string) => new Date(s).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
function fmtBytes(n: number) {
  if (!n) return "0";
  const u = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(u.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  return `${(n / 1024 ** i).toFixed(i ? 1 : 0)} ${u[i]}`;
}

function StatusChip({ status, trialEndsAt }: { status: string | null; trialEndsAt: string | null }) {
  if (!status) return <span className="text-slate-400">—</span>;
  const tone =
    status === "active"
      ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
      : status === "trialing"
        ? "bg-sky-50 text-sky-700 ring-sky-200"
        : status === "past_due" || status === "unpaid"
          ? "bg-amber-50 text-amber-800 ring-amber-200"
          : "bg-slate-100 text-slate-600 ring-slate-200";
  return (
    <span className={`chip ring-1 ${tone}`} title={trialEndsAt ? `Trial ends ${fmtDate(trialEndsAt)}` : undefined}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

export default function AdminDashboard() {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [q, setQ] = useState("");
  const [openError, setOpenError] = useState<string | null>(null);
  const [errorSource, setErrorSource] = useState<"all" | "server" | "apps">("all");

  const load = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      const r = await apiFetch("/api/admin/overview", { cache: "no-store" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) setState({ kind: "error", status: r.status, message: j.error || `Server returned ${r.status}` });
      else setState({ kind: "ok", data: j as Overview });
    } catch (e) {
      setState({ kind: "error", status: 0, message: (e as Error).message });
    }
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch
    void load();
  }, [load]);

  const companies = useMemo(() => {
    if (state.kind !== "ok") return [];
    const s = q.trim().toLowerCase();
    return s ? state.data.companies.filter((c) => `${c.name} ${c.ownerEmail ?? ""} ${c.planStatus ?? ""}`.toLowerCase().includes(s)) : state.data.companies;
  }, [state, q]);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="page-title">Platform admin</h1>
          <p className="text-sm text-slate-500">Companies, usage and recent app errors across every PinPlan account.</p>
        </div>
        <button className="btn" onClick={load} disabled={state.kind === "loading"}>
          <RefreshCw className={state.kind === "loading" ? "animate-spin" : ""} /> Refresh
        </button>
      </div>

      {state.kind === "loading" && <p className="py-16 text-center text-sm text-slate-500">Loading…</p>}

      {state.kind === "error" && (
        <div className="card p-6 text-sm">
          <p className="font-medium text-slate-900">
            {state.status === 403 ? "Not available for this account" : state.status === 401 ? "Sign in first" : state.status === 501 ? "Not set up yet" : "Couldn't load"}
          </p>
          <p className="mt-1 text-slate-600">{state.message}</p>
          {state.status === 401 && (
            <Link href="/settings" className="btn btn-primary mt-4">
              Go to Settings → Account
            </Link>
          )}
        </div>
      )}

      {state.kind === "ok" && (
        <>
          {state.data.missing.length > 0 && (
            <p className="mb-4 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">
              Some data is unavailable until migrations are run: {state.data.missing.join(", ")}.
            </p>
          )}
          <dl className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ["Companies", state.data.totals.companies.toLocaleString()],
              ["Users", `${state.data.totals.users.toLocaleString()}`, `${state.data.totals.signups7d} new this week · ${state.data.totals.soloUsers} without a team`],
              ["Jobs", state.data.totals.jobs.toLocaleString(), `${state.data.totals.photos.toLocaleString()} photos`],
              ["Storage", fmtBytes(state.data.totals.storageBytes), `${state.data.totals.errors24h >= 50 ? "50+" : state.data.totals.errors24h} errors in 24 h`],
            ].map(([label, value, sub]) => (
              <div key={label} className="card p-4">
                <dt className="text-xs font-medium text-slate-500">{label}</dt>
                <dd className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">{value}</dd>
                {sub && <dd className="mt-0.5 text-xs text-slate-500">{sub}</dd>}
              </div>
            ))}
          </dl>

          <section className="mb-10">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-base font-semibold text-slate-900">Companies</h2>
              <label className="relative w-full sm:w-72">
                <span className="sr-only">Search companies</span>
                <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
                <input className="input pl-9" placeholder="Search name, owner, plan…" value={q} onChange={(e) => setQ(e.target.value)} type="search" />
              </label>
            </div>
            <div className="card overflow-x-auto">
              <table className="tbl min-w-[860px]">
                <thead>
                  <tr>
                    <th>Company</th>
                    <th>Owner</th>
                    <th className="text-right!">Members</th>
                    <th>Plan</th>
                    <th>Trial / period end</th>
                    <th className="text-right!">Jobs</th>
                    <th className="text-right!">Photos</th>
                    <th className="text-right!">Storage</th>
                    <th>Created</th>
                    <th>Last sign-in</th>
                  </tr>
                </thead>
                <tbody>
                  {companies.map((c) => (
                    <tr key={c.id}>
                      <td className="font-medium text-slate-900">{c.name}</td>
                      <td className="text-slate-600">{c.ownerEmail ?? "—"}</td>
                      <td className="text-right tabular-nums">
                        {c.members}
                        {c.seatLimit != null && <span className="text-slate-400"> / {c.seatLimit}</span>}
                      </td>
                      <td>
                        <StatusChip status={c.planStatus} trialEndsAt={c.trialEndsAt} />
                      </td>
                      <td className="text-slate-600">{c.planStatus === "trialing" ? fmtDate(c.trialEndsAt) : fmtDate(c.currentPeriodEnd ?? c.trialEndsAt)}</td>
                      <td className="text-right tabular-nums">{c.jobs}</td>
                      <td className="text-right tabular-nums">{c.photos}</td>
                      <td className="text-right tabular-nums">{fmtBytes(c.storageBytes)}</td>
                      <td className="text-slate-600">{fmtDate(c.createdAt)}</td>
                      <td className="text-slate-600">{fmtDate(c.lastSignInAt)}</td>
                    </tr>
                  ))}
                  {!companies.length && (
                    <tr>
                      <td colSpan={10} className="py-8 text-center text-slate-500">
                        {q ? "No company matches that search." : "No companies yet."}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-semibold text-slate-900">Recent errors</h2>
              <div className="flex gap-1" role="group" aria-label="Show errors from">
                {(["all", "server", "apps"] as const).map((k) => (
                  <button key={k} type="button" className={`btn btn-sm ${errorSource === k ? "btn-primary" : "btn-ghost"}`} aria-pressed={errorSource === k} onClick={() => setErrorSource(k)}>
                    {k === "all" ? "All" : k === "server" ? `Server (${state.data.errors.filter((e) => e.platform === "server").length})` : "Apps"}
                  </button>
                ))}
              </div>
            </div>
            <div className="card divide-y divide-slate-100">
              {state.data.errors
                .filter((e) => errorSource === "all" || (errorSource === "server") === (e.platform === "server"))
                .map((e) => (
                <div key={e.id} className="px-4 py-3 text-sm">
                  <button className="w-full text-left" onClick={() => setOpenError(openError === e.id ? null : e.id)} aria-expanded={openError === e.id}>
                    <p className="font-mono text-[13px] break-words text-slate-900">
                      {e.platform === "server" && <span className="chip mr-2 bg-red-50 align-middle font-sans text-red-700 ring-1 ring-red-200">Server</span>}
                      {e.message}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {fmtTime(e.created_at)} · {e.platform ?? "?"} {e.app_version ?? ""} · {e.email ?? "signed out"} · {e.url ?? "—"}
                    </p>
                  </button>
                  {openError === e.id && (
                    <div className="mt-2 space-y-2">
                      {e.stack && <pre className="max-h-72 overflow-auto rounded-lg bg-slate-50 p-3 text-xs whitespace-pre-wrap text-slate-700">{e.stack}</pre>}
                      {e.context && <pre className="overflow-auto rounded-lg bg-slate-50 p-3 text-xs text-slate-700">{JSON.stringify(e.context, null, 2)}</pre>}
                      {e.user_agent && <p className="text-xs break-words text-slate-500">{e.user_agent}</p>}
                    </div>
                  )}
                </div>
              ))}
              {!state.data.errors.length && <p className="px-4 py-8 text-center text-sm text-slate-500">No errors reported.</p>}
            </div>
          </section>
          <p className="mt-6 text-xs text-slate-400">Generated {fmtTime(state.data.generatedAt)}</p>
        </>
      )}
    </div>
  );
}
