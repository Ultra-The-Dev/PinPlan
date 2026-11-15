import Foundation

/// Pictograms drawn inside device symbols. Same keys as the web app (src/lib/deviceIcons.ts), so a type's icon
/// carries across backups; each platform draws its own artwork (SF Symbols here).
public enum DeviceIcons {
    public struct Icon: Sendable, Hashable, Identifiable {
        public let key: String
        public let label: String
        public var id: String { key }
    }

    public static let all: [Icon] = [
        ("camera", "Camera"), ("tablet", "Tablet / display"), ("wifi", "Wi-Fi"), ("switch", "Network"), ("jack", "Data jack"),
        ("speaker", "Speaker"), ("tv", "TV"), ("home", "Smart home"), ("keypad", "Keypad"), ("bulb", "Light"),
        ("spot", "Ceiling light"), ("driver", "Driver / module"), ("shade", "Shade"), ("shield", "Security"), ("doorbell", "Doorbell"),
        ("lock", "Lock"), ("sensor", "Sensor"), ("thermostat", "Thermostat"), ("mic", "Microphone"), ("projector", "Projector"),
        ("rack", "Rack"), ("plug", "Outlet"), ("remote", "Remote"), ("sub", "Subwoofer"),
    ].map { Icon(key: $0.0, label: $0.1) }

    /// Starting device types draw their letters (C, W, S, TV…). An icon only shows when one is picked in the catalog.
    public static let defaults: [String: String] = [:]

    /// The pictogram key a device type draws with, or nil to draw its letters.
    public static func key(for t: DeviceType) -> String? {
        if t.icon == "letters" { return nil }
        guard let k = (t.icon?.isEmpty == false ? t.icon : nil) ?? defaults[t.id], all.contains(where: { $0.key == k }) else { return nil }
        return k
    }
}
