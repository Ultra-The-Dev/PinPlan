import type { AppSettings, Category, ClosetKind, DeviceType, Layer, Mount } from "./types";

export const CATEGORIES: { id: Category; name: string; color: string }[] = [
  { id: "security", name: "Security", color: "#dc2626" },
  { id: "network", name: "Network", color: "#2563eb" },
  { id: "audio", name: "Audio", color: "#7c3aed" },
  { id: "video", name: "Video", color: "#0891b2" },
  { id: "smarthome", name: "Smart home", color: "#059669" },
  { id: "lighting", name: "Lighting", color: "#d97706" },
  { id: "shades", name: "Shades", color: "#db2777" },
  { id: "infrastructure", name: "Infrastructure", color: "#16a34a" },
];

export const LAYERS: { id: Layer; name: string }[] = [
  ...CATEGORIES.map((c) => ({ id: c.id as Layer, name: c.name })),
  { id: "wiring", name: "Wiring" },
];

export const WIRE_TYPES = [
  "Cat6",
  "16/4 speaker",
  "HDMI + Cat6",
  "18/2",
  "LV per driver",
  "LV per manufacturer",
  "Coax",
  "Fiber",
  "None",
];

export const MOUNTS: Mount[] = ["ceiling", "wall", "exterior", "floor", "cabinet", "other"];

export const CLOSET_KINDS: { id: ClosetKind; name: string; abbrev: string; color: string }[] = [
  { id: "equipment", name: "Equipment closet", abbrev: "EQ", color: "#16a34a" },
  { id: "switch", name: "Switch closet", abbrev: "SW", color: "#15803d" },
  { id: "rack", name: "Network rack", abbrev: "RK", color: "#166534" },
];

const now = () => new Date(0).toISOString();

type Seed = Omit<DeviceType, "updatedAt" | "sort" | "unitPrice" | "laborPrice" | "billduProductId"> &
  Partial<Pick<DeviceType, "unitPrice" | "laborPrice">>;

// Starting catalog from PLAN.md. Prices start at 0 for the installer to fill in.
const SEED: Seed[] = [
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

export const DEFAULT_SETTINGS: AppSettings = {
  id: "app",
  business: {
    name: "",
    address: "",
    phone: "",
    email: "",
    website: "",
    estimateTerms:
      "Estimate valid for 30 days. 50% deposit due on approval, balance on completion. Quantities are based on the marked-up plans; changes on site are billed at the same unit rates.",
  },
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
  updatedAt: now(),
};

export function categoryOf(id: Category) {
  return CATEGORIES.find((c) => c.id === id)!;
}
