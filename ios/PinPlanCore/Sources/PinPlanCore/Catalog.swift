import Foundation

public struct CategoryInfo: Sendable { public let id: Category; public let name: String; public let color: String }

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
    ]

    public static func info(_ c: Category) -> CategoryInfo { categories.first { $0.id == c }! }

    public static let layerNames: [Layer: String] = [
        .security: "Security", .network: "Network", .audio: "Audio", .video: "Video", .smarthome: "Smart home",
        .lighting: "Lighting", .shades: "Shades", .infrastructure: "Infrastructure", .wiring: "Wiring",
    ]

    public static let wireTypes = ["Cat6", "16/4 speaker", "HDMI + Cat6", "18/2", "LV per driver", "LV per manufacturer", "Coax", "Fiber", "None"]

    public struct ClosetInfo: Sendable { public let id: ClosetKind; public let name: String; public let abbrev: String; public let color: String }
    public static let closetKinds: [ClosetInfo] = [
        .init(id: .equipment, name: "Equipment closet", abbrev: "EQ", color: "#16a34a"),
        .init(id: .switch, name: "Switch closet", abbrev: "SW", color: "#15803d"),
        .init(id: .rack, name: "Network rack", abbrev: "RK", color: "#166534"),
    ]
    public static func closetInfo(_ k: ClosetKind) -> ClosetInfo { closetKinds.first { $0.id == k }! }

    private static func t(_ id: String, _ name: String, _ cat: Category, _ symbol: String, _ abbrev: String, _ shape: MarkerShape, _ color: String,
                          _ unit: MeasureUnit, _ wire: String, _ mount: Mount, _ kind: DeviceKind, _ sort: Int) -> DeviceType {
        DeviceType(id: id, name: name, category: cat, symbol: symbol, abbrev: abbrev, shape: shape, color: color, unit: unit,
                   unitPrice: 0, laborPrice: 0, defaultWire: wire, defaultMount: mount, kind: kind, billduProductId: nil,
                   sort: sort, archived: nil, updatedAt: "1970-01-01T00:00:00.000Z")
    }

    /// Starting catalog from PLAN.md (same ids as the web app). Prices start at 0.
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
        ]
    }

    public static let defaultPricing = PricingSettings(
        markupPct: 0, taxPct: 0, laborMode: .combined,
        wirePrices: ["Cat6": 0, "16/4 speaker": 0, "HDMI + Cat6": 0, "18/2": 0, "LV per driver": 0, "LV per manufacturer": 0, "Coax": 0, "Fiber": 0],
        wireSlackPct: 10, wireDropFt: 10, floorHeightFt: 10, includeTentative: false, currency: "USD")
}
