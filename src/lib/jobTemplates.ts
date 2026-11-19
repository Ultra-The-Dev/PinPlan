// Job templates and "Duplicate job" (docs/job-templates.md). Pure: no browser, database or network, so the web app,
// tests and (later) the iPad app share one set of rules. The database side lives in jobTemplatesDb.ts.
//
// A template keeps a job's reusable setup (product choices, pricing tweaks, labels, checklists, standard estimate
// lines), never the client, the address, ticks, dates or photos. Duplicating copies a whole job (plans, devices, runs,
// closets, estimate edits, optionally checklists) with fresh ids, for tract and model homes.
import type { ProjectBundle, SyncTable } from "./db";
import type {
  Checklist,
  Closet,
  EstimateLine,
  JobTemplate,
  JobTemplateChecklist,
  JobTemplateEstimateLine,
  JobTemplatePayload,
  Marker,
  Project,
  Run,
  Sheet,
} from "./types";

export const TEMPLATE_VERSION = 1;
/** Rows written per putMany when duplicating (large jobs: 500+ devices). */
export const DUPLICATE_CHUNK = 200;
export const TEMPLATES_FILE_FORMAT = "pinplan-job-templates";

// ---------------- registry ----------------

export interface CaptureOptions {
  name: string;
  description?: string | null;
  /** Keep prices (pricing overrides, estimate line prices). Always false for technicians. */
  includePrices: boolean;
  includeChecklists?: boolean;
  /** Custom estimate lines and price/description overrides. */
  includeEstimate?: boolean;
  /** Job notes are usually about one site (gate codes): off unless asked for. */
  includeNotes?: boolean;
  /** The company's trades when the template is saved. */
  trades?: string[] | null;
}

export interface TemplateApplyContext {
  project: Project;
  now: string;
  newId: () => string;
  /** False for technicians: prices in the template are never applied (or shown). */
  includePrices: boolean;
  /** Device type ids and product ids that exist on this device; unknown ones are skipped with a warning. */
  deviceTypeIds?: ReadonlySet<string>;
  productIds?: ReadonlySet<string>;
  /** Things that were skipped, for the "applied with warnings" list. */
  warnings: string[];
  /** Write rows (put in chunks; queued for sync). */
  write: (table: SyncTable, rows: { id: string }[]) => Promise<void>;
}

/**
 * A piece of a job template. Built-ins: "checklists" and "estimate". Other features (forms, schedule, tasks…) register
 * their own part at module load; its capture() result is kept under payload.parts[key] and handed back to apply().
 */
export interface TemplatePart {
  key: string;
  label?: string;
  capture(bundle: ProjectBundle, opts: CaptureOptions): unknown;
  apply(data: unknown, ctx: TemplateApplyContext): Promise<void>;
}

const BUILT_IN = new Set(["checklists", "estimate"]);
const registry = new Map<string, TemplatePart>();

/** Add (or replace) a template part. Built-in parts can't be replaced. */
export function registerTemplatePart(part: TemplatePart): void {
  if (!part?.key || (BUILT_IN.has(part.key) && registry.has(part.key))) return;
  registry.set(part.key, part);
}

/** Remove an extension part (tests, feature flags). Built-ins stay. */
export function unregisterTemplatePart(key: string): void {
  if (!BUILT_IN.has(key)) registry.delete(key);
}

/** Every registered part, built-ins first. */
export function templateParts(): TemplatePart[] {
  return [...registry.values()];
}

const isBuiltIn = (key: string) => BUILT_IN.has(key);

// ---------------- small helpers ----------------

const live = <T extends { deleted?: boolean }>(xs: readonly T[] | undefined): T[] => (xs ?? []).filter((x) => x && !x.deleted);
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
/** Drop undefined/null keys so templates stay small and diff cleanly. */
function compact<T extends Record<string, unknown>>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null)) as T;
}
// Estimate line keys that point at a product or a device type (src/lib/estimate.ts). Longest prefixes first.
const PRODUCT_KEY_PREFIXES = ["labor:prod:", "optlabor:prod:", "prod:", "optprod:"];
const TYPE_KEY_PREFIXES = ["dev:", "opt:", "labor:", "optlabor:"];

/** What an estimate line key refers to: a product, a device type, or nothing to check (custom, wire, closet). */
export function estimateKeyRef(key: string): { product: string } | { type: string } | null {
  if (key.startsWith("labor:wire:")) return null;
  for (const p of PRODUCT_KEY_PREFIXES) if (key.startsWith(p)) return { product: key.slice(p.length) };
  for (const p of TYPE_KEY_PREFIXES) if (key.startsWith(p)) return { type: key.slice(p.length) };
  return null;
}

const PRICING_NUMBERS = ["markupPct", "taxPct", "wireSlackPct", "wireDropFt", "floorHeightFt"] as const;

/** Only the pricing fields the estimate understands, with the right types (templates can come from a file). */
function cleanPricing(v: unknown): JobTemplatePayload["project"]["pricing"] {
  if (!isObj(v)) return undefined;
  const out: Record<string, unknown> = {};
  for (const k of PRICING_NUMBERS) if (num(v[k]) != null) out[k] = v[k];
  if (v.laborMode === "combined" || v.laborMode === "separate") out.laborMode = v.laborMode;
  if (typeof v.includeTentative === "boolean") out.includeTentative = v.includeTentative;
  if (str(v.currency)) out.currency = v.currency;
  if (isObj(v.wirePrices)) {
    const wp = Object.fromEntries(Object.entries(v.wirePrices).filter(([k, x]) => !!k && num(x) != null));
    if (Object.keys(wp).length) out.wirePrices = wp;
  }
  return Object.keys(out).length ? (out as JobTemplatePayload["project"]["pricing"]) : undefined;
}

// ---------------- capture ----------------

function captureChecklists(bundle: ProjectBundle): JobTemplateChecklist[] {
  return live(bundle.checklists)
    .map((c) => ({
      name: c.name,
      items: (c.items ?? [])
        .filter((i) => i && str(i.text))
        .map((i) => compact({ text: i.text.trim(), requiresPhoto: i.requiresPhoto ? true : undefined, assignee: str(i.assignee) ?? undefined })),
    }))
    .filter((c) => str(c.name) || c.items.length);
}

function captureEstimate(bundle: ProjectBundle, includePrices: boolean): JobTemplateEstimateLine[] {
  const out: JobTemplateEstimateLine[] = [];
  for (const l of live(bundle.estimateLines)) {
    if (l.removed) continue;
    const price = includePrices ? num(l.unitPrice) : null;
    if (l.key.startsWith("custom:")) {
      if (!str(l.description) && price == null) continue;
      out.push(compact({ key: l.key, description: str(l.description), qty: num(l.qty), unit: str(l.unit), unitPrice: price, sort: num(l.sort) ?? undefined }));
    } else {
      // Device/wire overrides only keep what doesn't depend on this job's devices: the price and the wording (not qty).
      if (!str(l.description) && price == null) continue;
      out.push(compact({ key: l.key, description: str(l.description), unitPrice: price, sort: num(l.sort) ?? undefined }));
    }
  }
  return out;
}

const checklistsPart: TemplatePart = {
  key: "checklists",
  label: "Checklists",
  capture: (bundle) => captureChecklists(bundle),
  async apply(data, ctx) {
    const rows = buildChecklists(Array.isArray(data) ? (data as JobTemplateChecklist[]) : [], ctx);
    if (rows.length) await ctx.write("checklists", rows);
  },
};

const estimatePart: TemplatePart = {
  key: "estimate",
  label: "Estimate lines",
  capture: (bundle, opts) => captureEstimate(bundle, opts.includePrices),
  async apply(data, ctx) {
    // Technicians can't write estimate lines (the database refuses): nothing to apply.
    if (!ctx.includePrices) return;
    const rows = buildEstimateLines(Array.isArray(data) ? (data as JobTemplateEstimateLine[]) : [], ctx);
    if (rows.length) await ctx.write("estimateLines", rows);
  },
};

registry.set(checklistsPart.key, checklistsPart);
registry.set(estimatePart.key, estimatePart);

/** Save a job's reusable setup as a template. Strips ids, ticks, dates, photos and the client. */
export function captureTemplate(bundle: ProjectBundle, opts: CaptureOptions, meta: { id: string; now: string }): JobTemplate {
  const p = bundle.project;
  const projectTrades = (p as Project & { trades?: unknown }).trades;
  const trades = Array.isArray(projectTrades) ? (projectTrades as string[]) : (opts.trades ?? null);
  const project: JobTemplatePayload["project"] = compact({
    pricing: opts.includePrices && p.pricing && Object.keys(p.pricing).length ? { ...p.pricing } : undefined,
    productChoices: p.productChoices && Object.keys(p.productChoices).length ? { ...p.productChoices } : undefined,
    labels: p.labels?.length ? [...p.labels] : undefined,
    notes: opts.includeNotes ? (str(p.notes) ?? undefined) : undefined,
    trades: trades?.length ? [...trades] : undefined,
  });
  const parts: Record<string, unknown> = {};
  for (const part of templateParts()) {
    if (isBuiltIn(part.key)) continue;
    try {
      const v = part.capture(bundle, opts);
      if (v !== undefined) parts[part.key] = v;
    } catch {
      /* a broken extension never blocks saving the template */
    }
  }
  const payload: JobTemplatePayload = {
    version: TEMPLATE_VERSION,
    project,
    checklists: opts.includeChecklists === false ? [] : (checklistsPart.capture(bundle, opts) as JobTemplateChecklist[]),
    estimateLines: opts.includeEstimate === false ? [] : (estimatePart.capture(bundle, opts) as JobTemplateEstimateLine[]),
    ...(Object.keys(parts).length ? { parts } : {}),
  };
  return compact({
    id: meta.id,
    name: opts.name.trim() || "Untitled template",
    description: str(opts.description)?.trim() ?? undefined,
    trades: trades?.length ? [...trades] : undefined,
    payload,
    createdAt: meta.now,
    updatedAt: meta.now,
  }) as JobTemplate;
}

// ---------------- validate ----------------

export interface TemplateValidation {
  ok: boolean;
  /** Normalised payload (safe to apply even when it came from a file or another app version). */
  payload: JobTemplatePayload;
  warnings: string[];
  error?: string;
}

const EMPTY_PAYLOAD: JobTemplatePayload = { version: 1, project: {}, checklists: [], estimateLines: [] };

/** Check a template payload: version, shape, and parts nobody registered (ignored with a warning). */
export function validateTemplate(raw: unknown): TemplateValidation {
  const warnings: string[] = [];
  if (!isObj(raw)) return { ok: false, payload: EMPTY_PAYLOAD, warnings, error: "The template is empty or damaged." };
  const version = raw.version == null ? 1 : raw.version;
  if (typeof version !== "number" || !Number.isInteger(version) || version < 1)
    return { ok: false, payload: EMPTY_PAYLOAD, warnings, error: "The template's version isn't valid." };
  if (version > TEMPLATE_VERSION)
    return { ok: false, payload: EMPTY_PAYLOAD, warnings, error: "This template was saved by a newer version of PinPlan. Update the app to use it." };

  const p = isObj(raw.project) ? raw.project : {};
  const strings = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && !!x.trim()) : null);
  const choices = isObj(p.productChoices)
    ? Object.fromEntries(Object.entries(p.productChoices).filter(([k, v]) => !!k && typeof v === "string" && !!v))
    : null;
  const project: JobTemplatePayload["project"] = compact({
    pricing: cleanPricing(p.pricing),
    productChoices: choices && Object.keys(choices).length ? (choices as Record<string, string>) : undefined,
    labels: strings(p.labels)?.length ? strings(p.labels) : undefined,
    notes: str(p.notes) ?? undefined,
    trades: strings(p.trades)?.length ? strings(p.trades) : undefined,
  });

  const checklists: JobTemplateChecklist[] = (Array.isArray(raw.checklists) ? raw.checklists : [])
    .filter(isObj)
    .map((c) => ({
      name: typeof c.name === "string" ? c.name : "Checklist",
      items: (Array.isArray(c.items) ? c.items : [])
        .filter((i): i is Record<string, unknown> => isObj(i) && !!str(i.text))
        .map((i) => compact({ text: String(i.text), requiresPhoto: i.requiresPhoto === true ? true : undefined, assignee: str(i.assignee) ?? undefined })),
    }));

  const estimateLines: JobTemplateEstimateLine[] = (Array.isArray(raw.estimateLines) ? raw.estimateLines : [])
    .filter((l): l is Record<string, unknown> => isObj(l) && typeof l.key === "string" && /^[a-z]+:./.test(l.key))
    .map((l) => compact({ key: String(l.key), description: str(l.description), qty: num(l.qty), unit: str(l.unit), unitPrice: num(l.unitPrice), sort: num(l.sort) ?? undefined }));

  const parts: Record<string, unknown> = {};
  if (isObj(raw.parts))
    for (const [key, data] of Object.entries(raw.parts)) {
      if (registry.has(key) && !isBuiltIn(key)) parts[key] = data;
      else warnings.push(`Skipped “${key}”: this version of PinPlan doesn't know that part of a template.`);
    }

  return { ok: true, payload: { version: 1, project, checklists, estimateLines, ...(Object.keys(parts).length ? { parts } : {}) }, warnings };
}

// ---------------- apply ----------------

/** Fresh checklists from template checklists: new ids, nothing ticked. */
export function buildChecklists(list: JobTemplateChecklist[], ctx: Pick<TemplateApplyContext, "project" | "now" | "newId">): Checklist[] {
  return list.map((c) => ({
    id: ctx.newId(),
    projectId: ctx.project.id,
    name: c.name || "Checklist",
    items: c.items.map((i) => ({ id: ctx.newId(), text: i.text, ...(i.requiresPhoto ? { requiresPhoto: true } : {}), ...(i.assignee ? { assignee: i.assignee } : {}), done: false })),
    createdAt: ctx.now,
    updatedAt: ctx.now,
  }));
}

/** Estimate lines for a new job. Lines for device types this company no longer has are skipped with a warning. */
export function buildEstimateLines(
  list: JobTemplateEstimateLine[],
  ctx: Pick<TemplateApplyContext, "project" | "now" | "newId" | "includePrices" | "deviceTypeIds" | "productIds" | "warnings">,
): EstimateLine[] {
  const out: EstimateLine[] = [];
  const seen = new Set<string>();
  for (const l of list) {
    const ref = estimateKeyRef(l.key);
    if (ref && "type" in ref && ctx.deviceTypeIds && !ctx.deviceTypeIds.has(ref.type)) {
      ctx.warnings.push(`Skipped the estimate line “${l.description || l.key}”: its device type isn't in your catalog any more.`);
      continue;
    }
    if (ref && "product" in ref && ctx.productIds && !ctx.productIds.has(ref.product)) {
      ctx.warnings.push(`Skipped the estimate line “${l.description || l.key}”: that product was deleted.`);
      continue;
    }
    const price = ctx.includePrices ? (l.unitPrice ?? null) : null;
    const custom = l.key.startsWith("custom:");
    if (!custom && !l.description && price == null) continue;
    // Custom lines get a fresh key per job; computed keys stay (they match by device type / wire type).
    const key = custom ? `custom:${ctx.newId()}` : l.key;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(
      compact({
        id: ctx.newId(),
        projectId: ctx.project.id,
        key,
        description: l.description ?? undefined,
        qty: custom ? (l.qty ?? undefined) : undefined,
        unit: custom ? (l.unit ?? undefined) : undefined,
        unitPrice: price ?? undefined,
        sort: l.sort,
        updatedAt: ctx.now,
      }) as EstimateLine,
    );
  }
  return out;
}

export interface AppliedTemplate {
  /** Fields to set on the new job. */
  project: Partial<Project>;
  checklists: Checklist[];
  estimateLines: EstimateLine[];
  warnings: string[];
}

/** What applying `template` to a just-created job writes. Pure; applyTemplateParts also runs extension parts. */
export function applyTemplate(
  template: Pick<JobTemplate, "payload">,
  newProject: Project,
  now: string,
  newId: () => string,
  opts: { includePrices?: boolean; deviceTypeIds?: ReadonlySet<string>; productIds?: ReadonlySet<string> } = {},
): AppliedTemplate {
  const v = validateTemplate(template.payload);
  const warnings = [...v.warnings];
  if (!v.ok) return { project: {}, checklists: [], estimateLines: [], warnings: [v.error ?? "The template can't be used."] };
  const includePrices = opts.includePrices !== false;
  const ctx = { project: newProject, now, newId, includePrices, deviceTypeIds: opts.deviceTypeIds, productIds: opts.productIds, warnings };
  return {
    project: projectPatch(v.payload, newProject, ctx),
    checklists: buildChecklists(v.payload.checklists, ctx),
    estimateLines: includePrices ? buildEstimateLines(v.payload.estimateLines, ctx) : [],
    warnings,
  };
}

function projectPatch(
  payload: JobTemplatePayload,
  project: Project,
  ctx: { includePrices: boolean; deviceTypeIds?: ReadonlySet<string>; productIds?: ReadonlySet<string>; warnings: string[] },
): Partial<Project> {
  const t = payload.project;
  const patch: Partial<Project> = {};
  if (ctx.includePrices && t.pricing && Object.keys(t.pricing).length) patch.pricing = { ...project.pricing, ...t.pricing };
  if (t.productChoices) {
    const choices: Record<string, string> = { ...project.productChoices };
    for (const [typeId, productId] of Object.entries(t.productChoices)) {
      if (!typeId.startsWith("wire:") && ctx.deviceTypeIds && !ctx.deviceTypeIds.has(typeId)) {
        ctx.warnings.push(`Skipped a product choice: the device type “${typeId}” isn't in your catalog any more.`);
        continue;
      }
      if (ctx.productIds && !ctx.productIds.has(productId)) {
        ctx.warnings.push(`Skipped a product choice for “${typeId.replace(/^wire:/, "")}”: that product was deleted.`);
        continue;
      }
      choices[typeId] = productId;
    }
    if (Object.keys(choices).length) patch.productChoices = choices;
  }
  if (t.labels?.length) patch.labels = [...new Set([...(project.labels ?? []), ...t.labels])];
  if (t.notes) patch.notes = project.notes?.trim() ? `${project.notes.trim()}\n\n${t.notes}` : t.notes;
  return patch;
}

/** Write a template into a just-created job: the project fields, checklists, estimate lines and extension parts. */
export async function applyTemplateParts(
  template: Pick<JobTemplate, "payload">,
  ctx: TemplateApplyContext,
  writeProject: (patch: Partial<Project>) => Promise<void>,
): Promise<string[]> {
  const v = validateTemplate(template.payload);
  if (!v.ok) return [v.error ?? "The template can't be used."];
  ctx.warnings.push(...v.warnings);
  const patch = projectPatch(v.payload, ctx.project, ctx);
  if (Object.keys(patch).length) await writeProject(patch);
  for (const part of templateParts()) {
    const data = part.key === "checklists" ? v.payload.checklists : part.key === "estimate" ? v.payload.estimateLines : v.payload.parts?.[part.key];
    if (data === undefined) continue;
    try {
      await part.apply(data, ctx);
    } catch (e) {
      ctx.warnings.push(`Couldn't apply “${part.label ?? part.key}”: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return ctx.warnings;
}

/** A one-line summary for lists and the template picker ("3 checklists · 4 estimate lines · 6 products"). Never prices. */
export function templateSummary(t: Pick<JobTemplate, "payload">, opts: { prices?: boolean } = {}): string {
  const p = t.payload ?? EMPTY_PAYLOAD;
  const n = (k: number, one: string, many = `${one}s`) => (k ? `${k} ${k === 1 ? one : many}` : null);
  const parts = [
    n(p.checklists?.length ?? 0, "checklist"),
    opts.prices === false ? null : n(p.estimateLines?.length ?? 0, "estimate line"),
    n(Object.keys(p.project?.productChoices ?? {}).length, "product choice"),
    n(p.project?.labels?.length ?? 0, "label"),
    p.project?.pricing && opts.prices !== false ? "pricing" : null,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : "Empty";
}

/** The template as a technician may see it: no prices anywhere. */
export function withoutPrices(t: JobTemplate): JobTemplate {
  const p = t.payload ?? EMPTY_PAYLOAD;
  const { pricing: _pricing, ...project } = p.project ?? {};
  void _pricing;
  return { ...t, payload: { ...p, project, estimateLines: (p.estimateLines ?? []).map(({ unitPrice: _u, ...l }) => (void _u, l)) } };
}

// ---------------- duplicate ----------------

export interface DuplicateOptions {
  address?: string;
  clientName?: string;
  clientEmail?: string;
  clientPhone?: string;
  /** Copy devices, runs and closets (the counts). Off copies only the plan sheets. Default on. */
  includeCounts?: boolean;
  /** Copy checklists with every item unticked, or leave them out. */
  includeChecklists: "reset" | "skip";
  /** Photos, logs and documents are never copied. */
  includePhotos?: false;
  /** Copy estimate overrides and custom lines (keys stay: they key by device type). */
  includeEstimate: boolean;
  /** Plan image ids copied for the new job (old id -> new id). Sheets whose image wasn't copied keep the old id. */
  imageMap?: Record<string, string>;
}

export interface DuplicatedJob {
  project: Project;
  sheets: Sheet[];
  markers: Marker[];
  runs: Run[];
  closets: Closet[];
  estimateLines: EstimateLine[];
  checklists: Checklist[];
}

/** Plan image ids a duplicate needs (each once), so the caller can copy them first. */
export function duplicateImageIds(bundle: Pick<ProjectBundle, "sheets">): string[] {
  return [...new Set(live(bundle.sheets).map((s) => s.imageId).filter(Boolean))];
}

/**
 * Copy a job with fresh ids for every row and every reference between them (device → sheet/closet, run →
 * sheet/device/closet, closet → sheet). Labels (CAM-1-03), calibration and estimate keys are kept. Photos, logs,
 * documents, quotes/invoices, proposals and Billdu links are not copied. Deleted rows are never copied.
 */
export function duplicateJob(bundle: ProjectBundle, opts: DuplicateOptions, newId: () => string, now: string): DuplicatedJob {
  const src = bundle.project;
  const pid = newId();
  const project: Project = compact({
    id: pid,
    clientName: (opts.clientName ?? src.clientName ?? "").trim(),
    clientEmail: (opts.clientEmail ?? src.clientEmail ?? "").trim() || undefined,
    clientPhone: (opts.clientPhone ?? src.clientPhone ?? "").trim() || undefined,
    address: (opts.address ?? src.address ?? "").trim(),
    status: "estimate",
    notes: src.notes || undefined,
    billduDocs: [],
    pricing: src.pricing && Object.keys(src.pricing).length ? { ...src.pricing } : undefined,
    labels: src.labels?.length ? [...src.labels] : undefined,
    productChoices: src.productChoices && Object.keys(src.productChoices).length ? { ...src.productChoices } : undefined,
    createdAt: now,
    updatedAt: now,
  }) as Project;

  const sheetIds = new Map<string, string>();
  const sheets: Sheet[] = live(bundle.sheets).map((s) => {
    const id = newId();
    sheetIds.set(s.id, id);
    const { imageUrl: _url, ...rest } = s;
    void _url;
    return { ...rest, id, projectId: pid, imageId: opts.imageMap?.[s.imageId] ?? s.imageId, createdAt: now, updatedAt: now };
  });

  const counts = opts.includeCounts !== false;
  const closetIds = new Map<string, string>();
  const closets: Closet[] = [];
  const markerIds = new Map<string, string>();
  const markers: Marker[] = [];
  const runs: Run[] = [];
  if (counts) {
    for (const c of live(bundle.closets)) {
      const sheetId = sheetIds.get(c.sheetId);
      if (!sheetId) continue;
      const id = newId();
      closetIds.set(c.id, id);
      closets.push({ ...c, id, projectId: pid, sheetId, createdAt: now, updatedAt: now });
    }
    for (const m of live(bundle.markers)) {
      const sheetId = sheetIds.get(m.sheetId);
      if (!sheetId) continue;
      const id = newId();
      markerIds.set(m.id, id);
      markers.push({ ...m, id, projectId: pid, sheetId, closetId: m.closetId ? (closetIds.get(m.closetId) ?? null) : (m.closetId ?? null), photoId: null, createdAt: now, updatedAt: now });
    }
    for (const r of live(bundle.runs)) {
      const sheetId = sheetIds.get(r.sheetId);
      if (!sheetId) continue;
      runs.push({
        ...r,
        id: newId(),
        projectId: pid,
        sheetId,
        markerId: r.markerId ? (markerIds.get(r.markerId) ?? null) : (r.markerId ?? null),
        closetId: r.closetId ? (closetIds.get(r.closetId) ?? null) : (r.closetId ?? null),
        createdAt: now,
        updatedAt: now,
      });
    }
  }

  const estimateLines: EstimateLine[] = opts.includeEstimate ? live(bundle.estimateLines).map((l) => ({ ...l, id: newId(), projectId: pid, updatedAt: now })) : [];

  const checklists: Checklist[] =
    opts.includeChecklists === "reset"
      ? live(bundle.checklists).map((c) => ({
          id: newId(),
          projectId: pid,
          name: c.name,
          items: (c.items ?? []).map((i) => compact({ id: newId(), text: i.text, requiresPhoto: i.requiresPhoto || undefined, assignee: i.assignee || undefined, done: false })),
          createdAt: now,
          updatedAt: now,
        }))
      : [];

  return { project, sheets, markers, runs, closets, estimateLines, checklists };
}

/** The order duplicated rows are written in (parents first, like the sync push order). */
export const DUPLICATE_ORDER = ["sheets", "closets", "markers", "runs", "estimateLines", "checklists"] as const satisfies readonly (keyof DuplicatedJob & SyncTable)[];

/** Split rows into putMany-sized chunks. */
export function chunked<T>(rows: readonly T[], size = DUPLICATE_CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
  return out;
}

// ---------------- export / import ----------------

/** A file with templates to move between companies or keep as a backup. Ids are not kept on import. */
export function templatesFile(templates: JobTemplate[], now: string): string {
  return JSON.stringify(
    { format: TEMPLATES_FILE_FORMAT, version: 1, exportedAt: now, templates: live(templates).map(({ name, description, trades, payload }) => compact({ name, description, trades, payload })) },
    null,
    2,
  );
}

/** Templates from a templates file (or a single exported template). Bad entries are skipped with a reason. */
export function parseTemplatesFile(text: string, now: string, newId: () => string): { templates: JobTemplate[]; warnings: string[] } {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("That file isn't a PinPlan templates file (invalid JSON).");
  }
  const list = isObj(data) && Array.isArray(data.templates) ? data.templates : isObj(data) && isObj(data.payload) ? [data] : null;
  if (!list) throw new Error("That file isn't a PinPlan templates file.");
  const warnings: string[] = [];
  const templates: JobTemplate[] = [];
  for (const raw of list) {
    if (!isObj(raw)) continue;
    const name = str(raw.name) ?? "Imported template";
    const v = validateTemplate(raw.payload);
    if (!v.ok) {
      warnings.push(`Skipped “${name}”: ${v.error}`);
      continue;
    }
    warnings.push(...v.warnings.map((w) => `${name}: ${w}`));
    const trades = Array.isArray(raw.trades) ? raw.trades.filter((x): x is string => typeof x === "string") : null;
    templates.push(compact({ id: newId(), name, description: str(raw.description), trades: trades?.length ? trades : undefined, payload: v.payload, createdAt: now, updatedAt: now }) as JobTemplate);
  }
  return { templates, warnings };
}

/** Live templates, sorted by name. */
export function sortTemplates(templates: readonly JobTemplate[]): JobTemplate[] {
  return live(templates).sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
}
