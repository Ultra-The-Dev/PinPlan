import Foundation

/// A line of text found on a sheet (from the PDF text layer or on-device text recognition), with its position.
public struct PlanTextItem: Sendable, Hashable {
    public var text: String
    /// Relative position on the sheet (0…1, top-left origin).
    public var x: Double
    public var y: Double
    public init(text: String, x: Double, y: Double) { self.text = text; self.x = x; self.y = y }
}

public enum PlanDetailKind: String, Sendable, CaseIterable, Codable {
    case dimension, room, callout, note, scale
    public var title: String {
        switch self {
        case .dimension: return "Dimensions"
        case .room: return "Rooms"
        case .callout: return "LED & switch callouts"
        case .note: return "Notes"
        case .scale: return "Scale"
        }
    }
}

public struct PlanDetail: Sendable, Hashable, Identifiable {
    public var id: String
    public var kind: PlanDetailKind
    public var text: String
    public var x: Double
    public var y: Double
    /// Dimension value in feet (dimensions only).
    public var feet: Double?
    public init(id: String = newId(8), kind: PlanDetailKind, text: String, x: Double, y: Double, feet: Double? = nil) {
        self.id = id; self.kind = kind; self.text = text; self.x = x; self.y = y; self.feet = feet
    }
}

/// Reads a sheet's text into installer-friendly details. Offline and instant; the AI reader adds interpretation on top.
public enum PlanReader {
    static let roomWords: Set<String> = [
        "LIVING", "KITCHEN", "BEDROOM", "BED", "BATH", "BATHROOM", "DINING", "FAMILY", "GARAGE", "OFFICE", "STUDY", "CLOSET",
        "PANTRY", "LAUNDRY", "MUDROOM", "FOYER", "ENTRY", "HALL", "HALLWAY", "STAIR", "STAIRS", "GYM", "THEATER", "THEATRE", "MEDIA",
        "WINE", "STORAGE", "MECH", "MECHANICAL", "UTILITY", "PRIMARY", "MASTER", "GUEST", "POWDER", "DEN", "LIBRARY", "PLAYROOM",
        "NURSERY", "ATTIC", "PORCH", "DECK", "PATIO", "TERRACE", "BALCONY", "LOFT", "BONUS", "GREAT", "SUITE", "WIC", "W.I.C.",
        "EQUIPMENT", "AV", "LOUNGE", "BAR", "SPA", "SAUNA", "POOL", "BREAKFAST", "NOOK", "ELEV", "ELEVATOR", "CELLAR", "BASEMENT",
        "ROOM", "MUD", "BDRM", "BEDRM", "REC", "RECREATION", "CRAFT", "LAV", "WC", "VESTIBULE", "GALLERY", "SITTING", "FLEX", "RM", "BR", "MBR", "KIT", "LIV", "DIN", "FAM",
    ]

    /// Every feet-inches dimension in a string (12'-6", 12' 6", 3'-4 1/2", 10'), as (matched text, feet).
    public static func dimensions(in text: String) -> [(String, Double)] {
        let t = text.replacingOccurrences(of: "’", with: "'").replacingOccurrences(of: "′", with: "'")
            .replacingOccurrences(of: "”", with: "\"").replacingOccurrences(of: "″", with: "\"")
        guard let re = try? NSRegularExpression(pattern: #"(?<![\d/])(\d{1,3})\s*'\s*(?:-?\s*(\d{1,2})(?:\s+(\d{1,2})/(\d{1,2}))?\s*")?"#) else { return [] }
        var out: [(String, Double)] = []
        for m in re.matches(in: t, range: NSRange(t.startIndex..., in: t)) {
            guard let whole = Range(m.range, in: t), let fr = Range(m.range(at: 1), in: t), let ft = Double(t[fr]) else { continue }
            var inches = Range(m.range(at: 2), in: t).flatMap { Double(t[$0]) } ?? 0
            if let nr = Range(m.range(at: 3), in: t), let dr = Range(m.range(at: 4), in: t), let n = Double(t[nr]), let d = Double(t[dr]), d > 0 { inches += n / d }
            guard inches < 12 else { continue }
            out.append((String(t[whole]).trimmingCharacters(in: .whitespaces), ft + inches / 12))
        }
        return out
    }

    /// Room schedule rows (Revit/AutoCAD tables): a row of 4+ cells on one line with an area ("118 SF").
    /// Returns the indices of items in such rows and, per room name, its scheduled area.
    static func scheduleRows(_ items: [PlanTextItem]) -> (inRows: Set<Int>, areas: [String: String]) {
        let areaRe = #"\b\d{1,6}(\.\d+)?\s*(SF|S\.F\.|SQ\.?\s*FT\.?)$"#
        let headerWords: Set<String> = ["NUMBER", "NAME", "AREA", "PERIMETER", "FINISH", "LEVEL", "VOLUME", "COMMENTS", "HEIGHT", "OCCUPANCY"]
        var inRows = Set<Int>()
        var areas: [String: String] = [:]
        let order = items.indices.sorted { items[$0].y < items[$1].y }
        var i = 0
        while i < order.count {
            var row = [order[i]]
            var j = i + 1
            while j < order.count, items[order[j]].y - items[order[i]].y < 0.0025 { row.append(order[j]); j += 1 }
            i = j
            let upper = row.map { items[$0].text.uppercased().trimmingCharacters(in: .whitespaces) }
            // Header row of a schedule ("Number Name Area Perimeter Base Finish …").
            let headerHits = Set(upper.flatMap { $0.split(separator: " ").map(String.init) }).intersection(headerWords).count
            if row.count >= 3, headerHits >= 3 { inRows.formUnion(row); continue }
            guard row.count >= 3, let a = row.indices.first(where: { upper[$0].range(of: areaRe, options: .regularExpression) != nil }) else { continue }
            inRows.formUnion(row)
            let areaCell = upper[a]
            let area = areaCell.range(of: areaRe, options: .regularExpression).map { String(areaCell[$0]) } ?? areaCell
            // The room name: in the same cell before the area ("LIVKITALL ROOM 535 SF") or the cell to its left.
            let before = areaCell.replacingOccurrences(of: area, with: "").trimmingCharacters(in: .whitespaces)
            let cells = row.sorted { items[$0].x < items[$1].x }
            let nameText: String?
            if isRoomName(before) { nameText = before }
            else { nameText = cells.last(where: { items[$0].x < items[row[a]].x && isRoomName(items[$0].text) }).map { items[$0].text } }
            if let n = nameText { areas[normalizedName(n)] = area }
        }
        return (inRows, areas)
    }

    static func normalizedName(_ s: String) -> String {
        s.uppercased().split(whereSeparator: { !$0.isLetter && !$0.isNumber && $0 != "#" }).joined(separator: " ")
    }

    static func isRoomName(_ text: String) -> Bool {
        let upper = text.uppercased()
        let words = upper.split(whereSeparator: { !$0.isLetter && $0 != "." }).map(String.init).filter { $0.count > 1 }
        let letters = text.filter(\.isLetter)
        let mostlyUpper = !letters.isEmpty && Double(letters.filter(\.isUppercase).count) / Double(letters.count) > 0.8
        return mostlyUpper && words.count <= 4 && words.contains { roomWords.contains($0) }
    }

    public static func classify(_ items: [PlanTextItem]) -> [PlanDetail] {
        var out: [PlanDetail] = []
        let schedule = scheduleRows(items)
        for (index, item) in items.enumerated() where !schedule.inRows.contains(index) {
            let text = item.text.trimmingCharacters(in: .whitespacesAndNewlines)
            guard text.count >= 2 else { continue }
            if let s = Geometry.findScale(in: text) {
                out.append(PlanDetail(kind: .scale, text: s.label, x: item.x, y: item.y))
                continue
            }
            let dims = dimensions(in: text)
            let upper = text.uppercased()
            let words = upper.split(whereSeparator: { !$0.isLetter && $0 != "." }).map(String.init).filter { $0.count > 1 }
            let isCallout = upper.range(of: #"\bS\d{1,3}(\s*,\s*\d{1,3})*\b"#, options: .regularExpression) != nil
                || upper.range(of: #"\b\d+(\.\d+)?\s*LF\b"#, options: .regularExpression) != nil
                || upper.range(of: #"\bZONE\s*\d+"#, options: .regularExpression) != nil
            let letters = text.filter(\.isLetter)
            let mostlyUpper = !letters.isEmpty && Double(letters.filter(\.isUppercase).count) / Double(letters.count) > 0.8
            let isRoom = mostlyUpper && words.count <= 4 && words.contains { roomWords.contains($0) } && !isCallout
            if isRoom {
                let size = dims.count >= 2 ? "\(dims[0].0) × \(dims[1].0)" : nil
                out.append(PlanDetail(kind: .room, text: size.map { "\(words.joined(separator: " ").capitalized) · \($0)" } ?? text.capitalized, x: item.x, y: item.y))
            } else if isCallout {
                out.append(PlanDetail(kind: .callout, text: text, x: item.x, y: item.y))
            } else if words.count >= 4 || text.count >= 28 {
                out.append(PlanDetail(kind: .note, text: text, x: item.x, y: item.y))
            }
            if !isRoom {
                for (dt, ft) in dims { out.append(PlanDetail(kind: .dimension, text: dt, x: item.x, y: item.y, feet: ft)) }
            }
        }
        // Areas from a room schedule: attach to the room on the plan with the same name; list unmatched ones.
        if !schedule.areas.isEmpty {
            var used = Set<String>()
            for i in out.indices where out[i].kind == .room {
                let key = normalizedName(out[i].text.components(separatedBy: " · ")[0])
                if let a = schedule.areas[key] { out[i].text += " · \(a)"; used.insert(key) }
            }
            for (index, item) in items.enumerated() where schedule.inRows.contains(index) {
                guard let key = schedule.areas.keys.first(where: { normalizedName(item.text).hasPrefix($0) }), !used.contains(key),
                      let a = schedule.areas[key] else { continue }
                used.insert(key)
                out.append(PlanDetail(kind: .room, text: "\(key.capitalized) · \(a) (schedule)", x: item.x, y: item.y))
            }
        }
        // Room size printed on the line under the name ("GREAT ROOM" / 18'-6" x 22'-0").
        for i in out.indices where out[i].kind == .room && !out[i].text.contains(" · ") {
            let r = out[i]
            let below = items.filter { it in
                let dy = it.y - r.y, dx = abs(it.x - r.x)
                return dy > 0 && dy < 0.035 && dx < 0.06 && dimensions(in: it.text).count >= 2
            }.min { $0.y < $1.y }
            if let b = below {
                let d = dimensions(in: b.text)
                out[i].text = "\(r.text) · \(d[0].0) × \(d[1].0)"
            }
        }
        return out
    }

    /// Compare a printed dimension with the sheet's scale: measured feet along a drawn line vs. the printed value.
    /// Returns the relative error (0.02 = 2 %), or nil without a scale.
    public static func scaleError(printedFeet: Double, measuredFeet: Double?) -> Double? {
        guard let m = measuredFeet, printedFeet > 0 else { return nil }
        return abs(m - printedFeet) / printedFeet
    }
}

/// A run of text on a page with its box (page units, y grows downward), before it becomes a `PlanTextItem`.
public struct TextSegment: Sendable, Hashable {
    public var text: String
    public var minX: Double, minY: Double, maxX: Double, maxY: Double
    /// Height of one line (stays the single-line height after wrapped lines are joined).
    public var lineHeight: Double
    public init(text: String, minX: Double, minY: Double, maxX: Double, maxY: Double) {
        self.text = text; self.minX = minX; self.minY = minY; self.maxX = maxX; self.maxY = maxY
        self.lineHeight = maxY - minY
    }
    public var height: Double { maxY - minY }
}

public extension PlanReader {
    /// Joins wrapped lines of the same note: the next line starts at the same left edge, sits right below,
    /// has the same text size, and the line above is long or has an unclosed bracket.
    /// Short stacked labels (a room name over its size) are left separate.
    static func joinWrappedLines(_ segments: [TextSegment]) -> [TextSegment] {
        var out: [TextSegment] = []
        for s in segments {
            if let i = out.indices.last(where: { continues(out[$0], with: s) }) {
                var p = out[i]
                p.text += " " + s.text
                p.minX = min(p.minX, s.minX); p.minY = min(p.minY, s.minY)
                p.maxX = max(p.maxX, s.maxX); p.maxY = max(p.maxY, s.maxY)
                out[i] = p
            } else {
                out.append(s)
            }
        }
        return out
    }

    private static func continues(_ p: TextSegment, with s: TextSegment) -> Bool {
        let lineH = s.height
        guard lineH > 0 else { return false }
        // The last line of p (its bottom), compared with s.
        let lastLineTop = p.maxY - p.lineHeight
        let sameSize = abs(p.lineHeight - lineH) < 0.25 * lineH
        let alignedLeft = abs(p.minX - s.minX) <= 0.6 * lineH
        let gap = s.minY - p.maxY
        let below = gap >= -0.3 * lineH && gap <= 0.8 * lineH && s.minY > lastLineTop
        let unclosed = p.text.filter { $0 == "(" }.count > p.text.filter { $0 == ")" }.count
        let longLine = p.text.count >= 20 && !p.text.hasSuffix(".") && !p.text.hasSuffix(":")
        return sameSize && alignedLeft && below && (unclosed || longLine)
    }
}

public extension PlanReader {
    private static let floorPatterns: [(String, String)] = [
        (#"\b(1ST|FIRST)\.?\s*(FL|FLR|FLOOR)\b|\bMAIN\s*(FL|FLR|FLOOR|LEVEL)\b"#, "1st Fl"),
        (#"\b(2ND|SECOND)\.?\s*(FL|FLR|FLOOR)\b|\bUPPER\s*(FL|FLR|FLOOR|LEVEL)\b"#, "2nd Fl"),
        (#"\b(3RD|THIRD)\.?\s*(FL|FLR|FLOOR)\b"#, "3rd Fl"), (#"\bGROUND\s*(FL|FLR|FLOOR)\b"#, "Ground Fl"),
        (#"\bLOWER\s*(FL|FLR|FLOOR|LEVEL)\b"#, "Lower Fl"),
        (#"\bATTIC\b"#, "Attic"), (#"\bCELLAR\b"#, "Cellar"), (#"\bBASEMENT\b"#, "Basement"), (#"\bROOF\b"#, "Roof"),
    ]

    /// The floor a sheet shows, from its text. A sheet title ("FIRST FLOOR PLAN", "ATTIC PLAN") wins, then a short
    /// standalone label ("ATTIC"), then any mention. Words inside notes ("…CONDUIT FROM RACK TO ATTIC.") only count last.
    static func floorName(in text: String) -> String? {
        let lines = text.uppercased().components(separatedBy: .newlines)
            .map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }
        func match(_ line: String) -> String? {
            floorPatterns.first { line.range(of: $0.0, options: .regularExpression) != nil }?.1
        }
        // 1. Titles: the line names a plan.
        for line in lines where line.range(of: #"\bPLAN\b"#, options: .regularExpression) != nil && line.count <= 40 {
            if let m = match(line) { return m }
        }
        // 2. Short labels (title-block floor name).
        for line in lines where line.split(separator: " ").count <= 3 {
            if let m = match(line) { return m }
        }
        // 3. Floor numbers anywhere beat attic/cellar mentions in notes; then anything.
        for (re, name) in floorPatterns where text.uppercased().range(of: re, options: .regularExpression) != nil { return name }
        return nil
    }
}
