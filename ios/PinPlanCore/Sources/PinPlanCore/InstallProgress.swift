import Foundation

// Install progress and as-built: same rules as src/lib/installProgress.ts. Each device (marker) and run can carry an
// install status (roughed → installed → tested, then verified by the office, or issue) with history, photo proof
// and a test result. Install state never changes what was quoted: Takeoff ignores it.

public enum InstallProgress {
    /// Display order ("issue" is a flag, not a step).
    public static let order: [InstallStatus] = [.planned, .roughed, .installed, .tested, .verified, .issue]

    public static func rank(_ s: InstallStatus) -> Int {
        switch s {
        case .planned: return 0
        case .roughed: return 1
        case .installed: return 2
        case .tested: return 3
        case .verified: return 4
        case .issue: return -1
        }
    }

    /// Hex colours, same as the web app.
    public static func color(_ s: InstallStatus) -> String {
        switch s {
        case .planned: return "#94a3b8"
        case .roughed: return "#f59e0b"
        case .installed: return "#2563eb"
        case .tested: return "#16a34a"
        case .verified: return "#065f46"
        case .issue: return "#dc2626"
        }
    }

    public static func label(_ s: InstallStatus) -> String {
        switch s {
        case .planned: return "Planned"
        case .roughed: return "Roughed"
        case .installed: return "Installed"
        case .tested: return "Tested"
        case .verified: return "Verified"
        case .issue: return "Issue"
        }
    }

    public static let defaultPhotoRequired: [InstallStatus] = [.installed]
    static let maxHistory = 60

    public static func status(_ s: InstallState?) -> InstallStatus { s?.status ?? .planned }
    public static func status(_ m: Marker) -> InstallStatus { status(m.install) }
    public static func status(_ r: Run) -> InstallStatus { status(r.install) }
    public static func isDone(_ s: InstallStatus) -> Bool { s == .tested || s == .verified }
    public static func isInstalled(_ s: InstallStatus) -> Bool { rank(s) >= rank(.installed) }

    // MARK: workflows

    public struct Workflow: Sendable, Equatable {
        public let id: String
        public let steps: [InstallStatus]
        let names: [InstallStatus: String]
        public func label(_ s: InstallStatus) -> String { names[s] ?? InstallProgress.label(s) }
    }

    static func wf(_ id: String, _ steps: [InstallStatus], _ names: [InstallStatus: String]) -> Workflow { Workflow(id: id, steps: steps, names: names) }

    static let electricalCategories: Set<Category> = [.power, .switching, .panels, .ev]
    static let noRoughCategories: Set<Category> = [.infrastructure, .panels]

    /// Steps for a device type (by category and kind) for the company's trades.
    public static func workflow(category: Category?, kind: DeviceKind? = .device, trades: [TradeId] = [.lowvoltage]) -> Workflow {
        let primary = trades.first ?? .lowvoltage
        if kind == .led { return wf("led", [.installed, .tested], [.installed: "Installed", .tested: "Lit & tested"]) }
        let cat = category ?? .general
        let steps: [InstallStatus] = noRoughCategories.contains(cat) ? [.installed, .tested] : [.roughed, .installed, .tested]
        if electricalCategories.contains(cat) || (cat == .lighting && primary == .electrical) {
            return wf("electrical", steps, [.roughed: "Rough-in", .installed: "Trimmed out", .tested: "Tested"])
        }
        switch cat {
        case .fire: return wf("fire", steps, [.roughed: "Rough-in", .installed: "Installed", .tested: "Tested"])
        case .hvac: return wf("hvac", steps, [.roughed: "Rough-in", .installed: "Set", .tested: "Started up"])
        case .plumbing: return wf("plumbing", steps, [.roughed: "Rough-in", .installed: "Set", .tested: "Tested"])
        case .solar: return wf("solar", steps, [.roughed: "Mounted", .installed: "Wired", .tested: "Commissioned"])
        default: return wf("lowvoltage", steps, [.roughed: "Pre-wired", .installed: "Installed", .tested: "Tested"])
        }
    }

    /// Steps for a run: cable pulled → terminated → certified (pipes: run → connected → pressure tested); LED runs skip rough-in.
    public static func workflow(run: RunKind, trades: [TradeId] = [.lowvoltage]) -> Workflow {
        let primary = trades.first ?? .lowvoltage
        switch run {
        case .led, .stair: return wf("led", [.installed, .tested], [.installed: "Installed", .tested: "Lit & tested"])
        case .wire:
            if primary == .plumbing || primary == .hvac { return wf("pipe", [.roughed, .installed, .tested], [.roughed: "Run", .installed: "Connected", .tested: "Pressure tested"]) }
            if primary == .electrical { return wf("circuit", [.roughed, .installed, .tested], [.roughed: "Pulled", .installed: "Terminated", .tested: "Tested"]) }
            return wf("cable", [.roughed, .installed, .tested], [.roughed: "Pulled", .installed: "Terminated", .tested: "Certified"])
        }
    }

    public static func workflow(for m: Marker, catalog: [DeviceType], trades: [TradeId] = [.lowvoltage]) -> Workflow {
        let t = catalog.first { $0.id == m.deviceTypeId }
        return workflow(category: t?.category, kind: t?.kind, trades: trades)
    }

    /// The next field step after `current`; nil once the last step is reached (or verified).
    public static func next(_ current: InstallStatus?, _ w: Workflow) -> InstallStatus? {
        let cur = current ?? .planned
        if cur == .verified { return nil }
        if cur == .issue { return w.steps.first }
        return w.steps.first { rank($0) > rank(cur) }
    }

    // MARK: changes

    /// A new install state with `to` recorded and appended to the history. `test`: nil keeps the current result
    /// unless `clearTest` is set.
    public static func apply(_ state: InstallState?, to: InstallStatus, by: String?, at now: String,
                             photoId: String? = nil, note: String? = nil, test: InstallState.Test? = nil, clearTest: Bool = false) -> InstallState {
        var photos = state?.photoIds ?? []
        if let p = photoId, !p.isEmpty, !photos.contains(p) { photos.append(p) }
        let trimmed = note?.trimmingCharacters(in: .whitespacesAndNewlines)
        let entry = InstallState.Entry(status: to, by: by, at: now, note: (trimmed?.isEmpty ?? true) ? nil : trimmed)
        var history = (state?.history ?? []) + [entry]
        if history.count > maxHistory { history.removeFirst(history.count - maxHistory) }
        return InstallState(status: to, by: by, at: now, photoIds: photos, test: clearTest ? nil : (test ?? state?.test), history: history)
    }

    /// Is a photo required before setting `to`? (Company setting; nil = installed.)
    public static func requiresPhoto(_ setting: [InstallStatus]?, _ to: InstallStatus) -> Bool {
        (setting ?? defaultPhotoRequired).contains(to)
    }

    /// Verifying is office only; technicians set everything else, but can't change a verified device.
    public static func canSet(_ role: TeamRole?, _ to: InstallStatus, from: InstallStatus? = nil) -> Bool {
        guard role == .tech else { return true }
        return to != .verified && from != .verified
    }

    public static func canReset(_ role: TeamRole?) -> Bool { role != .tech }

    /// Tentative and deleted items can't be marked.
    public static func markable(tentative: Bool?, deleted: Bool?) -> Bool { tentative != true && deleted != true }

    // MARK: progress

    public enum GroupBy: String, Sendable, CaseIterable { case sheet, category, closet }

    public struct Counts: Sendable, Equatable {
        public var counts: [InstallStatus: Int] = [:]
        public var total = 0
        public var done: Int { (counts[.tested] ?? 0) + (counts[.verified] ?? 0) }
        public var pct: Int { total > 0 ? Int((Double(done) / Double(total) * 100).rounded()) : 0 }
        public func count(_ s: InstallStatus) -> Int { counts[s] ?? 0 }
        mutating func add(_ s: InstallStatus, _ n: Int = 1) { counts[s, default: 0] += n; total += n }
        public init() {}
    }

    public struct Row: Sendable, Identifiable, Equatable {
        public let id: String
        public let name: String
        public var devices: Counts
        public var runs: Counts
    }

    public static func trackedMarkers(_ markers: [Marker], catalog: [DeviceType]) -> [Marker] {
        let led = Set(catalog.filter { $0.kind == .led }.map(\.id))
        return markers.filter { markable(tentative: $0.tentative, deleted: $0.deleted) && !led.contains($0.deviceTypeId) }
    }

    public static func trackedRuns(_ runs: [Run]) -> [Run] { runs.filter { markable(tentative: $0.tentative, deleted: $0.deleted) } }

    public static func totals(_ markers: [Marker], catalog: [DeviceType]) -> Counts {
        var c = Counts()
        // A count pin (×12) has one status and counts 12 times.
        for m in trackedMarkers(markers, catalog: catalog) { c.add(status(m), m.quantity) }
        return c
    }

    /// Progress grouped by sheet (floor), category or closet; tentative/deleted left out, empty groups hidden.
    public static func progress(markers: [Marker], runs: [Run], sheets: [Sheet], catalog: [DeviceType], by: GroupBy,
                                closets: [Closet] = [], trades: [TradeId]? = nil) -> [Row] {
        struct G { var name: String; var sort: Double; var dev = Counts(); var run = Counts() }
        var groups: [String: G] = [:]
        var order: [String] = []
        let types = Dictionary(catalog.map { ($0.id, $0) }, uniquingKeysWith: { a, _ in a })
        let liveSheets = sheets.filter { $0.deleted != true }
        func key(sheetId: String, closetId: String?, category: Category?, run: RunKind?) -> (String, String, Double)? {
            switch by {
            case .sheet:
                guard let s = liveSheets.first(where: { $0.id == sheetId }) else { return nil }
                return (s.id, s.name, Double(s.order))
            case .closet:
                if let cid = closetId, let c = closets.first(where: { $0.id == cid && $0.deleted != true }) { return (c.id, c.name, 0) }
                return ("none", "No closet", 1)
            case .category:
                if let r = run { return r == .wire ? ("wiring", "Cabling", 1e6) : ("led", "LED", 1e6 - 1) }
                let cat = category ?? .general
                let name = trades.map { Trades.category(cat, for: $0).name } ?? Catalog.info(cat).name
                return (cat.rawValue, name, 0)
            }
        }
        func add(_ k: (String, String, Double), _ s: InstallStatus, isRun: Bool, n: Int = 1) {
            if groups[k.0] == nil { groups[k.0] = G(name: k.1, sort: k.2); order.append(k.0) }
            if isRun { groups[k.0]!.run.add(s) } else { groups[k.0]!.dev.add(s, n) }
        }
        for m in trackedMarkers(markers, catalog: catalog) {
            if let k = key(sheetId: m.sheetId, closetId: m.closetId, category: types[m.deviceTypeId]?.category, run: nil) { add(k, status(m), isRun: false, n: m.quantity) }
        }
        for r in trackedRuns(runs) {
            if let k = key(sheetId: r.sheetId, closetId: r.closetId, category: nil, run: r.kind) { add(k, status(r), isRun: true) }
        }
        return order.compactMap { id -> (String, G)? in groups[id].map { (id, $0) } }
            .filter { $0.1.dev.total + $0.1.run.total > 0 }
            .sorted { a, b in a.1.sort != b.1.sort ? a.1.sort < b.1.sort : a.1.name < b.1.name }
            .map { Row(id: $0.0, name: $0.1.name, devices: $0.1.dev, runs: $0.1.run) }
    }

    public struct Issue: Sendable, Identifiable, Equatable {
        public enum Kind: String, Sendable { case marker, run }
        public let kind: Kind
        public let id: String
        public let sheetId: String
        public let label: String
        public let note: String?
        public let by: String?
        public let at: String?
    }

    /// Devices and runs flagged with an issue, newest first.
    public static func issues(markers: [Marker], runs: [Run]) -> [Issue] {
        func note(_ s: InstallState?) -> String? { s?.history?.last(where: { $0.status == .issue })?.note }
        var out: [Issue] = []
        for m in markers where m.deleted != true && status(m) == .issue {
            out.append(Issue(kind: .marker, id: m.id, sheetId: m.sheetId, label: m.label.isEmpty ? "Device" : m.label, note: note(m.install), by: m.install?.by, at: m.install?.at))
        }
        for r in runs where r.deleted != true && status(r) == .issue {
            let label = r.switchLabel ?? r.zone ?? r.wireType ?? "Run"
            out.append(Issue(kind: .run, id: r.id, sheetId: r.sheetId, label: label, note: note(r.install), by: r.install?.by, at: r.install?.at))
        }
        return out.sorted { ($0.at ?? "") > ($1.at ?? "") }
    }

    /// Installed (installed, tested or verified) devices per device type, tentative left out. For a future
    /// progress-billing integration; not used by invoicing.
    public static func installedQuantities(markers: [Marker], catalog: [DeviceType]) -> [String: Int] {
        var out: [String: Int] = [:]
        for m in trackedMarkers(markers, catalog: catalog) where isInstalled(status(m)) { out[m.deviceTypeId, default: 0] += m.quantity }
        return out
    }

    /// Devices at `s` or further along (issue: exactly issue), for the walk-mode counter.
    public static func countAtLeast(_ markers: [Marker], catalog: [DeviceType], _ s: InstallStatus) -> (n: Int, total: Int) {
        let ms = trackedMarkers(markers, catalog: catalog)
        let n = ms.filter { s == .issue ? status($0) == .issue : rank(status($0)) >= rank(s) }.quantitySum
        return (n, ms.quantitySum)
    }

    /// Index of the point nearest `p` within `maxDist`, or nil.
    public static func nearest(_ points: [(x: Double, y: Double)], to p: (x: Double, y: Double), within maxDist: Double) -> Int? {
        var best: Int?
        var bestD = maxDist
        for (i, q) in points.enumerated() {
            let d = ((q.x - p.x) * (q.x - p.x) + (q.y - p.y) * (q.y - p.y)).squareRoot()
            if d <= bestD { bestD = d; best = i }
        }
        return best
    }

    /// Shortest distance from `p` to a polyline given as flat [x0, y0, x1, y1, …] (same units); infinity if empty.
    public static func distance(to polyline: [Double], from p: (x: Double, y: Double)) -> Double {
        guard polyline.count >= 2 else { return .infinity }
        if polyline.count < 4 { return ((polyline[0] - p.x) * (polyline[0] - p.x) + (polyline[1] - p.y) * (polyline[1] - p.y)).squareRoot() }
        var best = Double.infinity
        var i = 0
        while i + 3 < polyline.count {
            let ax = polyline[i], ay = polyline[i + 1], bx = polyline[i + 2], by = polyline[i + 3]
            let dx = bx - ax, dy = by - ay
            let len2 = dx * dx + dy * dy
            let t = len2 == 0 ? 0 : max(0, min(1, ((p.x - ax) * dx + (p.y - ay) * dy) / len2))
            let cx = ax + t * dx, cy = ay + t * dy
            best = min(best, ((p.x - cx) * (p.x - cx) + (p.y - cy) * (p.y - cy)).squareRoot())
            i += 2
        }
        return best
    }

    /// "Pass · 0.4 dB" / "Fail".
    public static func testText(_ t: InstallState.Test?) -> String {
        guard let t else { return "" }
        let v = t.value?.trimmingCharacters(in: .whitespaces) ?? ""
        return v.isEmpty ? (t.pass ? "Pass" : "Fail") : "\(t.pass ? "Pass" : "Fail") · \(v)"
    }
}
