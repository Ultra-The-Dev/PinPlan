import Foundation

public struct CategoryInfo: Sendable {
    public let id: Category; public let name: String; public let color: String
    public init(id: Category, name: String, color: String) { self.id = id; self.name = name; self.color = color }
}

public enum Catalog {
    public static let categories: [CategoryInfo] = [
        .init(id: .security, name: "Security", color: "#dc2626"),
        .init(id: .network, name: "Network", color: "#2563eb"),
        .init(id: .audio, name: "Audio", color: "#7c3aed"),
        .init(id: .video, name: "Video", color: "#0891b2"),
        .init(id: .smarthome, name: "Smart home", color: "#059669"),
        .init(id: .lighting, name: "Lighting", color: "#d97706"),
        .init(id: .shades, name: "Shades", color: "#db2777"),
        .init(id: .infrastructure, name: "Infrastructure", color: "#16a34a"),
        // Other trades (default names; a trade pack can rename them — Trades.swift). Same as src/lib/catalog.ts.
        .init(id: .power, name: "Receptacles", color: "#c2410c"),
        .init(id: .switching, name: "Switches & controls", color: "#4f46e5"),
        .init(id: .panels, name: "Panels & equipment", color: "#334155"),
        .init(id: .fire, name: "Fire & life safety", color: "#e11d48"),
        .init(id: .hvac, name: "HVAC", color: "#0284c7"),
        .init(id: .plumbing, name: "Plumbing", color: "#0d9488"),
        .init(id: .solar, name: "Solar", color: "#ca8a04"),
        .init(id: .ev, name: "EV charging", color: "#65a30d"),
        .init(id: .general, name: "General", color: "#64748b"),
    ]

    /// The low-voltage categories (the original catalog), in their original order.
    public static let lowVoltageCategories: [Category] = [.security, .network, .audio, .video, .smarthome, .lighting, .shades, .infrastructure]

    public static func info(_ c: Category) -> CategoryInfo { categories.first { $0.id == c } ?? categories[categories.count - 1] }

    public static let layerNames: [Layer: String] = [
        .security: "Security", .network: "Network", .audio: "Audio", .video: "Video", .smarthome: "Smart home",
        .lighting: "Lighting", .shades: "Shades", .infrastructure: "Infrastructure", .wiring: "Wiring",
        .power: "Receptacles", .switching: "Switches & controls", .panels: "Panels & equipment", .fire: "Fire & life safety",
        .hvac: "HVAC", .plumbing: "Plumbing", .solar: "Solar", .ev: "EV charging", .general: "General",
    ]

    public static let wireTypes = ["Cat6", "16/4 speaker", "HDMI", "HDMI + Cat6", "18/2", "LV per driver", "LV per manufacturer", "Coax", "Fiber", "22/4 alarm", "None"]

    public struct ClosetInfo: Sendable {
        public let id: ClosetKind; public let name: String; public let abbrev: String; public let color: String
        /// Layer / palette section it belongs to, and one line for the client legend.
        public var category: Category = .infrastructure
        public var description: String = "Where the equipment and cables come together."
    }
    public static let closetKinds: [ClosetInfo] = [
        .init(id: .equipment, name: "Equipment closet", abbrev: "EQ", color: "#16a34a"),
        .init(id: .switch, name: "Switch closet", abbrev: "SW", color: "#15803d"),
        .init(id: .rack, name: "Network rack", abbrev: "RK", color: "#166534"),
        // Other trades (same as CLOSET_KINDS in src/lib/catalog.ts).
        .init(id: .panel, name: "Main panel", abbrev: "MP", color: "#1e293b", category: .panels, description: "The main electrical panel, where the circuits start."),
        .init(id: .subpanel, name: "Subpanel", abbrev: "SP", color: "#475569", category: .panels, description: "A second electrical panel, fed from the main panel."),
        .init(id: .facp, name: "Fire alarm control panel", abbrev: "FACP", color: "#be123c", category: .fire, description: "The fire alarm control panel that monitors every device."),
        .init(id: .nac, name: "NAC / power extender", abbrev: "NAC", color: "#9f1239", category: .fire, description: "Power supply for the horns and strobes."),
        .init(id: .airhandler, name: "Air handler / furnace", abbrev: "AH", color: "#0369a1", category: .hvac, description: "The indoor heating and cooling unit."),
        .init(id: .condenser, name: "Condenser / heat pump", abbrev: "CU", color: "#075985", category: .hvac, description: "The outdoor cooling / heat-pump unit."),
        .init(id: .waterheater, name: "Water heater", abbrev: "WH", color: "#0f766e", category: .plumbing, description: "The water heater."),
        .init(id: .manifold, name: "Manifold", abbrev: "MAN", color: "#115e59", category: .plumbing, description: "Where the water lines branch out to the fixtures."),
        .init(id: .inverter, name: "Inverter / battery", abbrev: "INV", color: "#a16207", category: .solar, description: "The solar inverter and battery storage."),
    ]
    public static func closetInfo(_ k: ClosetKind) -> ClosetInfo { closetKinds.first { $0.id == k } ?? closetKinds[0] }
    /// The closet kinds that get a panel schedule.
    public static let panelKinds: [ClosetKind] = [.panel, .subpanel]

    private static func t(_ id: String, _ name: String, _ cat: Category, _ symbol: String, _ abbrev: String, _ shape: MarkerShape, _ color: String,
                          _ unit: MeasureUnit, _ wire: String, _ mount: Mount, _ kind: DeviceKind, _ sort: Int,
                          price: Double = 0, labor: Double = 0) -> DeviceType {
        DeviceType(id: id, name: name, category: cat, symbol: symbol, abbrev: abbrev, shape: shape, color: color, unit: unit,
                   unitPrice: price, laborPrice: labor, defaultWire: wire, defaultMount: mount, kind: kind, billduProductId: nil,
                   sort: sort, archived: nil, updatedAt: "1970-01-01T00:00:00.000Z")
    }

    /// The generic Door and Window types (the General pack's): "openings", reference counts every trade can place and
    /// count with Find similar. In every company's palette; off quotes until they have a price. Same as the web app.
    public static let openingTypeIds = ["gen-door", "gen-window"]

    /// The alarm items added to the original catalog later, in catalog order.
    public static let alarmSeedIds = ["door-contact", "window-contact", "glass-break", "motion", "siren", "alarm-keypad"]

    /// Client-legend lines for the original catalog's items that have one (the alarm items).
    public static let seedDescriptions: [String: String] = [
        "door-contact": "Alarm sensor that trips when the door opens.",
        "window-contact": "Alarm sensor that trips when the window opens.",
        "glass-break": "Alarm sensor that hears glass breaking in the room.",
        "motion": "Alarm sensor that sees movement in the room.",
        "siren": "Sounds when the alarm goes off.",
        "alarm-keypad": "Arms and disarms the alarm.",
    ]

    /// Starting catalog from PLAN.md (same ids as the web app). Prices start at 0, except the alarm items added later
    /// (US starting prices, device and labor).
    public static func seed() -> [DeviceType] {
        var i = 0
        func n() -> Int { defer { i += 1 }; return i }
        return [
            t("cam-indoor", "Indoor camera", .security, "C", "CAM", .circle, "#dc2626", .each, "Cat6", .ceiling, .device, n()),
            t("cam-outdoor", "Outdoor camera", .security, "OC", "OCAM", .triangle, "#b91c1c", .each, "Cat6", .exterior, .device, n()),
            t("vs", "Camera monitor / iPad display (VS)", .security, "VS", "VS", .square, "#ef4444", .each, "Cat6", .wall, .device, n()),
            t("wap", "Wi-Fi access point", .network, "W", "WAP", .circle, "#2563eb", .each, "Cat6", .ceiling, .device, n()),
            t("net-switch", "Network switch", .network, "NS", "NSW", .square, "#1d4ed8", .each, "Cat6", .other, .device, n()),
            t("data-drop", "Data drop (Cat6 jack)", .network, "D", "DATA", .diamond, "#3b82f6", .each, "Cat6", .wall, .device, n()),
            t("speaker", "In-ceiling speaker", .audio, "S", "SPK", .circle, "#7c3aed", .each, "16/4 speaker", .ceiling, .device, n()),
            t("tv", "TV location", .video, "TV", "TV", .square, "#0891b2", .each, "HDMI + Cat6", .wall, .device, n()),
            t("sh", "Smart-home control point (SH)", .smarthome, "SH", "SH", .hexagon, "#059669", .each, "Cat6", .wall, .device, n()),
            t("keypad", "Keypad", .smarthome, "K", "KP", .square, "#10b981", .each, "Cat6", .wall, .device, n()),
            t("led-ceiling", "LED strip — ceiling moulding", .lighting, "L", "LED", .diamond, "#d97706", .LF, "LV per driver", .ceiling, .led, n()),
            t("led-furniture", "LED strip — furniture", .lighting, "L", "LEDF", .diamond, "#ea580c", .LF, "LV per driver", .other, .led, n()),
            t("led-cabinet", "LED strip — cabinet", .lighting, "L", "LEDC", .diamond, "#f59e0b", .LF, "LV per driver", .cabinet, .led, n()),
            t("led-bench", "LED strip — bench", .lighting, "L", "LEDB", .diamond, "#ca8a04", .LF, "LV per driver", .other, .led, n()),
            t("led-bed", "LED strip — bed backlit", .lighting, "L", "LEDBD", .diamond, "#b45309", .LF, "LV per driver", .other, .led, n()),
            t("led-stair", "Stair-step LED", .lighting, "ST", "STAIR", .diamond, "#f97316", .LF, "LV per driver", .floor, .led, n()),
            t("led-spot-ceiling", "Ceiling LED spot", .lighting, "LS", "LSP", .star, "#eab308", .each, "18/2", .ceiling, .device, n()),
            t("led-driver", "LED zone / driver", .lighting, "DR", "DRV", .square, "#a16207", .each, "18/2", .other, .device, n()),
            t("shade", "Motorized curtain / shade", .shades, "M", "SHD", .square, "#db2777", .each, "LV per manufacturer", .wall, .device, n()),
            // Security: intrusion alarm (after the original items, so their sort order stays).
            t("door-contact", "Door contact", .security, "DC", "DC", .square, "#991b1b", .each, "22/4 alarm", .wall, .device, n(), price: 8, labor: 45),
            t("window-contact", "Window contact", .security, "WC", "WC", .square, "#f87171", .each, "22/4 alarm", .wall, .device, n(), price: 8, labor: 45),
            t("glass-break", "Glass-break detector", .security, "GB", "GB", .hexagon, "#be123c", .each, "22/4 alarm", .ceiling, .device, n(), price: 45, labor: 55),
            t("motion", "Motion detector", .security, "MD", "PIR", .triangle, "#e11d48", .each, "22/4 alarm", .wall, .device, n(), price: 35, labor: 55),
            t("siren", "Siren", .security, "SR", "SIR", .star, "#7f1d1d", .each, "22/4 alarm", .wall, .device, n(), price: 25, labor: 55),
            t("alarm-keypad", "Alarm keypad", .security, "AK", "AKP", .square, "#b91c1c", .each, "22/4 alarm", .wall, .device, n(), price: 140, labor: 75),
        ]
    }

    public static let defaultPricing = PricingSettings(
        markupPct: 0, taxPct: 0, laborMode: .combined,
        wirePrices: ["Cat6": 0, "16/4 speaker": 0, "HDMI + Cat6": 0, "18/2": 0, "LV per driver": 0, "LV per manufacturer": 0, "Coax": 0, "Fiber": 0, "22/4 alarm": 0.2],
        wireSlackPct: 10, wireDropFt: 10, floorHeightFt: 10, includeTentative: false, currency: "USD")
}
