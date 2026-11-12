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
  /** For wire home runs: the device and closet they connect. */
  markerId?: string | null;
  closetId?: string | null;
  tentative?: boolean;
  notes?: string;
  createdAt: string;
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
}

export interface AppSettings {
  id: "app";
  business: BusinessSettings;
  pricing: PricingSettings;
  billduDocType: "estimate" | "order" | "invoice";
  updatedAt: string;
}
