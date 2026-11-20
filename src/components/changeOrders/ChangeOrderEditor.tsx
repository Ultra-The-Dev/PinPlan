"use client";
// One change order: edit a draft (lines priced from the catalog or the plan, markup, tax, schedule, evidence), send
// the client link, record a verbal / paper / in-person approval, and see the answer.
import {
  ArrowLeft,
  Ban,
  Check,
  CheckCheck,
  Clock,
  Copy,
  Download,
  FilePen,
  Hammer,
  HandCoins,
  Mail,
  MapPin,
  Package,
  Plus,
  Send,
  Share2,
  Trash,
  Wifi,
  WifiOff,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { saveDoc, useJobDocs } from "@/lib/docActions";
import { useDocSettings } from "@/lib/docSettings";
import { billedChangeOrderIds, docName, invoiceFromChanges, normalizeDocSettings, today } from "@/lib/documents";
import {
  billableChanges,
  canDo,
  canEdit,
  changeOrderTotals,
  changeOrderUrl,
  coCode,
  CO_REASONS,
  deviceLaborLine,
  deviceLine,
  laborHoursLine,
  linesFromMarkers,
  mailtoBody,
  publicCoView,
  sellLines,
  transition,
  type CoAction,
  type CoPricing,
} from "@/lib/changeOrders";
import { db, newId, nowIso, saveImage } from "@/lib/db";
import { downloadBlob, slug } from "@/lib/download";
import { formatMoney } from "@/lib/estimate";
import { fmtDate, useT } from "@/lib/i18n";
import { newToken } from "@/lib/proposal";
import { productIdFor } from "@/lib/products";
import { useEditor } from "@/lib/store";
import { supabaseConfigured } from "@/lib/supabase";
import { useSyncStatus } from "@/lib/sync";
import { jobHref } from "@/lib/tabRoutes";
import { toast } from "@/lib/toast";
import { useBlobUrl } from "@/lib/useImage";
import type { ChangeOrder, ChangeOrderLine, DeviceType, Marker, Photo } from "@/lib/types";
import SignaturePad from "../SignaturePad";
import AddFromPlanDialog from "./AddFromPlanDialog";
import StatusChip from "./StatusChip";
import DevicePicker from "./DevicePicker";
import { useRowPending } from "./useChangeOrders";

const num = (s: string): number | null => {
  const n = parseFloat(s.replace(/[$,%\s]/g, ""));
  return Number.isFinite(n) ? n : null;
};

/** Text box that keeps what's typed and commits on blur / Enter (parent remounts it when the value changes). */
function NumField({ value, onCommit, label, className = "", allowEmpty, disabled }: { value: number | null | undefined; onCommit: (n: number | null) => void; label: string; className?: string; allowEmpty?: boolean; disabled?: boolean }) {
  const shown = value == null ? "" : String(value);
  const [v, setV] = useState(shown);
  return (
    <input
      aria-label={label}
      disabled={disabled}
      inputMode="decimal"
      className={`input text-right tabular-nums ${className}`}
      value={v}
      onChange={(e) => setV(e.target.value)}
      onFocus={(e) => e.currentTarget.select()}
      onBlur={() => {
        if (v === shown) return;
        const n = num(v);
        if (n == null && !allowEmpty) setV(shown);
        else onCommit(n);
      }}
      onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
    />
  );
}

const KIND_ICON: Record<ChangeOrderLine["kind"], typeof Package> = { device: MapPin, labor: Hammer, material: Package, custom: FilePen };

function LineRow({ line, sell, cur, editable, onChange, onRemove }: { line: ChangeOrderLine; sell: number; cur: string; editable: boolean; onChange: (patch: Partial<ChangeOrderLine>) => void; onRemove: () => void }) {
  const t = useT();
  const Icon = KIND_ICON[line.kind] ?? FilePen;
  if (!editable)
    return (
      <li className="flex items-start gap-3 px-3 py-2.5 text-sm sm:px-4">
        <Icon className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
        <div className="min-w-0 flex-1">
          <div className="break-words">{line.description || "—"}</div>
          <div className="text-xs text-slate-500 tabular-nums">
            {line.qty} {line.unit} × {formatMoney(line.unitPrice, cur)}
            {line.kind === "material" ? ` ${t("+ markup")}` : ""}
          </div>
        </div>
        <div className="shrink-0 font-medium tabular-nums">{formatMoney(sell, cur)}</div>
      </li>
    );
  return (
    <li className="grid grid-cols-[1fr_auto] gap-x-2 gap-y-1.5 px-3 py-2.5 sm:grid-cols-[1.25rem_1fr_4.5rem_4rem_6rem_6rem_2rem] sm:items-center sm:px-4" data-testid="co-line">
      <Icon className="hidden h-4 w-4 text-slate-400 sm:block" aria-label={line.kind} />
      <input key={`d${line.description}`} className="input" defaultValue={line.description} placeholder={t("Description")} aria-label={t("Description")} onBlur={(e) => e.target.value !== line.description && onChange({ description: e.target.value })} />
      <button className="btn btn-icon btn-ghost sm:order-last" onClick={onRemove} aria-label={t("Remove line")}>
        <Trash />
      </button>
      <div className="col-span-2 grid grid-cols-[4.5rem_4rem_1fr_auto] items-center gap-2 sm:contents">
        <NumField key={`q${line.qty}`} value={line.qty} label={t("Quantity")} onCommit={(n) => onChange({ qty: n ?? 0 })} />
        <input key={`u${line.unit}`} className="input text-center" defaultValue={line.unit} aria-label={t("Unit")} onBlur={(e) => e.target.value !== line.unit && onChange({ unit: e.target.value || "each" })} />
        <NumField key={`p${line.unitPrice}`} value={line.unitPrice} label={line.kind === "material" ? t("Unit cost") : t("Unit price")} onCommit={(n) => onChange({ unitPrice: n ?? 0 })} />
        <div className={`text-right text-sm font-medium tabular-nums ${sell < 0 ? "text-emerald-700" : ""}`}>{formatMoney(sell, cur)}</div>
      </div>
    </li>
  );
}

function PhotoThumb({ photo, on, onToggle }: { photo: Photo; on: boolean; onToggle: () => void }) {
  const t = useT();
  const url = useBlobUrl(photo.imageId);
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={on}
      className={`relative aspect-square overflow-hidden rounded-lg bg-slate-100 ring-2 ${on ? "ring-brand-500" : "ring-transparent"}`}
      title={photo.caption ?? ""}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {url && <img src={url} alt={photo.caption ?? t("Job photo")} className="h-full w-full object-cover" />}
      {on && (
        <span className="absolute top-1 right-1 flex h-5 w-5 items-center justify-center rounded-full bg-brand-600 text-white">
          <Check className="h-3 w-3" />
        </span>
      )}
    </button>
  );
}

/** Job RFIs, only when this app version has an `rfis` table (another feature may add it). */
function useRfis(projectId: string): { id: string; label: string }[] | null {
  const [rows, setRows] = useState<{ id: string; label: string }[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    const d = db();
    if (!d.tables.some((tb) => tb.name === "rfis")) return;
    d.table("rfis")
      .where("projectId")
      .equals(projectId)
      .toArray()
      .then((xs: Record<string, unknown>[]) => {
        if (cancelled) return;
        setRows(
          xs
            .filter((r) => !r.deleted)
            .map((r) => {
              const title = String(r.title ?? r.subject ?? r.question ?? "RFI");
              return { id: String(r.id), label: r.number != null ? `RFI ${r.number} — ${title}` : title };
            }),
        );
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [projectId]);
  return rows;
}

async function blobToDataUrl(b: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(b);
  });
}

function ApproveDialog({ code, onDone, onCancel }: { code: string; onDone: (r: { name: string; signature: string | null; comment: string }) => Promise<void>; onCancel: () => void }) {
  const t = useT();
  const [name, setName] = useState("");
  const [comment, setComment] = useState("");
  const [sign, setSign] = useState(false);
  const [signature, setSignature] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/30 backdrop-blur-[2px] sm:items-center sm:p-4" onClick={onCancel}>
      <form
        role="dialog"
        aria-label={t("Mark approved")}
        className="card animate-in w-full max-w-md space-y-3 rounded-b-none p-5 shadow-pop sm:rounded-b-xl"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.key === "Escape" && onCancel()}
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await onDone({ name, signature: sign ? signature : null, comment });
          } finally {
            setBusy(false);
          }
        }}
      >
        <h2 className="text-base font-semibold">{t("Mark {code} approved", { code })}</h2>
        <p className="text-sm text-slate-500">{t("For a verbal or paper OK — or hand the tablet to the client to sign here.")}</p>
        <div>
          <label className="label" htmlFor="co-approver">
            {t("Approved by")}
          </label>
          <input id="co-approver" className="input" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder={t("Client's name")} />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={sign} onChange={(e) => setSign(e.target.checked)} /> {t("Client signs on this device")}
        </label>
        {sign && <SignaturePad onChange={setSignature} />}
        <div>
          <label className="label" htmlFor="co-approve-note">
            {t("Note (optional)")}
          </label>
          <input id="co-approve-note" className="input" value={comment} onChange={(e) => setComment(e.target.value)} placeholder={t("e.g. OK'd by phone with Pat")} />
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className="btn" onClick={onCancel}>
            {t("Cancel")}
          </button>
          <button className="btn btn-brand" disabled={busy || !name.trim() || (sign && !signature)}>
            <Check /> {t("Mark approved")}
          </button>
        </div>
      </form>
    </div>
  );
}

export default function ChangeOrderEditor(props: {
  co: ChangeOrder;
  all: ChangeOrder[];
  pricing: CoPricing;
  onSave: (...cos: ChangeOrder[]) => Promise<ChangeOrder[]>;
  onReload: () => Promise<void>;
  onOpen: (id: string) => void;
  onClose: () => void;
}) {
  const t = useT();
  const { pricing, onSave } = props;
  const project = useEditor((s) => s.project)!;
  const sheets = useEditor((s) => s.sheets);
  const markers = useEditor((s) => s.markers);
  const catalog = useEditor((s) => s.catalog);
  const products = useEditor((s) => s.products);
  const photos = useEditor((s) => s.photos);
  const settings = useEditor((s) => s.settings)!;
  const updateProject = useEditor((s) => s.updateProject);
  const updateMarkers = useEditor((s) => s.updateMarkers);
  const pendingCount = useSyncStatus((s) => s.pending);
  const online = useSyncStatus((s) => s.online);
  const signedIn = useSyncStatus((s) => s.signedIn);

  const [draft, setDraft] = useState<ChangeOrder>(props.co);
  const [picker, setPicker] = useState(false);
  const [fromPlan, setFromPlan] = useState(false);
  const [approving, setApproving] = useState(false);
  const [showAllPhotos, setShowAllPhotos] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const cur = pricing.currency;
  const editable = canEdit(draft);

  // Billing an approved change: on its own invoice ("Bill this change"), or on an invoice from the quote. Each once.
  const router = useRouter();
  const { docs: jobDocs } = useJobDocs(project.id);
  const liveDocSettings = useDocSettings();
  const docSettings = liveDocSettings ?? normalizeDocSettings(settings.documents, settings.pricing.currency);
  const billedOn = (jobDocs ?? []).find((d) => d.kind === "invoice" && !d.deleted && d.status !== "void" && d.options?.changeOrderIds?.includes(draft.id)) ?? null;
  // Both are invoices: they open on the Money tab's Invoices & payments step.
  const openDoc = (id: string) => router.push(jobHref(project.id, "money", { step: "invoices", doc: id }));
  async function billThis() {
    const changes = billableChanges([draft], billedChangeOrderIds(jobDocs ?? []));
    if (!changes.length) return;
    setBusy("bill");
    try {
      const inv = invoiceFromChanges(changes, { id: newId(), now: nowIso(), day: today(), settings: docSettings, project });
      const saved = await saveDoc(inv);
      openDoc(saved.id);
    } catch (e) {
      toast(t("Couldn't make the invoice: {error}", { error: (e as Error).message }), "error");
    } finally {
      setBusy(null);
    }
  }
  const code = coCode(draft.number);

  // Take changes made elsewhere (sync, the client's answer) unless this draft has unsaved edits.
  const dirty = useRef(false);
  const [unsaved, setUnsaved] = useState(false);
  const [seen, setSeen] = useState(props.co);
  if (props.co !== seen) {
    setSeen(props.co);
    if (!unsaved) setDraft(props.co);
  }

  // Autosave drafts shortly after each change.
  const saveTimer = useRef<number | null>(null);
  const latest = useRef(draft);
  useEffect(() => {
    latest.current = draft;
  }, [draft]);
  const flush = async () => {
    if (saveTimer.current != null) window.clearTimeout(saveTimer.current);
    saveTimer.current = null;
    if (!dirty.current) return;
    dirty.current = false;
    await onSave(latest.current);
    setUnsaved(false);
  };
  const flushRef = useRef(flush);
  useEffect(() => {
    flushRef.current = flush;
  });
  useEffect(() => () => void flushRef.current(), []);
  const change = (patch: Partial<ChangeOrder>) => {
    if (!canEdit(latest.current)) return;
    const next = { ...latest.current, ...patch };
    latest.current = next;
    setDraft(next);
    dirty.current = true;
    setUnsaved(true);
    if (saveTimer.current != null) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => void flushRef.current(), 500);
  };
  const setLines = (lines: ChangeOrderLine[]) => change({ lines });

  const sells = useMemo(() => new Map(sellLines(draft).map((l) => [l.id, l.total])), [draft]);
  const totals = useMemo(() => changeOrderTotals(draft), [draft]);
  const hasMaterial = draft.lines.some((l) => l.kind === "material");
  const productFor = (d: DeviceType) => {
    const id = productIdFor({ productId: null, deviceTypeId: d.id }, project, products);
    return id ? (products.find((p) => p.id === id) ?? null) : null;
  };
  const rfis = useRfis(project.id);
  const pending = useRowPending(draft.shareToken ? draft.id : null, `${pendingCount}|${draft.updatedAt}`);

  function addDevice(d: DeviceType) {
    const p = productFor(d);
    const lines = [...latest.current.lines];
    const same = lines.findIndex((l) => l.kind === "device" && l.deviceTypeId === d.id);
    if (same >= 0) {
      lines[same] = { ...lines[same], qty: lines[same].qty + 1 };
      const lab = lines.findIndex((l) => l.kind === "labor" && l.deviceTypeId === d.id);
      if (lab >= 0) lines[lab] = { ...lines[lab], qty: lines[lab].qty + 1 };
    } else {
      lines.push(deviceLine(d, p, 1, pricing, newId()));
      const lab = deviceLaborLine(d, p, 1, pricing, newId());
      if (lab) lines.push(lab);
    }
    change({ lines, title: latest.current.title || d.name });
    setPicker(false);
  }

  function addFromPlan(chosen: Marker[]) {
    const fresh = linesFromMarkers(chosen, catalog, products, pricing, { project, newId });
    const lines = [...latest.current.lines];
    for (const l of fresh) {
      const i = lines.findIndex((x) => x.kind === l.kind && x.deviceTypeId === l.deviceTypeId && x.description === l.description && x.unitPrice === l.unitPrice);
      if (i >= 0) lines[i] = { ...lines[i], qty: lines[i].qty + l.qty };
      else lines.push(l);
    }
    const markerIds = [...new Set([...(latest.current.markerIds ?? []), ...chosen.map((m) => m.id)])];
    const sheetIds = [...new Set([...(latest.current.sheetIds ?? []), ...chosen.map((m) => m.sheetId)])];
    const names = [...new Set(fresh.filter((l) => l.kind === "device").map((l) => `${l.qty} × ${catalog.find((d) => d.id === l.deviceTypeId)?.name ?? "device"}`))];
    change({ lines, markerIds, sheetIds, title: latest.current.title || `Added ${names.join(", ")}`, reason: latest.current.title ? latest.current.reason : "plan_revision" });
    setFromPlan(false);
  }

  async function act(action: CoAction, opts: Parameters<typeof transition>[3] = {}) {
    await flush();
    const now = nowIso();
    try {
      const { co, copy } = transition(latest.current, action, now, opts);
      dirty.current = false;
      setDraft(co);
      latest.current = co;
      await onSave(...(copy ? [co, copy] : [co]));
      if (copy) props.onOpen(copy.id);
      return co;
    } catch (e) {
      toast((e as Error).message, "error");
      return null;
    }
  }

  const linkUrl = draft.shareToken && typeof window !== "undefined" ? changeOrderUrl(window.location.origin, draft.shareToken) : null;

  async function send() {
    setBusy("send");
    try {
      await flush();
      const base = latest.current;
      const sentAt = base.sentAt ?? nowIso();
      const captions = Object.fromEntries(photos.filter((p) => base.photoIds?.includes(p.id)).map((p) => [p.imageId, p.caption ?? ""]));
      // The client sees photos by image id (that is how they are stored in the cloud).
      const forView = { ...base, photoIds: photos.filter((p) => base.photoIds?.includes(p.id)).map((p) => p.imageId) };
      const view = publicCoView(forView, project, { business: settings.business, pricing }, { origin: window.location.origin, sentAt, photoCaptions: captions });
      const co = await act("send", { token: base.shareToken || newToken(), publicView: view });
      if (!co?.shareToken) return;
      const url = changeOrderUrl(window.location.origin, co.shareToken);
      try {
        await navigator.clipboard.writeText(url);
        toast(t("{code} link copied — paste it in a text or email", { code }), "success");
      } catch {
        toast(t("{code} is ready to send", { code }), "success");
      }
      void useSyncStatus.getState().syncNow().catch(() => undefined);
    } finally {
      setBusy(null);
    }
  }

  async function approveManually(r: { name: string; signature: string | null; comment: string }) {
    let signatureImageId: string | null = null;
    if (r.signature) {
      const blob = await (await fetch(r.signature)).blob();
      signatureImageId = await saveImage(blob, 600, 200);
    }
    const co = await act("approve", { name: r.name, signatureImageId, comment: r.comment });
    if (co) {
      setApproving(false);
      toast(t("{code} approved", { code }), "success");
    }
  }

  async function pdf() {
    setBusy("pdf");
    try {
      let signature: string | null = null;
      if (draft.signatureImageId) {
        const rec = await db().images.get(draft.signatureImageId);
        if (rec) signature = await blobToDataUrl(rec.blob);
      }
      const { renderChangeOrderPdf } = await import("./ChangeOrderPdf");
      const blob = await renderChangeOrderPdf({ co: draft, project, business: settings.business, currency: cur, signature });
      downloadBlob(blob, `${slug(project.address || project.clientName || "job")}-${code}.pdf`);
    } catch (e) {
      toast(t("Couldn't make the PDF: {error}", { error: (e as Error).message }), "error");
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    if (!window.confirm(t("Delete draft {code}?", { code }))) return;
    dirty.current = false;
    await onSave({ ...latest.current, deleted: true });
    props.onClose();
  }

  const linked = markers.filter((m) => draft.markerIds?.includes(m.id));
  const stillTentative = linked.filter((m) => m.tentative);
  const sigUrl = useBlobUrl(draft.signatureImageId);
  const jobPhotos = [...photos].sort((a, b) => b.takenAt.localeCompare(a.takenAt));
  const photoList = showAllPhotos ? jobPhotos : jobPhotos.slice(0, 12);
  const laborRate = pricing.laborRate ?? 0;

  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto max-w-4xl space-y-4 p-3 pb-24 sm:p-6">
        <div className="flex items-center gap-2">
          <button
            className="btn btn-icon btn-ghost"
            aria-label={t("Back to change orders")}
            onClick={async () => {
              await flush();
              props.onClose();
            }}
          >
            <ArrowLeft />
          </button>
          <span className="font-mono text-sm font-semibold text-slate-500">{code}</span>
          <StatusChip status={draft.status} />
          <div className="flex-1" />
          <button className="btn btn-sm" onClick={() => void pdf()} disabled={busy === "pdf"}>
            <Download /> {t("PDF")}
          </button>
        </div>

        {/* Client answer */}
        {(draft.status === "approved" || draft.status === "rejected") && (
          <section className={`card space-y-2 p-4 ring-1 ${draft.status === "approved" ? "ring-emerald-200" : "ring-red-200"}`}>
            <h2 className="flex items-center gap-2 font-semibold">
              {draft.status === "approved" ? <CheckCheck className="h-5 w-5 text-emerald-600" /> : <X className="h-5 w-5 text-red-600" />}
              {draft.approvedName
                ? draft.status === "approved"
                  ? t("Approved by {name}", { name: draft.approvedName })
                  : t("Rejected by {name}", { name: draft.approvedName })
                : draft.status === "approved"
                  ? t("Approved")
                  : t("Rejected")}
              {draft.respondedAt ? ` · ${fmtDate(draft.respondedAt, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}` : ""}
            </h2>
            {draft.clientComment && <p className="text-sm whitespace-pre-line text-slate-600">“{draft.clientComment}”</p>}
            {draft.status === "approved" && (
              <div className="flex flex-wrap items-center gap-2 text-sm">
                {billedOn ? (
                  <>
                    <span className="text-slate-600">{t("Billed on")}</span>
                    <button className="font-medium text-brand-600 hover:underline" onClick={() => openDoc(billedOn.id)}>
                      {docName(billedOn, docSettings)}
                    </button>
                  </>
                ) : (
                  <>
                    <button className="btn btn-sm btn-brand" onClick={() => void billThis()} disabled={busy === "bill" || jobDocs === null}>
                      <HandCoins /> {t("Bill this change")}
                    </button>
                    <span className="text-xs text-slate-500">{t("Or include it on the next invoice from the quote.")}</span>
                  </>
                )}
              </div>
            )}
            {sigUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={sigUrl} alt={t("Signature")} className="h-16 w-auto rounded bg-white p-1 ring-1 ring-slate-200" />
            )}
            {draft.status === "approved" && stillTentative.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
                <span className="flex-1">{t("Mark these devices as confirmed in the plan ({n} still tentative).", { n: stillTentative.length })}</span>
                <button
                  className="btn btn-sm"
                  onClick={async () => {
                    await updateMarkers(
                      stillTentative.map((m) => m.id),
                      () => ({ tentative: false }),
                    );
                    toast(t.tn("{n} device confirmed — undo on the plan if needed", "{n} devices confirmed — undo on the plan if needed", stillTentative.length), "success");
                  }}
                >
                  <Check /> {t.tn("Confirm {n} device", "Confirm {n} devices", stillTentative.length)}
                </button>
              </div>
            )}
          </section>
        )}

        {/* What and why */}
        <section className="card space-y-3 p-4">
          <div>
            <label className="label" htmlFor="co-title">
              {t("Title")}
            </label>
            <input
              id="co-title"
              key={`t${draft.title}`}
              className="input text-base font-semibold"
              defaultValue={draft.title}
              disabled={!editable}
              placeholder={t("e.g. Two extra exterior cameras")}
              onBlur={(e) => e.target.value !== draft.title && change({ title: e.target.value })}
            />
          </div>
          <div>
            <span className="label">{t("Reason")}</span>
            <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={t("Reason")}>
              {CO_REASONS.map((r) => (
                <button
                  key={r.id}
                  role="radio"
                  aria-checked={draft.reason === r.id}
                  disabled={!editable}
                  onClick={() => change({ reason: r.id })}
                  className={`h-8 rounded-full px-3 text-sm ring-1 ${draft.reason === r.id ? "bg-brand-600 text-white ring-brand-600" : "bg-white text-slate-600 ring-slate-200"}`}
                >
                  {t(r.label)}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="label" htmlFor="co-desc">
              {t("Description (the client sees this)")}
            </label>
            <textarea
              id="co-desc"
              key={`x${draft.description ?? ""}`}
              className="input min-h-[64px]"
              defaultValue={draft.description ?? ""}
              disabled={!editable}
              placeholder={t("What changes, and why")}
              onBlur={(e) => e.target.value !== (draft.description ?? "") && change({ description: e.target.value })}
            />
          </div>
        </section>

        {/* Lines */}
        <section className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
            <h2 className="section-title">{t("Lines")}</h2>
            {editable && <span className="text-xs text-slate-400">{t("Negative qty = credit")}</span>}
          </div>
          {draft.lines.length ? (
            <ul className="divide-y divide-slate-100">
              {draft.lines.map((l) => (
                <LineRow
                  key={l.id}
                  line={l}
                  sell={sells.get(l.id) ?? 0}
                  cur={cur}
                  editable={editable}
                  onChange={(patch) => setLines(latest.current.lines.map((x) => (x.id === l.id ? { ...x, ...patch } : x)))}
                  onRemove={() => setLines(latest.current.lines.filter((x) => x.id !== l.id))}
                />
              ))}
            </ul>
          ) : (
            <p className="px-4 py-6 text-center text-sm text-slate-500">{t("No lines yet. Add devices from the catalog or straight from the plan.")}</p>
          )}
          {editable && (
            <div className="grid grid-cols-2 gap-2 border-t border-slate-100 p-3 sm:flex sm:flex-wrap">
              <button className="btn btn-brand" onClick={() => setFromPlan(true)}>
                <MapPin /> {t("Add from plan")}
              </button>
              <button className="btn" onClick={() => setPicker(true)}>
                <Plus /> {t("Device")}
              </button>
              <button className="btn" onClick={() => setLines([...latest.current.lines, laborHoursLine(1, pricing, "Labor", newId())])}>
                <Hammer /> {t("Labor hours")}
              </button>
              <button className="btn" onClick={() => setLines([...latest.current.lines, { id: newId(), kind: "material", description: "", qty: 1, unit: "each", unitPrice: 0, taxable: true }])}>
                <Package /> {t("Material")}
              </button>
              <button className="btn col-span-2 sm:col-span-1" onClick={() => setLines([...latest.current.lines, { id: newId(), kind: "custom", description: "", qty: 1, unit: "each", unitPrice: 0, taxable: true }])}>
                <FilePen /> {t("Other")}
              </button>
            </div>
          )}
        </section>

        {/* Pricing + totals */}
        <section className="grid gap-4 sm:grid-cols-2">
          <div className="card space-y-3 p-4">
            <h2 className="section-title">{t("Pricing")}</h2>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <span className="label">{t("Markup on materials %")}</span>
                <NumField key={`m${draft.markupPct}`} value={draft.markupPct ?? 0} label={t("Markup %")} disabled={!editable} onCommit={(n) => change({ markupPct: n ?? 0 })} />
              </div>
              <div>
                <span className="label">{t("Tax %")}</span>
                <NumField key={`x${draft.taxPct}`} value={draft.taxPct ?? 0} label={t("Tax %")} disabled={!editable} onCommit={(n) => change({ taxPct: n ?? 0 })} />
              </div>
              <div>
                <span className="label">{t("Labor rate / hr")}</span>
                <NumField
                  key={`r${laborRate}`}
                  value={laborRate}
                  label={t("Labor rate per hour")}
                  onCommit={(n) => {
                    const rate = n ?? 0;
                    void updateProject({ pricing: { ...(project.pricing ?? {}), laborRate: rate } as typeof project.pricing });
                    if (canEdit(latest.current))
                      setLines(latest.current.lines.map((l) => (l.kind === "labor" && l.unit === "hr" && !l.deviceTypeId && (l.unitPrice === laborRate || !l.unitPrice) ? { ...l, unitPrice: rate } : l)));
                  }}
                />
              </div>
              <div>
                <span className="label">{t("Schedule impact (days)")}</span>
                <NumField key={`s${draft.scheduleDays}`} value={draft.scheduleDays ?? null} allowEmpty disabled={!editable} label={t("Schedule impact in days")} onCommit={(n) => change({ scheduleDays: n })} />
              </div>
            </div>
            <p className="text-xs text-slate-500">
              {pricing.laborMode === "combined"
                ? t("Catalog devices are priced like the estimate ({pct}% markup, installed).", { pct: pricing.markupPct })
                : t("Catalog devices are priced like the estimate ({pct}% markup, labor listed separately).", { pct: pricing.markupPct })}{" "}
              {t("The markup here applies to material lines only.")}
            </p>
          </div>
          <div className="card p-4">
            <h2 className="section-title">{t("Total")}</h2>
            <dl className="mt-2 space-y-1 text-sm">
              <div className="flex justify-between">
                <dt className="text-slate-500">{t("Lines")}</dt>
                <dd className="tabular-nums">{formatMoney(totals.subtotal, cur)}</dd>
              </div>
              {(hasMaterial || totals.markup !== 0) && (
                <div className="flex justify-between">
                  <dt className="text-slate-500">{t("Markup ({pct}% on materials)", { pct: draft.markupPct ?? 0 })}</dt>
                  <dd className="tabular-nums">{formatMoney(totals.markup, cur)}</dd>
                </div>
              )}
              <div className="flex justify-between">
                <dt className="text-slate-500">{t("Tax ({pct}%)", { pct: draft.taxPct ?? 0 })}</dt>
                <dd className="tabular-nums">{formatMoney(totals.tax, cur)}</dd>
              </div>
              <div className="flex justify-between border-t border-slate-200 pt-2 text-lg font-bold">
                <dt>{t("Change order total")}</dt>
                <dd className="tabular-nums" data-testid="co-editor-total">
                  {formatMoney(totals.total, cur)}
                </dd>
              </div>
            </dl>
          </div>
        </section>

        {/* Evidence */}
        <section className="card space-y-3 p-4">
          <h2 className="section-title">{t("Evidence")}</h2>
          {linked.length > 0 && (
            <div className="text-sm">
              <span className="text-slate-500">{t("Plan devices:")} </span>
              {linked.map((m) => m.label || catalog.find((d) => d.id === m.deviceTypeId)?.name).join(", ")}
              {draft.sheetIds?.length ? <span className="text-slate-500"> · {sheets.filter((s) => draft.sheetIds?.includes(s.id)).map((s) => s.name).join(", ")}</span> : null}
            </div>
          )}
          {rfis && rfis.length > 0 && (
            <div>
              <label className="label" htmlFor="co-rfi">
                RFI
              </label>
              <select id="co-rfi" className="input" disabled={!editable} value={draft.rfiId ?? ""} onChange={(e) => change({ rfiId: e.target.value || null })}>
                <option value="">{t("None")}</option>
                {rfis.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div>
            <span className="label">{editable ? t("Photos (tap to attach — the client sees them)") : t("Photos")}</span>
            {jobPhotos.length === 0 ? (
              <p className="text-sm text-slate-500">{t("No job photos yet. Take them on the Photos tab.")}</p>
            ) : editable ? (
              <>
                <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
                  {photoList.map((p) => {
                    const on = !!draft.photoIds?.includes(p.id);
                    return <PhotoThumb key={p.id} photo={p} on={on} onToggle={() => change({ photoIds: on ? (draft.photoIds ?? []).filter((x) => x !== p.id) : [...(draft.photoIds ?? []), p.id] })} />;
                  })}
                </div>
                {jobPhotos.length > photoList.length && (
                  <button className="btn btn-sm btn-ghost mt-2" onClick={() => setShowAllPhotos(true)}>
                    {t("Show all {n} photos", { n: jobPhotos.length })}
                  </button>
                )}
              </>
            ) : (
              <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
                {jobPhotos
                  .filter((p) => draft.photoIds?.includes(p.id))
                  .map((p) => (
                    <PhotoThumb key={p.id} photo={p} on={false} onToggle={() => undefined} />
                  ))}
                {!draft.photoIds?.length && <p className="col-span-full text-sm text-slate-500">{t("None attached.")}</p>}
              </div>
            )}
          </div>
        </section>

        {/* Client link */}
        {draft.status === "sent" && linkUrl && (
          <section className="card space-y-3 p-4" aria-label={t("Client link")}>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="section-title flex-1">{t("Client link")}</h2>
              {!supabaseConfigured || !signedIn ? (
                <span className="inline-flex items-center gap-1 text-xs text-amber-700">
                  <WifiOff className="h-3.5 w-3.5" /> {t("Cloud sync is off — the link won’t open. Mark it approved by hand.")}
                </span>
              ) : pending || !online ? (
                <span className="inline-flex items-center gap-1 text-xs text-amber-700" data-testid="co-link-state">
                  <Clock className="h-3.5 w-3.5" /> {t("Waiting to sync — the link works once this device is online")}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-xs text-emerald-700" data-testid="co-link-state">
                  <Wifi className="h-3.5 w-3.5" /> {t("Link is live")}
                </span>
              )}
            </div>
            <div className="flex gap-2">
              <input className="input flex-1 font-mono text-xs" readOnly value={linkUrl} aria-label={t("Client link")} onFocus={(e) => e.currentTarget.select()} data-testid="co-link" />
              <button
                className="btn"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(linkUrl);
                    toast(t("Link copied"), "success");
                  } catch {
                    toast(t("Couldn't copy — select the link and copy it"), "error");
                  }
                }}
              >
                <Copy /> {t("Copy")}
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              <a
                className="btn"
                href={`mailto:${encodeURIComponent(project.clientEmail ?? "")}?subject=${encodeURIComponent(`Change order ${code} — ${draft.title}`)}&body=${encodeURIComponent(
                  mailtoBody({ code, title: draft.title, total: totals.total, currency: cur, business: settings.business, scheduleDays: draft.scheduleDays ?? null }, linkUrl, (n) => formatMoney(n, cur)),
                )}`}
              >
                <Mail /> {t("Email")}
              </a>
              {project.clientPhone && (
                <a className="btn" href={`sms:${project.clientPhone.replace(/[^+\d]/g, "")}?&body=${encodeURIComponent(`${code} — ${draft.title}: ${formatMoney(totals.total, cur)}. Review and sign: ${linkUrl}`)}`}>
                  <Send /> {t("Text")}
                </a>
              )}
              {typeof navigator !== "undefined" && "share" in navigator && (
                <button className="btn" onClick={() => void navigator.share({ title: `Change order ${code}`, url: linkUrl }).catch(() => undefined)}>
                  <Share2 /> {t("Share")}
                </button>
              )}
            </div>
          </section>
        )}

        {/* Actions */}
        <section className="sticky bottom-0 z-10 -mx-3 flex flex-wrap gap-2 border-t border-slate-200 bg-white/95 p-3 backdrop-blur sm:static sm:mx-0 sm:rounded-xl sm:border sm:p-3">
          {draft.status === "draft" && (
            <button className="btn btn-brand flex-1 sm:flex-none" disabled={!draft.lines.length || busy === "send"} onClick={() => void send()}>
              <Send /> {t("Send to client")}
            </button>
          )}
          {canDo(draft, "approve") && (
            <button className="btn" onClick={() => setApproving(true)}>
              <Check /> {t("Mark approved")}
            </button>
          )}
          {draft.status === "sent" && (
            <button
              className="btn"
              onClick={() => {
                // Cancel on either prompt leaves the change order as it is.
                const name = window.prompt(t("Rejected by (optional)"));
                if (name == null) return;
                const comment = window.prompt(t("Reason (optional)"));
                if (comment == null) return;
                void act("reject", { name, comment });
              }}
            >
              <X /> {t("Mark rejected")}
            </button>
          )}
          {canDo(draft, "revise") && (
            <button className="btn" onClick={() => void act("revise", { newId: newId() })}>
              <FilePen /> {t("Revise")}
            </button>
          )}
          {canDo(draft, "void") && draft.status !== "draft" && (
            <button className="btn btn-ghost text-red-600" onClick={() => window.confirm(t("Void {code}? The client link stops working.", { code })) && void act("void")}>
              <Ban /> {t("Void…")}
            </button>
          )}
          {draft.status === "draft" && (
            <button className="btn btn-ghost text-red-600" onClick={() => void remove()}>
              <Trash /> {t("Delete draft")}
            </button>
          )}
          {draft.status === "approved" && <p className="self-center text-sm text-slate-500">{t("Approved change orders are locked. Make a new change order for further changes.")}</p>}
        </section>
      </div>

      {picker && <DevicePicker catalog={catalog} productFor={productFor} pricing={pricing} onPick={addDevice} onClose={() => setPicker(false)} />}
      {fromPlan && <AddFromPlanDialog project={project} sheets={sheets} markers={markers} catalog={catalog} cos={props.all} current={draft} onAdd={addFromPlan} onClose={() => setFromPlan(false)} />}
      {approving && <ApproveDialog code={code} onDone={approveManually} onCancel={() => setApproving(false)} />}
    </div>
  );
}
