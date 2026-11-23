import Foundation

/// Electrical panel schedule: each panel's circuits with breaker, what they feed, devices, wire and a rough load.
/// Same rules as src/lib/panelSchedule.ts (derived from the plan, like the closet port schedule).
public enum PanelSchedule {
    public static let unassigned = "unassigned"

    public struct Circuit: Hashable, Sendable {
        /// "12", "3/5" (2-pole), "" when not numbered yet, "unassigned" for devices with no circuit.
        public var number: String
        public var breakerA: Double?
        public var volts: Double
        public var poles: Int
        public var description: String
        public var devicesText: String
        public var devices: Int
        public var labels: [String]
        public var wire: String
        public var wireFt: Double?
        public var va: Double
        public var runIds: [String]
        public var tentative: Bool
        public var breakerGuessed: Bool

        public var numberLabel: String { number == PanelSchedule.unassigned ? "No circuit" : (number.isEmpty ? "—" : number) }
        public var breakerLabel: String {
            guard let a = breakerA else { return "—" }
            return "\(Wiring.num(a))A" + (poles >= 2 ? " \(poles)P" : "")
        }
    }

    public struct Panel: Hashable, Sendable {
        public var closetId: String
        public var name: String
        public var kind: ClosetKind
        public var floor: String
        public var circuits: [Circuit]
        public var totalVA: Double
        /// totalVA / 240 V, to 0.1 A.
        public var amps240: Double
    }

    /// Breaker spaces a circuit number uses: "3/5" → [3, 5].
    public static func spaces(_ n: String?) -> [Int] {
        (n ?? "").split(whereSeparator: { !$0.isNumber }).compactMap { Int($0) }.filter { $0 > 0 }
    }

    /// Panels that get a schedule: panel/subpanel closets, plus any closet circuits were drawn to.
    public static func panelClosets(_ b: ProjectBundle) -> [Closet] {
        let runs = b.liveRuns
        return b.liveClosets.filter { c in Catalog.panelKinds.contains(c.kind) || runs.contains { $0.kind == .wire && $0.closetId == c.id && $0.circuit != nil } }
    }

    private static func natural(_ a: String, _ b: String) -> Bool { a.localizedStandardCompare(b) == .orderedAscending }

    public static func build(_ b: ProjectBundle, catalog: [DeviceType]) -> [Panel] {
        let markers = b.liveMarkers
        let runs = b.liveRuns.filter { $0.kind == .wire }
        let types = Dictionary(catalog.map { ($0.id, $0) }, uniquingKeysWith: { a, _ in a })
        var out: [Panel] = []
        for panel in panelClosets(b) {
            var order: [String] = []
            var number: [String: String] = [:]
            var info: [String: CircuitInfo] = [:]
            var gRuns: [String: [Run]] = [:]
            var gMarkers: [String: [Marker]] = [:]
            var runKey: [String: String] = [:]
            func touch(_ key: String, _ num: String) {
                if number[key] == nil { number[key] = num; order.append(key) }
            }
            for r in runs where r.closetId == panel.id {
                let marker = markers.first { $0.id == r.markerId }
                let num = (r.circuit?.number ?? "").trimmingCharacters(in: .whitespaces).isEmpty
                    ? (marker?.circuit ?? "").trimmingCharacters(in: .whitespaces)
                    : (r.circuit?.number ?? "").trimmingCharacters(in: .whitespaces)
                let key = num.isEmpty ? "r:\(r.id)" : "n:\(num)"
                touch(key, num)
                gRuns[key, default: []].append(r)
                var i = info[key] ?? CircuitInfo()
                if i.breakerA == nil { i.breakerA = r.circuit?.breakerA }
                if i.volts == nil { i.volts = r.circuit?.volts }
                if i.poles == nil { i.poles = r.circuit?.poles }
                if (i.description ?? "").isEmpty, let d = r.circuit?.description, !d.isEmpty { i.description = d }
                info[key] = i
                runKey[r.id] = key
            }
            for m in markers where m.closetId == panel.id && types[m.deviceTypeId]?.kind != .led {
                let num = (m.circuit ?? "").trimmingCharacters(in: .whitespaces)
                let own = runs.first { $0.markerId == m.id && $0.closetId == panel.id }
                let key = !num.isEmpty ? "n:\(num)" : (own.flatMap { runKey[$0.id] } ?? unassigned)
                touch(key, !num.isEmpty ? num : (key == unassigned ? unassigned : ""))
                if !(gMarkers[key] ?? []).contains(where: { $0.id == m.id }) { gMarkers[key, default: []].append(m) }
            }
            var circuits: [Circuit] = []
            for key in order {
                let ms = gMarkers[key] ?? [], rs = gRuns[key] ?? []
                let i = info[key] ?? CircuitInfo()
                let specs = ms.map { Trades.deviceSpec(types[$0.deviceTypeId]) }
                // A count pin's load counts once per device it stands for.
                var va = 0.0
                for (j, sp) in specs.enumerated() { va += sp.va * Double(ms[j].quantity) }
                let volts = i.volts ?? (specs.contains { $0.volts >= 208 } ? 240 : 120)
                let poles = i.poles.map { Int($0) } ?? (volts >= 208 ? 2 : 1)
                let guess = specs.compactMap(\.breakerA).max()
                let breaker = i.breakerA ?? guess
                var typeCounts: [(String, Int)] = []
                for m in ms {
                    let n = types[m.deviceTypeId]?.name ?? m.deviceTypeId
                    let q = m.quantity
                    if let j = typeCounts.firstIndex(where: { $0.0 == n }) { typeCounts[j].1 += q } else { typeCounts.append((n, q)) }
                }
                let cables = rs.flatMap(\.cables).filter { !$0.isEmpty && $0 != "Unspecified" }
                let wire = mostCommon(cables) ?? mostCommon(ms.map(\.wireType).filter { !$0.isEmpty }) ?? breaker.map { Trades.wireForBreaker($0, volts: volts) } ?? ""
                let lens = rs.compactMap { Geometry.runLengthFt($0) }
                let rooms = Array(Set(ms.map { $0.room.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty })).sorted(by: natural)
                let desc = (i.description ?? "").trimmingCharacters(in: .whitespaces)
                circuits.append(Circuit(
                    number: number[key] ?? "", breakerA: breaker, volts: volts, poles: poles,
                    description: desc.isEmpty ? rooms.joined(separator: ", ") : desc,
                    devicesText: typeCounts.map { "\($0.1) × \($0.0)" }.joined(separator: ", "),
                    devices: ms.quantitySum, labels: ms.map(\.pinLabel).sorted(by: natural), wire: wire,
                    wireFt: lens.isEmpty ? nil : (lens.reduce(0, +) * 10).rounded() / 10, va: va, runIds: rs.map(\.id),
                    tentative: ms.isEmpty ? rs.allSatisfy { $0.tentative == true } : ms.allSatisfy(\.tentative),
                    breakerGuessed: i.breakerA == nil && guess != nil))
            }
            func rank(_ c: Circuit) -> Int { c.number == unassigned ? 2 : (spaces(c.number).isEmpty ? 1 : 0) }
            circuits = circuits.enumerated().sorted { x, y in
                let a = x.element, b = y.element
                if rank(a) != rank(b) { return rank(a) < rank(b) }
                let sa = spaces(a.number).first ?? 0, sb = spaces(b.number).first ?? 0
                if sa != sb { return sa < sb }
                if a.description != b.description { return natural(a.description, b.description) }
                return x.offset < y.offset
            }.map(\.element)
            let total = circuits.reduce(0) { $0 + $1.va }
            out.append(Panel(closetId: panel.id, name: panel.name, kind: panel.kind, floor: b.sheets.first { $0.id == panel.sheetId }?.name ?? "",
                             circuits: circuits, totalVA: total, amps240: (total / 240 * 10).rounded() / 10))
        }
        return out
    }

    private static func mostCommon(_ xs: [String]) -> String? {
        var n: [(String, Int)] = []
        for x in xs { if let i = n.firstIndex(where: { $0.0 == x }) { n[i].1 += 1 } else { n.append((x, 1)) } }
        guard let top = n.map(\.1).max() else { return nil }
        return n.first { $0.1 == top }?.0
    }

    /// Numbers for circuits that have none: the next free spaces (a 2-pole breaker takes n and n+2). Run id → number.
    public static func numberCircuits(_ p: Panel) -> [String: String] {
        var used = Set(p.circuits.flatMap { spaces($0.number) })
        var out: [String: String] = [:]
        for c in p.circuits where c.number.isEmpty && !c.runIds.isEmpty {
            var n = 1
            let num: String
            if c.poles >= 2 {
                while used.contains(n) || used.contains(n + 2) { n += 1 }
                used.insert(n); used.insert(n + 2)
                num = "\(n)/\(n + 2)"
            } else {
                while used.contains(n) { n += 1 }
                used.insert(n)
                num = "\(n)"
            }
            for id in c.runIds { out[id] = num }
        }
        return out
    }

    /// A number as the schedule shows it: "20", "1.5" (no trailing zeros), "" for nil.
    public static func number(_ v: Double?) -> String { Wiring.num(v) }

    /// One line under a panel: "12 devices · 3600 VA · 15 A at 240 V".
    public static func totalLine(_ p: Panel) -> String {
        let n = p.circuits.reduce(0) { $0 + $1.devices }
        return "\(n) device\(n == 1 ? "" : "s") · \(number(p.totalVA)) VA · \(number(p.amps240)) A at 240 V"
    }

    public static func csv(_ panels: [Panel]) -> String {
        var rows: [[String]] = [["Panel", "Circuit", "Breaker A", "Poles", "Volts", "Description", "Devices", "Device count", "Wire", "Wire ft", "Load VA"]]
        for p in panels {
            for c in p.circuits {
                rows.append([p.name, c.numberLabel, c.breakerA.map { Wiring.num($0) } ?? "", "\(c.poles)", Wiring.num(c.volts), c.description, c.devicesText,
                             "\(c.devices)", c.wire, c.wireFt.map { Wiring.num($0) } ?? "", Wiring.num(c.va)])
            }
            rows.append([p.name, "Total", "", "", "", "", "", "\(p.circuits.reduce(0) { $0 + $1.devices })", "", "", Wiring.num(p.totalVA)])
        }
        return rows.map { $0.map(csvCell).joined(separator: ",") }.joined(separator: "\n")
    }

    private static func csvCell(_ s: String) -> String {
        s.contains(",") || s.contains("\"") || s.contains("\n") ? "\"\(s.replacingOccurrences(of: "\"", with: "\"\""))\"" : s
    }
}
