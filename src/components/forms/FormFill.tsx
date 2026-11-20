"use client";
// Fill one form in the field: big controls, autosave while typing, signatures (also for someone else), photos,
// tables, live totals. "Submit" checks it and scrolls to the first problem; a submitted form is locked (the office can
// reopen it). "No" answers can become tasks; the PDF is made on the device.
import { ArrowLeft, Camera, CircleCheck, FileDown, ListTodo, Lock, LockOpen, MapPin, PenLine, Send, Trash, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { db, newId, nowIso } from "@/lib/db";
import { downloadBlob, slug } from "@/lib/download";
import {
  canDeleteForm,
  canEditForm,
  canReopenForm,
  computeCalcs,
  failedItems,
  formatNumber,
  formHistory,
  formProgress,
  removeFormPhoto,
  reopenForm,
  signatureFor,
  submitForm,
  validateForm,
  type FormIssue,
  type FormRow,
} from "@/lib/forms/forms";
import { signatureLines } from "@/lib/forms/signature";
import { deleteForm, saveForm, saveSignatureImage } from "@/lib/forms/useForms";
import { getAuthor, importPhoto, renderPhoto } from "@/lib/photos";
import { useEditor } from "@/lib/store";
import { useSyncStatus } from "@/lib/sync";
import { useRole } from "@/lib/team";
import { formTaskDrafts, formTaskNote, newTask } from "@/lib/tasks";
import { toast } from "@/lib/toast";
import type { FormField, JobForm, Photo } from "@/lib/types";
import { useBlobUrl } from "@/lib/useImage";
import PhotoViewer from "../photos/PhotoViewer";
import { CheckboxInput, MultiSelectInput, NumberInput, SelectInput, TableInput, YesNoInput } from "./FormInputs";
import { FormLocationPicker, placeText, type FormPlace } from "./FormLocation";
import type { FormPdfPhoto } from "./FormPdf";
import SignatureSheet from "./SignatureSheet";
import { useProjectTasks, useTasks } from "../tasks/taskStore";
import { fmtDate, useT } from "@/lib/i18n";

const when = (iso: string) => new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
// On screen (the PDF keeps `when`): in the active language.
const whenUi = (iso: string) => fmtDate(iso, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });

const blobToDataUrl = (b: Blob) =>
  new Promise<string>((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(String(fr.result));
    fr.onerror = () => rej(fr.error);
    fr.readAsDataURL(b);
  });

function Thumb({ photo, missing, onOpen, onRemove }: { photo?: Photo; missing?: boolean; onOpen: () => void; onRemove?: () => void }) {
  const url = useBlobUrl(photo?.imageId);
  const t = useT();
  return (
    <div className="relative">
      <button type="button" onClick={onOpen} disabled={missing} className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-lg bg-slate-100 text-[10px] text-slate-400 ring-1 ring-slate-200" aria-label={missing ? t("Photo missing") : t("Open photo")}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {url ? <img src={url} alt="" className="h-full w-full object-cover" /> : missing ? t("Missing") : null}
      </button>
      {onRemove && (
        <button type="button" onClick={onRemove} className="absolute -top-1.5 -right-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-white text-slate-500 shadow ring-1 ring-slate-200" aria-label={t("Remove photo from this field")}>
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

function SignatureView({ imageId }: { imageId: string }) {
  const url = useBlobUrl(imageId);
  const t = useT();
  // eslint-disable-next-line @next/next/no-img-element
  return url ? <img src={url} alt={t("Signature")} className="h-16 max-w-56 object-contain" /> : <span className="text-xs text-slate-400">{t("Signature image not on this device yet")}</span>;
}

export default function FormFill({ initial, onBack }: { initial: JobForm; onBack: () => void }) {
  const router = useRouter();
  const role = useRole();
  const t = useT();
  const { email } = useSyncStatus();
  const me = getAuthor(email);
  const { project, settings, photos, sheets, markers, checklists, saveRow } = useEditor();
  const planTasks = useProjectTasks(initial.projectId);
  const [form, setFormState] = useState<JobForm>(initial);
  const formRef = useRef(form);
  const [rev, setRev] = useState(0);
  const [saving, setSaving] = useState<"idle" | "pending" | "saved">("idle");
  const [showErrors, setShowErrors] = useState(false);
  const [signing, setSigning] = useState<FormField | null>(null);
  const [placing, setPlacing] = useState(false);
  const [viewer, setViewer] = useState<{ list: Photo[]; id: string } | null>(null);
  const [pdfBusy, setPdfBusy] = useState<string | null>(null);
  const [photoFor, setPhotoFor] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const pending = useRef<JobForm | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const editable = canEditForm(role, form);
  const issues = useMemo(() => validateForm(form), [form]);
  const progress = formProgress(form);
  const calcs = computeCalcs(form.template, form.values);
  const failed = failedItems(form);
  const history = formHistory(form);
  const place = placeText(form, sheets, markers);

  async function flush() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const next = pending.current;
    pending.current = null;
    if (!next) return;
    try {
      await saveForm(next);
      setSaving((s) => (pending.current ? s : "saved"));
    } catch {
      toast(t("Couldn't save the form"), "error");
    }
  }

  // Save what's typed when leaving the form.
  useEffect(
    () => () => {
      void flush();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // Changes from another device (sync) while nothing is waiting to save here.
  useEffect(() => {
    const onSync = () => {
      if (pending.current) return;
      void db()
        .forms.get(form.id)
        .then((row) => {
          if (!row || pending.current || row.updatedAt === formRef.current.updatedAt) return;
          if (row.deleted) return onBack();
          formRef.current = row;
          setFormState(row);
          setRev((r) => r + 1);
        });
    };
    window.addEventListener("pinplan:synced", onSync);
    return () => window.removeEventListener("pinplan:synced", onSync);
  }, [form.id, onBack]);

  /** Change the form (drafts only) and save it shortly after. */
  function update(fn: (f: JobForm) => JobForm) {
    const cur = formRef.current;
    if (!canEditForm(role, cur)) return;
    const next = fn(cur);
    formRef.current = next;
    setFormState(next);
    pending.current = next;
    setSaving("pending");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), 500);
  }
  const setValue = (id: string, v: unknown) => update((f) => ({ ...f, values: { ...f.values, [id]: v } }));

  /** Save right away (submit, reopen, location…). */
  async function saveNow(next: JobForm) {
    if (timer.current) clearTimeout(timer.current);
    pending.current = null;
    formRef.current = next;
    setFormState(next);
    const saved = await saveForm(next);
    formRef.current = saved;
    setFormState(saved);
    setSaving("saved");
    return saved;
  }

  async function submit() {
    setShowErrors(true);
    const list = validateForm(formRef.current);
    if (list.length) {
      const first = list[0];
      const el = document.getElementById(`ff-${first.fieldId}`);
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
      el?.querySelector<HTMLElement>("input, textarea, select, button")?.focus({ preventScroll: true });
      toast(t.tn("{n} thing to fix before submitting", "{n} things to fix before submitting", list.length), "error");
      return;
    }
    if (!confirm(t("Submit this form? It will be locked. The office can reopen it if something needs changing."))) return;
    await saveNow(submitForm(formRef.current, me, nowIso()));
    setShowErrors(false);
    toast(t("Form submitted and locked"), "success");
  }

  async function reopen() {
    const why = prompt(t("Reopen this form for changes? Add a short reason (optional):"), "");
    if (why === null) return;
    await saveNow(reopenForm(formRef.current, me, nowIso(), why));
    setRev((r) => r + 1);
    toast(t("Form reopened as a draft"));
  }

  async function remove() {
    if (!confirm(t("Delete “{name}”?", { name: form.name }))) return;
    if (timer.current) clearTimeout(timer.current);
    pending.current = null;
    await deleteForm(formRef.current);
    toast(t("Deleted “{name}”", { name: form.name }));
    onBack();
  }

  /** Every "No" answer becomes a task on the job (skipping ones already made, also as older punch-list items). */
  const makingTasks = useRef(false);
  async function makeTasks() {
    if (makingTasks.current) return;
    makingTasks.current = true;
    try {
      await makeTasksNow();
    } catch (e) {
      toast(t("Couldn't add the tasks: {error}", { error: (e as Error).message }), "error");
    } finally {
      makingTasks.current = false;
    }
  }
  async function makeTasksNow() {
    const f = formRef.current;
    const st = useTasks.getState();
    if (st.projectId !== f.projectId) await st.load(f.projectId);
    const note = formTaskNote(f.name);
    const legacy = new Set(checklists.filter((c) => !c.deleted && c.projectId === f.projectId).flatMap((c) => c.items.filter((i) => i.note === note).map((i) => i.text.trim().toLowerCase())));
    // The store's tasks, read now: a second tap right after the first must see the tasks it just made.
    const current = useTasks.getState().projectId === f.projectId ? useTasks.getState().tasks : planTasks;
    const drafts = formTaskDrafts(current, f, failedItems(f)).filter((d) => !legacy.has(d.title.toLowerCase()));
    if (!drafts.length) return toast(t("Those answers already have tasks"));
    const at = nowIso();
    for (const d of drafts) await useTasks.getState().save(newTask({ id: newId(), projectId: f.projectId, number: useTasks.getState().nextNumber(), ...d }, me, at, newId));
    toast(t.tn("{n} task added — see Field → Tasks", "{n} tasks added — see Field → Tasks", drafts.length), "success");
  }

  async function addPhotos(files: FileList | null) {
    const fieldId = photoFor;
    if (!files?.length || !fieldId || !project) return;
    const f = form.template.fields.find((x) => x.id === fieldId);
    try {
      const ids: string[] = [];
      for (const file of [...files]) {
        const p = await importPhoto(file, { projectId: project.id, author: me, extra: { tags: ["Form"], caption: `${form.name}${f ? `: ${f.label}` : ""}`, sheetId: form.sheetId ?? null, markerId: form.markerId ?? null } });
        await saveRow("photos", p);
        ids.push(p.id);
      }
      update((cur) => {
        const have = Array.isArray(cur.values[fieldId]) ? (cur.values[fieldId] as string[]) : [];
        return { ...cur, values: { ...cur.values, [fieldId]: [...have, ...ids] }, photoIds: [...new Set([...(cur.photoIds ?? []), ...ids])] };
      });
    } catch (e) {
      toast(t("Couldn't add the photo: {error}", { error: (e as Error).message }), "error");
    } finally {
      setPhotoFor(null);
    }
  }

  async function sign(f: FormField, d: { dataUrl: string; name: string; role: string }) {
    try {
      const imageId = await saveSignatureImage(d.dataUrl);
      const sig = { fieldId: f.id, name: d.name, role: d.role || null, imageId, signedAt: nowIso(), signedBy: me };
      update((cur) => ({ ...cur, signatures: [...(cur.signatures ?? []).filter((s) => s.fieldId !== f.id), sig] }));
      setSigning(null);
    } catch {
      toast(t("Couldn't save the signature"), "error");
    }
  }

  function openPlan() {
    if (!form.sheetId || !project) return;
    const st = useEditor.getState();
    st.setActiveSheet(form.sheetId);
    if (form.markerId && st.markers.some((m) => m.id === form.markerId)) st.focusOn("markers", form.markerId);
    else if (form.x != null && form.y != null) useEditor.setState({ focus: { sheetId: form.sheetId, x: form.x, y: form.y, n: (st.focus?.n ?? 0) + 1 } });
    router.replace(`/project?id=${project.id}&tab=plan`);
  }

  async function downloadPdf() {
    if (!project || !settings || pdfBusy) return;
    try {
      await flush();
      const f = formRef.current;
      const out: Record<string, FormPdfPhoto[]> = {};
      const fields = f.template.fields.filter((x) => x.type === "photo");
      const total = fields.reduce((n, x) => n + (Array.isArray(f.values[x.id]) ? (f.values[x.id] as unknown[]).length : 0), 0);
      let done = 0;
      for (const x of fields) {
        const list: FormPdfPhoto[] = [];
        for (const pid of (Array.isArray(f.values[x.id]) ? (f.values[x.id] as string[]) : [])) {
          setPdfBusy(t("Preparing photo {n} of {total}…", { n: ++done, total }));
          const p = photos.find((y) => y.id === pid);
          const rec = p ? await db().images.get(p.imageId) : undefined;
          if (!p || !rec) {
            list.push({ src: null, width: 4, height: 3 });
            continue;
          }
          const blob = await renderPhoto(rec.blob, p.annotations, 1400);
          list.push({ src: await blobToDataUrl(blob), width: p.width, height: p.height, caption: p.caption });
        }
        out[x.id] = list;
      }
      const sigs: Record<string, string> = {};
      for (const s of f.signatures ?? []) {
        const rec = await db().images.get(s.imageId);
        if (rec) sigs[s.imageId] = await blobToDataUrl(rec.blob);
      }
      setPdfBusy(t("Building the PDF…"));
      const { renderFormPdf } = await import("./FormPdf");
      const blob = await renderFormPdf({ form: f, business: settings.business, clientName: project.clientName, address: project.address, photos: out, signatures: sigs, place, when });
      downloadBlob(blob, `${slug(project.address || project.clientName || "job")}-${slug(f.name)}-${(f.submittedAt ?? f.updatedAt).slice(0, 10)}.pdf`);
    } catch (e) {
      toast(t("PDF failed: {error}", { error: (e as Error).message }), "error");
    } finally {
      setPdfBusy(null);
    }
  }

  // Problems per field (shown once Submit was tried).
  const byField = new Map<string, FormIssue[]>();
  if (showErrors) for (const i of issues) byField.set(i.fieldId, [...(byField.get(i.fieldId) ?? []), i]);

  const renderField = (f: FormField) => {
    const v = form.values[f.id];
    const errs = byField.get(f.id);
    if (f.type === "heading")
      return (
        <h3 key={f.id} id={`ff-${f.id}`} className="px-1 pt-3 text-sm font-semibold tracking-wide text-slate-500 uppercase">
          {f.label}
        </h3>
      );
    let body: React.ReactNode;
    switch (f.type) {
      case "yesno":
        body = <YesNoInput label={f.label} value={v} onChange={(x) => setValue(f.id, x)} disabled={!editable} />;
        break;
      case "number":
        body = <NumberInput label={f.label} unit={f.unit} min={f.min} value={v} onChange={(x) => setValue(f.id, x)} disabled={!editable} />;
        break;
      case "select":
        body = <SelectInput field={f} value={v} onChange={(x) => setValue(f.id, x)} disabled={!editable} />;
        break;
      case "multiselect":
        body = <MultiSelectInput field={f} value={v} onChange={(x) => setValue(f.id, x)} disabled={!editable} />;
        break;
      case "checkbox":
        body = <CheckboxInput label={f.label} value={v} onChange={(x) => setValue(f.id, x)} disabled={!editable} />;
        break;
      case "longtext":
        body = <textarea className="input min-h-28 text-base" aria-label={f.label} disabled={!editable} value={typeof v === "string" ? v : ""} onChange={(e) => setValue(f.id, e.target.value)} />;
        break;
      case "date":
      case "time":
        body = <input type={f.type} className="input h-11 max-w-56 text-base" aria-label={f.label} disabled={!editable} value={typeof v === "string" ? v : ""} onChange={(e) => setValue(f.id, e.target.value)} />;
        break;
      case "calc": {
        const n = calcs[f.id];
        body = (
          <p className="text-2xl font-semibold text-slate-900 tabular-nums" aria-live="polite" data-calc={f.id}>
            {n == null ? "—" : formatNumber(n)}
            {f.unit && n != null ? <span className="ml-1 text-sm font-medium text-slate-500">{f.unit}</span> : null}
          </p>
        );
        break;
      }
      case "table": {
        const rowErrors = new Map<number, Set<string>>();
        for (const e of errs ?? []) if (e.row != null && e.columnId) rowErrors.set(e.row, new Set([...(rowErrors.get(e.row) ?? []), e.columnId]));
        body = <TableInput field={f} value={v} disabled={!editable} newRowId={newId} rowErrors={rowErrors} onChange={(rows: FormRow[]) => setValue(f.id, rows)} />;
        break;
      }
      case "photo": {
        const ids = Array.isArray(v) ? (v as string[]) : [];
        const live = ids.map((id) => photos.find((p) => p.id === id));
        body = (
          <div className="flex flex-wrap gap-2">
            {ids.map((id, k) => (
              <Thumb
                key={id}
                photo={live[k]}
                missing={!live[k]}
                onOpen={() => live[k] && setViewer({ list: live.filter((p): p is Photo => !!p), id })}
                onRemove={editable ? () => update((cur) => removeFormPhoto(cur, f.id, id)) : undefined}
              />
            ))}
            {editable && (
              <button
                type="button"
                className="flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-slate-300 text-xs font-medium text-slate-600 hover:border-brand-300 hover:text-brand-700"
                onClick={() => {
                  setPhotoFor(f.id);
                  fileRef.current?.click();
                }}
              >
                <Camera className="h-5 w-5" /> {t("Add")}
              </button>
            )}
            {!editable && !ids.length && <p className="text-sm text-slate-400">{t("No photos")}</p>}
          </div>
        );
        break;
      }
      case "signature": {
        const s = signatureFor(form, f.id);
        body = s ? (
          <div className="flex flex-wrap items-center gap-3">
            <div className="rounded-lg bg-white px-2 ring-1 ring-slate-200">
              <SignatureView imageId={s.imageId} />
            </div>
            <div className="min-w-0 flex-1 text-sm">
              {signatureLines(s, whenUi(s.signedAt)).map((line, k) => (
                <p key={k} className={k === 0 ? "font-medium text-slate-900" : "text-xs text-slate-500"}>
                  {line}
                </p>
              ))}
            </div>
            {editable && (
              <button type="button" className="btn btn-sm btn-ghost text-slate-500" onClick={() => update((cur) => ({ ...cur, signatures: (cur.signatures ?? []).filter((x) => x.fieldId !== f.id) }))}>
                {t("Clear")}
              </button>
            )}
          </div>
        ) : editable ? (
          <button type="button" className="flex h-20 w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 text-sm font-semibold text-slate-600 transition hover:border-brand-300 hover:text-brand-700 active:scale-[0.99]" onClick={() => setSigning(f)}>
            <PenLine className="h-5 w-5" /> {t("Tap to sign")}
          </button>
        ) : (
          <p className="text-sm text-slate-400">{t("Not signed")}</p>
        );
        break;
      }
      default:
        body = <input className="input h-11 text-base" aria-label={f.label} disabled={!editable} value={typeof v === "string" ? v : ""} onChange={(e) => setValue(f.id, e.target.value)} />;
    }
    const plainErr = errs?.filter((e) => e.row == null);
    return (
      <section key={f.id} id={`ff-${f.id}`} className={`card scroll-mt-24 space-y-2.5 p-4 ${errs?.length ? "ring-2 ring-red-300" : ""}`}>
        <div>
          <p className="text-[15px] font-medium text-slate-900">
            {f.label}
            {f.required && <span className="ml-0.5 text-red-500" aria-label={t("required")}>*</span>}
          </p>
          {f.help && <p className="text-xs text-slate-500">{f.help}</p>}
        </div>
        {body}
        {plainErr?.map((e, k) => (
          <p key={k} className="text-sm font-medium text-red-600">
            {t(e.message)}
          </p>
        ))}
        {f.type === "table" && errs && errs.some((e) => e.row != null) && <p className="text-sm font-medium text-red-600">{t.tn("{n} cell to fix", "{n} cells to fix", errs.filter((e) => e.row != null).length)}</p>}
      </section>
    );
  };

  const office = canReopenForm(role, { status: "submitted" });

  return (
    <div className="space-y-3 pb-28">
      <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => void addPhotos(e.target.files).then(() => (e.target.value = ""))} />
      <div className="flex items-center gap-2">
        <button className="btn btn-sm btn-ghost -ml-2" onClick={() => void flush().then(onBack)}>
          <ArrowLeft /> {t("Forms")}
        </button>
        <span className="ml-auto text-xs text-slate-400" aria-live="polite">
          {editable ? (saving === "pending" ? t("Saving…") : saving === "saved" ? t("Saved") : "") : ""}
        </span>
      </div>

      <div className="card space-y-3 p-4">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            {editable ? (
              <input className="w-full rounded-md bg-transparent text-lg font-semibold text-slate-900 outline-none focus:ring-2 focus:ring-brand-100" aria-label={t("Form name")} value={form.name} onChange={(e) => update((f) => ({ ...f, name: e.target.value }))} />
            ) : (
              <h2 className="text-lg font-semibold text-slate-900">{form.name}</h2>
            )}
            <p className="text-xs text-slate-500">
              {form.template.name} · v{form.template.version || 1}
              {form.createdBy ? ` · ${t("started by {name}", { name: form.createdBy })}` : ""} · {whenUi(form.createdAt)}
            </p>
          </div>
          {form.status === "submitted" ? (
            <span className="chip shrink-0 bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200">
              <Lock className="h-3 w-3" /> {t("Submitted")}
            </span>
          ) : (
            <span className="chip shrink-0 bg-amber-50 text-amber-800 ring-1 ring-amber-200">{t("Draft")}</span>
          )}
        </div>
        <div>
          <div className="mb-1 flex justify-between text-xs text-slate-500">
            <span>
              {t("{answered} of {total} answered", { answered: progress.answered, total: progress.total })}
            </span>
            {progress.required > 0 && (
              <span>
                {t("{done}/{total} required", { done: progress.requiredDone, total: progress.required })}
              </span>
            )}
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
            <div className={`h-full rounded-full transition-all ${progress.requiredDone === progress.required ? "bg-emerald-500" : "bg-brand-500"}`} style={{ width: `${progress.pct}%` }} />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {place ? (
            <span className="inline-flex items-center overflow-hidden rounded-full bg-brand-50 text-xs font-medium text-brand-700 ring-1 ring-brand-200">
              <button className="inline-flex h-8 items-center gap-1 pr-2 pl-2.5 hover:underline" onClick={openPlan} title={t("Open the plan here")}>
                <MapPin className="h-3.5 w-3.5" /> {place}
              </button>
              {editable && (
                <button className="h-8 border-l border-brand-200 px-2 hover:bg-brand-100" onClick={() => setPlacing(true)} aria-label={t("Change plan location")}>
                  {t("Edit")}
                </button>
              )}
            </span>
          ) : (
            editable && (
              <button className="btn btn-sm" onClick={() => setPlacing(true)}>
                <MapPin /> {t("Pin to plan")}
              </button>
            )
          )}
          {failed.length > 0 && (
            <button className="btn btn-sm" onClick={() => void makeTasks()} title={t("Make a task on this job for every “No” answer")}>
              <ListTodo /> {t("Make tasks ({n})", { n: failed.length })}
            </button>
          )}
          <button className="btn btn-sm" onClick={() => void downloadPdf()} disabled={!!pdfBusy}>
            <FileDown /> {pdfBusy ?? "PDF"}
          </button>
          {canDeleteForm(role, form) && (
            <button className="btn btn-sm btn-ghost ml-auto text-slate-400 hover:text-red-600" onClick={() => void remove()} aria-label={t("Delete form")}>
              <Trash />
            </button>
          )}
        </div>
      </div>

      {form.status === "submitted" && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl bg-emerald-50 p-3.5 text-sm text-emerald-900 ring-1 ring-emerald-200" role="status">
          <CircleCheck className="h-5 w-5 shrink-0 text-emerald-600" />
          <p className="min-w-0 flex-1">
            {form.submittedBy ? t("Submitted by {name}", { name: form.submittedBy }) : t("Submitted")}
            {form.submittedAt ? ` · ${whenUi(form.submittedAt)}` : ""}. {t("Locked — no more changes.")}
          </p>
          {canReopenForm(role, form) && (
            <button className="btn btn-sm" onClick={() => void reopen()}>
              <LockOpen /> {t("Reopen")}
            </button>
          )}
        </div>
      )}

      <div key={rev} className="space-y-3">
        {form.template.fields.map(renderField)}
      </div>

      {history.length > 0 && (
        <div className="rounded-xl bg-slate-50 p-3.5 text-xs text-slate-500">
          <p className="mb-1 font-semibold text-slate-600">{t("History")}</p>
          {history.map((h, k) => (
            <p key={k}>
              {whenUi(h.at)} — {h.text}
              {h.by ? ` (${h.by})` : ""}
            </p>
          ))}
        </div>
      )}

      {editable && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div className="mx-auto flex max-w-4xl items-center gap-3">
            <p className="min-w-0 flex-1 truncate text-sm text-slate-500">
              {issues.length === 0 ? t("Ready to submit") : t("{done} of {total} required done", { done: progress.requiredDone, total: progress.required })}
              {showErrors && issues.length > 0 && <span className="ml-1 font-medium text-red-600">· {t("{n} to fix", { n: issues.length })}</span>}
            </p>
            <button className="btn btn-brand h-11 px-5 text-base" onClick={() => void submit()}>
              <Send /> {t("Submit")}
            </button>
          </div>
        </div>
      )}
      {!editable && !office && <p className="px-1 text-xs text-slate-400">{t("Ask the office if something on a submitted form needs to change.")}</p>}

      {signing && <SignatureSheet title={signing.label} me={me} otherFirst={/customer|witness|inspector|owner|ahj|gc/i.test(signing.label)} onSave={(d) => sign(signing, d)} onClose={() => setSigning(null)} />}
      {placing && (
        <FormLocationPicker
          place={form}
          onClose={() => setPlacing(false)}
          onSave={(p: FormPlace) => {
            setPlacing(false);
            update((f) => ({ ...f, ...p }));
          }}
        />
      )}
      {viewer && <PhotoViewer photos={viewer.list} startId={viewer.id} onClose={() => setViewer(null)} />}
    </div>
  );
}
