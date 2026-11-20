import { msg } from "./i18n/msg";
import { DOC_DEFAULT_ACCENT, DOC_DEFAULT_BRAND } from "./brandDefaults";
import type { AppSettings, BusinessSettings, Category, ClosetKind, DeviceType, Layer, Mount } from "./types";

export const CATEGORIES: { id: Category; name: string; color: string }[] = [
  { id: "security", name: msg("Security"), color: "#dc2626" },
  { id: "network", name: msg("Network"), color: "#2563eb" },
  { id: "audio", name: msg("Audio"), color: "#7c3aed" },
  { id: "video", name: msg("Video"), color: "#0891b2" },
  { id: "smarthome", name: msg("Smart home"), color: "#059669" },
  { id: "lighting", name: msg("Lighting"), color: "#d97706" },
  { id: "shades", name: msg("Shades"), color: "#db2777" },
  { id: "infrastructure", name: msg("Infrastructure"), color: "#16a34a" },
  // Other trades. These are the default names/colours; a trade pack can rename a category (see trades.ts).
  { id: "power", name: msg("Receptacles"), color: "#c2410c" },
  { id: "switching", name: msg("Switches & controls"), color: "#4f46e5" },
  { id: "panels", name: msg("Panels & equipment"), color: "#334155" },
  { id: "fire", name: msg("Fire & life safety"), color: "#e11d48" },
  { id: "hvac", name: msg("HVAC"), color: "#0284c7" },
  { id: "plumbing", name: msg("Plumbing"), color: "#0d9488" },
  { id: "solar", name: msg("Solar"), color: "#ca8a04" },
  { id: "ev", name: msg("EV charging"), color: "#65a30d" },
  { id: "general", name: msg("General"), color: "#64748b" },
];

/** The low-voltage categories (the original catalog), in their original order. */
export const LOW_VOLTAGE_CATEGORIES: Category[] = ["security", "network", "audio", "video", "smarthome", "lighting", "shades", "infrastructure"];

export const LAYERS: { id: Layer; name: string }[] = [
  ...CATEGORIES.map((c) => ({ id: c.id as Layer, name: c.name })),
  { id: "wiring", name: msg("Wiring") },
];

export const WIRE_TYPES = [
  "Cat6",
  "16/4 speaker",
  "HDMI",
  "HDMI + Cat6",
  "18/2",
  "LV per driver",
  "LV per manufacturer",
  "Coax",
  "Fiber",
  "None",
];

export const MOUNTS: Mount[] = ["ceiling", "wall", "exterior", "floor", "cabinet", "other"];

export interface ClosetKindInfo {
  id: ClosetKind;
  name: string;
  abbrev: string;
  color: string;
  /** Layer / palette section it belongs to. */
  category: Category;
  /** One line for the client legend. */
  description: string;
}

const LV_CLOSET_TEXT = "Where the equipment and cables come together.";
export const CLOSET_KINDS: ClosetKindInfo[] = [
  { id: "equipment", name: "Equipment closet", abbrev: "EQ", color: "#16a34a", category: "infrastructure", description: LV_CLOSET_TEXT },
  { id: "switch", name: "Switch closet", abbrev: "SW", color: "#15803d", category: "infrastructure", description: LV_CLOSET_TEXT },
  { id: "rack", name: "Network rack", abbrev: "RK", color: "#166534", category: "infrastructure", description: LV_CLOSET_TEXT },
  // Other trades' "closets": where their runs end.
  { id: "panel", name: "Main panel", abbrev: "MP", color: "#1e293b", category: "panels", description: "The main electrical panel, where the circuits start." },
  { id: "subpanel", name: "Subpanel", abbrev: "SP", color: "#475569", category: "panels", description: "A second electrical panel, fed from the main panel." },
  { id: "facp", name: "Fire alarm control panel", abbrev: "FACP", color: "#be123c", category: "fire", description: "The fire alarm control panel that monitors every device." },
  { id: "nac", name: "NAC / power extender", abbrev: "NAC", color: "#9f1239", category: "fire", description: "Power supply for the horns and strobes." },
  { id: "airhandler", name: "Air handler / furnace", abbrev: "AH", color: "#0369a1", category: "hvac", description: "The indoor heating and cooling unit." },
  { id: "condenser", name: "Condenser / heat pump", abbrev: "CU", color: "#075985", category: "hvac", description: "The outdoor cooling / heat-pump unit." },
  { id: "waterheater", name: "Water heater", abbrev: "WH", color: "#0f766e", category: "plumbing", description: "The water heater." },
  { id: "manifold", name: "Manifold", abbrev: "MAN", color: "#115e59", category: "plumbing", description: "Where the water lines branch out to the fixtures." },
  { id: "inverter", name: "Inverter / battery", abbrev: "INV", color: "#a16207", category: "solar", description: "The solar inverter and battery storage." },
];

/** Closet kind info. Unknown kinds (synced from a newer app) fall back to the equipment closet's look. */
export function closetMeta(kind: string): ClosetKindInfo {
  return CLOSET_KINDS.find((k) => k.id === kind) ?? { ...CLOSET_KINDS[0], id: kind as ClosetKind, name: kind ? `${kind[0].toUpperCase()}${kind.slice(1)}` : "Closet" };
}

/** The panel kinds that get a panel schedule. */
export const PANEL_KINDS: ClosetKind[] = ["panel", "subpanel"];

const now = () => new Date(0).toISOString();

type Seed = Omit<DeviceType, "updatedAt" | "sort" | "unitPrice" | "laborPrice" | "billduProductId"> &
  Partial<Pick<DeviceType, "unitPrice" | "laborPrice">>;

// Starting catalog from PLAN.md. Prices start at 0 for the installer to fill in.
export const SEED: Seed[] = [
  // Security
  { id: "cam-indoor", name: "Indoor camera", category: "security", symbol: "C", abbrev: "CAM", shape: "circle", color: "#dc2626", unit: "each", defaultWire: "Cat6", defaultMount: "ceiling", kind: "device" },
  { id: "cam-outdoor", name: "Outdoor camera", category: "security", symbol: "OC", abbrev: "OCAM", shape: "triangle", color: "#b91c1c", unit: "each", defaultWire: "Cat6", defaultMount: "exterior", kind: "device" },
  { id: "vs", name: "Camera monitor / iPad display (VS)", category: "security", symbol: "VS", abbrev: "VS", shape: "square", color: "#ef4444", unit: "each", defaultWire: "Cat6", defaultMount: "wall", kind: "device" },
  // Network
  { id: "wap", name: "Wi-Fi access point", category: "network", symbol: "W", abbrev: "WAP", shape: "circle", color: "#2563eb", unit: "each", defaultWire: "Cat6", defaultMount: "ceiling", kind: "device" },
  { id: "net-switch", name: "Network switch", category: "network", symbol: "NS", abbrev: "NSW", shape: "square", color: "#1d4ed8", unit: "each", defaultWire: "Cat6", defaultMount: "other", kind: "device" },
  { id: "data-drop", name: "Data drop (Cat6 jack)", category: "network", symbol: "D", abbrev: "DATA", shape: "diamond", color: "#3b82f6", unit: "each", defaultWire: "Cat6", defaultMount: "wall", kind: "device" },
  // Audio / video
  { id: "speaker", name: "In-ceiling speaker", category: "audio", symbol: "S", abbrev: "SPK", shape: "circle", color: "#7c3aed", unit: "each", defaultWire: "16/4 speaker", defaultMount: "ceiling", kind: "device" },
  { id: "tv", name: "TV location", category: "video", symbol: "TV", abbrev: "TV", shape: "square", color: "#0891b2", unit: "each", defaultWire: "HDMI + Cat6", defaultMount: "wall", kind: "device" },
  // Smart home
  { id: "sh", name: "Smart-home control point (SH)", category: "smarthome", symbol: "SH", abbrev: "SH", shape: "hexagon", color: "#059669", unit: "each", defaultWire: "Cat6", defaultMount: "wall", kind: "device" },
  { id: "keypad", name: "Keypad", category: "smarthome", symbol: "K", abbrev: "KP", shape: "square", color: "#10b981", unit: "each", defaultWire: "Cat6", defaultMount: "wall", kind: "device" },
  // Lighting (LF types are drawn as runs)
  { id: "led-ceiling", name: "LED strip — ceiling moulding", category: "lighting", symbol: "L", abbrev: "LED", shape: "diamond", color: "#d97706", unit: "LF", defaultWire: "LV per driver", defaultMount: "ceiling", kind: "led" },
  { id: "led-furniture", name: "LED strip — furniture", category: "lighting", symbol: "L", abbrev: "LEDF", shape: "diamond", color: "#ea580c", unit: "LF", defaultWire: "LV per driver", defaultMount: "other", kind: "led" },
  { id: "led-cabinet", name: "LED strip — cabinet", category: "lighting", symbol: "L", abbrev: "LEDC", shape: "diamond", color: "#f59e0b", unit: "LF", defaultWire: "LV per driver", defaultMount: "cabinet", kind: "led" },
  { id: "led-bench", name: "LED strip — bench", category: "lighting", symbol: "L", abbrev: "LEDB", shape: "diamond", color: "#ca8a04", unit: "LF", defaultWire: "LV per driver", defaultMount: "other", kind: "led" },
  { id: "led-bed", name: "LED strip — bed backlit", category: "lighting", symbol: "L", abbrev: "LEDBD", shape: "diamond", color: "#b45309", unit: "LF", defaultWire: "LV per driver", defaultMount: "other", kind: "led" },
  { id: "led-stair", name: "Stair-step LED", category: "lighting", symbol: "ST", abbrev: "STAIR", shape: "diamond", color: "#f97316", unit: "LF", defaultWire: "LV per driver", defaultMount: "floor", kind: "led" },
  { id: "led-spot-ceiling", name: "Ceiling LED spot", category: "lighting", symbol: "LS", abbrev: "LSP", shape: "star", color: "#eab308", unit: "each", defaultWire: "18/2", defaultMount: "ceiling", kind: "device" },
  { id: "led-driver", name: "LED zone / driver", category: "lighting", symbol: "DR", abbrev: "DRV", shape: "square", color: "#a16207", unit: "each", defaultWire: "18/2", defaultMount: "other", kind: "device" },
  // Shades
  { id: "shade", name: "Motorized curtain / shade", category: "shades", symbol: "M", abbrev: "SHD", shape: "square", color: "#db2777", unit: "each", defaultWire: "LV per manufacturer", defaultMount: "wall", kind: "device" },
];

export function seedCatalog(): DeviceType[] {
  return SEED.map((s, i) => ({
    unitPrice: 0,
    laborPrice: 0,
    billduProductId: null,
    ...s,
    sort: i,
    updatedAt: now(),
  }));
}

/** Starting estimate terms for every company (editable in Settings → Your business). */
export const DEFAULT_ESTIMATE_TERMS =
  "Estimate valid for 30 days. 50% deposit due on approval, balance on completion. Quantities are based on the marked-up plans; changes on site are billed at the same unit rates.";

/** What a new company's blank fields fall back to: nothing of anyone else's, the default document colours
 *  (src/lib/brandDefaults.ts), generic terms. */
export const NEUTRAL_BUSINESS: BusinessSettings = {
  name: "",
  address: "",
  phone: "",
  email: "",
  website: "",
  tagline: "",
  logo: "",
  brandColor: DOC_DEFAULT_BRAND,
  accentColor: DOC_DEFAULT_ACCENT,
  serviceArea: "",
  estimateTerms: DEFAULT_ESTIMATE_TERMS,
};

/** The fallback for installs saved before `brandDefaults` existed and for comped teams. It used to hold the founder's
 *  company details; the app ships no one's details now, so it is the same blank set. Kept so older settings rows
 *  (`brandDefaults: "founder"`) still resolve. */
export const FOUNDER_BUSINESS: BusinessSettings = NEUTRAL_BUSINESS;

export const DEFAULT_SETTINGS: AppSettings = {
  id: "app",
  // A new company starts blank: its own details go in Settings → Your business (or the sign-up checklist).
  business: NEUTRAL_BUSINESS,
  // New installs use the neutral defaults; settings saved before this field existed keep the founder's.
  brandDefaults: "neutral",
  pricing: {
    markupPct: 0,
    taxPct: 0,
    laborMode: "combined",
    wirePrices: {
      Cat6: 0,
      "16/4 speaker": 0,
      "HDMI + Cat6": 0,
      "18/2": 0,
      "LV per driver": 0,
      "LV per manufacturer": 0,
      Coax: 0,
      Fiber: 0,
    },
    wireSlackPct: 10,
    wireDropFt: 10,
    floorHeightFt: 10,
    includeTentative: false,
    currency: "USD",
  },
  billduDocType: "estimate",
  // Saved with "Save as template" on a job's checklist; managed in Settings → Checklist templates.
  checklistTemplates: [],
  updatedAt: now(),
};

/** Default category name/colour (trade-aware names: tradeCategory in trades.ts). Unknown ids fall back to "General". */
export function categoryOf(id: Category | string) {
  return CATEGORIES.find((c) => c.id === id) ?? CATEGORIES[CATEGORIES.length - 1];
}
