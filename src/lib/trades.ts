// Trade packs: what a company works with — low voltage (the original PinPlan), electrical, fire alarm, HVAC, plumbing,
// solar & EV, or a general/custom setup. A pack picks which categories (layers) are shown and what they're called,
// a starting catalog, wire/pipe types, the "closets" runs end at, what a run is called, built-in checklists and hints
// for the AI plan reader. Pure (no browser APIs) so it runs in tests and on the server. Mirrors PinPlanCore/Trades.swift.
//
// Categories are one fixed superset shared by the database, the web app and the iPad app (see docs/trades.md); a pack
// only chooses and renames them. Counts still come only from placed markers and runs (takeoff.ts).
import { CATEGORIES, LOW_VOLTAGE_CATEGORIES, SEED, WIRE_TYPES, categoryOf, closetMeta, type ClosetKindInfo } from "./catalog";
import { CHECKLIST_TEMPLATES } from "./fieldDocs";
import type { Category, ChecklistTemplate, ClosetKind, DeviceType, Layer, Mount, Shape, TradeId } from "./types";

export const TRADE_IDS: TradeId[] = ["lowvoltage", "electrical", "fire", "hvac", "plumbing", "solar", "general"];
export const DEFAULT_TRADES: TradeId[] = ["lowvoltage"];

/** A catalog item a pack starts with. Prices are editable starting points (low voltage starts at 0, as before). */
export interface TradeSeed {
  id: string;
  name: string;
  category: Category;
  symbol: string;
  abbrev: string;
  shape: Shape;
  color: string;
  unit: "each" | "LF";
  defaultWire: string;
  defaultMount: Mount;
  kind: "device" | "led";
  unitPrice: number;
  laborPrice: number;
  /** Plain-English line for the client legend. */
  description?: string;
  /** Electrical: rough connected load (VA) for the panel schedule, and the circuit it usually needs. */
  va?: number;
  breakerA?: number;
  volts?: number;
  poles?: number;
}

export interface TradePack {
  id: TradeId;
  name: string;
  /** Short label for badges ("Electrical"). */
  short: string;
  description: string;
  /** Examples shown on the sign-up card. */
  examples: string;
  color: string;
  /** Categories this trade uses, in palette order, with this trade's name for each. */
  categories: { id: Category; name: string }[];
  /** Closet kinds (where runs end) this trade places. */
  closets: ClosetKind[];
  /** What a run to a closet is called. */
  run: { one: string; many: string; hint: string };
  /** What "closet" means here ("panel", "FACP"…), for headings. */
  closetNoun: string;
  /** Wire / pipe / line types, in menu order. */
  wireTypes: string[];
  /** Starting $/ft for its wire types (only added where the company has no price yet). */
  wirePrices: Record<string, number>;
  /** "Wire", "Pipe", "Line"… — the noun for the wire types list. */
  wireNoun: string;
  catalog: TradeSeed[];
  checklists: ChecklistTemplate[];
  /** What the AI plan reader should look for on this trade's plans. */
  scanHint: string;
}

type SeedArgs = [id: string, name: string, category: Category, symbol: string, abbrev: string, shape: Shape, color: string, wire: string, mount: Mount, unitPrice: number, laborPrice: number, extra?: Partial<TradeSeed>];
const d = (...[id, name, category, symbol, abbrev, shape, color, defaultWire, defaultMount, unitPrice, laborPrice, extra]: SeedArgs): TradeSeed => ({
  id, name, category, symbol, abbrev, shape, color, unit: "each", defaultWire, defaultMount, kind: "device", unitPrice, laborPrice, ...extra,
});

// ---------------- low voltage (the original catalog, unchanged) ----------------

const LOW_VOLTAGE: TradePack = {
  id: "lowvoltage",
  name: "Low voltage & smart home",
  short: "Low voltage",
  description: "Cameras, Wi-Fi, audio/video, smart home, LED lighting and shades — home-run to equipment closets and racks.",
  examples: "Cameras · Wi-Fi · speakers · TVs · LED · shades",
  color: "#2563eb",
  categories: LOW_VOLTAGE_CATEGORIES.map((id) => ({ id, name: categoryOf(id).name })),
  closets: ["equipment", "switch", "rack"],
  run: { one: "Wire run", many: "Home runs", hint: "device → closet" },
  closetNoun: "closet",
  wireTypes: WIRE_TYPES.filter((w) => w !== "None"),
  wirePrices: {},
  wireNoun: "Cable",
  catalog: SEED.map((s) => ({ unitPrice: 0, laborPrice: 0, ...s })),
  checklists: CHECKLIST_TEMPLATES.filter((t) => t.id !== "punch"),
  scanHint: "",
};

// ---------------- electrical ----------------

const NM14 = "14/2 NM-B";
const NM12 = "12/2 NM-B";
const NM143 = "14/3 NM-B";
const ELECTRICAL_WIRES = [NM14, NM12, NM143, "12/3 NM-B", "10/2 NM-B", "10/3 NM-B", "8/3 NM-B", "6/3 NM-B", "14/2 MC", "12/2 MC", 'EMT 1/2"', 'EMT 3/4"', 'PVC 3/4"', 'PVC 1"'];

const ELECTRICAL: TradePack = {
  id: "electrical",
  name: "Electrical",
  short: "Electrical",
  description: "Receptacles, switches, lighting, smoke/CO and equipment — circuits home-run to panels, with a panel schedule.",
  examples: "Receptacles · switches · fixtures · panels · circuits",
  color: "#ea580c",
  categories: [
    { id: "power", name: "Receptacles" },
    { id: "switching", name: "Switches & controls" },
    { id: "lighting", name: "Lighting" },
    { id: "fire", name: "Life safety" },
    { id: "panels", name: "Panels & equipment" },
    { id: "ev", name: "EV charging" },
  ],
  closets: ["panel", "subpanel"],
  run: { one: "Circuit", many: "Circuits", hint: "device → panel (home run)" },
  closetNoun: "panel",
  wireTypes: ELECTRICAL_WIRES,
  wirePrices: {
    [NM14]: 0.65, [NM12]: 0.95, [NM143]: 0.95, "12/3 NM-B": 1.35, "10/2 NM-B": 1.75, "10/3 NM-B": 2.3, "8/3 NM-B": 3.6, "6/3 NM-B": 5.5,
    "14/2 MC": 1.2, "12/2 MC": 1.45, 'EMT 1/2"': 0.8, 'EMT 3/4"': 1.3, 'PVC 3/4"': 0.75, 'PVC 1"': 1.1,
  },
  wireNoun: "Wire",
  catalog: [
    // Receptacles (NEC 220.14(I): 180 VA per yoke)
    d("el-rec15", "Duplex receptacle 15A (TR)", "power", "R", "REC", "circle", "#c2410c", NM14, "wall", 4, 45, { va: 180, breakerA: 15, description: "Standard wall outlet." }),
    d("el-rec20", "Duplex receptacle 20A (TR)", "power", "R20", "REC", "circle", "#ea580c", NM12, "wall", 6, 50, { va: 180, breakerA: 20, description: "20-amp wall outlet (kitchens, laundry, garages)." }),
    d("el-gfci", "GFCI receptacle", "power", "GFI", "GFI", "circle", "#f97316", NM12, "wall", 22, 60, { va: 180, breakerA: 20, description: "Ground-fault protected outlet for kitchens, baths and outdoors." }),
    d("el-wr", "Weather-resistant GFCI + in-use cover", "power", "WP", "WP", "circle", "#fb923c", NM12, "exterior", 38, 80, { va: 180, breakerA: 20, description: "Outdoor outlet with a weatherproof cover." }),
    d("el-usb", "USB receptacle", "power", "USB", "USB", "circle", "#fdba74", NM14, "wall", 28, 50, { va: 180, breakerA: 15, description: "Wall outlet with built-in USB charging." }),
    d("el-quad", "Quad receptacle", "power", "R4", "QUAD", "square", "#9a3412", NM12, "wall", 12, 65, { va: 360, breakerA: 20, description: "Four-plug outlet (two receptacles)." }),
    d("el-floor", "Floor box receptacle", "power", "FB", "FBOX", "square", "#7c2d12", NM12, "floor", 85, 140, { va: 180, breakerA: 20, description: "Outlet set flush in the floor." }),
    d("el-240", "240V receptacle", "power", "240", "R240", "hexagon", "#b45309", "10/2 NM-B", "wall", 18, 85, { va: 3600, breakerA: 30, volts: 240, poles: 2, description: "240-volt outlet for a large appliance or tool." }),
    d("el-dryer", "Dryer receptacle 30A", "power", "DRY", "DRY", "hexagon", "#92400e", "10/3 NM-B", "wall", 22, 95, { va: 5000, breakerA: 30, volts: 240, poles: 2, description: "Outlet for an electric clothes dryer." }),
    d("el-range", "Range receptacle 50A", "power", "RNG", "RNG", "hexagon", "#78350f", "6/3 NM-B", "wall", 28, 120, { va: 8000, breakerA: 50, volts: 240, poles: 2, description: "Outlet for an electric range or oven." }),
    d("el-appl", "Appliance connection (DW / disposal / micro)", "power", "AP", "APPL", "square", "#d97706", NM12, "cabinet", 8, 70, { va: 1200, breakerA: 20, description: "Dedicated power for a built-in appliance." }),
    // Switches & controls
    d("el-sw", "Single-pole switch", "switching", "S", "SW", "square", "#4f46e5", NM14, "wall", 3, 35, { description: "Light switch." }),
    d("el-sw3", "3-way switch", "switching", "S3", "SW3", "square", "#6366f1", NM143, "wall", 6, 45, { description: "Switch that works with another switch (e.g. top and bottom of stairs)." }),
    d("el-sw4", "4-way switch", "switching", "S4", "SW4", "square", "#818cf8", NM143, "wall", 14, 55, { description: "Middle switch for a light controlled from three or more places." }),
    d("el-dim", "Dimmer", "switching", "D", "DIM", "square", "#4338ca", NM14, "wall", 28, 45, { description: "Dimmer switch." }),
    d("el-occ", "Occupancy / vacancy sensor switch", "switching", "OS", "OCC", "square", "#3730a3", NM14, "wall", 38, 50, { description: "Switch that turns the light on/off when someone enters or leaves." }),
    d("el-timer", "Timer switch", "switching", "TS", "TMR", "square", "#312e81", NM14, "wall", 32, 45, { description: "Switch with a countdown timer (bath fans, heaters)." }),
    d("el-fanctl", "Fan speed control", "switching", "FC", "FCTL", "square", "#a5b4fc", NM143, "wall", 35, 45, { description: "Wall control for a ceiling fan's speed." }),
    // Lighting
    d("el-can6", 'Recessed light 6"', "lighting", "CAN", "CAN", "circle", "#d97706", NM14, "ceiling", 28, 55, { va: 15, breakerA: 15, description: "Recessed ceiling light." }),
    d("el-can4", 'Recessed light 4"', "lighting", "C4", "CAN4", "circle", "#f59e0b", NM14, "ceiling", 32, 55, { va: 12, breakerA: 15, description: "Small recessed ceiling light." }),
    d("el-pend", "Pendant", "lighting", "P", "PEND", "diamond", "#b45309", NM14, "ceiling", 0, 75, { va: 60, breakerA: 15, description: "Hanging light (fixture by owner unless noted)." }),
    d("el-surf", "Surface / flush-mount fixture", "lighting", "SF", "FIX", "circle", "#ca8a04", NM14, "ceiling", 45, 55, { va: 40, breakerA: 15, description: "Ceiling-mounted light fixture." }),
    d("el-fan", "Ceiling fan / light (fan-rated box)", "lighting", "F", "FAN", "star", "#a16207", NM143, "ceiling", 25, 110, { va: 100, breakerA: 15, description: "Ceiling fan with light, on a fan-rated box." }),
    d("el-sconce", "Wall sconce", "lighting", "WS", "SCN", "triangle", "#eab308", NM14, "wall", 0, 60, { va: 40, breakerA: 15, description: "Wall-mounted light." }),
    d("el-ext", "Exterior light", "lighting", "EX", "EXT", "triangle", "#854d0e", NM14, "exterior", 0, 70, { va: 40, breakerA: 15, description: "Outdoor wall light." }),
    d("el-flood", "Flood / motion light", "lighting", "FL", "FLD", "triangle", "#713f12", NM14, "exterior", 55, 85, { va: 50, breakerA: 15, description: "Outdoor flood light with motion sensor." }),
    d("el-exit", "Exit / emergency light", "lighting", "EM", "EXIT", "square", "#dc2626", NM14, "wall", 65, 70, { va: 5, breakerA: 20, description: "Exit sign or emergency light with battery backup." }),
    { ...d("el-ucab", "Under-cabinet light", "lighting", "UC", "UCL", "diamond", "#facc15", NM14, "cabinet", 9, 8, { va: 5, breakerA: 15, description: "Under-cabinet lighting (per foot)." }), unit: "LF", kind: "led" },
    { ...d("el-strip", "Linear / strip light", "lighting", "LN", "LIN", "diamond", "#fde047", NM14, "ceiling", 12, 8, { va: 5, breakerA: 15, description: "Linear LED light (per foot)." }), unit: "LF", kind: "led" },
    // Life safety
    d("el-smoke", "Smoke alarm (hardwired, interconnected)", "fire", "SD", "SMK", "circle", "#e11d48", NM143, "ceiling", 32, 45, { va: 5, breakerA: 15, description: "Hardwired smoke alarm, linked so they all sound together." }),
    d("el-co", "CO alarm", "fire", "CO", "CO", "circle", "#be123c", NM143, "wall", 38, 45, { va: 5, breakerA: 15, description: "Carbon monoxide alarm." }),
    d("el-combo", "Smoke / CO combo alarm", "fire", "SC", "SCO", "circle", "#f43f5e", NM143, "ceiling", 55, 45, { va: 5, breakerA: 15, description: "Combined smoke and carbon monoxide alarm." }),
    d("el-heat", "Heat alarm (garage / attic)", "fire", "HA", "HEAT", "circle", "#9f1239", NM143, "ceiling", 35, 45, { va: 5, breakerA: 15, description: "Heat alarm where smoke alarms don't belong (garage, attic)." }),
    // Panels & equipment (the panels themselves are placed as "closets")
    d("el-disc", "Disconnect", "panels", "DS", "DISC", "square", "#334155", "10/2 NM-B", "wall", 45, 90, { volts: 240, poles: 2, breakerA: 30, description: "Safety disconnect switch." }),
    d("el-acdisc", "HVAC disconnect", "panels", "AC", "ACD", "square", "#475569", "10/2 NM-B", "exterior", 45, 120, { va: 3500, breakerA: 30, volts: 240, poles: 2, description: "Disconnect and circuit for the air conditioner / heat pump." }),
    d("el-jbox", "Junction box", "panels", "J", "JB", "diamond", "#64748b", NM14, "ceiling", 4, 30, { description: "Junction box." }),
    d("el-meter", "Meter", "panels", "MTR", "MTR", "hexagon", "#1e293b", "", "exterior", 0, 250, { description: "Utility meter." }),
    d("el-xfmr", "Transformer", "panels", "XF", "XFMR", "hexagon", "#0f172a", "", "other", 0, 150, { description: "Transformer." }),
    d("el-gen", "Generator inlet / transfer switch", "panels", "GI", "GEN", "hexagon", "#57534e", "6/3 NM-B", "exterior", 280, 450, { volts: 240, poles: 2, breakerA: 50, description: "Hookup for a standby or portable generator." }),
    d("ev-charger", "EV charger (Level 2)", "ev", "EV", "EV", "hexagon", "#65a30d", "6/3 NM-B", "wall", 0, 350, { va: 9600, breakerA: 50, volts: 240, poles: 2, description: "Level 2 electric-vehicle charger (40 A)." }),
  ],
  checklists: [
    {
      id: "el-rough",
      name: "Electrical rough-in walkthrough",
      items: [
        { text: "Boxes at the right heights and set for the wall finish", requiresPhoto: true },
        { text: "Box fill OK; fan-rated boxes where fans go" },
        { text: "Cables stapled within 12\" of boxes and every 4½ ft; nail plates where needed", requiresPhoto: true },
        { text: "Every home run labeled with its circuit number at the panel", requiresPhoto: true },
        { text: "Kitchen, bath, laundry and outdoor circuits on 20 A / GFCI as planned" },
        { text: "Smoke / CO alarms interconnected (14/3)" },
        { text: "Grounds made up and bonded in every box" },
        { text: "Photos of every open wall before insulation", requiresPhoto: true },
        { text: "Rough inspection scheduled" },
      ],
    },
    {
      id: "el-panel",
      name: "Panel / service",
      items: [
        { text: "Panel mounted and level, working clearance (30\" wide × 36\" deep) kept", requiresPhoto: true },
        { text: "Service conductors and main breaker sized per plan" },
        { text: "Grounding electrode system: rods, water and gas bonding", requiresPhoto: true },
        { text: "AFCI / GFCI breakers where required" },
        { text: "Lugs torqued to spec" },
        { text: "Panel schedule filled in and posted on the door", requiresPhoto: true },
        { text: "Meter base / utility coordination done" },
      ],
    },
    {
      id: "el-trim",
      name: "Electrical trim-out",
      items: [
        { text: "Devices installed, plates on and straight", requiresPhoto: true },
        { text: "Fixtures hung, lamps in, trims on", requiresPhoto: true },
        { text: "Receptacles polarity-tested" },
        { text: "GFCI and AFCI trip-tested" },
        { text: "Smoke / CO alarms tested together" },
        { text: "Fans balanced, dimmers and sensors set up" },
      ],
    },
    {
      id: "el-final",
      name: "Final & inspection prep",
      items: [
        { text: "Every circuit tested and matches the panel schedule" },
        { text: "Panel directory complete; all covers and blanks on", requiresPhoto: true },
        { text: "GFCI / AFCI / smoke test results written down" },
        { text: "Permit card and plans on site" },
        { text: "Site cleaned up", requiresPhoto: true },
        { text: "Final inspection passed" },
        { text: "Client walkthrough and sign-off" },
      ],
    },
  ],
  scanHint:
    "This is an electrical contractor. Look for electrical symbols: duplex receptacles (circle with two lines), GFI/GFCI, WP, 240V/dryer/range outlets, switches marked S, S3, S4, D (dimmer), OS (occupancy), recessed cans, pendants, fans, exterior lights, smoke/CO alarms, junction boxes, panels, disconnects, EV chargers. Circuit numbers and home-run arrows may be written next to devices.",
};

// ---------------- fire alarm & life safety ----------------

const FPLR18 = "18/2 FPLR";
const FIRE: TradePack = {
  id: "fire",
  name: "Fire alarm & life safety",
  short: "Fire alarm",
  description: "Detectors, pull stations, horn/strobes and modules — SLC and NAC wiring back to the FACP and power extenders.",
  examples: "Smoke & heat detectors · pull stations · horn/strobes · modules",
  color: "#e11d48",
  categories: [{ id: "fire", name: "Fire alarm" }],
  closets: ["facp", "nac"],
  run: { one: "Wire run", many: "Wire runs", hint: "device → FACP / NAC" },
  closetNoun: "panel",
  wireTypes: [FPLR18, "18/4 FPLR", "16/2 FPLR", "16/4 FPLR", "14/2 FPLP", "14/2 FPLR"],
  wirePrices: { [FPLR18]: 0.28, "18/4 FPLR": 0.42, "16/2 FPLR": 0.36, "16/4 FPLR": 0.6, "14/2 FPLP": 0.95, "14/2 FPLR": 0.55 },
  wireNoun: "Cable",
  catalog: [
    d("fa-smoke", "Smoke detector (addressable)", "fire", "SD", "SD", "circle", "#e11d48", FPLR18, "ceiling", 65, 55, { description: "Smoke detector on the fire alarm system." }),
    d("fa-heat", "Heat detector", "fire", "HD", "HD", "circle", "#f43f5e", FPLR18, "ceiling", 45, 55, { description: "Heat detector." }),
    d("fa-duct", "Duct smoke detector", "fire", "DD", "DD", "square", "#be123c", FPLR18, "other", 240, 150, { description: "Smoke detector in the air duct (shuts down the HVAC)." }),
    d("fa-co", "CO detector (system)", "fire", "CO", "CO", "circle", "#fb7185", FPLR18, "wall", 95, 55, { description: "Carbon monoxide detector on the fire alarm system." }),
    d("fa-pull", "Manual pull station", "fire", "F", "PULL", "square", "#9f1239", FPLR18, "wall", 75, 55, { description: "Pull station to raise the alarm by hand." }),
    d("fa-hs", "Horn / strobe", "fire", "HS", "HS", "triangle", "#dc2626", "14/2 FPLP", "wall", 70, 55, { description: "Alarm horn with flashing strobe." }),
    d("fa-strobe", "Strobe", "fire", "V", "STB", "triangle", "#ef4444", "14/2 FPLP", "wall", 55, 50, { description: "Flashing strobe light." }),
    d("fa-horn", "Horn", "fire", "H", "HRN", "triangle", "#b91c1c", "14/2 FPLP", "wall", 45, 50, { description: "Alarm horn." }),
    d("fa-spk", "Speaker / strobe (voice)", "fire", "SS", "SPST", "triangle", "#991b1b", "16/2 FPLR", "ceiling", 95, 60, { description: "Voice-evacuation speaker with strobe." }),
    d("fa-mon", "Monitor module", "fire", "MM", "MM", "diamond", "#7f1d1d", FPLR18, "other", 55, 45, { description: "Module that watches a switch (sprinkler flow, tamper…)." }),
    d("fa-relay", "Control / relay module", "fire", "CM", "CM", "diamond", "#881337", FPLR18, "other", 65, 45, { description: "Module that shuts down or releases equipment on alarm." }),
    d("fa-flow", "Waterflow / tamper switch", "fire", "WF", "WF", "diamond", "#4c0519", FPLR18, "other", 0, 60, { description: "Sprinkler waterflow or valve tamper switch (by the sprinkler contractor)." }),
    d("fa-annun", "Remote annunciator", "fire", "RA", "ANN", "square", "#e11d48", "18/4 FPLR", "wall", 450, 150, { description: "Display that shows fire alarm status away from the panel." }),
    d("fa-comm", "Communicator / dialer", "fire", "DL", "COMM", "square", "#9f1239", "18/4 FPLR", "other", 350, 120, { description: "Sends alarms to the monitoring company." }),
  ],
  checklists: [
    {
      id: "fa-pretest",
      name: "Fire alarm pre-test",
      items: [
        { text: "Every device installed and addressed per the plans", requiresPhoto: true },
        { text: "SLC / NAC circuits checked for continuity and grounds" },
        { text: "End-of-line resistors in place and labeled" },
        { text: "FACP programmed; points match the device list" },
        { text: "Battery calculation done; batteries dated", requiresPhoto: true },
        { text: "Every device tested once (100% pre-test)" },
        { text: "Monitoring account set up and test signals received" },
      ],
    },
    {
      id: "fa-acceptance",
      name: "Fire alarm acceptance test",
      items: [
        { text: "AHJ / fire marshal on site" },
        { text: "Every initiating device tested in front of the AHJ" },
        { text: "Horns and strobes: audibility and candela verified" },
        { text: "Supervisory and trouble signals checked" },
        { text: "Elevator recall / HVAC shutdown / door release verified" },
        { text: "Record of completion signed", requiresPhoto: true },
        { text: "As-built drawings and documents handed over" },
      ],
    },
  ],
  scanHint:
    "This is a fire alarm contractor. Look for fire alarm symbols: smoke (SD) and heat (HD) detectors, duct detectors, pull stations (F), horn/strobes (HS), strobes, speakers, monitor/control modules, waterflow/tamper switches, the FACP and NAC panels.",
};

// ---------------- HVAC ----------------

const HVAC: TradePack = {
  id: "hvac",
  name: "HVAC",
  short: "HVAC",
  description: "Registers, returns, thermostats, mini-splits and fans — line sets, thermostat wire and condensate back to the equipment.",
  examples: "Registers · returns · thermostats · mini-splits · line sets",
  color: "#0284c7",
  categories: [{ id: "hvac", name: "HVAC" }],
  closets: ["airhandler", "condenser"],
  run: { one: "Line run", many: "Line runs", hint: "device → equipment" },
  closetNoun: "equipment",
  wireTypes: ['Line set 1/4"×1/2"', 'Line set 3/8"×3/4"', "Thermostat 18/5", "Thermostat 18/8", 'Condensate 3/4" PVC', 'Flex duct 6"', 'Flex duct 8"'],
  wirePrices: { 'Line set 1/4"×1/2"': 4.5, 'Line set 3/8"×3/4"': 6.5, "Thermostat 18/5": 0.35, "Thermostat 18/8": 0.55, 'Condensate 3/4" PVC': 0.6, 'Flex duct 6"': 2.2, 'Flex duct 8"': 2.9 },
  wireNoun: "Line",
  catalog: [
    d("hv-supply", "Supply register / diffuser", "hvac", "SR", "SUP", "square", "#0284c7", 'Flex duct 6"', "ceiling", 18, 65, { description: "Where heated or cooled air comes in." }),
    d("hv-return", "Return grille", "hvac", "RG", "RET", "square", "#0369a1", 'Flex duct 8"', "wall", 28, 75, { description: "Where air goes back to the system." }),
    d("hv-tstat", "Thermostat", "hvac", "T", "TSTAT", "circle", "#0ea5e9", "Thermostat 18/5", "wall", 120, 85, { description: "Thermostat." }),
    d("hv-sensor", "Remote temperature sensor", "hvac", "TS", "SENS", "circle", "#38bdf8", "Thermostat 18/5", "wall", 45, 45, { description: "Room temperature sensor." }),
    d("hv-mini", "Mini-split indoor head", "hvac", "MS", "MINI", "hexagon", "#075985", 'Line set 1/4"×1/2"', "wall", 900, 450, { description: "Ductless wall unit for one room." }),
    d("hv-erv", "ERV / HRV", "hvac", "ERV", "ERV", "hexagon", "#0c4a6e", 'Flex duct 6"', "ceiling", 1400, 600, { description: "Fresh-air ventilation unit." }),
    d("hv-exh", "Exhaust fan", "hvac", "EF", "EXH", "circle", "#7dd3fc", 'Flex duct 6"', "ceiling", 95, 110, { description: "Exhaust fan (bath, laundry, kitchen)." }),
    d("hv-damper", "Zone damper", "hvac", "ZD", "ZD", "diamond", "#155e75", "Thermostat 18/5", "ceiling", 140, 90, { description: "Motorized damper for a heating/cooling zone." }),
    d("hv-cpump", "Condensate pump", "hvac", "CP", "CPMP", "diamond", "#164e63", 'Condensate 3/4" PVC', "other", 85, 75, { description: "Pumps condensation water to a drain." }),
  ],
  checklists: [
    {
      id: "hv-rough",
      name: "HVAC rough-in",
      items: [
        { text: "Duct runs installed, sealed and supported", requiresPhoto: true },
        { text: "Line sets run, insulated and protected", requiresPhoto: true },
        { text: "Condensate drains pitched to a drain" },
        { text: "Thermostat wire at every thermostat / sensor location" },
        { text: "Equipment pads / stands and clearances", requiresPhoto: true },
        { text: "Flue / venting per manufacturer" },
        { text: "Rough inspection scheduled" },
      ],
    },
    {
      id: "hv-startup",
      name: "HVAC startup & commissioning",
      items: [
        { text: "Line set pressure test and vacuum pulled", requiresPhoto: true },
        { text: "Refrigerant charge checked" },
        { text: "Static pressure and airflow measured" },
        { text: "Temperature split recorded" },
        { text: "Thermostats programmed; client shown how to use them" },
        { text: "Filters installed; warranty registered" },
      ],
    },
  ],
  scanHint:
    "This is an HVAC contractor. Look for supply registers/diffusers, return grilles, thermostats (T), mini-split heads, exhaust fans, ERV/HRV, duct runs and the air handler / condenser locations.",
};

// ---------------- plumbing ----------------

const PLUMBING: TradePack = {
  id: "plumbing",
  name: "Plumbing",
  short: "Plumbing",
  description: "Fixtures, hose bibbs, drains and gas outlets — supply and drain lines back to the water heater and manifold.",
  examples: "Sinks · toilets · showers · hose bibbs · PEX & drain",
  color: "#0d9488",
  categories: [{ id: "plumbing", name: "Plumbing" }],
  closets: ["waterheater", "manifold"],
  run: { one: "Pipe run", many: "Pipe runs", hint: "fixture → manifold" },
  closetNoun: "manifold",
  wireTypes: ['PEX 1/2"', 'PEX 3/4"', 'PEX 1"', 'Copper 1/2"', 'Copper 3/4"', 'Drain 1-1/2"', 'Drain 2"', 'Drain 3"', 'Drain 4"', 'Gas 1/2" CSST'],
  wirePrices: { 'PEX 1/2"': 0.55, 'PEX 3/4"': 0.95, 'PEX 1"': 1.6, 'Copper 1/2"': 3.2, 'Copper 3/4"': 5.4, 'Drain 1-1/2"': 1.6, 'Drain 2"': 2.1, 'Drain 3"': 3.6, 'Drain 4"': 4.8, 'Gas 1/2" CSST': 3.4 },
  wireNoun: "Pipe",
  catalog: [
    d("pl-lav", "Lavatory sink", "plumbing", "LAV", "LAV", "circle", "#0d9488", 'PEX 1/2"', "wall", 0, 220, { description: "Bathroom sink." }),
    d("pl-ks", "Kitchen sink", "plumbing", "KS", "KS", "square", "#0f766e", 'PEX 1/2"', "cabinet", 0, 260, { description: "Kitchen sink." }),
    d("pl-wc", "Toilet (WC)", "plumbing", "WC", "WC", "circle", "#14b8a6", 'PEX 1/2"', "floor", 0, 240, { description: "Toilet." }),
    d("pl-shower", "Shower valve", "plumbing", "SV", "SHV", "hexagon", "#115e59", 'PEX 1/2"', "wall", 180, 320, { description: "Shower valve and head." }),
    d("pl-tub", "Tub / tub-shower", "plumbing", "TUB", "TUB", "square", "#134e4a", 'PEX 1/2"', "floor", 0, 420, { description: "Bathtub with valve." }),
    d("pl-dw", "Dishwasher connection", "plumbing", "DW", "DW", "square", "#2dd4bf", 'PEX 1/2"', "cabinet", 15, 95, { description: "Water and drain for the dishwasher." }),
    d("pl-wm", "Washer box", "plumbing", "WB", "WB", "square", "#5eead4", 'PEX 1/2"', "wall", 45, 140, { description: "Water and drain box for the washing machine." }),
    d("pl-ice", "Ice maker box", "plumbing", "IM", "ICE", "diamond", "#99f6e4", 'PEX 1/2"', "wall", 35, 85, { description: "Water line for the fridge ice maker." }),
    d("pl-hb", "Hose bibb", "plumbing", "HB", "HB", "triangle", "#0e7490", 'PEX 3/4"', "exterior", 28, 110, { description: "Outdoor faucet (frost-free)." }),
    d("pl-fd", "Floor drain", "plumbing", "FD", "FD", "circle", "#155e75", 'Drain 2"', "floor", 45, 180, { description: "Floor drain." }),
    d("pl-co", "Cleanout", "plumbing", "CLO", "CO", "diamond", "#164e63", 'Drain 3"', "floor", 25, 90, { description: "Drain cleanout access." }),
    d("pl-gas", "Gas outlet / stub", "plumbing", "G", "GAS", "triangle", "#a16207", 'Gas 1/2" CSST', "wall", 35, 140, { description: "Gas connection for an appliance." }),
  ],
  checklists: [
    {
      id: "pl-rough",
      name: "Plumbing rough-in",
      items: [
        { text: "Drain / waste / vent installed and pitched", requiresPhoto: true },
        { text: "DWV water or air test passed", requiresPhoto: true },
        { text: "Supply lines pressure-tested", requiresPhoto: true },
        { text: "Stub-outs at the right heights; nail plates on" },
        { text: "Shower / tub valves set for the finished wall", requiresPhoto: true },
        { text: "Rough inspection scheduled" },
      ],
    },
    {
      id: "pl-final",
      name: "Plumbing final",
      items: [
        { text: "Fixtures set, caulked and secured", requiresPhoto: true },
        { text: "Supplies and traps checked for leaks" },
        { text: "Water heater set, venting and T&P discharge done", requiresPhoto: true },
        { text: "Hot water at every fixture; mixing valves set" },
        { text: "Gas appliances connected and leak-tested" },
        { text: "Final inspection passed" },
      ],
    },
  ],
  scanHint:
    "This is a plumber. Look for plumbing fixtures: sinks (LAV, KS), toilets (WC), showers and tubs, dishwasher and washer connections, hose bibbs (HB), floor drains (FD), cleanouts, gas outlets, the water heater and manifold.",
};

// ---------------- solar & EV ----------------

const SOLAR: TradePack = {
  id: "solar",
  name: "Solar & EV charging",
  short: "Solar & EV",
  description: "PV modules, optimizers, rapid shutdown, combiner and EV chargers — PV wire and conduit back to the inverter and panel.",
  examples: "PV modules · inverters · rapid shutdown · EV chargers",
  color: "#ca8a04",
  categories: [
    { id: "solar", name: "Solar" },
    { id: "ev", name: "EV charging" },
  ],
  closets: ["inverter", "panel"],
  run: { one: "Conduit run", many: "Conduit runs", hint: "array → inverter / panel" },
  closetNoun: "inverter",
  wireTypes: ["PV wire 10 AWG", "THHN 10 AWG", "THHN 8 AWG", "THHN 6 AWG", 'EMT 3/4"', 'PVC 1"', "6/3 NM-B"],
  wirePrices: { "PV wire 10 AWG": 0.45, "THHN 10 AWG": 0.35, "THHN 8 AWG": 0.6, "THHN 6 AWG": 0.95, 'EMT 3/4"': 1.3, 'PVC 1"': 1.1, "6/3 NM-B": 5.5 },
  wireNoun: "Wire",
  catalog: [
    d("pv-module", "PV module", "solar", "PV", "PV", "square", "#ca8a04", "PV wire 10 AWG", "exterior", 240, 90, { description: "Solar panel." }),
    d("pv-mi", "Optimizer / microinverter", "solar", "MI", "MI", "diamond", "#a16207", "PV wire 10 AWG", "exterior", 160, 25, { description: "Electronics under each panel." }),
    d("pv-comb", "Combiner box", "solar", "CB", "COMB", "square", "#854d0e", "THHN 10 AWG", "exterior", 220, 150, { description: "Combines the array's strings." }),
    d("pv-rsd", "Rapid shutdown switch", "solar", "RSD", "RSD", "hexagon", "#dc2626", "THHN 10 AWG", "exterior", 120, 90, { description: "Emergency switch that shuts the array down." }),
    d("pv-disc", "PV disconnect", "solar", "PVD", "PVD", "square", "#713f12", "THHN 8 AWG", "exterior", 140, 120, { description: "Solar disconnect switch." }),
    d("pv-meter", "Production meter", "solar", "PM", "PMTR", "hexagon", "#eab308", "THHN 8 AWG", "exterior", 180, 120, { description: "Meter that measures solar production." }),
    d("pv-batt", "Battery", "solar", "BAT", "BAT", "hexagon", "#facc15", "THHN 6 AWG", "wall", 0, 650, { description: "Home battery." }),
    d("ev-charger", "EV charger (Level 2)", "ev", "EV", "EV", "hexagon", "#65a30d", "6/3 NM-B", "wall", 0, 350, { va: 9600, breakerA: 50, volts: 240, poles: 2, description: "Level 2 electric-vehicle charger (40 A)." }),
    d("ev-outlet", "EV outlet (NEMA 14-50)", "ev", "EVR", "EVR", "hexagon", "#4d7c0f", "6/3 NM-B", "wall", 45, 220, { va: 9600, breakerA: 50, volts: 240, poles: 2, description: "50-amp outlet for a plug-in EV charger." }),
    d("ev-lm", "EV load management", "ev", "LM", "LMGT", "diamond", "#365314", "THHN 10 AWG", "wall", 350, 150, { description: "Shares panel capacity between the charger and the home." }),
  ],
  checklists: [
    {
      id: "pv-install",
      name: "Solar install",
      items: [
        { text: "Roof attachments flashed and sealed", requiresPhoto: true },
        { text: "Rails, modules and optimizers installed per layout", requiresPhoto: true },
        { text: "Array bonded and grounded" },
        { text: "Conduit and wire runs secured; labels applied", requiresPhoto: true },
        { text: "Rapid shutdown installed and tested" },
        { text: "Inverter / battery mounted with clearances", requiresPhoto: true },
      ],
    },
    {
      id: "pv-commission",
      name: "Commissioning & PTO",
      items: [
        { text: "String voltages and polarity checked" },
        { text: "Inverter commissioned; monitoring online" },
        { text: "Placards and labels complete", requiresPhoto: true },
        { text: "Final inspection passed" },
        { text: "Utility permission to operate (PTO) received" },
        { text: "Client shown the monitoring app" },
      ],
    },
  ],
  scanHint:
    "This is a solar / EV installer. Look for PV module layouts, optimizers, combiner boxes, rapid shutdown, disconnects, meters, inverters, batteries and EV chargers.",
};

// ---------------- general / custom ----------------

const GENERAL: TradePack = {
  id: "general",
  name: "General contractor / custom",
  short: "General",
  description: "A blank slate: mark items, notes and punch work on plans, and build your own catalog for any trade.",
  examples: "Your own items · punch work · notes",
  color: "#64748b",
  categories: [{ id: "general", name: "General" }],
  closets: ["equipment"],
  run: { one: "Run", many: "Runs", hint: "item → hub" },
  closetNoun: "hub",
  wireTypes: [],
  wirePrices: {},
  wireNoun: "Run",
  catalog: [
    d("gen-item", "Item", "general", "X", "ITEM", "circle", "#64748b", "None", "other", 0, 0, { description: "Item." }),
    d("gen-fixture", "Fixture", "general", "FX", "FIX", "square", "#475569", "None", "other", 0, 0, { description: "Fixture." }),
    d("gen-appliance", "Appliance", "general", "APP", "APP", "square", "#334155", "None", "floor", 0, 0, { description: "Appliance." }),
    d("gen-door", "Door", "general", "DOR", "DOOR", "diamond", "#78716c", "None", "wall", 0, 0, { description: "Door." }),
    d("gen-window", "Window", "general", "WIN", "WIN", "diamond", "#a8a29e", "None", "wall", 0, 0, { description: "Window." }),
    d("gen-access", "Access panel", "general", "AP", "ACC", "square", "#57534e", "None", "wall", 0, 0, { description: "Access panel." }),
    d("gen-blocking", "Blocking / backing", "general", "BLK", "BLK", "triangle", "#92400e", "None", "wall", 0, 0, { description: "Wood blocking for a future mount." }),
    d("gen-patch", "Patch & repair", "general", "PR", "PATCH", "star", "#b45309", "None", "wall", 0, 0, { description: "Patch and repair." }),
    d("gen-note", "Note / RFI", "general", "N", "NOTE", "star", "#0ea5e9", "None", "other", 0, 0, { description: "A note or question for the plan." }),
  ],
  checklists: [
    {
      id: "gen-walk",
      name: "Site walkthrough",
      items: [
        { text: "Scope reviewed with the client / GC" },
        { text: "Existing conditions photographed", requiresPhoto: true },
        { text: "Access, parking and working hours confirmed" },
        { text: "Permits checked" },
      ],
    },
    {
      id: "gen-closeout",
      name: "Closeout",
      items: [
        { text: "Punch list complete" },
        { text: "Site cleaned", requiresPhoto: true },
        { text: "Manuals, warranties and keys handed over" },
        { text: "Client sign-off" },
      ],
    },
  ],
  scanHint: "",
};

export const TRADE_PACKS: TradePack[] = [LOW_VOLTAGE, ELECTRICAL, FIRE, HVAC, PLUMBING, SOLAR, GENERAL];

// ---------------- helpers ----------------

export function tradePack(id: TradeId | string): TradePack {
  return TRADE_PACKS.find((p) => p.id === id) ?? LOW_VOLTAGE;
}

/** Known trade ids, primary first, no duplicates. Nothing set (older installs) = low voltage only, exactly as before. */
export function normalizeTrades(raw: unknown): TradeId[] {
  const list = Array.isArray(raw) ? raw : [];
  const out: TradeId[] = [];
  for (const t of list) if (typeof t === "string" && (TRADE_IDS as string[]).includes(t) && !out.includes(t as TradeId)) out.push(t as TradeId);
  return out.length ? out : [...DEFAULT_TRADES];
}

export const primaryTrade = (trades: TradeId[]): TradePack => tradePack(normalizeTrades(trades)[0]);
export const hasTrade = (trades: TradeId[], id: TradeId) => normalizeTrades(trades).includes(id);
/** Low voltage only (the original app): screens keep their original wording and layout. */
export const isLowVoltageOnly = (trades: TradeId[]) => {
  const t = normalizeTrades(trades);
  return t.length === 1 && t[0] === "lowvoltage";
};

export interface TradeCategory {
  id: Category;
  name: string;
  color: string;
}

/** Categories the company uses: the primary trade's first (in its order, with its names), then the other trades'. */
export function tradeCategories(trades: TradeId[]): TradeCategory[] {
  const out: TradeCategory[] = [];
  for (const t of normalizeTrades(trades))
    for (const c of tradePack(t).categories) if (!out.some((x) => x.id === c.id)) out.push({ id: c.id, name: c.name, color: categoryOf(c.id).color });
  return out;
}

/** Name and colour of a category for these trades (any category, used or not). Unknown ids read as "General". */
export function tradeCategory(id: Category | string, trades: TradeId[]): TradeCategory {
  const c = tradeCategories(trades).find((x) => x.id === id);
  if (c) return c;
  const base = categoryOf(id);
  return { id: base.id, name: base.name, color: base.color };
}

/** Every category in display order: the company's first, then the rest (for catalog editing and takeoff grouping). */
export function allCategoriesFor(trades: TradeId[]): TradeCategory[] {
  const mine = tradeCategories(trades);
  return [...mine, ...CATEGORIES.filter((c) => !mine.some((m) => m.id === c.id)).map((c) => ({ id: c.id, name: c.name, color: c.color }))];
}

/** Layer toggles: the company's categories plus wiring. */
export function tradeLayers(trades: TradeId[]): { id: Layer; name: string }[] {
  return [...tradeCategories(trades).map((c) => ({ id: c.id as Layer, name: c.name })), { id: "wiring" as Layer, name: primaryTrade(trades).id === "lowvoltage" ? "Wiring" : wiringName(trades) }];
}

function wiringName(trades: TradeId[]): string {
  const p = primaryTrade(trades);
  return p.id === "electrical" ? "Circuits" : p.id === "plumbing" ? "Piping" : p.id === "hvac" ? "Lines" : "Wiring";
}

/** Closet kinds (where runs end) the company places, primary trade's first. */
export function tradeClosetKinds(trades: TradeId[]): ClosetKindInfo[] {
  const ids: ClosetKind[] = [];
  for (const t of normalizeTrades(trades)) for (const k of tradePack(t).closets) if (!ids.includes(k)) ids.push(k);
  return ids.map((k) => closetMeta(k));
}

/** Wire / pipe / line types for these trades, in menu order (low voltage's own list first when it's enabled). */
export function tradeWireTypes(trades: TradeId[]): string[] {
  const out: string[] = [];
  for (const t of normalizeTrades(trades)) for (const w of tradePack(t).wireTypes) if (!out.includes(w)) out.push(w);
  return out;
}

/** Every known wire type from every pack (so a type from another trade still has a colour/prefix). */
export const ALL_WIRE_TYPES: string[] = Array.from(new Set(TRADE_PACKS.flatMap((p) => p.wireTypes)));

const OWNERS = new Map<string, TradeId[]>();
for (const p of TRADE_PACKS) for (const s of p.catalog) OWNERS.set(s.id, [...(OWNERS.get(s.id) ?? []), p.id]);

/** The packs a device type comes from (empty for the company's own types). */
export const typeTrades = (typeId: string): TradeId[] => OWNERS.get(typeId) ?? [];

/**
 * Does this device type belong in the palette for these trades? A pack's own types show when that pack is enabled;
 * the company's own types show when their category is. (Low voltage only: exactly the old palette.)
 */
export function typeVisible(d: Pick<DeviceType, "id" | "category" | "archived">, trades: TradeId[]): boolean {
  if (d.archived) return false;
  const t = normalizeTrades(trades);
  const owners = typeTrades(d.id);
  if (owners.length) return owners.some((o) => t.includes(o));
  return tradeCategories(t).some((c) => c.id === d.category);
}

/** Built-in checklist templates for these trades (the punch list always), primary trade's first. */
export function tradeChecklists(trades: TradeId[]): ChecklistTemplate[] {
  const out: ChecklistTemplate[] = [];
  for (const t of normalizeTrades(trades)) for (const c of tradePack(t).checklists) if (!out.some((x) => x.id === c.id)) out.push(c);
  const punch = CHECKLIST_TEMPLATES.find((c) => c.id === "punch");
  if (punch) out.push(punch);
  return out;
}

/** Words that change with the trade: what a run, a closet and the wire list are called. */
export function tradeVocab(trades: TradeId[]) {
  const p = primaryTrade(trades);
  return { run: p.run.one, runs: p.run.many, runHint: p.run.hint, closet: p.closetNoun, wire: p.wireNoun };
}

/** Client-legend line for a pack's device type. */
export function packDescription(typeId: string): string | undefined {
  for (const p of TRADE_PACKS) {
    const s = p.catalog.find((x) => x.id === typeId);
    if (s?.description) return s.description;
  }
  return undefined;
}

/** Seed → catalog row. */
export function seedToDeviceType(s: TradeSeed, sort: number, updatedAt: string): DeviceType {
  return {
    id: s.id,
    name: s.name,
    category: s.category,
    symbol: s.symbol,
    abbrev: s.abbrev,
    shape: s.shape,
    color: s.color,
    unit: s.unit,
    unitPrice: s.unitPrice,
    laborPrice: s.laborPrice,
    defaultWire: s.defaultWire,
    defaultMount: s.defaultMount,
    kind: s.kind,
    billduProductId: null,
    sort,
    updatedAt,
  };
}

export interface PackAdditions {
  /** Catalog types the company doesn't have yet (never replaces or deletes existing ones). */
  types: DeviceType[];
  /** Archived types of this pack that would be shown again. */
  unarchive: DeviceType[];
  /** $/ft for wire types that have no price yet. */
  wirePrices: Record<string, number>;
  checklists: ChecklistTemplate[];
}

/** What adding a trade brings to this company's catalog and settings: only what's missing. */
export function packAdditions(trade: TradeId, catalog: DeviceType[], wirePrices: Record<string, number>, now: string): PackAdditions {
  const p = tradePack(trade);
  const have = new Map(catalog.map((x) => [x.id, x]));
  let sort = catalog.reduce((m, x) => Math.max(m, x.sort), -1) + 1;
  const types: DeviceType[] = [];
  const unarchive: DeviceType[] = [];
  for (const s of p.catalog) {
    const cur = have.get(s.id);
    if (!cur) types.push(seedToDeviceType(s, sort++, now));
    else if (cur.archived) unarchive.push({ ...cur, archived: false, updatedAt: now });
  }
  const prices: Record<string, number> = {};
  for (const w of p.wireTypes) if (wirePrices[w] == null) prices[w] = p.wirePrices[w] ?? 0;
  return { types, unarchive, wirePrices: prices, checklists: p.checklists };
}

// ---------------- electrical: loads and circuits ----------------

export interface DeviceSpec {
  /** Rough connected load in VA. */
  va: number;
  breakerA: number | null;
  volts: number;
  poles: number;
}

const SPECS = new Map<string, TradeSeed>();
for (const p of TRADE_PACKS) for (const s of p.catalog) if (!SPECS.has(s.id)) SPECS.set(s.id, s);

/** Load and circuit defaults for a device type (pack defaults; the company's own types by category). */
export function deviceSpec(dt: Pick<DeviceType, "id" | "category"> | undefined): DeviceSpec {
  const s = dt ? SPECS.get(dt.id) : undefined;
  if (s && (s.va != null || s.breakerA != null)) {
    const volts = s.volts ?? 120;
    return { va: s.va ?? 0, breakerA: s.breakerA ?? null, volts, poles: s.poles ?? (volts >= 208 ? 2 : 1) };
  }
  const cat = dt?.category;
  if (cat === "power") return { va: 180, breakerA: 20, volts: 120, poles: 1 };
  if (cat === "lighting") return { va: 60, breakerA: 15, volts: 120, poles: 1 };
  if (cat === "ev") return { va: 9600, breakerA: 50, volts: 240, poles: 2 };
  return { va: 0, breakerA: null, volts: 120, poles: 1 };
}

/** The usual copper NM-B size for a breaker (15 A → 14/2 …). */
export function wireForBreaker(breakerA: number, volts = 120): string {
  const cond = volts >= 208 ? 3 : 2;
  if (breakerA <= 15) return `14/${cond} NM-B`;
  if (breakerA <= 20) return `12/${cond} NM-B`;
  if (breakerA <= 30) return `10/${cond} NM-B`;
  if (breakerA <= 40) return "8/3 NM-B";
  return "6/3 NM-B";
}

export const BREAKER_SIZES = [15, 20, 25, 30, 40, 50, 60];

/** Placeholder hint for the AI plan reader's prompt: what to look for, by trade. Empty for low voltage only. */
export function scanHints(trades: TradeId[]): string {
  return normalizeTrades(trades)
    .map((t) => tradePack(t).scanHint)
    .filter(Boolean)
    .join("\n");
}

/** One line describing the company's work, for AI prompts ("a low-voltage / smart-home installer", "an electrical contractor"). */
export function tradeWho(trades: TradeId[]): string {
  const names: Record<TradeId, string> = {
    lowvoltage: "a low-voltage / smart-home installer",
    electrical: "an electrical contractor",
    fire: "a fire alarm contractor",
    hvac: "an HVAC contractor",
    plumbing: "a plumbing contractor",
    solar: "a solar / EV-charging installer",
    general: "a general contractor",
  };
  return normalizeTrades(trades)
    .map((t) => names[t])
    .join(" who is also ");
}

/** Known trade ids from untrusted input (API bodies). Unknown or missing → low voltage. */
export const parseTrades = (raw: unknown): TradeId[] => normalizeTrades(raw);
