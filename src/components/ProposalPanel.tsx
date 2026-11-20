"use client";
// Installer side of client quotes: send the job's pricing as a link (the client reviews the plans, picks options, signs
// and approves), see when it's opened and answered. An approval becomes the job's approved quote, ready to bill.
import { Ban, Check, Copy, ExternalLink, FileSignature, HandCoins, Mail, RefreshCw, Share2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useJobDocs } from "@/lib/docActions";
import { quoteForProposal } from "@/lib/docFromEstimate";
import { useDocSettings } from "@/lib/docSettings";
import { approvalNeedsQuote, docName, documentTotals, formatDocMoney, normalizeDocSettings } from "@/lib/documents";
import { formatMoney, type Estimate } from "@/lib/estimate";
import { buildSnapshot, newToken, proposalUrl, type ProposalSnapshot } from "@/lib/proposal";
import { explainCloudError } from "@/lib/cloudCheck";
import { listProposals, publishProposal, revokeProposal, type ProposalRow } from "@/lib/proposalCloud";
import { useEditor } from "@/lib/store";
import { supabaseConfigured } from "@/lib/supabase";
import { SYNCED_EVENT, useSyncStatus } from "@/lib/sync";
import { jobHref } from "@/lib/tabRoutes";
import type { Takeoff } from "@/lib/takeoff";
import { toast } from "@/lib/toast";
import type { PricingSettings, SalesDoc } from "@/lib/types";

const STATUS: Record<ProposalRow["status"], { text: string; cls: string }> = {
  sent: { text: "Sent — not opened yet", cls: "bg-slate-100 text-slate-600" },
  viewed: { text: "Opened by client", cls: "bg-sky-50 text-sky-700" },
  accepted: { text: "Approved", cls: "bg-emerald-50 text-emerald-700" },
  declined: { text: "Declined", cls: "bg-red-50 text-red-700" },
  revoked: { text: "Withdrawn", cls: "bg-slate-100 text-slate-400" },
};

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "");

export default function ProposalPanel({ estimate, takeoff, pricing, openForm = 0 }: { estimate: Estimate; takeoff: Takeoff; pricing: PricingSettings; /** Bumped by "Send to client" at the top of the page. */ openForm?: number }) {
  const router = useRouter();
  const { project, sheets, markers, runs, closets, catalog, settings } = useEditor();
  const { signedIn, userId, authReady } = useSyncStatus();
  const liveDocSettings = useDocSettings();
  const ds = liveDocSettings ?? normalizeDocSettings(settings?.documents, settings?.pricing.currency);
  const { docs } = useJobDocs(project?.id);
  const [rows, setRows] = useState<ProposalRow[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [form, setForm] = useState(false);
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  // Blank = the company's defaults (Settings → Quotes & invoices); typing a value changes it for this job's link only.
  const [validDays, setValidDays] = useState<string | null>(null);
  const [detail, setDetail] = useState<ProposalSnapshot["detail"]>("lines");
  const [deposit, setDeposit] = useState<string | null>(null);
  const [plans, setPlans] = useState(true);
  const panel = useRef<HTMLElement>(null);

  // "Send to client" at the top of the page opens the form here.
  const [seenOpen, setSeenOpen] = useState(openForm);
  if (openForm !== seenOpen) {
    setSeenOpen(openForm);
    if (openForm) setForm(true);
  }
  useEffect(() => {
    if (openForm) panel.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [openForm]);

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

  // A client approved: the Money tab (useApprovedProposalQuote) approves the job, switches on the options they picked
  // and makes the approved quote (locked, with the signature), once, on every step. Shown here when it is there.
  const accepted = rows?.find((r) => r.status === "accepted");
  const approvedQuote: SalesDoc | null = accepted && docs ? quoteForProposal(docs, accepted.id) : null;
  // Jobs approved before approvals became quotes: when the office has since made its own approved quote (or billed from
  // one), that quote stands and no second one is made.
  const handledByHand = !!accepted && !!docs && !approvedQuote && !approvalNeedsQuote(docs, accepted);
  // The hook reloads approvals on each sync; when this card's 30 s poll sees one first, tell it now (once per approval).
  const waiting = !!accepted && !!docs && !approvedQuote && !handledByHand;
  const nudged = useRef(new Set<string>());
  useEffect(() => {
    if (!waiting || !accepted || nudged.current.has(accepted.id)) return;
    nudged.current.add(accepted.id);
    window.dispatchEvent(new CustomEvent(SYNCED_EVENT, { detail: { tables: ["proposals"], projectIds: projectId ? [projectId] : [] } }));
  }, [waiting, accepted, projectId]);

  if (!project) return null;

  const header = (
    <div className="mb-3 flex items-center gap-2">
      <FileSignature className="h-4 w-4 text-brand-600" />
      <h3 className="font-semibold">Quote for the client</h3>
      {signedIn && rows && (
        <button className="btn btn-sm btn-icon btn-ghost ml-auto" title="Refresh" aria-label="Refresh" onClick={() => void refresh()}>
          <RefreshCw />
        </button>
      )}
    </div>
  );

  if (supabaseConfigured && !authReady)
    return (
      <section ref={panel} className="card scroll-mt-4 p-5">
        {header}
        <p className="text-sm text-slate-400">Loading…</p>
      </section>
    );

  if (!supabaseConfigured || !signedIn)
    return (
      <section ref={panel} className="card scroll-mt-4 p-5">
        {header}
        <p className="text-sm text-slate-500">
          Send the client a link to review the plans and price, pick options and approve with a signature.{" "}
          {supabaseConfigured ? "Sign in to your account first." : "Client links aren’t available on this copy of the app. Download the client PDF instead (More → Client PDF)."}
        </p>
        {supabaseConfigured && (
          <Link href="/settings#account" className="btn btn-sm mt-3">
            Sign in
          </Link>
        )}
      </section>
    );

  const n = (s: string | null) => {
    if (s == null) return null;
    const v = parseFloat(s);
    return Number.isFinite(v) ? v : null;
  };
  const validValue = validDays ?? String(ds.quoteValidDays || "");
  const depositValue = deposit ?? (ds.depositPct ? String(ds.depositPct) : "");

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
            title: title.trim() || `Quote — ${project.address || project.clientName || "your project"}`, message, validDays: n(validValue), detail, depositPct: n(depositValue), images, origin: window.location.origin,
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
      `Hi ${project.clientName || "there"},\n\nHere is your quote from ${biz}. You can review the plans and price, choose options and approve it online:\n\n${link(r.id)}\n\nThank you!`,
    );
    return `mailto:${encodeURIComponent(project.clientEmail ?? "")}?subject=${subject}&body=${body}`;
  };
  const share = async (r: ProposalRow) => {
    if (navigator.share) await navigator.share({ title: r.snapshot.title, url: link(r.id) }).catch(() => undefined);
    else await copy(r.id);
  };
  const bill = (q: SalesDoc, what: "deposit" | "balance") => router.push(jobHref(project.id, "money", { step: "quote", doc: q.id, bill: what }));

  const live = (rows ?? []).filter((r) => r.status !== "revoked");
  const old = (rows ?? []).filter((r) => r.status === "revoked");
  const fmtDoc = (x: number) => formatDocMoney(x, ds.currency, ds.locale);

  return (
    <section ref={panel} className="card scroll-mt-4 p-5">
      {header}
      {rows === null && <p className="text-sm text-slate-400">Loading…</p>}
      {live.map((r) => {
        const q = r.status === "accepted" && docs ? quoteForProposal(docs, r.id) : null;
        const dep = q ? documentTotals(q).deposit : null;
        return (
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
                  <strong>{r.client_name}</strong> approved {when(r.responded_at)} — {formatMoney(r.accepted_total ?? 0, r.snapshot.currency)}
                </p>
                {(r.chosen_options?.length ?? 0) > 0 && (
                  <p className="text-xs text-slate-500">
                    Options chosen: {r.snapshot.lines.filter((l) => r.chosen_options!.includes(l.key)).map((l) => l.description).join(", ")}
                  </p>
                )}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {r.signature && <img src={r.signature} alt={`Signature of ${r.client_name}`} className="h-14 rounded bg-white ring-1 ring-slate-200" />}
                {r.client_note && <p className="text-xs text-slate-500">Note: “{r.client_note}”</p>}
                {q ? (
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <button className="btn btn-sm btn-brand" onClick={() => bill(q, dep ? "deposit" : "balance")}>
                      <HandCoins /> {dep ? `Bill the deposit (${fmtDoc(dep)})` : "Create invoice"}
                    </button>
                    <Link href={jobHref(project.id, "money", { step: "quote", doc: q.id })} className="text-xs font-medium text-brand-600 hover:underline">
                      Approved quote {docName(q, ds)}
                    </Link>
                  </div>
                ) : handledByHand ? (
                  <Link href={jobHref(project.id, "money", { step: "quote" })} className="text-xs font-medium text-brand-600 hover:underline">
                    Quotes & invoices
                  </Link>
                ) : (
                  <p className="text-xs text-slate-500">Saving the approved quote…</p>
                )}
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
                    if (!confirm("Withdraw this quote? The link will stop working.")) return;
                    await revokeProposal(r.id).catch((e) => toast(e.message, "error"));
                    void refresh();
                  }}
                >
                  <Ban /> Withdraw
                </button>
              )}
            </div>
          </div>
        );
      })}

      {!form ? (
        <button className={`btn w-full ${live.length ? "" : "btn-brand"}`} onClick={() => setForm(true)} disabled={!estimate.lines.length}>
          <FileSignature /> {live.length ? "Send an updated quote" : "Send to client"}
        </button>
      ) : (
        <div className="space-y-3">
          <label className="block text-sm">
            <span className="label">Title</span>
            <input className="input" placeholder={`Quote — ${project.address || project.clientName}`} value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <label className="block text-sm">
            <span className="label">Message to the client</span>
            <textarea className="input min-h-20" placeholder="Thanks for the walkthrough. Here's the system we discussed…" value={message} onChange={(e) => setMessage(e.target.value)} />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm">
              <span className="label">Valid for (days)</span>
              <input className="input text-right" inputMode="numeric" placeholder="no limit" value={validValue} onChange={(e) => setValidDays(e.target.value)} />
            </label>
            <label className="text-sm">
              <span className="label">Deposit %</span>
              <input className="input text-right" inputMode="decimal" placeholder="none" value={depositValue} onChange={(e) => setDeposit(e.target.value)} />
            </label>
          </div>
          <p className="-mt-1 text-xs text-slate-500">
            Your usual validity and deposit come from{" "}
            <Link href="/settings#invoicing" className="underline">
              Settings → Quotes & invoices
            </Link>
            ; changes here are for this job only.
          </p>
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
            The client sees your business details, the scope, {plans ? "the plans, " : ""}this price ({formatMoney(estimate.total, pricing.currency)}) and your terms. Optional items show as add-ons they can tick. Sending freezes the price; send an updated quote after changes. When they approve, it becomes the job’s approved quote, ready to bill.
          </p>
          <div className="flex gap-2">
            <button className="btn" onClick={() => setForm(false)} disabled={!!busy}>
              Cancel
            </button>
            <button className="btn btn-brand flex-1" onClick={() => void publish()} disabled={!!busy}>
              {busy ?? "Send & copy link"}
            </button>
          </div>
        </div>
      )}
      {old.length > 0 && <p className="mt-3 text-xs text-slate-400">{old.length} earlier link{old.length > 1 ? "s" : ""} withdrawn.</p>}
    </section>
  );
}
