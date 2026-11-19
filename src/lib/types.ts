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
  | "infrastructure";

/** Layers the crew can toggle. One per category plus wiring. */
export type Layer = Category | "wiring";

export type Unit = "each" | "LF";
export type Mount = "ceiling" | "wall" | "exterior" | "floor" | "cabinet" | "other";
export type Shape = "circle" | "square" | "triangle" | "diamond" | "hexagon" | "star";
export type ProjectStatus = "estimate" | "approved" | "installed";
export type RunKind = "led" | "stair" | "wire";
export type ClosetKind = "equipment" | "switch" | "rack";

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
  tentative: boolean;
  notes: string;
  photoId?: string | null;
  createdAt: string;
  updatedAt: string;
  deleted?: boolean;
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
  tentative?: boolean;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  deleted?: boolean;
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

export interface AppSettings {
  id: "app";
  business: BusinessSettings;
  pricing: PricingSettings;
  billduDocType: "estimate" | "order" | "invoice";
  updatedAt: string;
}
