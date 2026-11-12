import Foundation

/// Quantities for one floor or the whole project, built only from placed markers and runs.
public struct TakeoffBucket: Hashable, Sendable {
    /// All placed markers per device type (includes tentative).
    public var counts: [String: Int] = [:]
    /// Tentative (?) markers per device type — subset of counts.
    public var tentative: [String: Int] = [:]
    /// Confirmed LED feet per LED type (incl. stair LED).
    public var ledFt: [String: Double] = [:]
    public var ledTentativeFt: [String: Double] = [:]
    /// Distinct confirmed LED zones (runs without a zone count one each).
    public var ledZones = 0
    public var ledTotalFt = 0.0
    public var stairFt = 0.0
    public var stairSteps = 0
    public var wireFt: [String: Double] = [:]
    public var wireRuns: [String: Int] = [:]
    public var closets: [ClosetKind: Int] = [.equipment: 0, .switch: 0, .rack: 0]
    /// Runs with no length yet (no scale, nothing typed).
    public var unmeasuredRuns = 0

    public init() {}

    public func count(_ ids: [String], confirmedOnly: Bool = false) -> Int {
        ids.reduce(0) { $0 + (counts[$1] ?? 0) - (confirmedOnly ? (tentative[$1] ?? 0) : 0) }
    }
}

public struct FloorTakeoff: Hashable, Sendable, Identifiable {
    public var sheetId: String
    public var name: String
    public var bucket: TakeoffBucket
    public var id: String { sheetId }
}

public struct Takeoff: Hashable, Sendable {
    public var floors: [FloorTakeoff]
    public var total: TakeoffBucket
}

private func r1(_ v: Double) -> Double { (v * 10).rounded() / 10 }

public enum TakeoffCalculator {
    public static func compute(_ b: ProjectBundle) -> Takeoff {
        let sheets = b.liveSheets
        var buckets: [String: TakeoffBucket] = Dictionary(uniqueKeysWithValues: sheets.map { ($0.id, TakeoffBucket()) })
        var zones: [String: Set<String>] = Dictionary(uniqueKeysWithValues: sheets.map { ($0.id, Set<String>()) })

        for m in b.liveMarkers where buckets[m.sheetId] != nil {
            buckets[m.sheetId]!.counts[m.deviceTypeId, default: 0] += 1
            if m.tentative { buckets[m.sheetId]!.tentative[m.deviceTypeId, default: 0] += 1 }
        }
        for r in b.liveRuns where buckets[r.sheetId] != nil {
            let len = Geometry.runLengthFt(r)
            if len == nil { buckets[r.sheetId]!.unmeasuredRuns += 1 }
            switch r.kind {
            case .led, .stair:
                let typeId = r.deviceTypeId ?? (r.kind == .stair ? "led-stair" : "led-unassigned")
                let tentative = r.tentative == true
                if !tentative {
                    let z = r.zone?.trimmingCharacters(in: .whitespaces) ?? ""
                    zones[r.sheetId]!.insert(z.isEmpty ? "run:\(r.id)" : "z:\(z)")
                }
                guard let len else { continue }
                if tentative { buckets[r.sheetId]!.ledTentativeFt[typeId, default: 0] += len; continue }
                buckets[r.sheetId]!.ledFt[typeId, default: 0] += len
                buckets[r.sheetId]!.ledTotalFt += len
                if r.kind == .stair {
                    buckets[r.sheetId]!.stairFt += len
                    buckets[r.sheetId]!.stairSteps += r.steps ?? 0
                }
            case .wire:
                let wt = (r.wireType?.isEmpty == false ? r.wireType! : "Unspecified")
                buckets[r.sheetId]!.wireRuns[wt, default: 0] += 1
                if let len { buckets[r.sheetId]!.wireFt[wt, default: 0] += len }
            }
        }
        for c in b.liveClosets where buckets[c.sheetId] != nil { buckets[c.sheetId]!.closets[c.kind, default: 0] += 1 }

        var total = TakeoffBucket()
        var floors: [FloorTakeoff] = []
        for s in sheets {
            var f = buckets[s.id]!
            f.ledZones = zones[s.id]!.count
            f.ledTotalFt = r1(f.ledTotalFt)
            f.stairFt = r1(f.stairFt)
            f.ledFt = f.ledFt.mapValues(r1); f.ledTentativeFt = f.ledTentativeFt.mapValues(r1); f.wireFt = f.wireFt.mapValues(r1)
            for (k, v) in f.counts { total.counts[k, default: 0] += v }
            for (k, v) in f.tentative { total.tentative[k, default: 0] += v }
            for (k, v) in f.ledFt { total.ledFt[k, default: 0] += v }
            for (k, v) in f.ledTentativeFt { total.ledTentativeFt[k, default: 0] += v }
            for (k, v) in f.wireFt { total.wireFt[k, default: 0] += v }
            for (k, v) in f.wireRuns { total.wireRuns[k, default: 0] += v }
            for (k, v) in f.closets { total.closets[k, default: 0] += v }
            total.ledZones += f.ledZones
            total.ledTotalFt += f.ledTotalFt
            total.stairFt += f.stairFt
            total.stairSteps += f.stairSteps
            total.unmeasuredRuns += f.unmeasuredRuns
            floors.append(FloorTakeoff(sheetId: s.id, name: s.name, bucket: f))
        }
        total.ledTotalFt = r1(total.ledTotalFt)
        total.stairFt = r1(total.stairFt)
        total.ledFt = total.ledFt.mapValues(r1); total.ledTentativeFt = total.ledTentativeFt.mapValues(r1); total.wireFt = total.wireFt.mapValues(r1)
        return Takeoff(floors: floors, total: total)
    }

    /// CSV rows per floor plus a whole-project section (same layout as the web app).
    public static func csv(_ t: Takeoff, catalog: [DeviceType]) -> String {
        func name(_ id: String) -> String { catalog.first { $0.id == id }?.name ?? id }
        var rows: [[String]] = [["Floor", "Item", "Unit", "Quantity", "Tentative"]]
        func fmt(_ v: Double) -> String { v == v.rounded() ? String(Int(v)) : String(v) }
        func emit(_ floor: String, _ b: TakeoffBucket) {
            for id in b.counts.keys.sorted() { rows.append([floor, name(id), "each", String(b.counts[id]!), String(b.tentative[id] ?? 0)]) }
            for id in b.ledFt.keys.sorted() { rows.append([floor, name(id), "LF", fmt(b.ledFt[id]!), fmt(b.ledTentativeFt[id] ?? 0)]) }
            rows.append([floor, "LED zones", "each", String(b.ledZones), ""])
            rows.append([floor, "LED total", "LF", fmt(b.ledTotalFt), ""])
            for wt in b.wireFt.keys.sorted() { rows.append([floor, "Wire — \(wt)", "ft", fmt(b.wireFt[wt]!), ""]) }
        }
        for f in t.floors { emit(f.name, f.bucket) }
        emit("Whole project", t.total)
        return CSV.encode(rows)
    }
}

public enum CSV {
    public static func encode(_ rows: [[String]]) -> String {
        rows.map { row in
            row.map { v in
                v.contains(where: { $0 == "," || $0 == "\"" || $0 == "\n" }) ? "\"" + v.replacingOccurrences(of: "\"", with: "\"\"") + "\"" : v
            }.joined(separator: ",")
        }.joined(separator: "\n")
    }
}
