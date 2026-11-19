"use client";
// One RFI: write it (subject, question, our suggestion, who to, due, impacts), attach photos, documents and the spot on
// the plan, then send it (office): a no-login answer link plus a ready-to-send email. Answers arrive through the link
// on the next sync, or are recorded here when they came by phone or email. Close, reopen, void, PDF.
import { Ban, Camera, Check, Copy, FileDown, FileText, ImagePlus, Link2, Mail, MapPin, MessageSquareReply, RotateCcw, Send, Trash, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { newId, nowIso } from "@/lib/db";
import { getAuthor, importPhoto } from "@/lib/photos";
import {
  canEditRfi,
  canRfi,
  emailText,
  isOverdue,
  mailtoUrl,
  newRfi,
  newShareToken,
  parseCc,
  rfiCode,
  rfiLink,
  rfiPhotos,
  senderFrom,
  transition,
  type RfiAction,
} from "@/lib/rfis";
import { useEditor } from "@/lib/store";
import { supabaseConfigured } from "@/lib/supabase";
import { useSyncStatus } from "@/lib/sync";
import { useRole } from "@/lib/team";
import { toast } from "@/lib/toast";
import type { Photo, Rfi, RfiImpact } from "@/lib/types";
import { useBlobUrl, useSheetImage } from "@/lib/useImage";
import { saveRfi, useLinkedTaskNumber, useRfiQueued } from "@/lib/useRfis";
import PlanCrop from "./PlanCrop";
import PlanSpotPicker, { markerName, type PlanSpot } from "./PlanSpotPicker";
import { downloadRfiPdf } from "./rfiPdfData";
import { addDays, BallChip, dayLabel, localToday, StatusChip } from "./ui";

function Thumb({ photo, onClick, selected, onRemove }: { photo: Photo; onClick?: () => void; selected?: boolean; onRemove?: () => void }) {
  const url = useBlobUrl(photo.imageId);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={onClick}
        className={`block h-20 w-20 overflow-hidden rounded-lg bg-slate-100 ${selected === undefined ? "ring-1 ring-slate-200" : selected ? "ring-[3px] ring-brand-500" : "opacity-70 ring-1 ring-slate-200"}`}
        aria-pressed={selected}
        aria-label={photo.caption || "Photo"}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {url && <img src={url} alt="" className="h-full w-full object-cover" />}
        {selected && (
          <span className="absolute top-1 right-1 rounded-full bg-brand-600 p-0.5 text-white">
            <Check className="h-3 w-3" />
          </span>
        )}
      </button>
      {onRemove && (
        <button type="button" className="absolute -top-1.5 -right-1.5 rounded-full bg-white p-0.5 text-slate-600 shadow ring-1 ring-slate-200" onClick={onRemove} aria-label="Remove photo">
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

/** Pick from the job's photos (newest first). */
function PhotoPicker({ photos, chosen, onDone }: { photos: Photo[]; chosen: string[]; onDone: (ids: string[]) => void }) {
  const [sel, setSel] = useState<string[]>(chosen);
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-slate-900/40 sm:items-center sm:p-4" onClick={() => onDone(chosen)}>
      <div className="card animate-in flex max-h-[85vh] w-full max-w-xl flex-col rounded-b-none shadow-pop sm:rounded-b-xl" role="dialog" aria-label="Job photos" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3">
          <h3 className="mr-auto font-semibold">Job photos</h3>
          <button className="btn btn-sm" onClick={() => onDone(chosen)}>
            Cancel
          </button>
          <button className="btn btn-sm btn-brand" onClick={() => onDone(sel)}>
            Attach {sel.length || ""}
          </button>
        </div>
        <div className="flex flex-wrap gap-2 overflow-auto p-4">
          {photos.length ? (
            photos.map((p) => <Thumb key={p.id} photo={p} selected={sel.includes(p.id)} onClick={() => setSel((s) => (s.includes(p.id) ? s.filter((x) => x !== p.id) : [...s, p.id]))} />)
          ) : (
            <p className="text-sm text-slate-500">No photos on this job yet. Take one with the camera button.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function LocationPreview({ sheetImageId, sheetName, width, height, x, y, label }: { sheetImageId: string; sheetName: string; width: number; height: number; x: number; y: number; label: string }) {
  const img = useSheetImage(sheetImageId);
  if (!img) return <div className="flex h-40 items-center justify-center rounded-lg bg-slate-100 text-xs text-slate-500">{sheetName}</div>;
  return <PlanCrop src={img.url} width={width || img.img.naturalWidth} height={height || img.img.naturalHeight} x={x} y={y} label={label} className="max-h-72" />;
}

const IMPACTS: { v: RfiImpact; label: string }[] = [
  { v: "no", label: "No" },
  { v: "tbd", label: "TBD" },
  { v: "yes", label: "Yes" },
];

function Segment<T extends string>({ value, options, onChange, disabled, label }: { value: T | null | undefined; options: { v: T; label: string }[]; onChange: (v: T) => void; disabled?: boolean; label: string }) {
  return (
    <div className="seg" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o.v} type="button" role="radio" aria-checked={value === o.v} disabled={disabled} className={`tab h-7 px-2.5 ${value === o.v ? "tab-active" : ""}`} onClick={() => onChange(o.v)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export default function RfiEditor({ rfi, isNew, onClose }: { rfi: Rfi; isNew: boolean; onClose: () => void }) {
  const { project, settings, photos, sheets, markers, catalog, documents, saveRow } = useEditor();
  const { email, signedIn } = useSyncStatus();
  const role = useRole();
  const [r, setR] = useState<Rfi>(rfi);
  const [ccText, setCcText] = useState((rfi.cc ?? []).join(", "));
  const [dirty, setDirty] = useState(isNew);
  const [saved, setSaved] = useState(!isNew);
  const [busy, setBusy] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [photoPicker, setPhotoPicker] = useState(false);
  const [docPicker, setDocPicker] = useState(false);
  const [answering, setAnswering] = useState(false);
  const [answer, setAnswer] = useState("");
  const [answerBy, setAnswerBy] = useState(rfi.toName ?? "");
  const camRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const queued = useRfiQueued(saved ? r.id : null, r.updatedAt);
  const taskNo = useLinkedTaskNumber(r.taskId);

  // A newer copy arrived (sync pull, an answer through the link) and nothing is being edited: show it.
  const [seen, setSeen] = useState(rfi);
  if (seen !== rfi) {
    setSeen(rfi);
    if (!dirty && rfi.updatedAt !== r.updatedAt) {
      setR(rfi);
      setCcText((rfi.cc ?? []).join(", "));
    }
  }

  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === "Escape" && !picking && !photoPicker && !docPicker && requestClose();
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });

  const livePhotos = useMemo(() => photos.filter((p) => !p.deleted), [photos]);
  const attached = rfiPhotos(r, livePhotos);
  const attachedDocs = (r.documentIds ?? []).map((id) => documents.find((d) => d.id === id && !d.deleted)).filter((d): d is NonNullable<typeof d> => !!d);
  const sheet = r.sheetId ? sheets.find((s) => s.id === r.sheetId && !s.deleted) : undefined;
  const marker = r.markerId ? markers.find((m) => m.id === r.markerId) : undefined;
  const editable = canEditRfi(role, r);
  const canPhotos = r.status !== "void" && (editable || canRfi(role, "addPhoto"));
  const today = localToday();
  const overdue = isOverdue(r, today);
  const live = supabaseConfigured && !!r.shareToken;
  const link = live && typeof window !== "undefined" ? rfiLink(window.location.origin, r.shareToken!) : null;

  if (!project || !settings) return null;

  const set = (p: Partial<Rfi>) => {
    setR((x) => ({ ...x, ...p }));
    setDirty(true);
  };

  function requestClose() {
    if (dirty && saved && !window.confirm("Discard your changes to this RFI?")) return;
    if (dirty && !saved && (r.subject.trim() || r.question.trim()) && !window.confirm("Discard this new RFI?")) return;
    onClose();
  }

  const current = (): Rfi => ({ ...r, subject: r.subject.trim(), question: r.question.trim(), suggestion: r.suggestion?.trim() || null, cc: parseCc(ccText) });

  async function persist(next: Rfi, msg?: string): Promise<Rfi | null> {
    try {
      const out = await saveRfi(next);
      setR(out);
      setDirty(false);
      setSaved(true);
      if (msg) toast(msg, "success");
      return out;
    } catch (e) {
      toast(`Couldn't save: ${(e as Error).message}`, "error");
      return null;
    }
  }

  async function save() {
    const next = current();
    if (!next.subject && !next.question) return toast("Write the subject or question first", "info");
    await persist(next, isNew && !saved ? `${rfiCode(r.number)} saved` : "Saved");
  }

  function openEmail(rr: Rfi, lnk: string | null) {
    const text = emailText(rr, project!, lnk, { sheetName: sheet?.name, from: rr.sender?.contact ?? getAuthor(email), company: settings!.business.name });
    window.location.href = mailtoUrl(rr.toEmail, rr.cc, text);
  }
  async function copy(text: string, what = "Link copied") {
    try {
      await navigator.clipboard.writeText(text);
      toast(what, "success");
    } catch {
      window.prompt("Copy this link", text);
    }
  }

  async function act(action: RfiAction) {
    const by = getAuthor(email);
    const now = nowIso();
    try {
      if (action === "send") {
        const base = current();
        if (!base.subject && !base.question) return toast("Write the subject or question first", "info");
        const token = base.shareToken ?? newShareToken();
        const next = transition({ ...base, sender: senderFrom(settings!.business, by) }, "send", by, now, { shareToken: token });
        const out = await persist(next, r.status === "open" ? "Sent again" : `${rfiCode(r.number)} sent — the ball is with them`);
        if (!out) return;
        const lnk = supabaseConfigured ? rfiLink(window.location.origin, token) : null;
        if (lnk) {
          try {
            await navigator.clipboard.writeText(lnk);
          } catch {
            /* clipboard blocked: the link is shown below */
          }
        }
        openEmail(out, lnk);
        return;
      }
      if (action === "void" && !window.confirm(`Void ${rfiCode(r.number)}? The answer link stops working.`)) return;
      if (action === "answer") {
        const next = transition(current(), "answer", answerBy || "", now, { answer });
        await persist(next, "Answer recorded — the ball is with us");
        setAnswering(false);
        setAnswer("");
        return;
      }
      const next = transition(current(), action, by, now);
      await persist(next, action === "close" ? "Closed" : action === "reopen" ? "Reopened — the ball is with them" : "Voided");
    } catch (e) {
      toast((e as Error).message, "error");
    }
  }

  async function addFiles(files: FileList | null) {
    const list = [...(files ?? [])];
    if (!list.length || !project) return;
    setBusy("Adding photos…");
    try {
      const ids: string[] = [];
      for (const f of list) {
        try {
          const p = await importPhoto(f, { projectId: project.id, author: getAuthor(email), extra: { sheetId: r.sheetId ?? null, markerId: r.markerId ?? null, caption: r.subject ? `${rfiCode(r.number)}: ${r.subject}` : rfiCode(r.number) } });
          await saveRow("photos", p);
          ids.push(p.id);
        } catch (err) {
          toast(`${f.name}: ${(err as Error).message}`, "error");
        }
      }
      if (ids.length) {
        const next = { ...r, photoIds: [...(r.photoIds ?? []), ...ids] };
        // A tech adding photos to a sent RFI: save right away (they can't edit the rest).
        if (!editable && saved) await persist(next, "Photo added");
        else set({ photoIds: next.photoIds });
      }
    } finally {
      setBusy(null);
    }
  }

  async function setPhotoIds(ids: string[]) {
    if (!editable && saved) await persist({ ...r, photoIds: ids }, "Photos updated");
    else set({ photoIds: ids });
  }

  async function downloadPdf() {
    setBusy("Building the PDF…");
    try {
      await downloadRfiPdf(dirty ? current() : r, { project: project!, settings: settings!, photos, sheets, documents, markerLabel: (id) => {
        const m = markers.find((x) => x.id === id);
        return m ? markerName(m, catalog) : null;
      } });
    } catch (e) {
      toast(`PDF failed: ${(e as Error).message}`, "error");
    } finally {
      setBusy(null);
    }
  }

  const office = canRfi(role, "send");
  const status = r.status;
  return (
    <>
    <div className="fixed inset-0 z-50 flex items-stretch justify-center bg-slate-900/40 sm:items-center sm:p-4" onClick={requestClose}>
      <div className="flex h-full w-full flex-col bg-slate-50 shadow-pop sm:h-auto sm:max-h-[92vh] sm:max-w-2xl sm:rounded-2xl" role="dialog" aria-modal="true" aria-label={`${rfiCode(r.number)} ${r.subject}`} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center gap-2 border-b border-slate-200 bg-white px-4 py-3 sm:rounded-t-2xl">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="font-mono text-sm font-bold text-slate-700">{rfiCode(r.number)}</span>
              <StatusChip status={status} />
              <BallChip rfi={r} />
              {overdue && <span className="chip bg-red-50 text-red-700 ring-1 ring-red-200">Overdue</span>}
              {taskNo != null && <span className="chip bg-slate-100 text-slate-600">Linked task #{taskNo}</span>}
            </div>
            <div className="mt-0.5 truncate text-xs text-slate-500">
              {[r.createdBy && `Raised by ${r.createdBy}`, r.sentAt && `sent ${dayLabel(r.sentAt)}`, r.answeredAt && `answered ${dayLabel(r.answeredAt)}`].filter(Boolean).join(" · ") || (saved ? "Draft" : "New RFI")}
            </div>
          </div>
          <button className="btn btn-icon btn-ghost" onClick={requestClose} aria-label="Back to the list">
            <X />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-auto px-4 py-4">
          {/* Answer (when there is one) first: it's what people open an answered RFI for. */}
          {r.answer && (
            <section className="card border-l-4 border-l-emerald-500 p-4" aria-label="Answer">
              <div className="flex items-center gap-1.5 text-xs font-bold tracking-wide text-emerald-700 uppercase">
                <Check className="h-4 w-4" /> {status === "open" ? "Earlier answer" : "Answer"}
              </div>
              <p className="mt-1.5 whitespace-pre-line">{r.answer}</p>
              <p className="mt-1.5 text-xs text-slate-500">{[r.answeredBy, r.answeredAt && new Date(r.answeredAt).toLocaleString()].filter(Boolean).join(" · ")}</p>
            </section>
          )}

          <section className="card space-y-3 p-4">
            <label className="block text-sm">
              <span className="label">Subject</span>
              <input className="input text-base" placeholder="e.g. FACP location" value={r.subject} onChange={(e) => set({ subject: e.target.value })} disabled={!editable} autoFocus={isNew} maxLength={200} />
            </label>
            <label className="block text-sm">
              <span className="label">Question</span>
              <textarea className="input min-h-24 text-base" placeholder="Where does the fire alarm control panel go? Plans show two locations." value={r.question} onChange={(e) => set({ question: e.target.value })} disabled={!editable} />
            </label>
            <label className="block text-sm">
              <span className="label">Our suggestion (optional)</span>
              <textarea className="input min-h-16" placeholder="Suggest the garage wall next to the electrical panel." value={r.suggestion ?? ""} onChange={(e) => set({ suggestion: e.target.value })} disabled={!editable} />
            </label>
          </section>

          {/* Where + photos + documents */}
          <section className="card space-y-3 p-4">
            <div>
              <div className="mb-1.5 flex items-center gap-2">
                <span className="label mb-0 flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5" /> Plan location
                </span>
                <div className="flex-1" />
                {editable && sheets.length > 0 && (
                  <button className="btn btn-sm btn-ghost text-brand-600" onClick={() => setPicking(true)}>
                    {sheet ? "Change" : "Pick on plan"}
                  </button>
                )}
                {editable && sheet && (
                  <button className="btn btn-sm btn-ghost" onClick={() => set({ sheetId: null, x: null, y: null, markerId: null })} aria-label="Remove location">
                    <X />
                  </button>
                )}
              </div>
              {sheet && r.x != null && r.y != null ? (
                <LocationPreview sheetImageId={sheet.imageId} sheetName={sheet.name} width={sheet.width} height={sheet.height} x={r.x} y={r.y} label={[sheet.name, marker ? markerName(marker, catalog) : ""].filter(Boolean).join(" · ")} />
              ) : (
                <p className="text-xs text-slate-500">{sheets.length ? "Mark the spot so they know exactly where you mean." : "Add plan sheets to the job to mark a spot."}</p>
              )}
            </div>

            <div>
              <div className="mb-1.5 flex flex-wrap items-center gap-1">
                <span className="label mb-0 mr-auto">Photos</span>
                {canPhotos && (
                  <>
                    <input ref={camRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => void addFiles(e.currentTarget.files).finally(() => (e.target.value = ""))} data-testid="rfi-camera" />
                    <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => void addFiles(e.currentTarget.files).finally(() => (e.target.value = ""))} data-testid="rfi-upload" />
                    <button className="btn btn-sm btn-ghost text-brand-600" onClick={() => camRef.current?.click()} disabled={!!busy}>
                      <Camera /> Take
                    </button>
                    <button className="btn btn-sm btn-ghost text-brand-600" onClick={() => fileRef.current?.click()} disabled={!!busy}>
                      <ImagePlus /> Upload
                    </button>
                    <button className="btn btn-sm btn-ghost text-brand-600" onClick={() => setPhotoPicker(true)}>
                      From job
                    </button>
                  </>
                )}
              </div>
              {attached.length ? (
                <div className="flex flex-wrap gap-2">
                  {attached.map((p) => (
                    <Thumb key={p.id} photo={p} onRemove={canPhotos && editable ? () => void setPhotoIds((r.photoIds ?? []).filter((x) => x !== p.id)) : undefined} />
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-500">A photo answers half the question.</p>
              )}
            </div>

            <div>
              <div className="mb-1.5 flex items-center gap-2">
                <span className="label mb-0 mr-auto">Documents</span>
                {editable && documents.some((d) => !d.deleted) && (
                  <button className="btn btn-sm btn-ghost text-brand-600" onClick={() => setDocPicker((x) => !x)}>
                    <FileText /> {docPicker ? "Done" : "Attach"}
                  </button>
                )}
              </div>
              {docPicker ? (
                <ul className="divide-y divide-slate-100 rounded-lg ring-1 ring-slate-200">
                  {documents
                    .filter((d) => !d.deleted)
                    .map((d) => {
                      const on = (r.documentIds ?? []).includes(d.id);
                      return (
                        <li key={d.id}>
                          <label className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm">
                            <input type="checkbox" checked={on} onChange={() => set({ documentIds: on ? (r.documentIds ?? []).filter((x) => x !== d.id) : [...(r.documentIds ?? []), d.id] })} />
                            <span className="truncate">{d.name}</span>
                          </label>
                        </li>
                      );
                    })}
                </ul>
              ) : attachedDocs.length ? (
                <div className="flex flex-wrap gap-1.5">
                  {attachedDocs.map((d) => (
                    <span key={d.id} className="chip bg-slate-100 text-slate-700">
                      <FileText className="h-3 w-3" /> {d.name}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-500">{documents.some((d) => !d.deleted) ? "Point to a drawing or spec sheet from the job's documents." : "No job documents yet (Field → Documents)."}</p>
              )}
            </div>
          </section>

          {/* Who + when */}
          <section className="card space-y-3 p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="label">To (name)</span>
                <input className="input" placeholder="Pat Rivera" value={r.toName ?? ""} onChange={(e) => set({ toName: e.target.value })} disabled={!editable} autoComplete="off" />
              </label>
              <label className="block text-sm">
                <span className="label">Company</span>
                <input className="input" placeholder="GC / architect / owner" value={r.toCompany ?? ""} onChange={(e) => set({ toCompany: e.target.value })} disabled={!editable} />
              </label>
              <label className="block text-sm">
                <span className="label">Email</span>
                <input className="input" type="email" inputMode="email" placeholder="pat@gc.com" value={r.toEmail ?? ""} onChange={(e) => set({ toEmail: e.target.value.trim() })} disabled={!editable} />
              </label>
              <label className="block text-sm">
                <span className="label">CC</span>
                <input className="input" inputMode="email" placeholder="super@gc.com, pm@gc.com" value={ccText} onChange={(e) => (setCcText(e.target.value), setDirty(true))} disabled={!editable} />
              </label>
            </div>
            <div>
              <span className="label">Answer needed by</span>
              <div className="flex flex-wrap items-center gap-2">
                <input type="date" className="input h-9 w-44" value={r.due ?? ""} onChange={(e) => set({ due: e.target.value || null })} disabled={!editable} aria-label="Due date" />
                {editable &&
                  [
                    [2, "2 days"],
                    [5, "5 days"],
                    [7, "1 week"],
                  ].map(([n, l]) => (
                    <button key={n} type="button" className={`btn btn-sm ${r.due === addDays(today, n as number) ? "btn-on" : ""}`} onClick={() => set({ due: addDays(today, n as number) })}>
                      {l}
                    </button>
                  ))}
              </div>
            </div>
            <div className="flex flex-wrap gap-x-5 gap-y-3">
              <div>
                <span className="label">Priority</span>
                <Segment label="Priority" value={r.priority ?? "normal"} disabled={!editable} onChange={(v) => set({ priority: v })} options={[{ v: "low", label: "Low" }, { v: "normal", label: "Normal" }, { v: "high", label: "High" }]} />
              </div>
              <div>
                <span className="label">Cost impact</span>
                <Segment label="Cost impact" value={r.costImpact} disabled={!editable} onChange={(v) => set({ costImpact: v })} options={IMPACTS} />
              </div>
              <div>
                <span className="label">Schedule impact</span>
                <Segment label="Schedule impact" value={r.scheduleImpact} disabled={!editable} onChange={(v) => set({ scheduleImpact: v })} options={IMPACTS} />
              </div>
            </div>
          </section>

          {/* Sharing state */}
          {saved && status !== "draft" && status !== "void" && (
            <section className="card space-y-2 p-4" aria-label="Answer link">
              <div className="flex items-center gap-1.5 text-sm font-semibold">
                <Link2 className="h-4 w-4" /> Answer link
              </div>
              {!supabaseConfigured ? (
                <p className="text-sm text-slate-500">No-login answer links need cloud sync. The email still works: they reply to it and you record the answer here.</p>
              ) : !r.shareToken ? (
                <p className="text-sm text-slate-500">Send it again to make a link.</p>
              ) : (
                <>
                  <div className="flex items-center gap-2">
                    <input className="input h-9 font-mono text-xs" readOnly value={link ?? ""} onFocus={(e) => e.currentTarget.select()} aria-label="Answer link" data-testid="rfi-link" />
                    <button className="btn btn-sm" onClick={() => link && void copy(link)}>
                      <Copy /> Copy
                    </button>
                  </div>
                  {(queued || !signedIn) && (
                    <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800" data-testid="rfi-pending">
                      {signedIn ? "Will be live once synced." : "Will be live once you sign in and it syncs."}
                    </p>
                  )}
                </>
              )}
              {office && status === "open" && (
                <button className="btn btn-sm" onClick={() => openEmail(r, link)}>
                  <Mail /> Email again
                </button>
              )}
            </section>
          )}

          {answering && (
            <section className="card space-y-3 border-2 border-emerald-200 p-4" aria-label="Record answer">
              <p className="text-sm text-slate-600">Got the answer by phone, email or in a meeting? Write it down here.</p>
              <textarea className="input min-h-24 text-base" placeholder="Their answer" value={answer} onChange={(e) => setAnswer(e.target.value)} autoFocus />
              <label className="block text-sm">
                <span className="label">Answered by</span>
                <input className="input" value={answerBy} onChange={(e) => setAnswerBy(e.target.value)} placeholder="Name" />
              </label>
              <div className="flex justify-end gap-2">
                <button className="btn btn-sm" onClick={() => setAnswering(false)}>
                  Cancel
                </button>
                <button className="btn btn-sm btn-brand" disabled={!answer.trim()} onClick={() => void act("answer")}>
                  <Check /> Save answer
                </button>
              </div>
            </section>
          )}
        </div>

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-2 border-t border-slate-200 bg-white px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:rounded-b-2xl">
          {busy && <span className="text-xs text-slate-500" aria-live="polite">{busy}</span>}
          {saved && (
            <button className="btn btn-sm" onClick={() => void downloadPdf()} disabled={!!busy}>
              <FileDown /> PDF
            </button>
          )}
          {saved && status === "draft" && canRfi(role, "delete") && (
            <button
              className="btn btn-sm btn-ghost text-red-600"
              onClick={async () => {
                if (!window.confirm(`Delete draft ${rfiCode(r.number)}?`)) return;
                await saveRfi({ ...r, deleted: true });
                onClose();
              }}
              aria-label="Delete draft"
            >
              <Trash />
            </button>
          )}
          {saved && status !== "void" && status !== "draft" && canRfi(role, "void") && (
            <button className="btn btn-sm btn-ghost text-slate-500" onClick={() => void act("void")}>
              <Ban /> Void
            </button>
          )}
          <div className="flex-1" />
          {(status === "answered" || status === "closed") && canRfi(role, "reopen") && (
            <button className="btn btn-sm" onClick={() => void act("reopen")}>
              <RotateCcw /> Reopen
            </button>
          )}
          {status === "open" && canRfi(role, "recordAnswer") && !answering && (
            <button className="btn btn-sm" onClick={() => setAnswering(true)}>
              <MessageSquareReply /> Record answer
            </button>
          )}
          {(status === "open" || status === "answered") && canRfi(role, "close") && (
            <button className={`btn btn-sm ${status === "answered" ? "btn-brand" : ""}`} onClick={() => void act("close")}>
              <Check /> Close
            </button>
          )}
          {editable && (dirty || !saved) && (
            <button className="btn btn-sm" onClick={() => void save()}>
              {status === "draft" ? "Save draft" : "Save"}
            </button>
          )}
          {(status === "draft" || status === "open") && office && (
            <button className={`btn btn-sm ${status === "draft" ? "btn-brand" : ""}`} onClick={() => void act("send")}>
              <Send /> {status === "draft" ? "Send" : "Resend"}
            </button>
          )}
          {status === "draft" && !office && saved && !dirty && <span className="text-xs text-slate-500">The office sends it.</span>}
        </div>
      </div>
    </div>

      {picking && (
        <PlanSpotPicker
          sheets={sheets.filter((s) => !s.deleted)}
          markers={markers}
          catalog={catalog}
          initial={{ sheetId: r.sheetId ?? undefined, x: r.x ?? undefined, y: r.y ?? undefined, markerId: r.markerId ?? null }}
          onCancel={() => setPicking(false)}
          onPick={(s: PlanSpot) => {
            set({ sheetId: s.sheetId, x: s.x, y: s.y, markerId: s.markerId });
            setPicking(false);
          }}
        />
      )}
      {photoPicker && (
        <PhotoPicker
          photos={livePhotos}
          chosen={r.photoIds ?? []}
          onDone={(ids) => {
            setPhotoPicker(false);
            if (ids.join() !== (r.photoIds ?? []).join()) void setPhotoIds(ids);
          }}
        />
      )}
    </>
  );
}

/** A blank draft for this job (not saved until "Save draft" or "Send"). */
export function draftRfi(projectId: string, number: number, author: string): Rfi {
  return newRfi(newId(), projectId, number, author, nowIso());
}
