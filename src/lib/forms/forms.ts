// Typed forms and inspections: pure logic shared by the fill screen, the PDF, Settings and tests.
// Mirrors PinPlanCore/Forms.swift (keep the two in step).
//
// Answers live in `JobForm.values`, keyed by field id:
//   text / longtext / date / time / select → string · number → number · yesno → "yes" | "no" | "na"
//   checkbox → boolean · multiselect → string[] · photo → photo ids (string[]) · table → rows (objects keyed by column id,
//   plus "_id") · signature → nothing here (the signature lives in `JobForm.signatures`) · heading / calc → nothing.
// The reserved key "_history" holds reopen notes. Field ids can't start with "_".
import type { Checklist, ChecklistItem, FormCalcOp, FormField, FormFieldType, FormSignature, FormTemplate, JobForm } from "../types";
import type { TeamRole } from "../teamLogic";
import { CHECKLIST_TEMPLATES, PUNCH_TEMPLATE_ID, checklistFromTemplate, findPunchList } from "../fieldDocs";

export const FIELD_TYPES: { type: FormFieldType; name: string }[] = [
  { type: "heading", name: "Section heading" },
  { type: "text", name: "Short text" },
  { type: "longtext", name: "Long text" },
  { type: "number", name: "Number" },
  { type: "date", name: "Date" },
  { type: "time", name: "Time" },
  { type: "yesno", name: "Yes / No / N.A." },
  { type: "checkbox", name: "Checkbox" },
  { type: "select", name: "Dropdown" },
  { type: "multiselect", name: "Multiple choice" },
  { type: "photo", name: "Photos" },
  { type: "signature", name: "Signature" },
  { type: "table", name: "Table" },
  { type: "calc", name: "Calculation" },
];
export const TABLE_COLUMN_TYPES: FormFieldType[] = ["text", "number", "select", "yesno", "date"];
export const MAX_TABLE_COLUMNS = 8;
export const CALC_OPS: { op: FormCalcOp; name: string }[] = [
  { op: "sum", name: "Total" },
  { op: "avg", name: "Average" },
  { op: "min", name: "Lowest" },
  { op: "max", name: "Highest" },
  { op: "count_no", name: "Count of “No”" },
];
export const FORM_CATEGORIES: { id: FormTemplate["category"]; name: string }[] = [
  { id: "inspection", name: "Inspection" },
  { id: "test", name: "Test record" },
  { id: "tm", name: "T&M tag" },
  { id: "safety", name: "Safety" },
  { id: "other", name: "Other" },
];
export const HISTORY_KEY = "_history";
export type YesNo = "yes" | "no" | "na";
export type FormRow = Record<string, unknown> & { _id?: string };
export interface FormHistoryNote {
  at: string;
  by?: string | null;
  text: string;
}

/** Fields that take an answer (not headings or calcs). */
export const isInput = (f: FormField) => f.type !== "heading" && f.type !== "calc";

// ---------------- numbers ----------------

/** A typed number: "12.5", "12,5" (decimal comma) or "1,234.5" (thousands). NaN-free: null when it isn't a number. */
export function parseNumber(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  let s = v.trim().replace(/\s/g, "");
  if (!s) return null;
  if (s.includes(",") && s.includes(".")) s = s.replace(/,/g, "");
  else if (s.includes(",")) {
    // One comma = decimal comma ("12,5"); several = thousands ("1,234,567").
    s = (s.match(/,/g) ?? []).length === 1 ? s.replace(",", ".") : s.replace(/,/g, "");
  }
  if (!/^[-+]?(\d+\.?\d*|\.\d+)$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** 12 → "12", 1.5 → "1.5", 0.1 + 0.2 → "0.3". */
export function formatNumber(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "";
  return String(Math.round(n * 1000) / 1000);
}

// ---------------- answers ----------------

/** Whether a value counts as answered for this field type. */
export function hasAnswer(f: Pick<FormField, "type">, v: unknown): boolean {
  switch (f.type) {
    case "number":
      return parseNumber(v) != null;
    case "checkbox":
      return v === true;
    case "yesno":
      return v === "yes" || v === "no" || v === "na";
    case "multiselect":
    case "photo":
      return Array.isArray(v) && v.length > 0;
    case "table":
      return Array.isArray(v) && v.some((r) => rowHasData(r as FormRow));
    case "heading":
    case "calc":
    case "signature":
      return false;
    default:
      return typeof v === "string" ? v.trim().length > 0 : v != null && v !== "";
  }
}

const rowHasData = (r: FormRow | null | undefined) => !!r && Object.entries(r).some(([k, v]) => k !== "_id" && v != null && v !== "" && !(Array.isArray(v) && !v.length));

/** Rows of a table answer (anything else reads as no rows). */
export function tableRows(v: unknown): FormRow[] {
  return Array.isArray(v) ? (v.filter((r) => r && typeof r === "object" && !Array.isArray(r)) as FormRow[]) : [];
}

/** Starting answers for a new form. `today` (YYYY-MM-DD) pre-fills date fields. */
export function emptyValues(t: Pick<FormTemplate, "fields">, opts: { today?: string } = {}): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of t.fields) {
    if (f.type === "table" || f.type === "multiselect" || f.type === "photo") out[f.id] = [];
    else if (f.type === "checkbox") out[f.id] = false;
    else if (f.type === "date" && opts.today) out[f.id] = opts.today;
  }
  return out;
}

export const signatureFor = (form: Pick<JobForm, "signatures">, fieldId: string): FormSignature | undefined =>
  (form.signatures ?? []).find((s) => s.fieldId === fieldId);

// ---------------- calculations ----------------

/** The numbers (or yes/no answers, for count_no) a calc reads. */
function calcInputs(t: Pick<FormTemplate, "fields">, values: Record<string, unknown>, of: string): unknown[] {
  const [a, b] = of.split(".");
  const f = t.fields.find((x) => x.id === a);
  if (!f) return [];
  if (b === undefined) return f.type === "table" ? [] : [values[f.id]];
  if (f.type !== "table") return [];
  return tableRows(values[f.id]).map((r) => r[b]);
}

export function computeCalc(t: Pick<FormTemplate, "fields">, values: Record<string, unknown>, calc: NonNullable<FormField["calc"]>): number | null {
  const raw = calcInputs(t, values, calc.of);
  if (calc.op === "count_no") return raw.filter((v) => v === "no").length;
  const nums = raw.map(parseNumber).filter((n): n is number => n != null);
  if (calc.op === "sum") return Math.round(nums.reduce((s, n) => s + n, 0) * 1e6) / 1e6;
  if (!nums.length) return null;
  if (calc.op === "avg") return Math.round((nums.reduce((s, n) => s + n, 0) / nums.length) * 1e6) / 1e6;
  if (calc.op === "min") return Math.min(...nums);
  return Math.max(...nums);
}

/** Every calc field's value (null when there's nothing to work it out from). */
export function computeCalcs(t: Pick<FormTemplate, "fields">, values: Record<string, unknown>): Record<string, number | null> {
  const out: Record<string, number | null> = {};
  for (const f of t.fields) if (f.type === "calc" && f.calc) out[f.id] = computeCalc(t, values, f.calc);
  return out;
}

/** Column totals shown under a table (number columns only). */
export function columnTotals(table: FormField, rows: FormRow[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const c of table.columns ?? []) {
    if (c.type !== "number") continue;
    out[c.id] = Math.round(rows.reduce((s, r) => s + (parseNumber(r[c.id]) ?? 0), 0) * 1e6) / 1e6;
  }
  return out;
}

// ---------------- validation ----------------

export interface FormIssue {
  fieldId: string;
  message: string;
  /** Table issues: which row (0-based) and column. */
  row?: number;
  columnId?: string;
}

function checkValue(f: FormField, v: unknown): string | null {
  if (f.type === "number" && typeof v === "string" && v.trim() && parseNumber(v) == null) return "Enter a number";
  if (!hasAnswer(f, v)) return f.required ? (f.type === "checkbox" ? "Must be ticked" : "Required") : null;
  if (f.type === "number") {
    const n = parseNumber(v)!;
    if (f.min != null && n < f.min) return `Must be at least ${formatNumber(f.min)}`;
    if (f.max != null && n > f.max) return `Must be ${formatNumber(f.max)} or less`;
  }
  if (f.type === "select" && f.options?.length && !f.options.includes(String(v))) return "Pick one of the options";
  if (f.type === "multiselect" && f.options?.length && (v as unknown[]).some((x) => !f.options!.includes(String(x)))) return "Pick from the options";
  return null;
}

/** What stops the form being submitted: required answers, numbers out of range, unknown options, missing signatures. */
export function validateForm(form: Pick<JobForm, "template" | "values" | "signatures">): FormIssue[] {
  const out: FormIssue[] = [];
  const values = form.values ?? {};
  for (const f of form.template.fields) {
    if (f.type === "heading" || f.type === "calc") continue;
    if (f.type === "signature") {
      if (f.required && !signatureFor(form, f.id)) out.push({ fieldId: f.id, message: "Signature required" });
      continue;
    }
    if (f.type === "table") {
      const rows = tableRows(values[f.id]);
      const filled = rows.map((r, i) => [r, i] as const).filter(([r]) => rowHasData(r));
      if (f.required && !filled.length) out.push({ fieldId: f.id, message: "Add at least one row" });
      // Blank rows are ignored (a row added by mistake doesn't block submitting).
      for (const [r, i] of filled)
        for (const c of f.columns ?? []) {
          const m = checkValue(c, r[c.id]);
          if (m) out.push({ fieldId: f.id, row: i, columnId: c.id, message: `Row ${i + 1}: ${c.label} — ${m.toLowerCase()}` });
        }
      continue;
    }
    const m = checkValue(f, values[f.id]);
    if (m) out.push({ fieldId: f.id, message: m });
  }
  return out;
}

/** How far along the form is. `pct` is answered / answerable; `requiredDone` of `required` must be done to submit. */
export function formProgress(form: Pick<JobForm, "template" | "values" | "signatures">): { answered: number; total: number; required: number; requiredDone: number; pct: number } {
  let answered = 0;
  let total = 0;
  let required = 0;
  let requiredDone = 0;
  for (const f of form.template.fields) {
    if (!isInput(f)) continue;
    total++;
    const done = f.type === "signature" ? !!signatureFor(form, f.id) : hasAnswer(f, form.values?.[f.id]);
    if (done) answered++;
    if (f.required) {
      required++;
      if (done) requiredDone++;
    }
  }
  return { answered, total, required, requiredDone, pct: total ? Math.round((answered / total) * 100) : 0 };
}

export interface FailedItem {
  fieldId: string;
  row?: number;
  /** Plain text for a punch item, e.g. "Panel inspection: Breakers labeled — No". */
  text: string;
}

/** Yes/no answers of "No" (fields and table cells), e.g. for "Make punch items". */
export function failedItems(form: Pick<JobForm, "template" | "values" | "name">): FailedItem[] {
  const out: FailedItem[] = [];
  for (const f of form.template.fields) {
    const v = form.values?.[f.id];
    if (f.type === "yesno" && v === "no") out.push({ fieldId: f.id, text: `${f.label} — No` });
    if (f.type === "table") {
      const cols = f.columns ?? [];
      const name = cols.find((c) => c.type === "text");
      tableRows(v).forEach((r, i) => {
        for (const c of cols)
          if (c.type === "yesno" && r[c.id] === "no") {
            const what = name && typeof r[name.id] === "string" && (r[name.id] as string).trim() ? (r[name.id] as string).trim() : `Row ${i + 1}`;
            out.push({ fieldId: f.id, row: i, text: `${f.label}: ${what} — ${c.label}: No` });
          }
      });
    }
  }
  return out;
}

// ---------------- permissions and status ----------------

/** Drafts: anyone. Submitted forms are locked for everyone (the office can reopen them). */
export function canEditForm(_role: TeamRole | null | undefined, form: Pick<JobForm, "status">): boolean {
  return form.status !== "submitted";
}
/** Reopen a submitted form: office (owner/admin, or no team). */
export const canReopenForm = (role: TeamRole | null | undefined, form: Pick<JobForm, "status">) => form.status === "submitted" && role !== "tech";
/** Drafts can be deleted by anyone; submitted forms only by the office. */
export const canDeleteForm = (role: TeamRole | null | undefined, form: Pick<JobForm, "status">) => form.status !== "submitted" || role !== "tech";
/** Building templates (Settings → Forms) is office work. */
export const canEditTemplates = (role: TeamRole | null | undefined) => role !== "tech";

export function formHistory(form: Pick<JobForm, "values">): FormHistoryNote[] {
  const h = form.values?.[HISTORY_KEY];
  return Array.isArray(h) ? (h.filter((x) => x && typeof x === "object" && typeof (x as FormHistoryNote).at === "string") as FormHistoryNote[]) : [];
}

export function submitForm<T extends JobForm>(form: T, by: string | null, now: string): T {
  return { ...form, status: "submitted", submittedBy: by, submittedAt: now };
}

/** Back to draft, with a note saying who reopened it and why. */
export function reopenForm<T extends JobForm>(form: T, by: string | null, now: string, reason = ""): T {
  const text = `Reopened${form.submittedAt ? ` (submitted ${form.submittedAt.slice(0, 10)}${form.submittedBy ? ` by ${form.submittedBy}` : ""})` : ""}${reason.trim() ? `: ${reason.trim()}` : ""}`;
  return {
    ...form,
    status: "draft",
    submittedAt: null,
    submittedBy: null,
    values: { ...form.values, [HISTORY_KEY]: [...formHistory(form), { at: now, by, text }] },
  };
}

/** A new form on a job from a template (deep copy: later template edits never touch it). */
export function newJobForm(t: FormTemplate, projectId: string, newId: () => string, now: string, by: string | null, today?: string): JobForm {
  const template = JSON.parse(JSON.stringify(t)) as FormTemplate;
  return {
    id: newId(),
    projectId,
    templateId: t.id,
    name: t.name,
    template,
    status: "draft",
    values: emptyValues(template, { today }),
    signatures: [],
    photoIds: [],
    createdBy: by,
    createdAt: now,
    updatedAt: now,
  };
}

/** Take a photo off a photo field; it stays linked (`photoIds`) only while another photo field still uses it. */
export function removeFormPhoto<T extends Pick<JobForm, "template" | "values" | "photoIds">>(form: T, fieldId: string, photoId: string): T {
  const values = { ...form.values, [fieldId]: (Array.isArray(form.values[fieldId]) ? (form.values[fieldId] as string[]) : []).filter((x) => x !== photoId) };
  const stillUsed = form.template.fields.some((f) => f.type === "photo" && Array.isArray(values[f.id]) && (values[f.id] as string[]).includes(photoId));
  return { ...form, values, photoIds: stillUsed ? form.photoIds : (form.photoIds ?? []).filter((x) => x !== photoId) };
}

// ---------------- punch items ----------------

/** Add the form's "No" answers to the job's punch list (started when there is none). Items already added are skipped. */
export function punchItemsFromForm(
  checklists: Checklist[],
  form: JobForm,
  newId: () => string,
  now: string,
): { checklist: Checklist; added: ChecklistItem[]; created: boolean } {
  const existing = findPunchList(checklists, form.projectId);
  const base = existing ?? checklistFromTemplate(CHECKLIST_TEMPLATES.find((t) => t.id === PUNCH_TEMPLATE_ID)!, form.projectId, newId, now);
  const note = `From form “${form.name}”`;
  const have = new Set(base.items.filter((i) => i.note === note).map((i) => i.text));
  const added: ChecklistItem[] = [];
  for (const f of failedItems(form)) {
    if (have.has(f.text)) continue;
    have.add(f.text);
    added.push({ id: newId(), text: f.text, note });
  }
  return { checklist: added.length ? { ...base, items: [...base.items, ...added], updatedAt: now } : base, added, created: !existing && added.length > 0 };
}

// ---------------- templates ----------------

const CALC_OP_IDS = new Set(CALC_OPS.map((c) => c.op));
const TYPE_IDS = new Set(FIELD_TYPES.map((t) => t.type));
const CATEGORY_IDS = new Set(FORM_CATEGORIES.map((c) => c.id));

/** Problems that make a template unusable (shown in the builder; imports with any are refused). Empty = fine. */
export function validateTemplate(t: FormTemplate): string[] {
  const out: string[] = [];
  if (!t || typeof t !== "object") return ["Not a form template"];
  if (!t.name?.trim()) out.push("Give the form a name");
  if (!CATEGORY_IDS.has(t.category)) out.push(`Unknown category “${t.category}”`);
  if (!Array.isArray(t.fields) || !t.fields.length) return [...out, "Add at least one field"];
  const ids = new Set<string>();
  for (const f of t.fields) {
    const name = f.label?.trim() || f.id;
    if (!f.id || typeof f.id !== "string") out.push(`A field has no id (“${name}”)`);
    else if (f.id.startsWith("_") || f.id.includes(".")) out.push(`Field id “${f.id}” can't start with “_” or contain “.”`);
    else if (ids.has(f.id)) out.push(`Two fields share the id “${f.id}”`);
    ids.add(f.id);
    if (!TYPE_IDS.has(f.type)) out.push(`“${name}” has an unknown type “${f.type}”`);
    if (!f.label?.trim()) out.push(`A ${f.type} field has no label`);
    if ((f.type === "select" || f.type === "multiselect") && !(f.options ?? []).some((o) => o.trim())) out.push(`“${name}” needs at least one option`);
    if (f.min != null && f.max != null && f.min > f.max) out.push(`“${name}”: the minimum is above the maximum`);
    if (f.type === "table") {
      const cols = f.columns ?? [];
      if (!cols.length) out.push(`Table “${name}” has no columns`);
      if (cols.length > MAX_TABLE_COLUMNS) out.push(`Table “${name}” has more than ${MAX_TABLE_COLUMNS} columns`);
      const cids = new Set<string>();
      for (const c of cols) {
        if (!c.id || c.id.startsWith("_") || c.id.includes(".")) out.push(`Table “${name}” has a column with a bad id`);
        else if (cids.has(c.id)) out.push(`Table “${name}” has two columns with the id “${c.id}”`);
        cids.add(c.id);
        if (!TABLE_COLUMN_TYPES.includes(c.type)) out.push(`Table “${name}”: a column can't be a ${c.type} field`);
        if (!c.label?.trim()) out.push(`Table “${name}” has a column with no label`);
        if (c.type === "select" && !(c.options ?? []).some((o) => o.trim())) out.push(`Table “${name}”: column “${c.label}” needs options`);
      }
    }
  }
  for (const f of t.fields) {
    if (f.type !== "calc") continue;
    const name = f.label?.trim() || f.id;
    if (!f.calc || !CALC_OP_IDS.has(f.calc.op)) {
      out.push(`Calculation “${name}” needs an operation`);
      continue;
    }
    const target = calcTarget(t, f.calc.of);
    if (!target) out.push(`Calculation “${name}” refers to “${f.calc.of}”, which isn't on the form`);
    else if (f.calc.op === "count_no" ? target.type !== "yesno" : target.type !== "number") out.push(`Calculation “${name}” can't use “${target.label}” (${f.calc.op === "count_no" ? "needs a yes/no" : "needs a number"})`);
  }
  return out;
}

/** The field (or table column) a calc reference points at. */
export function calcTarget(t: Pick<FormTemplate, "fields">, of: string): FormField | undefined {
  if (!of) return undefined;
  const [a, b, extra] = of.split(".");
  if (extra !== undefined) return undefined;
  const f = t.fields.find((x) => x.id === a);
  if (!f) return undefined;
  if (b === undefined) return f.type === "table" ? undefined : f;
  return f.type === "table" ? f.columns?.find((c) => c.id === b) : undefined;
}

/** Things a calc can point at: number fields / yes-no fields and table columns. */
export function calcChoices(t: Pick<FormTemplate, "fields">, op: FormCalcOp): { of: string; label: string }[] {
  const want: FormFieldType = op === "count_no" ? "yesno" : "number";
  const out: { of: string; label: string }[] = [];
  for (const f of t.fields) {
    if (f.type === want) out.push({ of: f.id, label: f.label });
    if (f.type === "table") for (const c of f.columns ?? []) if (c.type === want) out.push({ of: `${f.id}.${c.id}`, label: `${f.label} › ${c.label}` });
  }
  return out;
}

const str = (v: unknown) => (typeof v === "string" ? v : undefined);
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);

function cleanField(raw: unknown, inTable = false): FormField | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const type = str(r.type) as FormFieldType | undefined;
  const id = str(r.id)?.trim();
  if (!type || !id) return null;
  const f: FormField = { id, type, label: str(r.label)?.trim() ?? "" };
  if (r.required === true) f.required = true;
  if (Array.isArray(r.options)) f.options = r.options.filter((o): o is string => typeof o === "string").map((o) => o.trim()).filter(Boolean);
  if (str(r.unit)?.trim()) f.unit = str(r.unit)!.trim();
  if (num(r.min) != null) f.min = num(r.min);
  if (num(r.max) != null) f.max = num(r.max);
  if (str(r.help)?.trim()) f.help = str(r.help)!.trim();
  if (!inTable && Array.isArray(r.columns)) f.columns = r.columns.map((c) => cleanField(c, true)).filter((c): c is FormField => !!c);
  if (!inTable && r.calc && typeof r.calc === "object") {
    const c = r.calc as Record<string, unknown>;
    f.calc = { op: str(c.op) as FormCalcOp, of: str(c.of) ?? "" };
  }
  return f;
}

/** Read a template from JSON (text or parsed): cleaned up, with the problems that make it unusable. */
export function templateFromJson(input: unknown): { template: FormTemplate | null; errors: string[] } {
  let raw: unknown = input;
  if (typeof input === "string") {
    try {
      raw = JSON.parse(input);
    } catch {
      return { template: null, errors: ["That file isn't valid JSON"] };
    }
  }
  // An export wraps the template: { format: "pinplan-form-template", template }.
  if (raw && typeof raw === "object" && (raw as { template?: unknown }).template) raw = (raw as { template: unknown }).template;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { template: null, errors: ["That isn't a form template"] };
  const r = raw as Record<string, unknown>;
  const template: FormTemplate = {
    id: str(r.id)?.trim() || "",
    name: str(r.name)?.trim() ?? "",
    category: (str(r.category) as FormTemplate["category"]) ?? "other",
    fields: Array.isArray(r.fields) ? r.fields.map((f) => cleanField(f)).filter((f): f is FormField => !!f) : [],
    version: Math.max(1, Math.floor(num(r.version) ?? 1)),
  };
  if (str(r.trade)) template.trade = str(r.trade);
  if (str(r.createdAt)) template.createdAt = str(r.createdAt);
  if (str(r.updatedAt)) template.updatedAt = str(r.updatedAt);
  const errors = validateTemplate(template);
  if (!template.id) errors.unshift("The template has no id");
  return { template, errors };
}

/** JSON for "Export" (re-imported by templateFromJson). */
export function templateToJson(t: FormTemplate): string {
  const clean = { ...t };
  delete clean.builtin;
  return JSON.stringify({ format: "pinplan-form-template", template: clean }, null, 2);
}

/** Company templates read from settings: unusable or duplicate entries dropped, never marked built in. */
export function normalizeFormTemplates(raw: unknown): FormTemplate[] {
  if (!Array.isArray(raw)) return [];
  const out: FormTemplate[] = [];
  const seen = new Set<string>();
  for (const x of raw) {
    const { template, errors } = templateFromJson(x);
    if (!template || errors.length || seen.has(template.id)) continue;
    seen.add(template.id);
    out.push(template);
  }
  return out;
}

/** A copy of a template to customise (new id, "(copy)" name, not built in, version 1). */
export function duplicateTemplate(t: FormTemplate, newId: () => string, now: string, existing: FormTemplate[] = []): FormTemplate {
  const copy = JSON.parse(JSON.stringify(t)) as FormTemplate;
  delete copy.builtin;
  const taken = new Set(existing.map((x) => x.name.trim().toLowerCase()));
  let name = `${t.name} (copy)`;
  for (let n = 2; taken.has(name.toLowerCase()); n++) name = `${t.name} (copy ${n})`;
  return { ...copy, id: newId(), name, version: 1, createdAt: now, updatedAt: now };
}

/** Saving an edited template bumps its version (shown on the PDF). */
export const bumpVersion = (t: FormTemplate, now: string): FormTemplate => ({ ...t, version: (t.version || 1) + 1, updatedAt: now });

/** A field id not used on the template yet ("f1", "f2"…, or based on a hint). */
export function newFieldId(existing: { id: string }[], hint = "f"): string {
  const base = hint.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 24) || "f";
  const taken = new Set(existing.map((f) => f.id));
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) if (!taken.has(`${base}_${n}`)) return `${base}_${n}`;
}

/** Move a field up (-1) or down (+1). Out of range leaves the list as it is. */
export function moveField<T>(list: T[], index: number, by: -1 | 1): T[] {
  const j = index + by;
  if (index < 0 || index >= list.length || j < 0 || j >= list.length) return list;
  const next = [...list];
  [next[index], next[j]] = [next[j], next[index]];
  return next;
}

/** Templates to start a form from: the company's own and the ones for the company's trades first, then the rest. */
export function templatesForTrades(all: FormTemplate[], trades: string[]): { suggested: FormTemplate[]; others: FormTemplate[] } {
  const want = new Set(trades);
  const suggested: FormTemplate[] = [];
  const others: FormTemplate[] = [];
  for (const t of all) (!t.builtin || !t.trade || want.has(t.trade) ? suggested : others).push(t);
  return { suggested, others };
}

/** Search templates by name, category and field labels. */
export function searchTemplates(list: FormTemplate[], q: string): FormTemplate[] {
  const s = q.trim().toLowerCase();
  if (!s) return list;
  const cat = (t: FormTemplate) => FORM_CATEGORIES.find((c) => c.id === t.category)?.name ?? "";
  return list.filter((t) => `${t.name} ${cat(t)} ${t.fields.map((f) => f.label).join(" ")}`.toLowerCase().includes(s));
}

/** Text of an answer for lists and the PDF. */
export function answerText(f: FormField, v: unknown): string {
  if (f.type === "yesno") return v === "yes" ? "Yes" : v === "no" ? "No" : v === "na" ? "N/A" : "";
  if (f.type === "checkbox") return v === true ? "Yes" : "No";
  if (f.type === "number") {
    const n = parseNumber(v);
    return n == null ? "" : `${formatNumber(n)}${f.unit ? ` ${f.unit}` : ""}`;
  }
  if (f.type === "multiselect") return Array.isArray(v) ? v.join(", ") : "";
  return typeof v === "string" ? v : "";
}
