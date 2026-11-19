// Core domain types. Positions (x, y, points) are always relative to the sheet image (0–1),
// so they survive any zoom level, screen size or re-render resolution.

export type Category =
  | "security"
  | "network"
  | "audio"
  | "video"
  | "smarthome"
  | "lighting"
  | "shades"
  | "infrastructure"
  // Other trades (see src/lib/trades.ts). One fixed superset shared by the database, the web app and the iPad app;
  // readers must tolerate ids they don't know (fall back to "general").
  | "power"
  | "switching"
  | "panels"
  | "fire"
  | "hvac"
  | "plumbing"
  | "solar"
  | "ev"
  | "general";

/** A trade pack: which categories, catalog, wire types, closets and checklists a company works with. */
export type TradeId = "lowvoltage" | "electrical" | "fire" | "hvac" | "plumbing" | "solar" | "general";

/** Layers the crew can toggle. One per category plus wiring. */
export type Layer = Category | "wiring";

export type Unit = "each" | "LF";
export type Mount = "ceiling" | "wall" | "exterior" | "floor" | "cabinet" | "other";
export type Shape = "circle" | "square" | "triangle" | "diamond" | "hexagon" | "star";
export type ProjectStatus = "estimate" | "approved" | "installed";
export type RunKind = "led" | "stair" | "wire";
/** Where runs end. The first three are low voltage; the rest belong to other trades (panels, FACP, air handler…). */
export type ClosetKind =
  | "equipment"
  | "switch"
  | "rack"
  | "panel"
  | "subpanel"
  | "facp"
  | "nac"
  | "airhandler"
  | "condenser"
  | "waterheater"
  | "manifold"
  | "inverter";

/** Electrical circuit details on a wire run (a circuit's home run to its panel). All optional. */
export interface CircuitInfo {
  /** Breaker space(s) in the panel, e.g. "12" or "3/5" for a 2-pole breaker. */
  number?: string | null;
  /** Breaker size in amps (15, 20, 30, 40, 50…). */
  breakerA?: number | null;
  /** 120 or 240 (208/277 also allowed). */
  volts?: number | null;
  /** 1, 2 or 3 poles. */
  poles?: number | null;
  /** What the circuit feeds ("Kitchen counter receptacles"). Defaults to the rooms of its devices. */
  description?: string | null;
}

export interface BillduDocRef {
  id: number;
  type: "estimate" | "order" | "invoice" | "proforma";
  serial?: string | null;
  /** Total (before tax) that this document billed. */
  amount: number;
  /** For deposit/progress invoices, the percentage of the estimate it represents. */
  percent?: number | null;
  label?: string;
  createdAt: string;
}

export interface Project {
  id: string;
  clientName: string;
  clientEmail?: string;
  clientPhone?: string;
  address: string;
  status: ProjectStatus;
  notes?: string;
  billduClientId?: number | null;
  billduDocs: BillduDocRef[];
  /** Per-project estimate overrides of the global pricing settings. */
  pricing?: Partial<PricingSettings>;
  /** Free-form labels for sorting jobs ("Pre-wire", "Waiting on GC", "Service"). */
  labels?: string[] | null;
  /** Job location (from the first geotagged photo or set by hand), for the jobs map. */
  lat?: number | null;
  lng?: number | null;
  /** Product chosen for this job per device type id (or "wire:<cable type>" for cable products). */
  productChoices?: Record<string, string> | null;
  createdAt: string;
  updatedAt: string;
  deleted?: boolean;
}

export interface Sheet {
  id: string;
  projectId: string;
  name: string;
  pageNumber: number;
  order: number;
  /** Key into the local `images` table. */
  imageId: string;
  /** Remote URL once synced to storage (optional). */
  imageUrl?: string | null;
  width: number;
  height: number;
  /** Image pixels per real-world foot, once calibrated. */
  pxPerFt?: number | null;
  /** Image pixels per paper inch (known for PDF renders; lets the user type a plan scale). */
  pxPerInch?: number | null;
  scaleLabel?: string | null;
  createdAt: string;
  updatedAt: string;
  deleted?: boolean;
}

export interface DeviceType {
  id: string;
  name: string;
  category: Category;
  /** Short text drawn inside the symbol, e.g. "C", "W", "SH". */
  symbol: string;
  /** Pictogram drawn inside the symbol (key of DEVICE_ICONS), "letters" for the symbol text, or unset for the default. */
  icon?: string | null;
  /** Label prefix for auto-numbering, e.g. "CAM" -> CAM-1-03. */
  abbrev: string;
  shape: Shape;
  color: string;
  unit: Unit;
  /** Material/sell price per unit (each, or per LF). */
  unitPrice: number;
  /** Labor price per unit. */
  laborPrice: number;
  defaultWire: string;
  defaultMount: Mount;
  /** "led" types are measured by runs instead of placed as point markers. */
  kind: "device" | "led";
  billduProductId?: number | null;
  sort: number;
  archived?: boolean;
  updatedAt: string;
}

export interface Marker {
  id: string;
  projectId: string;
  sheetId: string;
  deviceTypeId: string;
  x: number;
  y: number;
  label: string;
  room: string;
  mount: Mount;
  wireType: string;
  /** Cables pulled to this device when there are several (e.g. ["HDMI", "Cat6"]). Repeats mean several of that type. */
  wires?: string[] | null;
  /** This device's product when it differs from the job's choice for its type. */
  productId?: string | null;
  closetId?: string | null;
  /** Electrical: the panel circuit number this device is on (e.g. "12"). Its panel is closetId. */
  circuit?: string | null;
  tentative: boolean;
  notes: string;
  photoId?: string | null;
  createdAt: string;
  updatedAt: string;
  deleted?: boolean;
  /** Install progress (roughed → installed → tested → verified), with history and photo proof. Never counted. */
  install?: InstallState | null;
}

export interface Run {
  id: string;
  projectId: string;
  sheetId: string;
  kind: RunKind;
  /** LED device type for led/stair runs. */
  deviceTypeId?: string | null;
  /** Flat list of relative coords [x0, y0, x1, y1, ...]. */
  points: number[];
  /** Length measured from the sheet scale (ft), if calibrated. */
  measuredFt?: number | null;
  /** Typed length (ft). Overrides the measured length when set. */
  typedFt?: number | null;
  zone?: string;
  switchLabel?: string;
  steps?: number | null;
  lfPerStep?: number | null;
  wireType?: string;
  /** Cables a home run carries when it is a bundle (wireType is the first). */
  wireTypes?: string[] | null;
  /** For wire home runs: the device and closet they connect. */
  markerId?: string | null;
  closetId?: string | null;
  /** Electrical jobs: the run is a circuit's home run (circuit number, breaker, voltage, poles). */
  circuit?: CircuitInfo | null;
  tentative?: boolean;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  deleted?: boolean;
  /** Install progress (wire runs: roughed = pulled, installed = terminated, tested = certified). Never counted. */
  install?: InstallState | null;
}

/** A specific product (brand + model) for a device type, e.g. a Ubiquiti G5 Turret for "Indoor camera".
 * Cable products use deviceTypeId "wire:<cable type>" and are priced per foot. */
export interface Product {
  id: string;
  deviceTypeId: string;
  brand: string;
  model: string;
  sku?: string | null;
  /** Material cost per unit (each, per LF for LED, per ft for cable). */
  unitPrice: number;
  laborPrice: number;
  notes?: string | null;
  archived?: boolean;
  updatedAt: string;
  deleted?: boolean;
}

export interface Closet {
  id: string;
  projectId: string;
  sheetId: string;
  kind: ClosetKind;
  x: number;
  y: number;
  name: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  deleted?: boolean;
}

/** User overrides on the computed estimate, plus custom lines. */
export interface EstimateLine {
  id: string;
  projectId: string;
  /** Matches a computed line key (e.g. "dev:<typeId>", "wire:Cat6") or "custom:<id>". */
  key: string;
  description?: string | null;
  qty?: number | null;
  unit?: string | null;
  unitPrice?: number | null;
  removed?: boolean;
  /** For optional (tentative) lines: include in totals. */
  include?: boolean | null;
  sort?: number;
  updatedAt: string;
  deleted?: boolean;
}

/** AI-suggested ("ghost") items. Never counted until accepted. */
export interface Suggestion {
  id: string;
  projectId: string;
  sheetId: string;
  kind: "marker" | "led";
  deviceTypeId?: string | null;
  x: number;
  y: number;
  /** For LED callouts. */
  zone?: string;
  lf?: number | null;
  switchLabel?: string;
  symbolText?: string;
  tentative?: boolean;
  confidence: number;
  createdAt: string;
}

// ---------------- field documentation (photos, checklists, logs, documents) ----------------

/** A shape drawn over a photo. Coordinates are relative (0–1) to the photo, like plan positions. */
export interface PhotoShape {
  kind: "pen" | "arrow" | "rect" | "circle" | "text";
  color: string;
  /** Stroke width relative to the photo's longer side (e.g. 0.006). */
  width: number;
  /** pen: [x0,y0,x1,y1,…]; arrow/rect/circle: [x0,y0,x1,y1]; text: [x,y]. */
  points: number[];
  text?: string;
}

/** A job photo: who took it, when and where, what it shows, and where it is on the plan. */
export interface Photo {
  id: string;
  projectId: string;
  /** Key into the local `images` table (and cloud storage). */
  imageId: string;
  width: number;
  height: number;
  takenAt: string;
  takenBy?: string | null;
  lat?: number | null;
  lng?: number | null;
  caption?: string | null;
  tags?: string[] | null;
  /** Mark-up drawn over the photo (the original image is never changed). */
  annotations?: PhotoShape[] | null;
  /** Where it is: a device, a sheet/position on the plan, a room. */
  markerId?: string | null;
  sheetId?: string | null;
  room?: string | null;
  /** Before/after: an "after" photo points at its "before". */
  beforeId?: string | null;
  /** Checklist item this photo was taken for. */
  checklistId?: string | null;
  checklistItemId?: string | null;
  createdAt: string;
  updatedAt: string;
  deleted?: boolean;
}

export interface PhotoComment {
  id: string;
  projectId: string;
  photoId: string;
  author?: string | null;
  text: string;
  createdAt: string;
  updatedAt: string;
  deleted?: boolean;
}

export interface ChecklistItem {
  id: string;
  text: string;
  /** Needs at least one photo before it counts as done. */
  requiresPhoto?: boolean;
  done?: boolean;
  doneBy?: string | null;
  doneAt?: string | null;
  note?: string | null;
  /** Who should do it (a team member's name) — makes the item a task on their list. */
  assignee?: string | null;
  /** Due date (YYYY-MM-DD). */
  due?: string | null;
  /** Photo this item was made from (a photo comment turned into a task). */
  photoId?: string | null;
  /** Photo comment this item was made from (so the comment shows as a task even after the text is edited). */
  commentId?: string | null;
}

export interface Checklist {
  id: string;
  projectId: string;
  name: string;
  items: ChecklistItem[];
  createdAt: string;
  updatedAt: string;
  deleted?: boolean;
}

/** A daily log / job note: what happened on site, with photos. */
export interface JobLog {
  id: string;
  projectId: string;
  /** Day it covers (YYYY-MM-DD). */
  date: string;
  title?: string | null;
  body: string;
  author?: string | null;
  photoIds?: string[] | null;
  createdAt: string;
  updatedAt: string;
  deleted?: boolean;
  /** Structured daily report (weather, crew & hours, work, delays, safety, signature). Null/absent on older free-text logs. */
  report?: DailyReport | null;
}

/** A file attached to a job (permit, spec sheet, contract…). Bytes live in the `images` table / storage. */
export interface JobDocument {
  id: string;
  projectId: string;
  name: string;
  mime: string;
  size: number;
  fileId: string;
  createdAt: string;
  updatedAt: string;
  deleted?: boolean;
}

export interface StoredImage {
  id: string;
  blob: Blob;
  width: number;
  height: number;
  mime: string;
}

export interface PricingSettings {
  /** % added to material prices (devices, LED, wire). */
  markupPct: number;
  /** Sales tax % applied on the estimate and Billdu items. */
  taxPct: number;
  /** combined: one "installed" line per type; separate: labor lines listed separately. */
  laborMode: "combined" | "separate";
  /** Price per foot for each wire type. */
  wirePrices: Record<string, number>;
  /** Extra % of cable added for slack/service loops. */
  wireSlackPct: number;
  /** Fixed extra ft per home run (drops, termination). */
  wireDropFt: number;
  /** Floor-to-floor height used for cross-floor home runs. */
  floorHeightFt: number;
  /** Include tentative (?) items in totals by default. */
  includeTentative: boolean;
  currency: string;
}

export interface BusinessSettings {
  name: string;
  address: string;
  phone: string;
  email: string;
  website: string;
  estimateTerms: string;
  /** One line under the name, e.g. "Smart Home · Lighting · AV & Home Theater · Security". */
  tagline?: string;
  /** Logo: a site path ("/brand/…png"), a URL, or an uploaded image (data URL). */
  logo?: string;
  /** Main brand colour (headings, bands) and accent (buttons, highlights). */
  brandColor?: string;
  accentColor?: string;
  /** Short line in the client-facing footer, e.g. the service area. */
  serviceArea?: string;
}

/** A checklist to start jobs from: built-in, or saved by the company ("Save as template"). */
export interface ChecklistTemplate {
  id: string;
  name: string;
  items: { text: string; requiresPhoto?: boolean }[];
  /** Saved by the user (lives in settings); built-ins leave this unset. */
  custom?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface AppSettings {
  id: "app";
  business: BusinessSettings;
  pricing: PricingSettings;
  billduDocType: "estimate" | "order" | "invoice";
  /** Company checklist templates saved from jobs (optional: older settings don't have it). Written only by saveChecklistTemplates. */
  checklistTemplates?: ChecklistTemplate[];
  /** Which defaults blank business fields fall back to: "neutral" on installs from the SaaS onwards; missing on
   *  the founder's older installs, which keep the founder's company details. */
  brandDefaults?: "founder" | "neutral";
  /** The company's trades, primary first (e.g. ["electrical", "lowvoltage"]). Missing or empty = low voltage only.
   *  Written only by saveTrades (src/lib/useTrades.ts); mirrored on the team so every member shares it. */
  trades?: TradeId[];
  /** Quotes / invoices / credit notes (Settings → Invoicing). Missing on older settings: DEFAULT_DOC_SETTINGS applies.
   *  The company-wide copy lives in the cloud (`document_settings`); this is this device's cache of it. */
  documents?: DocumentSettings;
  /** Install statuses that need a photo before they can be set (Settings → Install progress). Missing = ["installed"]. */
  installPhotoRequired?: InstallStatus[];
  updatedAt: string;
}

// ---------------- quotes, invoices, credit notes (see docs/documents.md) ----------------

/** "quote" covers estimates, quotes and proposals: one behaviour, the title is a setting ("Estimate", "Quote"…). */
export type DocKind = "quote" | "invoice" | "credit_note";
/** Stored status. "overdue" and "expired" are never stored: they are worked out from the dates (displayStatus). */
export type DocStatus = "draft" | "sent" | "viewed" | "accepted" | "declined" | "partially_paid" | "paid" | "void";
export type DocDisplayStatus = DocStatus | "overdue" | "expired";
export type InvoiceType = "standard" | "deposit" | "progress" | "final";
export type DocSource = "manual" | "estimate" | "quote" | "invoice" | "duplicate";
export type DocGrouping = "category" | "floor" | "room" | "flat";
export type DocTemplate = "classic" | "modern" | "compact";
export type PaymentMethod = "cash" | "check" | "card" | "ach" | "zelle" | "other";

/** A percentage of, or a fixed amount off, something. */
export interface Adjust {
  type: "pct" | "fixed";
  value: number;
}

export interface DocTaxRate {
  id: string;
  /** e.g. "NY Sales Tax". */
  name: string;
  /** Percent, e.g. 8.875. */
  rate: number;
}

export interface DocLine {
  id: string;
  /** "section": a heading row (only `description` is used); the items below it belong to it. Default "item". */
  kind?: "item" | "section";
  description: string;
  /** Second line under the description (rooms, device labels, notes). */
  details?: string | null;
  /** Item code / SKU. */
  sku?: string | null;
  qty: number;
  unit?: string | null;
  unitPrice: number;
  /** Line discount (before tax). */
  discount?: Adjust | null;
  taxable: boolean;
  /** Which of the document's taxes apply when taxable; null/missing = all of them. */
  taxIds?: string[] | null;
  /** Shown to the client but not counted in the totals. */
  optional?: boolean;
  /** Estimate line key it came from ("dev:<type>", "wire:Cat6"…). */
  key?: string | null;
}

export interface DocFee {
  id: string;
  /** "Shipping", "Permit fee"… */
  label: string;
  amount: number;
  taxable?: boolean;
}

export interface DocClient {
  name: string;
  company?: string | null;
  email?: string | null;
  phone?: string | null;
  billingAddress?: string | null;
  siteAddress?: string | null;
}

export interface DocColumns {
  qty: boolean;
  unit: boolean;
  unitPrice: boolean;
  discount: boolean;
  tax: boolean;
  sku: boolean;
  lineTotal: boolean;
}

/** How the document is shown (PDF and client link). Missing keys fall back to the company settings. */
export interface DocOptions {
  /** "sections": prices per section only (line prices hidden). */
  detail?: "lines" | "sections";
  columns?: Partial<DocColumns>;
  template?: DocTemplate;
  /** Link to the marked-up plans PDF shown on the document. */
  plansUrl?: string | null;
  /** Quotes: the client must sign to accept. */
  requireSignature?: boolean;
}

/** A quote, invoice or credit note. Belongs to a job; money fields are denormalised (documentTotals) for lists. */
export interface SalesDoc {
  id: string;
  projectId: string;
  kind: DocKind;
  /** Title override (otherwise the kind's label from settings). */
  title?: string | null;
  /** Given by the server when the document is issued (sent); null while it's a draft or waiting for sync. */
  number?: string | null;
  status: DocStatus;
  issueDate?: string | null;
  dueDate?: string | null;
  /** Quotes: last day it can be accepted. */
  validUntil?: string | null;
  /** Payment terms in days (0 = due on receipt). */
  termsDays?: number | null;
  client: DocClient;
  lines: DocLine[];
  discount?: Adjust | null;
  taxes: DocTaxRate[];
  fees?: DocFee[] | null;
  /** Deposit asked for (quotes: on acceptance; invoices: due first). */
  deposit?: Adjust | null;
  /** Final invoices: amounts already invoiced (deposits, progress bills), taken off after tax. */
  deductions?: DocFee[] | null;
  currency: string;
  notes?: string | null;
  terms?: string | null;
  footer?: string | null;
  /** Never shown to the client. */
  internalNotes?: string | null;
  options?: DocOptions | null;
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  total: number;
  amountPaid: number;
  balanceDue: number;
  source: DocSource;
  /** The document this one was made from (quote → invoice, invoice → credit note, duplicate). */
  convertedFrom?: string | null;
  invoiceType?: InvoiceType | null;
  /** Deposit / progress invoices: the percentage of the quote billed. */
  billedPct?: number | null;
  /** The client link currently published, and a fingerprint of what it shows (to spot a stale link). */
  shareToken?: string | null;
  shareHash?: string | null;
  sentAt?: string | null;
  viewedAt?: string | null;
  /** Client's answer (quotes), written by the server from the client link. */
  respondedAt?: string | null;
  signerName?: string | null;
  signature?: string | null;
  clientNote?: string | null;
  paidAt?: string | null;
  voidedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  deleted?: boolean;
}

/** A payment (positive) or refund (negative) against an invoice. */
export interface DocPayment {
  id: string;
  projectId: string;
  documentId: string;
  amount: number;
  /** YYYY-MM-DD. */
  date: string;
  method: PaymentMethod;
  reference?: string | null;
  note?: string | null;
  /** Kept for the record but not counted. */
  voided?: boolean;
  createdAt: string;
  updatedAt: string;
  deleted?: boolean;
}

export interface DocKindSettings {
  /** Title on the document: "Estimate", "Quote", "Proposal", "Invoice", "Credit note". */
  label: string;
  /** Number format: {YYYY} {YY} {MM}, and {0000} (zero-padded) or {#} for the counter, e.g. "INV-{YYYY}-{0000}". */
  format: string;
  /** Start the counter again at 1 each January. */
  yearlyReset: boolean;
  terms: string;
  notes: string;
  footer: string;
}

export interface DocumentSettings {
  kinds: Record<DocKind, DocKindSettings>;
  /** Payment terms in days for new invoices (0 = due on receipt). */
  paymentTermsDays: number;
  /** Quotes stay valid this many days (0 = no expiry). */
  quoteValidDays: number;
  /** Deposit asked for on new quotes (%; 0 = none). */
  depositPct: number;
  lateFee: string;
  /** Named tax rates; `default` ones are added to new documents. */
  taxes: (DocTaxRate & { default: boolean })[];
  /** Labor lines are taxed (off by default: installation labor often isn't). */
  laborTaxable: boolean;
  currency: string;
  /** Number/date formatting, e.g. "en-US". */
  locale: string;
  columns: DocColumns;
  grouping: DocGrouping;
  detail: "lines" | "sections";
  /** Estimate → quote: add rooms / device labels under each line. */
  lineDetails: boolean;
  template: DocTemplate;
  payment: {
    /** Free text shown under "How to pay". */
    instructions: string;
    bank: string;
    zelle: string;
    checkPayable: string;
    /** The company's own payment link, with {amount}, {number} and {currency} filled in. */
    payUrl: string;
  };
  signatureOnQuotes: boolean;
  reminders: { enabled: boolean; daysBeforeDue: number; daysAfterDue: number[] };
  updatedAt?: string;
}

/** The structured part of a daily log (src/lib/dailyReport.ts). Every section is optional so old and partial reports load. */
export interface DailyReport {
  weather?: {
    summary?: string;
    tempHighF?: number | null;
    tempLowF?: number | null;
    precipIn?: number | null;
    windMph?: number | null;
    source?: "auto" | "manual";
    /** Filled from the forecast (the log's day was in the future when it was fetched). */
    forecast?: boolean;
  };
  crew?: { name: string; hours: number; role?: string | null }[];
  work?: { text: string; sheetId?: string | null; area?: string | null }[];
  deliveries?: string[];
  equipment?: string[];
  /** `ongoing` delays carry over to the next day's report ("Copy from yesterday"). */
  delays?: { reason: string; hours?: number | null; ongoing?: boolean }[];
  safety?: { incident: boolean; notes?: string | null };
  visitors?: string[];
  signature?: { name: string; imageId: string; signedAt: string } | null;
}

// ---------------- install progress (see src/lib/installProgress.ts) ----------------

export type InstallStatus = "planned" | "roughed" | "installed" | "tested" | "verified" | "issue";

export interface InstallState {
  status: InstallStatus;
  by?: string | null;
  at?: string | null;
  /** Photos taken as proof (Photo ids; the photos also carry markerId). */
  photoIds?: string[];
  /** Test record: pass/fail plus a reading (dB loss, ohms, psi…). */
  test?: { pass: boolean; value?: string | null; note?: string | null } | null;
  history?: { status: InstallStatus; by?: string | null; at: string; note?: string | null }[];
}

// ---------------- job templates (see docs/job-templates.md) ----------------

/** A checklist kept in a job template: no ids, ticks, dates or photos. */
export interface JobTemplateChecklist {
  name: string;
  items: { text: string; requiresPhoto?: boolean; assignee?: string | null }[];
}

/** An estimate line kept in a job template: custom lines, and overrides that make sense without the job's devices. */
export interface JobTemplateEstimateLine {
  /** "custom:<id>" or a computed line key ("dev:<typeId>", "opt:<typeId>", "wire:<type>"). */
  key: string;
  description?: string | null;
  qty?: number | null;
  unit?: string | null;
  /** Left out when the template was saved without prices (or by a technician). */
  unitPrice?: number | null;
  sort?: number;
}

/** What a job template holds. Versioned JSON so the web and iPad apps can read each other's templates. */
export interface JobTemplatePayload {
  version: 1;
  project: {
    pricing?: Partial<PricingSettings> | null;
    productChoices?: Record<string, string> | null;
    labels?: string[] | null;
    notes?: string | null;
    trades?: string[] | null;
  };
  checklists: JobTemplateChecklist[];
  estimateLines: JobTemplateEstimateLine[];
  /** Extension data from template parts other features registered (registerTemplatePart), by part key. */
  parts?: Record<string, unknown>;
}

/** A saved job setup to start new jobs from (company level: not part of any job). */
export interface JobTemplate {
  id: string;
  name: string;
  description?: string | null;
  trades?: string[] | null;
  payload: JobTemplatePayload;
  /** Set by the database (the signed-in user who saved it). */
  createdBy?: string | null;
  createdAt: string;
  updatedAt: string;
  deleted?: boolean;
}
