import Foundation

// Trade packs: low voltage (the original PinPlan), electrical, fire alarm, HVAC, plumbing, solar & EV, general.
// Same rules as src/lib/trades.ts; the pack data itself (TradePacksData.swift) is generated from the web app's file.
// Categories are one fixed superset shared with the web app and the database; a pack only picks and renames them.

public enum TradeId: String, Codable, CaseIterable, Sendable, Identifiable {
    case lowvoltage, electrical, fire, hvac, plumbing, solar, general
    public var id: String { rawValue }
}

/// A catalog item a pack starts with, plus what the panel schedule needs to know about it.
public struct TradeSeed: Sendable {
    public let type: DeviceType
    public let description: String?
    public let va: Double?
    public let breakerA: Double?
    public let volts: Double?
    public let poles: Int?

    public init(id: String, name: String, category: Category, symbol: String, abbrev: String, shape: MarkerShape, color: String,
                unit: MeasureUnit, defaultWire: String, defaultMount: Mount, kind: DeviceKind, unitPrice: Double, laborPrice: Double,
                description: String?, va: Double?, breakerA: Double?, volts: Double?, poles: Int?) {
        type = DeviceType(id: id, name: name, category: category, symbol: symbol, abbrev: abbrev, shape: shape, color: color, unit: unit,
                          unitPrice: unitPrice, laborPrice: laborPrice, defaultWire: defaultWire, defaultMount: defaultMount, kind: kind,
                          billduProductId: nil, sort: 0, archived: nil, updatedAt: "1970-01-01T00:00:00.000Z")
        self.description = description; self.va = va; self.breakerA = breakerA; self.volts = volts; self.poles = poles
    }

    /// The original low-voltage seed items (prices 0, no electrical data).
    public init(lowVoltage d: DeviceType) {
        type = d; description = nil; va = nil; breakerA = nil; volts = nil; poles = nil
    }
}

public struct TradePack: Sendable, Identifiable {
    public struct CategoryName: Sendable { public let id: Category; public let name: String }
    public struct RunNames: Sendable { public let one: String; public let many: String; public let hint: String }
    public let id: TradeId
    public let name: String
    public let short: String
    public let description: String
    public let examples: String
    public let color: String
    /// Categories this trade uses, in palette order, with this trade's name for each.
    public let categories: [CategoryName]
    public let closets: [ClosetKind]
    public let run: RunNames
    public let closetNoun: String
    public let wireNoun: String
    public let wireTypes: [String]
    public let wirePrices: [String: Double]
    public let catalog: [TradeSeed]
    public let checklists: [FieldDocs.Template]
    public let scanHint: String
}

public struct DeviceSpec: Equatable, Sendable {
    public var va: Double
    public var breakerA: Double?
    public var volts: Double
    public var poles: Int
}

public struct TradeVocab: Equatable, Sendable {
    public let run: String
    public let runs: String
    public let runHint: String
    public let closet: String
    public let wire: String
}

public enum Trades {
    public static let defaultTrades: [TradeId] = [.lowvoltage]

    public static func pack(_ id: TradeId) -> TradePack { packs.first { $0.id == id } ?? packs[0] }

    /// Known ids, primary first, no duplicates. Nothing set = low voltage only (the app as it always was).
    public static func normalize(_ raw: [String]?) -> [TradeId] {
        var out: [TradeId] = []
        for s in raw ?? [] { if let t = TradeId(rawValue: s), !out.contains(t) { out.append(t) } }
        return out.isEmpty ? defaultTrades : out
    }
    public static func normalize(_ ids: [TradeId]) -> [TradeId] { normalize(ids.map(\.rawValue)) }

    public static func primary(_ trades: [TradeId]) -> TradePack { pack(normalize(trades)[0]) }
    public static func isLowVoltageOnly(_ trades: [TradeId]) -> Bool { normalize(trades) == [.lowvoltage] }

    /// The company's categories: primary trade's first (its names), then the others'.
    public static func categories(for trades: [TradeId]) -> [CategoryInfo] {
        var out: [CategoryInfo] = []
        for t in normalize(trades) {
            for c in pack(t).categories where !out.contains(where: { $0.id == c.id }) {
                out.append(CategoryInfo(id: c.id, name: c.name, color: Catalog.info(c.id).color))
            }
        }
        return out
    }

    /// Any category, named for these trades.
    public static func category(_ id: Category, for trades: [TradeId]) -> CategoryInfo {
        categories(for: trades).first { $0.id == id } ?? Catalog.info(id)
    }

    /// Every category: the company's first, then the rest.
    public static func allCategories(for trades: [TradeId]) -> [CategoryInfo] {
        let mine = categories(for: trades)
        return mine + Catalog.categories.filter { c in !mine.contains { $0.id == c.id } }
    }

    public struct LayerInfo: Sendable, Identifiable { public let id: Layer; public let name: String }

    /// Layer toggles: the company's categories plus wiring.
    public static func layers(for trades: [TradeId]) -> [LayerInfo] {
        let p = primary(trades)
        let wiring = p.id == .electrical ? "Circuits" : p.id == .plumbing ? "Piping" : p.id == .hvac ? "Lines" : "Wiring"
        return categories(for: trades).compactMap { c in Layer(rawValue: c.id.rawValue).map { LayerInfo(id: $0, name: c.name) } }
            + [LayerInfo(id: .wiring, name: wiring)]
    }

    public static func closetKinds(for trades: [TradeId]) -> [Catalog.ClosetInfo] {
        var ids: [ClosetKind] = []
        for t in normalize(trades) { for k in pack(t).closets where !ids.contains(k) { ids.append(k) } }
        return ids.map(Catalog.closetInfo)
    }

    public static func wireTypes(for trades: [TradeId]) -> [String] {
        var out: [String] = []
        for t in normalize(trades) { for w in pack(t).wireTypes where !out.contains(w) { out.append(w) } }
        return out
    }

    /// The packs a device type comes from (empty for the company's own types).
    public static func typeTrades(_ typeId: String) -> [TradeId] {
        packs.filter { p in p.catalog.contains { $0.type.id == typeId } }.map(\.id)
    }

    /// In the palette for these trades? A pack's types show when the pack is on; the company's own when their category is.
    public static func typeVisible(_ d: DeviceType, for trades: [TradeId]) -> Bool {
        if d.archived == true { return false }
        let t = normalize(trades)
        let owners = typeTrades(d.id)
        if !owners.isEmpty { return owners.contains { t.contains($0) } }
        return categories(for: t).contains { $0.id == d.category }
    }

    /// Built-in checklist templates for these trades, punch list last.
    public static func checklists(for trades: [TradeId]) -> [FieldDocs.Template] {
        var out: [FieldDocs.Template] = []
        for t in normalize(trades) { for c in pack(t).checklists where !out.contains(where: { $0.id == c.id }) { out.append(c) } }
        if let punch = FieldDocs.templates.first(where: { $0.id == "punch" }) { out.append(punch) }
        return out
    }

    public static func vocab(for trades: [TradeId]) -> TradeVocab {
        let p = primary(trades)
        return TradeVocab(run: p.run.one, runs: p.run.many, runHint: p.run.hint, closet: p.closetNoun, wire: p.wireNoun)
    }

    /// Client-legend line for a pack's device type.
    public static func packDescription(_ typeId: String) -> String? {
        for p in packs { if let s = p.catalog.first(where: { $0.type.id == typeId }), let d = s.description { return d } }
        return nil
    }

    public struct Additions: Sendable {
        public var types: [DeviceType]
        public var unarchive: [DeviceType]
        public var wirePrices: [String: Double]
    }

    /// What adding a trade brings: only what the company doesn't have (never replaces or deletes).
    public static func packAdditions(_ trade: TradeId, catalog: [DeviceType], wirePrices: [String: Double], now: String) -> Additions {
        let p = pack(trade)
        var sort = (catalog.map(\.sort).max() ?? -1) + 1
        var types: [DeviceType] = [], unarchive: [DeviceType] = []
        for s in p.catalog {
            if let cur = catalog.first(where: { $0.id == s.type.id }) {
                if cur.archived == true { var u = cur; u.archived = false; u.updatedAt = now; unarchive.append(u) }
            } else {
                var d = s.type; d.sort = sort; d.updatedAt = now; sort += 1
                types.append(d)
            }
        }
        var prices: [String: Double] = [:]
        for w in p.wireTypes where wirePrices[w] == nil { prices[w] = p.wirePrices[w] ?? 0 }
        return Additions(types: types, unarchive: unarchive, wirePrices: prices)
    }

    /// Load and circuit defaults for a device type (pack data; the company's own types by category).
    public static func deviceSpec(_ d: DeviceType?) -> DeviceSpec {
        if let d, let s = packs.lazy.compactMap({ $0.catalog.first { $0.type.id == d.id } }).first, s.va != nil || s.breakerA != nil {
            let volts = s.volts ?? 120
            return DeviceSpec(va: s.va ?? 0, breakerA: s.breakerA, volts: volts, poles: s.poles ?? (volts >= 208 ? 2 : 1))
        }
        switch d?.category {
        case .power?: return DeviceSpec(va: 180, breakerA: 20, volts: 120, poles: 1)
        case .lighting?: return DeviceSpec(va: 60, breakerA: 15, volts: 120, poles: 1)
        case .ev?: return DeviceSpec(va: 9600, breakerA: 50, volts: 240, poles: 2)
        default: return DeviceSpec(va: 0, breakerA: nil, volts: 120, poles: 1)
        }
    }

    /// The usual copper NM-B size for a breaker.
    public static func wireForBreaker(_ amps: Double, volts: Double = 120) -> String {
        let cond = volts >= 208 ? 3 : 2
        if amps <= 15 { return "14/\(cond) NM-B" }
        if amps <= 20 { return "12/\(cond) NM-B" }
        if amps <= 30 { return "10/\(cond) NM-B" }
        if amps <= 40 { return "8/3 NM-B" }
        return "6/3 NM-B"
    }

    public static let breakerSizes: [Double] = [15, 20, 25, 30, 40, 50, 60]
}
