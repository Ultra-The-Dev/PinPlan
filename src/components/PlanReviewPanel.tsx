"use client";
// Send the client the plan only — device locations and a legend, no prices — to review before pricing.
import { Ban, Check, Copy, ExternalLink, Eye, FileText, Mail, MessageSquareWarning, RefreshCw, Share2 } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { explainCloudError } from "@/lib/cloudCheck";
import { buildLegend } from "@/lib/legend";
import { buildSnapshot, floorLabels, newToken, parseClientNote, proposalUrl, type ProposalSnapshot } from "@/lib/proposal";
import { listProposals, publishProposal, revokeProposal, type ProposalRow } from "@/lib/proposalCloud";
import { symbolDataUrl } from "@/lib/renderSheet";
import { useEditor } from "@/lib/store";
import { supabaseConfigured } from "@/lib/supabase";
import { useSyncStatus } from "@/lib/sync";
import { computeTakeoff } from "@/lib/takeoff";
import { toast } from "@/lib/toast";
import { useTrades } from "@/lib/useTrades";

const when = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : "";

/** The client's note: free text, their numbered pins as a list, and the pins drawn over the plan they were dropped on. */
function ClientNote({ note, floors }: { note: string; floors: ProposalSnapshot["floors"] }) {
  const { text, pins } = parseClientNote(note);
  const labels = floorLabels(floors.map((f) => f.name));
  const pinned = floors.map((f, i) => ({ name: labels[i], image: f.image })).filter((f) => f.image && pins.some((p) => p.floor === f.name));
  return (
    <div className="space-y-2 text-sm text-slate-800">
      {text && <blockquote className="border-l-2 border-amber-400 pl-3 whitespace-pre-line">“{text}”</blockquote>}
      {pins.length > 0 && (
        <ol className="space-y-1">
          {pins.map((p, i) => (
            <li key={i} className="flex items-start gap-2">
              <span className="mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-red-600 text-[11px] font-bold text-white">{p.n}</span>
              <span>
                <span className="font-medium">{p.floor}</span>
                {p.note ? ` — ${p.note}` : <span className="text-slate-500"> — (no note)</span>}
              </span>
            </li>
          ))}
        </ol>
      )}
      {pinned.map((f) => (
        <figure key={f.name} className="overflow-hidden rounded-lg bg-white ring-1 ring-slate-200">
          <div className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={f.image!} alt={`${f.name} with the client's pins`} className="block w-full" loading="lazy" />
            {pins.map((p, i) =>
              p.floor === f.name ? (
                <span
                  key={i}
                  title={p.note || `Pin ${p.n}`}
                  className="absolute flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-red-600 text-[11px] font-bold text-white shadow ring-2 ring-white"
                  style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }}
                >
                  {p.n}
                </span>
              ) : null,
            )}
          </div>
          <figcaption className="border-t border-slate-100 px-3 py-1 text-xs text-slate-600">{f.name}</figcaption>
        </figure>
      ))}
    </div>
  );
}

export default function PlanReviewPanel({ onPdf, pdfBusy }: { onPdf: () => void; pdfBusy: string | null }) {
  const { project, sheets, markers, runs, closets, catalog, settings } = useEditor();
  const trades = useTrades();
  const { signedIn, userId, authReady } = useSyncStatus();
  const [rows, setRows] = useState<ProposalRow[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [form, setForm] = useState(false);
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const takeoff = useMemo(() => computeTakeoff({ sheets, markers, runs, closets }), [sheets, markers, runs, closets]);

  const projectId = project?.id;
  const refresh = useCallback(async () => {
    if (!projectId || !signedIn) return;
    try {
      setRows((await listProposals(projectId)).filter((r) => r.snapshot.kind === "review"));
    } catch (e) {
      toast(explainCloudError((e as Error).message), "error");
    }
  }, [projectId, signedIn]);

  useEffect(() => {
    const first = window.setTimeout(() => void refresh(), 0);
    const t = window.setInterval(() => void refresh(), 30_000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(t);
    };
  }, [refresh]);

  if (!project) return null;
  const cloud = supabaseConfigured && signedIn;

  async function publish() {
    if (!project || !userId || !settings) return;
    const token = newToken();
    setBusy("Preparing…");
    try {
      // The client's current link is withdrawn only once the new one is published (a failed publish leaves it working).
      const open = (rows ?? []).filter((r) => r.status === "sent" || r.status === "viewed").map((r) => r.id);
      const legend = buildLegend(takeoff, catalog, (d) => symbolDataUrl(d, 64), trades);
      const row = await publishProposal({
        token,
        projectId: project.id,
        userId,
        includePlans: true,
        sheets,
        data: { markers, runs, closets, catalog },
        onProgress: setBusy,
        build: (images) =>
          buildSnapshot({
            kind: "review",
            legend,
            project,
            sheets,
            catalog,
            takeoff,
            business: settings.business,
            currency: "",
            taxPct: 0,
            title: title || `Preliminary plan — ${project.address || project.clientName || "your home"}`,
            message,
            validDays: null,
            detail: "lines",
            depositPct: null,
            images,
            origin: window.location.origin,
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
    const body = encodeURIComponent(
      `Hi ${project.clientName || "there"},\n\nHere is the preliminary plan from ${biz} showing where everything will go. The legend explains each symbol. Take a look and let us know if it looks right or what you'd like changed:\n\n${link(r.id)}\n\nPricing will follow once the layout is set.\n\nThank you!`,
    );
    return `mailto:${encodeURIComponent(project.clientEmail ?? "")}?subject=${encodeURIComponent(r.snapshot.title)}&body=${body}`;
  };
  const share = async (r: ProposalRow) => {
    if (navigator.share) await navigator.share({ title: r.snapshot.title, url: link(r.id) }).catch(() => undefined);
    else await copy(r.id);
  };

  const live = (rows ?? []).filter((r) => r.status !== "revoked");

  return (
    <section className="card p-5">
      <div className="mb-1 flex items-center gap-2">
        <Eye className="h-4 w-4 text-brand-600" />
        <h3 className="font-semibold">Plan review for the client</h3>
        {cloud && rows && (
          <button className="btn btn-sm btn-icon btn-ghost ml-auto" title="Refresh" aria-label="Refresh" onClick={() => void refresh()}>
            <RefreshCw />
          </button>
        )}
      </div>
      <p className="mb-3 text-sm text-slate-500">
        The marked-up plans with a legend of every symbol — no prices — so the client can check where everything goes before you price it.
      </p>

      {cloud &&
        live.map((r) => (
          <div key={r.id} className="mb-3 space-y-2 rounded-xl p-3 ring-1 ring-slate-200">
            <div className="flex flex-wrap items-center gap-2">
              {r.status === "accepted" ? (
                <span className="chip bg-emerald-50 text-emerald-700">
                  <Check className="mr-1 h-3.5 w-3.5" /> Layout approved
                </span>
              ) : r.status === "declined" ? (
                <span className="chip bg-amber-50 text-amber-800">
                  <MessageSquareWarning className="mr-1 h-3.5 w-3.5" /> Changes requested
                </span>
              ) : (
                <span className={`chip ${r.status === "viewed" ? "bg-sky-50 text-sky-700" : "bg-slate-100 text-slate-600"}`}>
                  {r.status === "viewed" ? "Opened by client" : "Sent — not opened yet"}
                </span>
              )}
              <span className="text-xs text-slate-400">sent {when(r.created_at)}</span>
            </div>
            {r.status === "accepted" && (
              <>
                <p className="text-sm">
                  <strong>{r.client_name}</strong> approved the layout {when(r.responded_at)}. Next: price it and send the quote from the Pricing tab.
                </p>
                {r.client_note && <ClientNote note={r.client_note} floors={r.snapshot.floors} />}
              </>
            )}
            {r.status === "declined" && (
              <div className="space-y-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
                <p>
                  {r.client_name ?? "The client"} asked for changes {when(r.responded_at)}. Update the plan, then send a new review.
                </p>
                {r.client_note && <ClientNote note={r.client_note} floors={r.snapshot.floors} />}
              </div>
            )}
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
                    if (!confirm("Withdraw this plan review? The link will stop working.")) return;
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

      {form && cloud ? (
        <div className="space-y-3">
          <label className="block text-sm">
            <span className="label">Title</span>
            <input className="input" placeholder={`Preliminary plan — ${project.address || project.clientName}`} value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <label className="block text-sm">
            <span className="label">Message to the client</span>
            <textarea
              className="input min-h-20"
              placeholder="Here's where we're planning to put everything. Let us know if anything should move…"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
          </label>
          <p className="text-xs text-slate-500">
            The client sees your business details, each floor’s plan with the devices, and the legend. They can approve the layout (name + signature) or ask for changes with a
            note.
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
      ) : (
        <div className="flex flex-wrap gap-2">
          {cloud ? (
            <button className={`btn ${live.length ? "" : "btn-brand"}`} onClick={() => setForm(true)} disabled={!sheets.length || !markers.length}>
              <Eye /> {live.length ? "Send an updated plan" : "Send plan for review"}
            </button>
          ) : !supabaseConfigured || !authReady ? null : (
            <Link href="/settings#account" className="btn">
              Sign in to send a link
            </Link>
          )}
          <button className="btn" onClick={onPdf} disabled={!!pdfBusy || !sheets.length}>
            <FileText /> {pdfBusy ?? "Client plan PDF"}
          </button>
        </div>
      )}
    </section>
  );
}
