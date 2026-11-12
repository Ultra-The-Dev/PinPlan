import Foundation

public enum Geometry {
    /// Length of a relative-coordinate polyline in image pixels.
    public static func polylinePx(_ points: [Double], width: Double, height: Double) -> Double {
        var total = 0.0
        var i = 2
        while i + 1 < points.count {
            total += hypot((points[i] - points[i - 2]) * width, (points[i + 1] - points[i - 1]) * height)
            i += 2
        }
        return total
    }

    public static func polylineFt(_ points: [Double], sheet: Sheet) -> Double? {
        guard let ppf = sheet.pxPerFt, ppf > 0 else { return nil }
        return polylinePx(points, width: sheet.width, height: sheet.height) / ppf
    }

    /// Effective length of a run in feet: typed beats measured; stairs are steps × LF per step.
    public static func runLengthFt(_ r: Run) -> Double? {
        if let t = r.typedFt { return t }
        if r.kind == .stair {
            if let s = r.steps, let l = r.lfPerStep { return Double(s) * l }
            return nil
        }
        return r.measuredFt
    }

    /// Parse a typed length into feet: 12, 12.5, 12', 12'6", 12' 6", 12ft 6in, 18", 3.5m.
    public static func parseFeet(_ input: String) -> Double? {
        let s = input.trimmingCharacters(in: .whitespaces).lowercased()
            .replacingOccurrences(of: "’", with: "'").replacingOccurrences(of: "′", with: "'")
            .replacingOccurrences(of: "”", with: "\"").replacingOccurrences(of: "″", with: "\"")
        if s.isEmpty { return nil }
        if s.hasSuffix("m"), !s.hasSuffix("in"), let v = Double(s.dropLast().trimmingCharacters(in: .whitespaces)) { return v * 3.28084 }
        let pattern = #"^(?:(\d+(?:\.\d+)?)\s*(?:'|ft|feet|foot))?\s*-?\s*(?:(\d+(?:\.\d+)?)\s*(?:"|in|inch|inches))?$"#
        if let re = try? NSRegularExpression(pattern: pattern),
           let m = re.firstMatch(in: s, range: NSRange(s.startIndex..., in: s)) {
            let ft = Range(m.range(at: 1), in: s).flatMap { Double(s[$0]) }
            let inch = Range(m.range(at: 2), in: s).flatMap { Double(s[$0]) }
            if ft != nil || inch != nil { return (ft ?? 0) + (inch ?? 0) / 12 }
        }
        if let v = Double(s), v > 0 { return v }
        return nil
    }

    /// Parse an architectural scale (1/4" = 1'-0", 1/8"=1', 3/16 = 1, 1:48) into paper inches per real foot.
    public static func parseScale(_ input: String) -> Double? {
        let s = input.trimmingCharacters(in: .whitespaces).replacingOccurrences(of: "’", with: "'").replacingOccurrences(of: "”", with: "\"")
        if let re = try? NSRegularExpression(pattern: #"^1\s*:\s*(\d+(?:\.\d+)?)$"#),
           let m = re.firstMatch(in: s, range: NSRange(s.startIndex..., in: s)),
           let r = Range(m.range(at: 1), in: s), let d = Double(s[r]), d > 0 { return 12 / d }
        let parts = s.split(separator: "=", omittingEmptySubsequences: false)
        guard parts.count == 2 else { return nil }
        guard let paper = parseInchesFraction(String(parts[0])) else { return nil }
        let realRaw = String(parts[1]).replacingOccurrences(of: #"'\s*-\s*"#, with: "' ", options: .regularExpression)
        guard let real = parseFeet(realRaw), real > 0 else { return nil }
        return paper / real
    }

    private static func parseInchesFraction(_ raw: String) -> Double? {
        let s = raw.replacingOccurrences(of: "\"", with: "").replacingOccurrences(of: "in", with: "").trimmingCharacters(in: .whitespaces)
        let parts = s.split(separator: " ")
        func frac(_ f: Substring) -> Double? {
            let p = f.split(separator: "/")
            if p.count == 2, let a = Double(p[0]), let b = Double(p[1]), b != 0 { return a / b }
            return Double(f)
        }
        if parts.count == 2, let whole = Double(parts[0]), let f = frac(parts[1]) { return whole + f }
        if parts.count == 1, let f = frac(parts[0]), f > 0 { return f }
        return nil
    }

    public static func formatFeetInches(_ ft: Double) -> String {
        var f = Int(ft.rounded(.down))
        var i = Int(((ft - Double(f)) * 12).rounded())
        if i == 12 { f += 1; i = 0 }
        return "\(f)'-\(i)\""
    }

    /// Estimated home-run cable length (ft) from a device to its closet: Manhattan distance on the device's sheet,
    /// plus floor-to-floor height per floor crossed, plus slack % and a fixed drop. nil without a scale.
    public static func estimateHomeRunFt(marker: Marker, closet: Closet, sheets: [Sheet], pricing: PricingSettings) -> Double? {
        guard let ms = sheets.first(where: { $0.id == marker.sheetId }),
              let cs = sheets.first(where: { $0.id == closet.sheetId }),
              let ppf = ms.pxPerFt, ppf > 0 else { return nil }
        var ft = (abs(marker.x - closet.x) * ms.width + abs(marker.y - closet.y) * ms.height) / ppf
        if ms.id != cs.id {
            let sorted = sheets.sorted { $0.order < $1.order }
            let a = sorted.firstIndex { $0.id == ms.id } ?? 0
            let b = sorted.firstIndex { $0.id == cs.id } ?? 0
            ft += Double(max(1, abs(a - b))) * pricing.floorHeightFt
        }
        ft = ft * (1 + pricing.wireSlackPct / 100) + pricing.wireDropFt
        return (ft * 10).rounded() / 10
    }

    /// L-shaped path from device to closet for drawing a home run.
    public static func homeRunPoints(marker: Marker, closet: Closet) -> [Double] {
        [marker.x, marker.y, closet.x, marker.y, closet.x, closet.y]
    }
}

public enum Labels {
    /// Next auto-numbered label, e.g. CAM-1-03 (floor number = 1-based sheet position).
    public static func next(abbrev: String, sheetId: String, sheets: [Sheet], markers: [Marker]) -> String {
        let floorNo = (sheets.sorted { $0.order < $1.order }.firstIndex { $0.id == sheetId } ?? 0) + 1
        let prefix = "\(abbrev)-\(floorNo)-"
        var maxN = 0
        for m in markers where m.sheetId == sheetId && m.label.hasPrefix(prefix) {
            if let n = Int(m.label.dropFirst(prefix.count)) { maxN = max(maxN, n) }
        }
        return prefix + String(format: "%02d", maxN + 1)
    }
}
