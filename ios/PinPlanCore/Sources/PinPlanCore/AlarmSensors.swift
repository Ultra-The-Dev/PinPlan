import Foundation

// Alarm sensors from openings (docs/find-similar.md, "Alarm sensors from openings"): after counting doors and windows,
// "Add sensors" places a door contact on each door, a window contact on each window and / or one glass-break per room
// with windows, in one step. Pure; the same rules and cases as src/lib/alarmSensors.ts (tests/alarmSensors.test.ts ↔
// AlarmSensorTests.swift). Counts still come only from placed devices. A count pin (Window ×12) is an opening that
// stands for that many: its contact is one count pin ×12 at the same spot; its windows join its room's glass-break.
public enum AlarmSensors {
    public enum OpeningKind: String, Sendable { case door, window }

    /// door = a door contact on each door; window = a window contact on each window; glass = a glass-break per room.
    public enum SensorKind: String, CaseIterable, Sendable, Identifiable {
        case door, window, glass
        public var id: String { rawValue }
        /// The catalog item it places (the Security items in Catalog.seed()).
        public var typeId: String {
            switch self {
            case .door: return "door-contact"
            case .window: return "window-contact"
            case .glass: return "glass-break"
            }
        }
    }

    private static let notAnOpening = #"\b(contacts?|sensors?|switch(es)?|alarms?|glass|break|detectors?|locks?|strikes?|chimes?|bells?|cameras?|shades?|blinds?|curtains?|films?|tints?|closers?|openers?|operators?|readers?|hardware|stations?|supervision|monitors?)\b"#

    private static func has(_ name: String, _ pattern: String) -> Bool {
        name.range(of: pattern, options: [.regularExpression, .caseInsensitive]) != nil
    }

    /// Is this device type an opening, and which? The generic Door and Window always are; the company's own types
    /// when their name says door or window and nothing else ("Sliding door"), not "Door contact" or "Doorbell".
    public static func openingKind(id: String, name: String) -> OpeningKind? {
        if id == Catalog.openingTypeIds[0] { return .door }
        if id == Catalog.openingTypeIds[1] { return .window }
        if Catalog.alarmSeedIds.contains(id) || has(name, notAnOpening) { return nil }
        if has(name, #"\bdoors?\b"#) { return .door }
        if has(name, #"\bwindows?\b"#) { return .window }
        return nil
    }

    public static func openingKind(_ t: DeviceType?) -> OpeningKind? { t.flatMap { openingKind(id: $0.id, name: $0.name) } }

    /// A door or window placed on a sheet.
    public struct Opening: Equatable, Sendable, Identifiable {
        public var id: String
        public var kind: OpeningKind
        public var x: Double
        public var y: Double
        public var room: String
        /// How many doors / windows this pin stands for (a count pin); 1 for a normal pin.
        public var count: Int
        public init(id: String, kind: OpeningKind, x: Double, y: Double, room: String = "", count: Int = 1) {
            self.id = id; self.kind = kind; self.x = x; self.y = y; self.room = room; self.count = count
        }
    }

    /// Doors / windows behind a list of openings (a count pin counts as its count).
    public static func openingCount(_ openings: [Opening]) -> Int { openings.reduce(0) { $0 + $1.count } }

    /// The doors and windows on one sheet, in placement order.
    public static func sheetOpenings(markers: [Marker], catalog: [DeviceType], sheetId: String) -> [Opening] {
        var kinds: [String: OpeningKind?] = [:]
        for d in catalog { kinds[d.id] = openingKind(d) }
        return markers.compactMap { m in
            guard m.deleted != true, m.sheetId == sheetId, let k = kinds[m.deviceTypeId] ?? nil else { return nil }
            return Opening(id: m.id, kind: k, x: m.x, y: m.y, room: m.room.trimmingCharacters(in: .whitespaces), count: m.quantity)
        }
    }

    /// How far (sheet px) a sensor sits from its opening: 2 ft, or 2.5% of the sheet's long side without a scale.
    public static func offsetPx(width: Double, height: Double, pxPerFt: Double?) -> Double {
        if let s = pxPerFt, s > 0 { return 2 * s }
        return 0.025 * max(width, height)
    }

    /// Windows closer than this (sheet px) share a glass-break when their rooms aren't known: 15 ft, or 6% of the sheet.
    public static func clusterPx(width: Double, height: Double, pxPerFt: Double?) -> Double {
        if let s = pxPerFt, s > 0 { return 15 * s }
        return 0.06 * max(width, height)
    }

    public struct Placement: Equatable, Sendable {
        public var kind: SensorKind
        public var deviceTypeId: String
        public var x: Double
        public var y: Double
        public var room: String
        /// The door, the window, or the windows of the room (glass-break).
        public var openingIds: [String]
        /// Sensors this placement stands for: a count pin's contact is one count pin ×N; glass-breaks 1.
        public var count: Int = 1
    }

    public struct Plan: Equatable, Sendable {
        public var placements: [Placement] = []
        /// Sensors to place per kind (only the kinds asked for).
        public var counts: [SensorKind: Int] = [.door: 0, .window: 0, .glass: 0]
        /// Openings (door / window) or rooms (glass) that already have that sensor.
        public var covered: [SensorKind: Int] = [.door: 0, .window: 0, .glass: 0]
        public func count(_ k: SensorKind) -> Int { counts[k] ?? 0 }
        public init() {}
    }

    /// An existing device on the plan (only its type, place, room and sheet matter).
    public struct Placed: Sendable {
        public var sheetId: String, deviceTypeId: String, x: Double, y: Double, room: String
        public init(sheetId: String, deviceTypeId: String, x: Double, y: Double, room: String = "") {
            self.sheetId = sheetId; self.deviceTypeId = deviceTypeId; self.x = x; self.y = y; self.room = room
        }
        public init(_ m: Marker) { self.init(sheetId: m.sheetId, deviceTypeId: m.deviceTypeId, x: m.x, y: m.y, room: m.room) }
    }

    private static func clamp01(_ v: Double) -> Double { min(1, max(0, v)) }
    private static func roomKey(_ r: String) -> String { r.trimmingCharacters(in: .whitespaces).lowercased() }

    /// Where sensors go for the openings on a sheet (same rules as planSensors on the web): contacts up and to the
    /// right of their opening, glass-breaks up and to the left of the middle of their windows; an opening with a
    /// sensor of that type within 1.5× the offset, or a room / group with a glass-break, is covered (nothing placed).
    public static func plan(openings: [Opening], existing: [Placed], sheetId: String, width: Double, height: Double, pxPerFt: Double?,
                            kinds: Set<SensorKind>, excluded: Set<String> = []) -> Plan {
        let use = openings.filter { !excluded.contains($0.id) }
        var out = Plan()
        let off = offsetPx(width: width, height: height, pxPerFt: pxPerFt)
        let diag = 0.5.squareRoot()
        let dx = off * diag / width, dy = off * diag / height
        func dist(_ ax: Double, _ ay: Double, _ bx: Double, _ by: Double) -> Double { hypot((ax - bx) * width, (ay - by) * height) }
        let live = existing.filter { $0.sheetId == sheetId }

        for kind in [SensorKind.door, .window] where kinds.contains(kind) {
            let have = live.filter { $0.deviceTypeId == kind.typeId }
            for o in use where o.kind.rawValue == kind.rawValue {
                // A sensor pin next to it (whatever its count) means this opening already has its sensors.
                if have.contains(where: { dist($0.x, $0.y, o.x, o.y) < 1.5 * off }) { out.covered[kind, default: 0] += o.count; continue }
                out.placements.append(Placement(kind: kind, deviceTypeId: kind.typeId, x: clamp01(o.x + dx), y: clamp01(o.y - dy), room: o.room, openingIds: [o.id], count: o.count))
                out.counts[kind, default: 0] += o.count
            }
        }

        if kinds.contains(.glass) {
            let have = live.filter { $0.deviceTypeId == SensorKind.glass.typeId }
            let link = clusterPx(width: width, height: height, pxPerFt: pxPerFt)
            for g in windowGroups(use.filter { $0.kind == .window }, near: { dist($0.x, $0.y, $1.x, $1.y) <= link }) {
                let n = Double(g.windows.count)
                let cx = g.windows.reduce(0) { $0 + $1.x } / n, cy = g.windows.reduce(0) { $0 + $1.y } / n
                let ax = clamp01(cx - dx), ay = clamp01(cy - dy)
                let already = g.room.isEmpty
                    ? have.contains { m in dist(m.x, m.y, ax, ay) < 1.5 * off || g.windows.contains { dist(m.x, m.y, $0.x, $0.y) <= link } }
                    : have.contains { m in (!roomKey(m.room).isEmpty && roomKey(m.room) == roomKey(g.room)) || dist(m.x, m.y, ax, ay) < 1.5 * off }
                if already { out.covered[.glass, default: 0] += 1; continue }
                out.placements.append(Placement(kind: .glass, deviceTypeId: SensorKind.glass.typeId, x: ax, y: ay, room: g.room, openingIds: g.windows.map(\.id)))
                out.counts[.glass, default: 0] += 1
            }
        }
        return out
    }

    /// Windows grouped for glass-breaks: by room when the window has one (case and spaces ignored), else chains of
    /// nearby windows. Groups in the order of their first window.
    public static func windowGroups(_ windows: [Opening], near: (Opening, Opening) -> Bool) -> [(room: String, windows: [Opening])] {
        var groups: [(first: Int, room: String, windows: [Opening])] = []
        var byRoom: [String: Int] = [:]
        var loose: [Opening] = []
        for (i, w) in windows.enumerated() {
            let k = roomKey(w.room)
            if k.isEmpty { loose.append(w); continue }
            if let gi = byRoom[k] { groups[gi].windows.append(w) } else {
                byRoom[k] = groups.count
                groups.append((i, w.room.trimmingCharacters(in: .whitespaces), [w]))
            }
        }
        var seen = Set<String>()
        for w in loose where !seen.contains(w.id) {
            var g = [w]
            seen.insert(w.id)
            var i = 0
            while i < g.count {
                for o in loose where !seen.contains(o.id) && near(g[i], o) { seen.insert(o.id); g.append(o) }
                i += 1
            }
            groups.append((windows.firstIndex { $0.id == w.id } ?? 0, "", g))
        }
        return groups.sorted { $0.first < $1.first }.map { ($0.room, $0.windows) }
    }

    /// Sensor kinds whose catalog item is missing or archived.
    public static func missingTypes(_ catalog: [DeviceType], kinds: [SensorKind] = SensorKind.allCases) -> [SensorKind] {
        kinds.filter { k in !catalog.contains { $0.id == k.typeId && $0.archived != true } }
    }

    // MARK: takeoff: "Openings"

    public struct Count: Equatable, Sendable {
        public var doors = 0, windows = 0, doorContacts = 0, windowContacts = 0, glassBreaks = 0
        public init(doors: Int = 0, windows: Int = 0, doorContacts: Int = 0, windowContacts: Int = 0, glassBreaks: Int = 0) {
            self.doors = doors; self.windows = windows; self.doorContacts = doorContacts; self.windowContacts = windowContacts; self.glassBreaks = glassBreaks
        }
        public var isEmpty: Bool { doors + windows + doorContacts + windowContacts + glassBreaks == 0 }
    }

    public struct Floor: Equatable, Sendable, Identifiable {
        public var sheetId: String
        public var name: String
        public var counts: Count
        public var id: String { sheetId }
    }

    public struct Summary: Equatable, Sendable {
        public var floors: [Floor]
        public var total: Count
        public var hasOpenings: Bool { total.doors + total.windows > 0 }
        public var hasSensors: Bool { total.doorContacts + total.windowContacts + total.glassBreaks > 0 }
    }

    /// "Doors 14 · Windows 22" and "Door contacts 14 · Window contacts 22 · Glass-break 6", per floor and for the job,
    /// from the takeoff (placed devices only).
    public static func summary(_ t: Takeoff, catalog: [DeviceType]) -> Summary {
        let doorIds = catalog.filter { openingKind($0) == .door }.map(\.id)
        let windowIds = catalog.filter { openingKind($0) == .window }.map(\.id)
        func of(_ b: TakeoffBucket) -> Count {
            Count(doors: b.count(doorIds), windows: b.count(windowIds), doorContacts: b.counts[SensorKind.door.typeId] ?? 0,
                  windowContacts: b.counts[SensorKind.window.typeId] ?? 0, glassBreaks: b.counts[SensorKind.glass.typeId] ?? 0)
        }
        return Summary(floors: t.floors.map { Floor(sheetId: $0.sheetId, name: $0.name, counts: of($0.bucket)) }, total: of(t.total))
    }
}
