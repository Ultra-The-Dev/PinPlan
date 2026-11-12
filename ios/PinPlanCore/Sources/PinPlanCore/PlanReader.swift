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

    public static func classify(_ items: [PlanTextItem]) -> [PlanDetail] {
        var out: [PlanDetail] = []
        for item in items {
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
        return out
    }

    /// Compare a printed dimension with the sheet's scale: measured feet along a drawn line vs. the printed value.
    /// Returns the relative error (0.02 = 2 %), or nil without a scale.
    public static func scaleError(printedFeet: Double, measuredFeet: Double?) -> Double? {
        guard let m = measuredFeet, printedFeet > 0 else { return nil }
        return abs(m - printedFeet) / printedFeet
    }
}
