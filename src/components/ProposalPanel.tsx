"use client";
// Installer side of client proposals: publish the estimate as a link, see when it's opened and answered.
import { Ban, Check, Copy, ExternalLink, FileSignature, Mail, RefreshCw, Share2 } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { formatMoney, type Estimate } from "@/lib/estimate";
import { buildSnapshot, newToken, proposalUrl, type ProposalSnapshot } from "@/lib/proposal";
import { explainCloudError } from "@/lib/cloudCheck";
import { listProposals, publishProposal, revokeProposal, type ProposalRow } from "@/lib/proposalCloud";
import { useEditor } from "@/lib/store";
import { supabaseConfigured } from "@/lib/supabase";
import { useSyncStatus } from "@/lib/sync";
import type { Takeoff } from "@/lib/takeoff";
import { toast } from "@/lib/toast";
import type { PricingSettings } from "@/lib/types";

const STATUS: Record<ProposalRow["status"], { text: string; cls: string }> = {
  sent: { text: "Sent — not opened yet", cls: "bg-slate-100 text-slate-600" },
  viewed: { text: "Opened by client", cls: "bg-sky-50 text-sky-700" },
  accepted: { text: "Accepted", cls: "bg-emerald-50 text-emerald-700" },
  declined: { text: "Declined", cls: "bg-red-50 text-red-700" },
  revoked: { text: "Withdrawn", cls: "bg-slate-100 text-slate-400" },
};

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "");

export default function ProposalPanel({ estimate, takeoff, pricing }: { estimate: Estimate; takeoff: Takeoff; pricing: PricingSettings }) {
  const { project, sheets, markers, runs, closets, catalog, settings, updateProject, upsertEstimateLine } = useEditor();
  const { signedIn, userId, authReady } = useSyncStatus();
  const [rows, setRows] = useState<ProposalRow[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [form, setForm] = useState(false);
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [validDays, setValidDays] = useState("30");
  const [detail, setDetail] = useState<ProposalSnapshot["detail"]>("lines");
  const [deposit, setDeposit] = useState("50");
  const [plans, setPlans] = useState(true);

  const projectId = project?.id;
  const refresh = useCallback(async () => {
    if (!projectId || !signedIn) return;
    try {
      // Plan reviews (no prices) have their own card on the Takeoff tab.
      setRows((await listProposals(projectId)).filter((r) => r.snapshot.kind !== "review"));
    } catch (e) {
      toast(explainCloudError((e as Error).message), "error");
    }
  }, [projectId, signedIn]);

  useEffect(() => {
    // Load now and every 30 s, so a client's answer shows up while this tab is open.
    const first = window.setTimeout(() => void refresh(), 0);
    const t = window.setInterval(() => void refresh(), 30_000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(t);
    };
  }, [refresh]);

  // A client accepted: approve the job and switch on the options they picked (once — the job is then approved).
  const accepted = rows?.find((r) => r.status === "accepted");
  useEffect(() => {
    if (!accepted || !project || project.status !== "estimate") return;
    const key = `pinplan.proposal.applied.${accepted.id}`;
    try {
      if (localStorage.getItem(key)) return;
      localStorage.setItem(key, "1");
    } catch {
      /* storage unavailable: the status check above still stops repeats */
    }
    void (async () => {
      const chosen = new Set(accepted.chosen_options ?? []);
      for (const l of accepted.snapshot.lines.filter((x) => x.optional)) await upsertEstimateLine(l.key, { include: chosen.has(l.key) });
      await updateProject({ status: "approved" });
      toast(`${accepted.client_name ?? "The client"} accepted the proposal — job marked approved`, "success");
    })();
  }, [accepted, project, updateProject, upsertEstimateLine]);

  if (!project) return null;

  const header = (
    <div className="mb-3 flex items-center gap-2">
      <FileSignature className="h-4 w-4 text-brand-600" />
      <h3 className="font-semibold">Client proposal</h3>
      {signedIn && rows && (
        <button className="btn btn-sm btn-icon btn-ghost ml-auto" title="Refresh" aria-label="Refresh" onClick={() => void refresh()}>
          <RefreshCw />
        </button>
      )}
    </div>
  );

  if (supabaseConfigured && !authReady)
    return (
      <section className="card p-5">
        {header}
        <p className="text-sm text-slate-400">Loading…</p>
      </section>
    );

  if (!supabaseConfigured || !signedIn)
    return (
      <section className="card p-5">
        {header}
        <p className="text-sm text-slate-500">
          Send the client a link to review the plans and price, pick options and sign online. {supabaseConfigured ? "Sign in to your cloud account first." : "This needs cloud sync set up (see SETUP.md, step 6)."}
        </p>
        <Link href="/settings#account" className="btn btn-sm mt-3">
          {supabaseConfigured ? "Sign in" : "Settings"}
        </Link>
      </section>
    );

  const n = (s: string) => {
    const v = parseFloat(s);
    return Number.isFinite(v) ? v : null;
  };

  async function publish() {
    if (!project || !userId || !settings) return;
    const token = newToken();
    setBusy("Preparing…");
    try {
      // Older links for this job stop working; the client always sees the latest price.
      // The client's current link is withdrawn only once the new one is published (a failed publish leaves it working).
      const open = (rows ?? []).filter((r) => r.status === "sent" || r.status === "viewed").map((r) => r.id);
      const row = await publishProposal({
        token,
        projectId: project.id,
        userId,
        includePlans: plans,
        sheets,
        data: { markers, runs, closets, catalog },
        onProgress: setBusy,
        build: (images) =>
          buildSnapshot({
            project, sheets, catalog, takeoff, estimate, business: settings.business, currency: pricing.currency, taxPct: pricing.taxPct,
            title, message, validDays: n(validDays), detail, depositPct: n(deposit), images, origin: window.location.origin,
          }),
      });
      for (const id of open) await revokeProposal(id).catch(() => undefined);
      setRows((rs) => [row, ...(rs ?? []).map((r) => (r.status === "sent" || r.status === "viewed" ? { ...r, status: "revoked" as const } : r))]);
      setForm(false);
      await copy(row.id);
    } catch (e) {
      toast(explainCloudError((e as Error).message), "error");
    } finally {
      setBusy(null);
    }
  }

  const link = (id: string) => proposalUrl(window.location.origin, id);
  async function copy(id: string) {
    try {
      await navigator.clipboard.writeText(link(id));
      toast("Link copied — paste it into a text or email to the client", "success");
    } catch {
      window.prompt("Copy this link:", link(id));
    }
  }
  const mailto = (r: ProposalRow) => {
    const biz = settings?.business.name || "us";
    const subject = encodeURIComponent(r.snapshot.title);
    const body = encodeURIComponent(
      `Hi ${project.clientName || "there"},\n\nHere is your proposal from ${biz}. You can review the plans and price, choose options and approve it online:\n\n${link(r.id)}\n\nThank you!`,
    );
    return `mailto:${encodeURIComponent(project.clientEmail ?? "")}?subject=${subject}&body=${body}`;
  };
  const share = async (r: ProposalRow) => {
    if (navigator.share) await navigator.share({ title: r.snapshot.title, url: link(r.id) }).catch(() => undefined);
    else await copy(r.id);
  };

  const live = (rows ?? []).filter((r) => r.status !== "revoked");
  const old = (rows ?? []).filter((r) => r.status === "revoked");

  return (
    <section className="card p-5">
      {header}
      {rows === null && <p className="text-sm text-slate-400">Loading…</p>}
      {live.map((r) => (
        <div key={r.id} className="mb-3 space-y-2.5 rounded-xl p-3 ring-1 ring-slate-200">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`chip ${STATUS[r.status].cls}`}>{STATUS[r.status].text}</span>
            <span className="text-xs text-slate-400">sent {when(r.created_at)}</span>
          </div>
          {r.status === "viewed" && r.viewed_at && <p className="text-xs text-slate-500">First opened {when(r.viewed_at)}</p>}
          {r.status === "accepted" && (
            <div className="space-y-1.5 text-sm">
              <p>
                <Check className="mr-1 inline h-4 w-4 text-emerald-600" />
                <strong>{r.client_name}</strong> accepted {when(r.responded_at)} — {formatMoney(r.accepted_total ?? 0, r.snapshot.currency)}
              </p>
              {(r.chosen_options?.length ?? 0) > 0 && (
                <p className="text-xs text-slate-500">
                  Options chosen: {r.snapshot.lines.filter((l) => r.chosen_options!.includes(l.key)).map((l) => l.description).join(", ")}
                </p>
              )}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {r.signature && <img src={r.signature} alt={`Signature of ${r.client_name}`} className="h-14 rounded bg-white ring-1 ring-slate-200" />}
              {r.client_note && <p className="text-xs text-slate-500">Note: “{r.client_note}”</p>}
              {r.snapshot.depositPct ? <p className="text-xs text-slate-500">Next: send the {r.snapshot.depositPct}% deposit invoice from “Send to Billdu” below.</p> : null}
            </div>
          )}
          {r.status === "declined" && <p className="text-sm text-slate-600">{r.client_name ?? "The client"} declined {when(r.responded_at)}{r.client_note ? `: “${r.client_note}”` : "."}</p>}
          <div className="flex flex-wrap gap-1.5">
            <button className="btn btn-sm" onClick={() => void copy(r.id)}>
              <Copy /> Copy link
            </button>
            <a className="btn btn-sm" href={mailto(r)}>
              <Mail /> Email
            </a>
            <button className="btn btn-sm" onClick={() => void share(r)}>
              <Share2 /> Share
            </button>
            <a className="btn btn-sm" href={link(r.id)} target="_blank" rel="noreferrer">
              <ExternalLink /> Open
            </a>
            {(r.status === "sent" || r.status === "viewed") && (
              <button
                className="btn btn-sm btn-ghost text-slate-500"
                onClick={async () => {
                  if (!confirm("Withdraw this proposal? The link will stop working.")) return;
                  await revokeProposal(r.id).catch((e) => toast(e.message, "error"));
                  void refresh();
                }}
              >
                <Ban /> Withdraw
              </button>
            )}
          </div>
        </div>
      ))}

      {!form ? (
        <button className={`btn w-full ${live.length ? "" : "btn-brand"}`} onClick={() => setForm(true)} disabled={!estimate.lines.length}>
          <FileSignature /> {live.length ? "Send an updated proposal" : "Create proposal link"}
        </button>
      ) : (
        <div className="space-y-3">
          <label className="block text-sm">
            <span className="label">Title</span>
            <input className="input" placeholder={`Proposal — ${project.address || project.clientName}`} value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <label className="block text-sm">
            <span className="label">Message to the client</span>
            <textarea className="input min-h-20" placeholder="Thanks for the walkthrough. Here's the system we discussed…" value={message} onChange={(e) => setMessage(e.target.value)} />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm">
              <span className="label">Valid for (days)</span>
              <input className="input text-right" inputMode="numeric" value={validDays} onChange={(e) => setValidDays(e.target.value)} />
            </label>
            <label className="text-sm">
              <span className="label">Deposit %</span>
              <input className="input text-right" inputMode="decimal" placeholder="none" value={deposit} onChange={(e) => setDeposit(e.target.value)} />
            </label>
          </div>
          <label className="block text-sm">
            <span className="label">Prices shown</span>
            <select className="input" value={detail} onChange={(e) => setDetail(e.target.value as ProposalSnapshot["detail"])}>
              <option value="lines">Every line (qty × price)</option>
              <option value="sections">Section totals only</option>
            </select>
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input type="checkbox" className="accent-brand-600" checked={plans} onChange={(e) => setPlans(e.target.checked)} /> Include the marked-up plans
          </label>
          <p className="text-xs text-slate-500">
            The client sees your business details, the scope, {plans ? "the plans, " : ""}this estimate ({formatMoney(estimate.total, pricing.currency)}) and your terms. Optional “?” items show as add-ons they can tick. Publishing freezes the price; send an updated proposal after changes.
          </p>
          <div className="flex gap-2">
            <button className="btn" onClick={() => setForm(false)} disabled={!!busy}>
              Cancel
            </button>
            <button className="btn btn-brand flex-1" onClick={() => void publish()} disabled={!!busy}>
              {busy ?? "Publish & copy link"}
            </button>
          </div>
        </div>
      )}
      {old.length > 0 && <p className="mt-3 text-xs text-slate-400">{old.length} earlier link{old.length > 1 ? "s" : ""} withdrawn.</p>}
    </section>
  );
}
