import Foundation

/// View (read the plan: tap for details, nothing moves) or Edit (place, draw, drag, delete).
public enum PlanViewerMode: String, Codable, CaseIterable, Sendable {
    case view, edit

    /// Technicians open plans to read them; owners and the office to mark them up.
    public static func defaultMode(for role: TeamRole?) -> PlanViewerMode { role == .tech ? .view : .edit }
}

/// Which tentative (?) devices to show.
public enum TentativeFilter: String, Codable, CaseIterable, Sendable {
    case all, confirmed, tentative

    public var title: String {
        switch self {
        case .all: return "All"
        case .confirmed: return "Confirmed"
        case .tentative: return "Tentative"
        }
    }
}

/// Plan layers and filters, remembered per job. Hiding never changes counts: the takeoff always counts everything.
public struct PlanFilter: Codable, Hashable, Sendable {
    /// Hidden trade layers (device categories) and `.wiring`.
    public var hiddenLayers: Set<Layer> = []
    /// Hidden device types (catalog ids).
    public var hiddenTypes: Set<String> = []
    public var tentative: TentativeFilter = .all
    /// Only these rooms (empty = every room).
    public var rooms: Set<String> = []
    /// Closets, panels and equipment.
    public var showClosets = true
    /// Device labels (C1, W2…) and run labels under the symbols.
    public var showLabels = false

    public init() {}

    /// Anything hidden or filtered (labels don't count: they hide nothing).
    public var isFiltering: Bool { !hiddenLayers.isEmpty || !hiddenTypes.isEmpty || tentative != .all || !rooms.isEmpty || !showClosets }

    /// Back to everything visible (keeps the labels choice).
    public mutating func reset() {
        let labels = showLabels
        self = PlanFilter()
        showLabels = labels
    }

    public func isLayerVisible(_ l: Layer) -> Bool { !hiddenLayers.contains(l) }

    public mutating func setLayer(_ l: Layer, visible: Bool) {
        if visible { hiddenLayers.remove(l) } else { hiddenLayers.insert(l) }
    }

    public mutating func setType(_ id: String, visible: Bool) {
        if visible { hiddenTypes.remove(id) } else { hiddenTypes.insert(id) }
    }

    public mutating func toggleRoom(_ room: String) {
        if rooms.contains(room) { rooms.remove(room) } else { rooms.insert(room) }
    }

    /// Whether a device shows. `category` is its type's category (nil for an unknown type, which shows unless
    /// filtered by type, tentative or room).
    public func shows(_ m: Marker, category: Category?) -> Bool {
        if let c = category, hiddenLayers.contains(Layer(rawValue: c.rawValue) ?? .general) { return false }
        if hiddenTypes.contains(m.deviceTypeId) { return false }
        switch tentative {
        case .all: break
        case .confirmed: if m.tentative { return false }
        case .tentative: if !m.tentative { return false }
        }
        if !rooms.isEmpty && !rooms.contains(m.room) { return false }
        return true
    }

    /// Runs: wires on the wiring layer, LED and stair runs on lighting (and their LED type's own toggle).
    public func shows(_ r: Run) -> Bool {
        if hiddenLayers.contains(r.kind == .wire ? .wiring : .lighting) { return false }
        if let t = r.deviceTypeId, hiddenTypes.contains(t) { return false }
        switch tentative {
        case .all: break
        case .confirmed: if r.tentative == true { return false }
        case .tentative: if r.tentative != true { return false }
        }
        return true
    }

    /// Closets: the closet toggle and their trade's layer.
    public func shows(closetCategory: Category) -> Bool {
        showClosets && !hiddenLayers.contains(Layer(rawValue: closetCategory.rawValue) ?? .infrastructure)
    }

    // MARK: counts for the layers panel

    public struct Counts: Hashable, Sendable {
        public var byLayer: [Layer: Int] = [:]
        public var byType: [String: Int] = [:]
        public var byRoom: [String: Int] = [:]
        public var tentative = 0
        public var total = 0
        public var shown = 0
        public var wires = 0
        public var closets = 0
    }

    /// Counts of devices on a sheet (all of them, whatever is hidden) and how many show with this filter.
    public func counts(markers: [Marker], runs: [Run] = [], closets: [Closet] = [], category: (String) -> Category?) -> Counts {
        var c = Counts()
        for m in markers {
            let cat = category(m.deviceTypeId)
            if let cat { c.byLayer[Layer(rawValue: cat.rawValue) ?? .general, default: 0] += 1 }
            c.byType[m.deviceTypeId, default: 0] += 1
            if !m.room.isEmpty { c.byRoom[m.room, default: 0] += 1 }
            if m.tentative { c.tentative += 1 }
            c.total += 1
            if shows(m, category: cat) { c.shown += 1 }
        }
        c.wires = runs.filter { $0.kind == .wire }.count
        c.byLayer[.wiring, default: 0] += c.wires
        c.closets = closets.count
        return c
    }

    /// Rooms on a sheet, A→Z.
    public static func rooms(in markers: [Marker]) -> [String] {
        Array(Set(markers.map(\.room).filter { !$0.isEmpty })).sorted { $0.localizedStandardCompare($1) == .orderedAscending }
    }
}

/// Sheet browser helpers: order, neighbours, search and the recently viewed list.
public enum SheetNav {
    /// Sheets in plan-set order.
    public static func ordered(_ sheets: [Sheet]) -> [Sheet] {
        sheets.sorted { ($0.order, $0.pageNumber, $0.name) < ($1.order, $1.pageNumber, $1.name) }
    }

    /// The sheet `delta` places from `id` (nil past either end).
    public static func neighbor(of id: String?, in sheets: [Sheet], delta: Int) -> Sheet? {
        let s = ordered(sheets)
        guard let id, let i = s.firstIndex(where: { $0.id == id }) else { return nil }
        let j = i + delta
        return s.indices.contains(j) ? s[j] : nil
    }

    /// "2 of 5".
    public static func position(of id: String?, in sheets: [Sheet]) -> (index: Int, count: Int)? {
        let s = ordered(sheets)
        guard let id, let i = s.firstIndex(where: { $0.id == id }) else { return nil }
        return (i + 1, s.count)
    }

    /// Sheets whose name (or page number) matches every word of the query, in order.
    public static func search(_ sheets: [Sheet], query: String) -> [Sheet] {
        let words = query.lowercased().split(whereSeparator: { $0.isWhitespace }).map(String.init)
        guard !words.isEmpty else { return ordered(sheets) }
        return ordered(sheets).filter { s in
            let hay = "\(s.name) page \(s.pageNumber) p\(s.pageNumber) \(s.scaleLabel ?? "")".lowercased()
            return words.allSatisfy { hay.contains($0) }
        }
    }

    /// Most recent first, no repeats, at most `limit`.
    public static func touch(_ id: String, recents: [String], limit: Int = 8) -> [String] {
        Array(([id] + recents.filter { $0 != id }).prefix(limit))
    }

    /// Recent ids that still exist, as sheets.
    public static func recent(_ ids: [String], in sheets: [Sheet]) -> [Sheet] {
        ids.compactMap { id in sheets.first { $0.id == id } }
    }
}
