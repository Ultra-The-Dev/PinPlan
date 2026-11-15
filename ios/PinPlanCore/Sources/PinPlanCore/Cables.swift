import Foundation

public extension Marker {
    /// Cables pulled to this device; repeats mean several of that type. Falls back to the single wire type. "None" = no cable.
    var cables: [String] {
        let list = (wires?.isEmpty == false) ? wires! : [wireType]
        return list.filter { !$0.isEmpty && $0 != "None" }
    }

    /// Set the device's cables (keeps `wireType` = the first one, for older readers).
    mutating func setCables(_ list: [String]) {
        let c = list.filter { !$0.isEmpty && $0 != "None" }
        wires = c.count > 1 ? c : nil
        wireType = c.first ?? "None"
    }
}

public extension Run {
    /// Cables this run carries: its bundle, else its single wire type.
    var cables: [String] {
        if let w = wireTypes, !w.isEmpty { return w }
        return [wireType?.isEmpty == false ? wireType! : "Unspecified"]
    }
}

public struct CableCount: Hashable, Identifiable, Sendable {
    public var type: String
    public var count: Int
    public var id: String { type }
}

public enum Cables {
    /// Cable products live in the product library under "wire:<cable type>" (e.g. "wire:Cat6").
    public static let productPrefix = "wire:"
    public static func productKey(_ cableType: String) -> String { productPrefix + cableType }
    public static func cableType(fromKey key: String) -> String? { key.hasPrefix(productPrefix) ? String(key.dropFirst(productPrefix.count)) : nil }

    /// "cat 6", "CAT6 cable", "hdmi" → the cable type name, if it is one.
    public static func matchCable(_ text: String) -> String? {
        func norm(_ s: String) -> String { s.lowercased().replacingOccurrences(of: "cable", with: "").replacingOccurrences(of: "wire", with: "").filter { $0.isLetter || $0.isNumber || $0 == "/" || $0 == "+" } }
        let t = norm(text)
        guard !t.isEmpty else { return nil }
        return Catalog.wireTypes.filter { $0 != "None" }.first { norm($0) == t }
    }

    /// HDMI ×1, Cat6 ×2 — in first-seen order.
    public static func counts(_ list: [String]) -> [CableCount] {
        var order: [String] = []
        var n: [String: Int] = [:]
        for c in list { if n[c] == nil { order.append(c) }; n[c, default: 0] += 1 }
        return order.map { CableCount(type: $0, count: n[$0]!) }
    }

    /// "HDMI + 2× Cat6", or "No cable".
    public static func summary(_ list: [String]) -> String {
        let c = counts(list)
        if c.isEmpty { return "No cable" }
        return c.map { $0.count > 1 ? "\($0.count)× \($0.type)" : $0.type }.joined(separator: " + ")
    }

    /// Change how many of one cable type are in a bundle (0 removes it), keeping the order.
    public static func setting(_ type: String, count: Int, in list: [String]) -> [String] {
        let current = counts(list)
        var out: [String] = []
        var placed = false
        for c in current {
            let t = c.type, n = c.count
            if t == type { out += Array(repeating: t, count: max(0, count)); placed = true } else { out += Array(repeating: t, count: n) }
        }
        if !placed && count > 0 { out += Array(repeating: type, count: count) }
        return out
    }
}
