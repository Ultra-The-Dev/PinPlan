import Foundation

/// Extra labor, prewire and other work added to an estimate in one tap (same as the web app's src/lib/charges.ts).
/// Per-device charges count themselves from the plan: key "custom:<id>@cam-indoor+cam-outdoor".
public struct QuickCharge: Hashable, Identifiable, Sendable, Codable {
    public var id: String
    public var name: String
    public var unit: String
    public var price: Double
    public var countFrom: [String]?
    public init(id: String, name: String, unit: String, price: Double, countFrom: [String]? = nil) {
        self.id = id; self.name = name; self.unit = unit; self.price = price; self.countFrom = countFrom
    }
}

public enum QuickCharges {
    public static let defaults: [QuickCharge] = [
        .init(id: "prewire-cam", name: "Prewire Cat6 to each camera location", unit: "each", price: 180, countFrom: ["cam-indoor", "cam-outdoor"]),
        .init(id: "prewire-spk", name: "Prewire 16/4 and 16/2 to each speaker", unit: "each", price: 100, countFrom: ["speaker"]),
        .init(id: "prewire-wap", name: "Prewire Cat6 to each access point", unit: "each", price: 180, countFrom: ["wap"]),
        .init(id: "prewire-tv", name: "Prewire HDMI + Cat6 to each TV location", unit: "each", price: 0, countFrom: ["tv"]),
        .init(id: "prewire-data", name: "Prewire Cat6 to each data drop", unit: "each", price: 0, countFrom: ["data-drop"]),
        .init(id: "closet", name: "Equipment closet build-out — rack, patch cables and data terminations", unit: "each", price: 4500),
        .init(id: "labor", name: "Additional labor", unit: "hr", price: 0),
        .init(id: "programming", name: "Programming and system setup", unit: "hr", price: 0),
        .init(id: "trip", name: "Trip / service charge", unit: "each", price: 0),
        .init(id: "permit", name: "Permit and filing", unit: "each", price: 0),
    ]

    public static func key(for c: QuickCharge, id: String = newId(8)) -> String {
        if let f = c.countFrom, !f.isEmpty { return "custom:\(id)@\(f.joined(separator: "+"))" }
        return "custom:\(id)"
    }

    public static func linkedTypes(_ key: String) -> [String]? {
        guard key.hasPrefix("custom:"), let at = key.firstIndex(of: "@") else { return nil }
        return key[key.index(after: at)...].split(separator: "+").map(String.init)
    }

    /// Placed (confirmed) devices of these types on the whole job.
    public static func count(_ t: TakeoffBucket, _ ids: [String]) -> Int {
        ids.reduce(0) { $0 + (t.counts[$1] ?? 0) - (t.tentative[$1] ?? 0) }
    }
}
