"use client";
// Company-wide quotes / invoices / credit notes: what's owed (A/R aging), what came in this month, filters, search,
// CSV for the accountant, and new invoices for any job (or a new job for a repeat client).
import { Bell, Download, FilePlus2, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { db, newId, nowIso, put } from "@/lib/db";
import { saveDoc, useAllDocs } from "@/lib/docActions";
import { useDocSettings } from "@/lib/docSettings";
import {
  aging,
  AGING_LABELS,
  clientDirectory,
  displayStatus,
  docName,
  documentsCsv,
  formatDocDate,
  formatDocMoney,
  newDocument,
  paymentsCsv,
  receivables,
  reminderDue,
  STATUS_LABEL,
  today,
  type AgingBucket,
} from "@/lib/documents";
import { downloadText } from "@/lib/download";
import { SYNCED_EVENT } from "@/lib/sync";
import type { DocDisplayStatus, DocKind, Project, SalesDoc } from "@/lib/types";
import { KindChip, Modal, StatusChip } from "./ui";

type StatusFilter = "all" | "open" | DocDisplayStatus | "reminder";

export default function InvoicesPage() {
  const router = useRouter();
  const ds = useDocSettings();
  const { docs, payments } = useAllDocs();
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [kind, setKind] = useState<DocKind | "all">("invoice");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [bucket, setBucket] = useState<AgingBucket | null>(null);
  const [q, setQ] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [client, setClient] = useState("");
  const [picking, setPicking] = useState(false);
  const [day, setDay] = useState("");

  useEffect(() => {
    const load = () => {
      // "Today" is read in the browser, after mount (the page is prerendered).
      setDay(today());
      void db()
        .projects.toArray()
        .then((ps) => setProjects(ps.filter((p) => !p.deleted)));
    };
    const t = window.setTimeout(load, 0);
    window.addEventListener(SYNCED_EVENT, load);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener(SYNCED_EVENT, load);
    };
  }, []);

  const byProject = useMemo(() => new Map((projects ?? []).map((p) => [p.id, p])), [projects]);
  const all = useMemo(() => (docs ?? []).filter((d) => byProject.has(d.projectId)), [docs, byProject]);
  const directory = useMemo(() => clientDirectory(projects ?? [], all), [projects, all]);

  if (!ds || docs === null || projects === null || !day) return <p className="p-6 text-slate-500">Loading…</p>;
  const money = (n: number) => formatDocMoney(n, ds.currency, ds.locale);

  const r = receivables(all, payments, day);
  const ag = aging(all, day);
  const due = all.filter((d) => reminderDue(d, ds.reminders, day));

  const needle = q.trim().toLowerCase();
  const rows = all.filter((d) => {
    if (kind !== "all" && d.kind !== kind) return false;
    const st = displayStatus(d, day);
    if (status === "open" && !(d.kind === "invoice" && d.balanceDue > 0 && d.status !== "draft" && d.status !== "void")) return false;
    if (status === "reminder" && !reminderDue(d, ds.reminders, day)) return false;
    if (status !== "all" && status !== "open" && status !== "reminder" && st !== status) return false;
    if (bucket) {
      const one = aging([d], day);
      if (!(one[bucket] > 0)) return false;
    }
    if (from && (d.issueDate ?? "") < from) return false;
    if (to && (d.issueDate ?? "") > to) return false;
    if (client && (d.client?.email?.toLowerCase() || d.client?.name?.toLowerCase() || "") !== client) return false;
    if (needle) {
      const p = byProject.get(d.projectId);
      const hay = [d.number, d.title, d.client?.name, d.client?.company, d.client?.email, p?.address, p?.clientName].filter(Boolean).join(" ").toLowerCase();
      if (!hay.includes(needle)) return false;
    }
    return true;
  });
  const open = (d: SalesDoc) => router.push(`/project?id=${encodeURIComponent(d.projectId)}&tab=billing&doc=${encodeURIComponent(d.id)}`);
  const sum = (xs: SalesDoc[], f: (d: SalesDoc) => number) => xs.filter((d) => d.status !== "void").reduce((s, d) => s + f(d), 0);

  async function newInvoice(project: Project) {
    const d = newDocument({ id: newId(), kind: "invoice", project, settings: ds!, now: nowIso(), day: today() });
    const saved = await saveDoc(d);
    router.push(`/project?id=${encodeURIComponent(project.id)}&tab=billing&doc=${encodeURIComponent(saved.id)}`);
  }
  async function newJob(c: { name: string; email?: string | null; phone?: string | null; address: string }) {
    const p: Project = { id: newId(), clientName: c.name, clientEmail: c.email ?? "", clientPhone: c.phone ?? "", address: c.address, status: "approved", billduDocs: [], createdAt: nowIso(), updatedAt: nowIso() };
    await put("projects", p);
    await newInvoice(p);
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      <div className="mb-5 flex flex-wrap items-end gap-3">
        <div className="mr-auto">
          <h1 className="page-title">Invoices</h1>
          <p className="mt-1 text-sm text-slate-500">Every quote, invoice and credit note across your jobs.</p>
        </div>
        <button className="btn" onClick={() => downloadText(documentsCsv(rows, byProject, day), `pinplan-documents-${day}.csv`)}>
          <Download /> CSV
        </button>
        <button className="btn" onClick={() => downloadText(paymentsCsv(payments.filter((p) => byProject.has(p.projectId)), new Map(all.map((d) => [d.id, d]))), `pinplan-payments-${day}.csv`)}>
          <Download /> Payments CSV
        </button>
        <button className="btn btn-brand" onClick={() => setPicking(true)}>
          <FilePlus2 /> New invoice
        </button>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Outstanding" value={money(r.outstanding)} onClick={() => { setKind("invoice"); setStatus("open"); setBucket(null); }} />
        <Stat label="Overdue" value={money(r.overdue)} tone={r.overdue > 0 ? "red" : undefined} onClick={() => { setKind("invoice"); setStatus("overdue"); setBucket(null); }} />
        <Stat label="Paid this month" value={money(r.paidThisMonth)} tone="green" />
        <Stat label="Draft invoices" value={money(r.drafts)} onClick={() => { setKind("invoice"); setStatus("draft"); setBucket(null); }} />
      </div>

      <section className="card mb-4 p-4" aria-label="Accounts receivable aging">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="section-title">A/R aging</h2>
          <span className="text-xs text-slate-500">by days past due · total {money(ag.total)}</span>
        </div>
        <div className="flex h-2.5 overflow-hidden rounded-full bg-slate-100" aria-hidden>
          {(Object.keys(AGING_LABELS) as AgingBucket[]).map((b, i) => (ag.total > 0 && ag[b] > 0 ? <div key={b} style={{ width: `${(ag[b] / ag.total) * 100}%` }} className={["bg-emerald-500", "bg-amber-400", "bg-orange-500", "bg-red-500", "bg-red-700"][i]} /> : null))}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
          {(Object.keys(AGING_LABELS) as AgingBucket[]).map((b) => (
            <button key={b} className={`rounded-lg px-3 py-2 text-left ring-1 ${bucket === b ? "bg-brand-50 ring-brand-200" : "ring-slate-200 hover:bg-slate-50"}`} onClick={() => { setBucket(bucket === b ? null : b); setKind("invoice"); setStatus("all"); }}>
              <div className="text-xs text-slate-500">{AGING_LABELS[b]}</div>
              <div className="font-semibold tabular-nums">{money(ag[b])}</div>
            </button>
          ))}
        </div>
      </section>

      {due.length > 0 && (
        <button className="mb-4 flex w-full items-center gap-2 rounded-xl bg-amber-50 px-4 py-2.5 text-left text-sm text-amber-900 ring-1 ring-amber-200" onClick={() => { setKind("invoice"); setStatus("reminder"); setBucket(null); }}>
          <Bell className="h-4 w-4" /> {due.length} invoice{due.length > 1 ? "s are" : " is"} due for a payment reminder — show {due.length > 1 ? "them" : "it"}
        </button>
      )}

      <div className="card mb-3 flex flex-wrap items-end gap-3 p-3">
        <label className="relative min-w-48 flex-1 text-sm">
          <span className="sr-only">Search</span>
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input className="input pl-9" placeholder="Number, client, job…" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <label className="text-sm">
          <span className="label">Type</span>
          <select className="input" value={kind} onChange={(e) => setKind(e.target.value as DocKind | "all")}>
            <option value="all">All</option>
            <option value="quote">{ds.kinds.quote.label}s</option>
            <option value="invoice">Invoices</option>
            <option value="credit_note">Credit notes</option>
          </select>
        </label>
        <label className="text-sm">
          <span className="label">Status</span>
          <select className="input" value={status} onChange={(e) => setStatus(e.target.value as StatusFilter)}>
            <option value="all">Any</option>
            <option value="open">Unpaid (balance due)</option>
            <option value="reminder">Reminder due</option>
            {(["draft", "sent", "viewed", "overdue", "partially_paid", "paid", "accepted", "declined", "expired", "void"] as DocDisplayStatus[]).map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="label">Client</span>
          <select className="input max-w-48" value={client} onChange={(e) => setClient(e.target.value)}>
            <option value="">All clients</option>
            {directory.map((c) => (
              <option key={`${c.email}-${c.name}`} value={c.email?.toLowerCase() || c.name.toLowerCase()}>
                {c.name || c.email}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="label">From</span>
          <input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="text-sm">
          <span className="label">To</span>
          <input className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        {(status !== "all" || bucket || from || to || client || q || kind !== "invoice") && (
          <button className="btn btn-sm btn-ghost" onClick={() => { setKind("invoice"); setStatus("all"); setBucket(null); setFrom(""); setTo(""); setClient(""); setQ(""); }}>
            Clear
          </button>
        )}
      </div>

      {rows.length === 0 ? (
        <div className="card p-10 text-center text-sm text-slate-500">{all.length ? "Nothing matches these filters." : "No quotes or invoices yet. Open a job’s Billing tab, or start a new invoice here."}</div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="hidden bg-slate-50/60 text-left text-[11px] font-semibold text-slate-500 md:table-header-group">
              <tr>
                <th className="px-4 py-2.5">Number</th>
                <th className="px-3 py-2.5">Client / job</th>
                <th className="px-3 py-2.5">Date</th>
                <th className="px-3 py-2.5">Due</th>
                <th className="px-3 py-2.5">Status</th>
                <th className="px-3 py-2.5 text-right">Total</th>
                <th className="px-4 py-2.5 text-right">Balance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((d) => {
                const p = byProject.get(d.projectId);
                const st = displayStatus(d, day);
                return (
                  <tr key={d.id} className="cursor-pointer hover:bg-slate-50" onClick={() => open(d)}>
                    <td className="px-4 py-2.5 align-top">
                      <div className="flex items-center gap-2">
                        <KindChip kind={d.kind} />
                        <a
                          className="font-medium hover:underline"
                          href={`/project?id=${encodeURIComponent(d.projectId)}&tab=billing&doc=${encodeURIComponent(d.id)}`}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            open(d);
                          }}
                        >
                          {docName(d, ds)}
                        </a>
                      </div>
                      <div className="mt-1 text-xs text-slate-500 md:hidden">
                        {d.client?.name || p?.clientName} · {formatDocDate(d.issueDate, ds.locale)}
                      </div>
                      <div className="mt-1 md:hidden">
                        <StatusChip status={st} />
                      </div>
                    </td>
                    <td className="hidden max-w-64 px-3 py-2.5 align-top md:table-cell">
                      <div className="truncate">{d.client?.name || p?.clientName || "—"}</div>
                      <div className="truncate text-xs text-slate-500">{p?.address}</div>
                    </td>
                    <td className="hidden px-3 py-2.5 align-top whitespace-nowrap md:table-cell">{formatDocDate(d.issueDate, ds.locale)}</td>
                    <td className={`hidden px-3 py-2.5 align-top whitespace-nowrap md:table-cell ${st === "overdue" ? "font-medium text-red-600" : ""}`}>{d.kind === "invoice" ? formatDocDate(d.dueDate, ds.locale) : d.kind === "quote" ? formatDocDate(d.validUntil, ds.locale) : ""}</td>
                    <td className="hidden px-3 py-2.5 align-top md:table-cell">
                      <StatusChip status={st} />
                    </td>
                    <td className="px-3 py-2.5 text-right align-top font-medium whitespace-nowrap tabular-nums">{formatDocMoney(d.total, d.currency, ds.locale)}</td>
                    <td className="px-4 py-2.5 text-right align-top whitespace-nowrap tabular-nums">{d.kind === "invoice" && d.status !== "draft" && d.status !== "void" ? formatDocMoney(d.balanceDue, d.currency, ds.locale) : <span className="text-slate-300">—</span>}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="border-t border-slate-200 bg-slate-50/60 text-sm">
              <tr>
                <td className="px-4 py-2.5 font-medium" colSpan={1}>
                  {rows.length} shown
                </td>
                <td className="hidden md:table-cell" colSpan={4} />
                <td className="px-3 py-2.5 text-right font-semibold tabular-nums">{money(sum(rows, (d) => d.total))}</td>
                <td className="px-4 py-2.5 text-right font-semibold tabular-nums">{money(sum(rows.filter((d) => d.kind === "invoice" && d.status !== "draft"), (d) => d.balanceDue))}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {picking && <PickJob projects={projects} directory={directory} onClose={() => setPicking(false)} onPick={(p) => void newInvoice(p)} onNewJob={(c) => void newJob(c)} />}
    </div>
  );
}

function Stat({ label, value, tone, onClick }: { label: string; value: string; tone?: "red" | "green"; onClick?: () => void }) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag className={`card px-4 py-3 text-left ${onClick ? "hover:ring-brand-200" : ""}`} onClick={onClick}>
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`mt-0.5 text-xl font-semibold tabular-nums ${tone === "red" ? "text-red-600" : tone === "green" ? "text-emerald-700" : ""}`}>{value}</div>
    </Tag>
  );
}

function PickJob({ projects, directory, onClose, onPick, onNewJob }: { projects: Project[]; directory: ReturnType<typeof clientDirectory>; onClose: () => void; onPick: (p: Project) => void; onNewJob: (c: { name: string; email?: string | null; phone?: string | null; address: string }) => void }) {
  const [q, setQ] = useState("");
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const needle = q.trim().toLowerCase();
  const list = projects
    .filter((p) => !needle || `${p.address} ${p.clientName} ${p.clientEmail ?? ""}`.toLowerCase().includes(needle))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 50);
  return (
    <Modal title="New invoice" description="Invoices belong to a job. Pick one, or start a job for a client." onClose={onClose}>
      {!creating ? (
        <>
          <input className="input mb-2" placeholder="Search jobs and clients" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
          <ul className="max-h-[50vh] divide-y divide-slate-100 overflow-auto rounded-lg ring-1 ring-slate-200">
            {list.map((p) => (
              <li key={p.id}>
                <button className="w-full px-3 py-2.5 text-left text-sm hover:bg-slate-50" onClick={() => onPick(p)}>
                  <div className="font-medium">{p.address || "Untitled job"}</div>
                  <div className="text-xs text-slate-500">{p.clientName || "No client"}</div>
                </button>
              </li>
            ))}
            {!list.length && <li className="px-3 py-4 text-center text-sm text-slate-500">No matching jobs.</li>}
          </ul>
          <button className="btn mt-3 w-full" onClick={() => setCreating(true)}>
            <FilePlus2 /> New job for a client
          </button>
        </>
      ) : (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            onNewJob({ name: name.trim(), email: email.trim(), phone: phone.trim(), address: address.trim() });
          }}
        >
          <label className="block text-sm">
            <span className="label">Client</span>
            <input className="input" list="pp-clients" value={name} required onChange={(e) => {
              const v = e.target.value;
              setName(v);
              const c = directory.find((x) => x.name === v);
              if (c) {
                setEmail(c.email ?? "");
                setPhone(c.phone ?? "");
                if (!address) setAddress(c.siteAddress ?? "");
              }
            }} autoFocus />
            <datalist id="pp-clients">
              {directory.map((c) => (
                <option key={`${c.email}-${c.name}`} value={c.name} />
              ))}
            </datalist>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm">
              <span className="label">Email</span>
              <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            <label className="text-sm">
              <span className="label">Phone</span>
              <input className="input" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </label>
          </div>
          <label className="block text-sm">
            <span className="label">Job address</span>
            <input className="input" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="12 Maple Ridge Rd" />
          </label>
          <div className="flex gap-2">
            <button type="button" className="btn" onClick={() => setCreating(false)}>
              Back
            </button>
            <button className="btn btn-brand flex-1" disabled={!name.trim()}>
              Create job & invoice
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
