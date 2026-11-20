import Foundation

/// One line or run of text on a sheet: a relative 0…1 box with a top-left origin (as `PageTextItem` on the web).
public struct FloorTextItem: Sendable, Hashable {
    public var text: String
    public var x: Double
    public var y: Double
    public var w: Double
    public var h: Double
    public init(text: String, x: Double, y: Double, w: Double, h: Double) {
        self.text = text; self.x = x; self.y = y; self.w = w; self.h = h
    }
}

/// Floor names read off a plan sheet: "1ST. FL", "FIRST FLOOR", "2ND FLR", "LEVEL 2", "L2", "GROUND FLOOR", "BASEMENT",
/// "CELLAR", "ATTIC", "ROOF", "MEZZANINE", "LOWER LEVEL", "UNIT 3B"… The title block (bottom-right corner, or a
/// vertical strip down the right edge) wins, then large type anywhere. Room labels, notes, schedules and elevation
/// marks ("FIN. FL. ELEV", "FLOOR DRAIN", "STAIR TO 2ND FLOOR") don't count. Same rules as `src/lib/floorName.ts`.
public enum FloorName {
    public struct Match: Sendable, Equatable {
        public var name: String
        public var key: String
        public var line: String
        public var score: Double
    }

    enum Kind { case ordinal, named, number, code, word, unit, site
        var strength: Double {
            switch self {
            case .ordinal, .named, .number, .code: return 3
            case .unit: return 2
            case .word, .site: return 1
            }
        }
    }

    struct Hit { var name: String; var key: String; var kind: Kind; var start: Int; var end: Int }

    static let ordWords = ["FIRST", "SECOND", "THIRD", "FOURTH", "FIFTH", "SIXTH", "SEVENTH", "EIGHTH", "NINTH", "TENTH", "ELEVENTH", "TWELFTH"]
    static let ordN = #"\d{1,2}\s?(?:ST|ND|RD|TH)\.?"#
    static var ord: String { "(?:\(ordN)|\(ordWords.joined(separator: "|")))" }
    static let flw = #"(?:FLOOR|FLR\.?|FL\.?)(?![A-Z])"#

    static let reOrd = rx(#"\b("# + ord + #"(?:\s*(?:&|AND|/|,)\s*"# + ord + #")*)\s*("# + flw + ")")
    static let reNamed = rx(#"\b(GROUND|MAIN|UPPER|LOWER|TOP|GARDEN|STREET|ENTRY|ENTRANCE)\s+(FLOOR|FLR\.?|FL\.?|LEVEL|LVL\.?)(?![A-Z])"#)
    static let reNamedLvl = rx(#"\b(BASEMENT|CELLAR|PARKING|GARAGE|PODIUM|MEZZANINE|ROOF|PLAZA|CONCOURSE|LOBBY)\s+(LEVEL|LVL\.?)(?![A-Z])"#)
    static let reNum = rx(#"\b(LEVEL|LVL\.?|FLOOR|FLR\.?)\s*(?:#|NO\.?)?\s*-?\s*(\d{1,3}|[BPM]\d{1,2}|[A-Z])(?![A-Z0-9'"%])"#)
    static let reCode = rx(#"^\s*L\s*-?\s*(\d{1,2})(?:\s+(?:FLOOR\s+)?PLANS?)?\s*$"#)
    static let reWord = rx(#"\b(SUB-?BASEMENT|BASEMENT|CELLAR|ATTIC|ROOF|MEZZANINE|PENTHOUSE|CRAWL\s?SPACE)(?![A-Z])"#)
    static let reUnit = rx(#"\b(UNIT|APT\.?|APARTMENT|SUITE|STE\.?)\s*#?\s*(\d{1,4}[A-Z]?|[A-Z]\d{0,3})(?![A-Z0-9'"])"#)
    static let reSite = rx(#"\bSITE\s+PLANS?\b"#)
    static let rejectAfter = rx(#"^(?:ELEV|EL\b|EL\.|LINE|LVL\b|HEIGHT|HT\b|DRAINS?\b|BOX(?:ES)?\b|OUTLETS?\b|SINKS?\b|JOISTS?\b|ACCESS|HATCH|VENTS?\b|VENTILATION|STAIRS?\b|DOORS?\b|FANS?\b|INSULATION|MOUNTED|PENETRATIONS?|TRUSS|SHEATHING|OVERHANG|SLOPE|PITCH|EAVES?\b|RAFTERS?\b|ABOVE|BELOW|SPACE|TILE|FINISH|=|\+|\d|TOP\b|DECK|MEMBRANE|SURFACE|LOAD|ASSEMBLY|TYPE\b|MATERIAL|COVERING|EQUIPMENT|MOUNT\b|DUCT|LADDER|SCUTTLE|WALKWAY|HR\b|HOUR|%|DB\b|LUX\b|FC\b|DIAGRAM|SENSOR|SWITCH|METER|CONTROL|GAUGE|INDICATOR|OF\b)"#)
    static let rejectBefore = rx(#"(?:\bT\.?\s?O\.?|\bTOP\s+OF|\bFIN\.?|\bFINISH(?:ED)?|\bF\.F\.?|\bBOTTOM\s+OF|\bB\.O\.?|\bSOUND|\bLIGHT(?:ING)?|\bWATER|\bNOISE|\bSECURITY|\bACCESS|\bPOWER|\bSIGNAL|\bSERVICE|\bBATTERY|\bGRADE|\bLUX|\bPRIORITY|\bALARM|\bTHREAT|\bUSER|\bTRIM|\bOIL|\bFUEL|\bTANK|\bAUDIO|\bVOLUME|\bINPUT|\bOUTPUT|\bMIC|\bRAISED|\bEXISTING\s+ROOF|\bNEW\s+ROOF|\bMETAL|\bFLAT|\bPITCHED|\bSHINGLE|\bGREEN)\s*[.:-]?\s*$"#)
    static let connectors = rx(#"\b(?:SEE|REFER|PER|PROVIDE|VERIFY|INSTALL|INSTALLED|SHALL|CONTRACTOR|UP|DN|DOWN|TO|FROM|OPEN|ABOVE|BELOW|BETWEEN|THRU|THROUGH|VIA|ROUTE|RUN|FEED|FEEDS|SERVING|SERVES|LOCATED|ON|AT|IN|BY|WITH|FOR|INTO|ONTO|UNDER|OVER)\b"#)
    static let planWord = rx(#"\bPLANS?\b"#)
    static let planAfter = rx(#"^(?:[A-Z&/-]+\s+){0,3}PLANS?\b"#)
    static let filler: Set<String> = Set("PLAN PLANS FLOOR LEVEL ELECTRICAL POWER LIGHTING LOW VOLTAGE LV SECURITY AV AUDIO VIDEO DATA TELECOM COMM COMMUNICATIONS TECHNOLOGY FIRE ALARM MECHANICAL HVAC PLUMBING ARCHITECTURAL STRUCTURAL FRAMING REFLECTED CEILING RCP DEMOLITION DEMO NEW EXISTING PROPOSED LAYOUT DEVICE DEVICES SYSTEMS SYSTEM PARTIAL ENLARGED OVERALL FURNITURE FINISH FINISHES DIMENSION DIMENSIONED SHEET AND & - – — : / NORTH SOUTH EAST WEST AREA PART WING OPTION SMART HOME AUTOMATION NETWORK WIFI SPEAKER SPEAKERS LED LEDS SITE KEY THE".split(separator: " ").map(String.init))

    static func rx(_ p: String) -> NSRegularExpression { try! NSRegularExpression(pattern: p) }

    static func all(_ re: NSRegularExpression, _ s: String) -> [NSTextCheckingResult] {
        re.matches(in: s, range: NSRange(location: 0, length: (s as NSString).length))
    }
    static func test(_ re: NSRegularExpression, _ s: String) -> Bool {
        re.firstMatch(in: s, range: NSRange(location: 0, length: (s as NSString).length)) != nil
    }
    static func group(_ m: NSTextCheckingResult, _ i: Int, _ s: String) -> String {
        let r = m.range(at: i)
        return r.location == NSNotFound ? "" : (s as NSString).substring(with: r)
    }
    static func sub(_ s: String, _ from: Int, _ to: Int) -> String {
        let ns = s as NSString
        let a = max(0, min(from, ns.length)), b = max(a, min(to, ns.length))
        return ns.substring(with: NSRange(location: a, length: b - a))
    }

    static func upper(_ s: String) -> String {
        s.uppercased().replacingOccurrences(of: #"[‘’`´]"#, with: "'", options: .regularExpression)
            .replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression)
    }
    static func tokens(_ s: String) -> [String] { s.split(whereSeparator: { $0.isWhitespace }).map(String.init) }

    static func titleWord(_ w: String) -> String {
        var bare = w
        while bare.hasSuffix(".") { bare.removeLast() }
        guard !bare.isEmpty else { return "" }
        let up = bare.uppercased()
        if let m = rx(#"^(\d+)(ST|ND|RD|TH)$"#).firstMatch(in: up, range: NSRange(location: 0, length: (up as NSString).length)) {
            return group(m, 1, up) + group(m, 2, up).lowercased()
        }
        if bare.rangeOfCharacter(from: .decimalDigits) != nil { return up }
        if bare.rangeOfCharacter(from: .letters) == nil { return bare }
        return bare.split(separator: "-", omittingEmptySubsequences: false).map { p in
            p.isEmpty ? "" : p.prefix(1).uppercased() + p.dropFirst().lowercased()
        }.joined(separator: "-")
    }

    /// Title Case a printed phrase, keeping its wording: "1ST. FL" → "1st Fl", "LOWER LEVEL" → "Lower Level".
    public static func titleCase(_ s: String) -> String {
        var t = s.trimmingCharacters(in: .whitespacesAndNewlines)
        t = t.replacingOccurrences(of: #"(\d)\s+(ST|ND|RD|TH|st|nd|rd|th)\b"#, with: "$1$2", options: .regularExpression)
        t = t.replacingOccurrences(of: #"\s*,\s*"#, with: ", ", options: .regularExpression)
        t = t.replacingOccurrences(of: #"\s*([&/])\s*"#, with: " $1 ", options: .regularExpression)
        return tokens(t).map(titleWord).filter { !$0.isEmpty }.joined(separator: " ")
    }

    static func ordinalNumber(_ tok: String) -> Int? {
        let t = tok.replacingOccurrences(of: " ", with: "")
        if let m = rx(#"^(\d{1,2})"#).firstMatch(in: t, range: NSRange(location: 0, length: (t as NSString).length)) { return Int(group(m, 1, t)) }
        let w = t.hasSuffix(".") ? String(t.dropLast()) : t
        return ordWords.firstIndex(of: w).map { $0 + 1 }
    }

    static func rejected(_ u: String, _ start: Int, _ end: Int) -> Bool {
        let after = sub(u, end, Int.max).replacingOccurrences(of: #"^[\s.,:;-]+"#, with: "", options: .regularExpression)
        if test(rejectAfter, after) { return true }
        return test(rejectBefore, sub(u, start - 24, start))
    }

    static func hits(_ text: String, wholeLine: Bool) -> [Hit] {
        let u = upper(text)
        var out: [Hit] = []
        func push(_ h: Hit) {
            if out.contains(where: { h.start < $0.end && $0.start < h.end }) { return }
            out.append(h)
        }
        for m in all(reOrd, u) {
            let start = m.range.location, end = m.range.location + m.range.length
            if rejected(u, start, end) { continue }
            let parts = group(m, 1, u).replacingOccurrences(of: #"\s*(?:&|AND|/|,)\s*"#, with: "|", options: .regularExpression).split(separator: "|")
            let key = "f" + parts.map { ordinalNumber(String($0)).map(String.init) ?? "?" }.joined(separator: "+")
            push(Hit(name: titleCase(group(m, 0, u)), key: key, kind: .ordinal, start: start, end: end))
        }
        for re in [reNamed, reNamedLvl] {
            for m in all(re, u) {
                let start = m.range.location, end = m.range.location + m.range.length
                if rejected(u, start, end) { continue }
                let w = group(m, 1, u)
                let key = w == "GROUND" ? "g" : w == "MAIN" ? "main" : w.lowercased()
                push(Hit(name: titleCase(group(m, 0, u)), key: key, kind: .named, start: start, end: end))
            }
        }
        for m in all(reNum, u) {
            let start = m.range.location, end = m.range.location + m.range.length
            let word = group(m, 1, u), code = group(m, 2, u)
            let isFloor = word.hasPrefix("FL")
            if isFloor && code.count == 1 && code.rangeOfCharacter(from: .letters) != nil { continue }
            if let n = Int(code), n > 150 { continue }
            if rejected(u, start, end) { continue }
            push(Hit(name: "\(titleWord(word)) \(code)", key: (isFloor ? "fn" : "l") + code.lowercased(), kind: .number, start: start, end: end))
        }
        if wholeLine, let m = reCode.firstMatch(in: u, range: NSRange(location: 0, length: (u as NSString).length)), let n = Int(group(m, 1, u)) {
            push(Hit(name: "Level \(n)", key: "l\(n)", kind: .code, start: 0, end: (u as NSString).length))
        }
        for m in all(reUnit, u) {
            let start = m.range.location, end = m.range.location + m.range.length
            if rejected(u, start, end) { continue }
            let code = group(m, 2, u)
            push(Hit(name: "\(titleWord(group(m, 1, u))) \(code)", key: "unit:" + code.lowercased(), kind: .unit, start: start, end: end))
        }
        for m in all(reWord, u) {
            let start = m.range.location, end = m.range.location + m.range.length
            if rejected(u, start, end) { continue }
            let raw = group(m, 1, u)
            let word = raw.replacingOccurrences(of: " ", with: "")
            let name = word == "CRAWLSPACE" ? "Crawl Space" : titleCase(raw)
            push(Hit(name: name, key: word.lowercased().replacingOccurrences(of: "-", with: ""), kind: .word, start: start, end: end))
        }
        for m in all(reSite, u) {
            push(Hit(name: "Site Plan", key: "site", kind: .site, start: m.range.location, end: m.range.location + m.range.length))
        }
        return out.sorted { $0.start < $1.start }
    }

    static func standalone(_ u: String, _ h: Hit) -> Bool {
        let rest = (sub(u, 0, h.start) + " " + sub(u, h.end, Int.max))
            .replacingOccurrences(of: #"[()\[\]"',.:;]"#, with: " ", options: .regularExpression)
        return tokens(rest).allSatisfy { w in
            filler.contains(w) || (w.count <= 1 && w.rangeOfCharacter(from: .alphanumerics) != nil)
        }
    }

    /// Floor name from plain text (no positions): titles ("… PLAN") first, then anything not inside a note.
    static func fromText(_ text: String) -> String? {
        // One line at a time for whole-line codes ("L2"); the rest reads the text as one run.
        for line in text.components(separatedBy: .newlines) {
            let l = upper(line).trimmingCharacters(in: .whitespaces)
            if !l.isEmpty, let h = hits(l, wholeLine: true).first(where: { $0.kind == .code }) { return h.name }
        }
        let u = upper(text.replacingOccurrences(of: "\n", with: " "))
        var best: (Hit, Double)?
        for h in hits(u, wholeLine: tokens(u).count <= 4) {
            let after = tokens(sub(u, h.end, Int.max)).prefix(4).joined(separator: " ")
            let plan = h.kind == .site || test(planAfter, after)
            let pointer = test(connectors, tokens(sub(u, 0, h.start)).suffix(3).joined(separator: " "))
            if pointer && !plan { continue }
            if (h.kind == .unit || h.kind == .site) && !plan && tokens(u).count > 4 { continue }
            let score = h.kind.strength + (plan ? 3 : 0) - (pointer ? 2 : 0)
            if best == nil || score > best!.1 { best = (h, score) }
        }
        return best?.0.name
    }

    struct Line { var text: String; var x: Double; var y: Double; var w: Double; var h: Double; var size: Double; var vertical: Bool }

    static func lines(_ items: [FloorTextItem]) -> [Line] {
        var vertical: [Line] = []
        var horiz: [FloorTextItem] = []
        for it in items {
            let s = it.text.trimmingCharacters(in: .whitespaces)
            if s.isEmpty { continue }
            if s.count >= 2 && it.h > it.w * 1.5 {
                vertical.append(Line(text: it.text, x: it.x, y: it.y, w: it.w, h: it.h, size: it.w, vertical: true))
            } else { horiz.append(it) }
        }
        horiz.sort { $0.y != $1.y ? $0.y < $1.y : $0.x < $1.x }
        var groups: [(Line, [FloorTextItem])] = []
        func cy(_ y: Double, _ h: Double) -> Double { y + h / 2 }
        for it in horiz {
            if let i = groups.firstIndex(where: { g in
                let l = g.0
                return abs(cy(l.y, l.h) - cy(it.y, it.h)) < min(l.h, it.h) * 0.5 && abs(l.h - it.h) < max(l.h, it.h) * 0.35
                    && it.x - (l.x + l.w) < it.h * 2.5 && it.x + it.w > l.x - it.h * 2.5
            }) {
                var l = groups[i].0
                let x0 = min(l.x, it.x), y0 = min(l.y, it.y)
                l.w = max(l.x + l.w, it.x + it.w) - x0
                l.h = max(l.y + l.h, it.y + it.h) - y0
                l.x = x0; l.y = y0
                groups[i].0 = l
                groups[i].1.append(it)
            } else {
                groups.append((Line(text: "", x: it.x, y: it.y, w: it.w, h: it.h, size: it.h, vertical: false), [it]))
            }
        }
        let out = groups.map { g -> Line in
            var l = g.0
            l.size = g.1.map(\.h).max() ?? l.h
            l.text = g.1.sorted { $0.x < $1.x }.map { $0.text.trimmingCharacters(in: .whitespaces) }.joined(separator: " ")
                .replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression)
            return l
        }
        return out + vertical
    }

    static func region(_ l: Line) -> Double {
        let cx = l.x + l.w / 2, cy = l.y + l.h / 2
        if cx >= 0.7 && cy >= 0.7 { return 3 }
        if l.vertical && cx >= 0.8 { return 3 }
        if cx >= 0.82 || cy >= 0.86 { return 1.5 }
        return 0
    }

    /// The best floor-name candidate with its line and score, or nil.
    public static func find(_ items: [FloorTextItem]) -> Match? {
        let ls = lines(items).filter { $0.text.count <= 80 }
        guard let maxSize = ls.map(\.size).max(), maxSize > 0 else { return nil }
        var best: Match?
        for l in ls {
            let u = upper(l.text)
            let words = tokens(u)
            let plan = test(planWord, u)
            if words.count > 10 && !plan { continue }
            if test(connectors, u) { continue }
            let reg = region(l)
            let rel = l.size / maxSize
            for h in hits(u, wholeLine: true) {
                let alone = standalone(u, h)
                let strength = h.kind.strength
                if strength < 3 && !alone && !plan { continue }
                if !alone && !plan && reg == 0 && rel < 0.6 { continue }
                if h.kind == .word && reg == 0 && rel < 0.6 && !plan { continue }
                let score = strength + (alone ? 3 : 0) + (plan ? 2 : 0) + reg + 3 * rel
                if best == nil || score > best!.score { best = Match(name: h.name, key: h.key, line: l.text, score: score) }
            }
        }
        return best
    }

    /// The floor a sheet shows, in the plan's own words ("1st Fl", "First Floor", "Level 2", "Basement", "Unit 3B"),
    /// from positioned text (title block first, then large type). Nil when nothing qualifies.
    public static func parse(_ items: [FloorTextItem]) -> String? { find(items)?.name }

    /// The same from plain text (a PDF page's string, or recognised text without positions).
    public static func parse(text: String) -> String? { fromText(text) }

    /// A key that matches the same floor however it is written: "FIRST FLOOR" = "1st Fl" = "1ST FLR" → "f1".
    public static func key(_ name: String?) -> String {
        let s = (name ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        guard !s.isEmpty else { return "" }
        if let h = hits(s, wholeLine: tokens(s).count <= 4).first { return h.key }
        return s.lowercased().replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression)
    }

    /// True for a name the app made up ("Sheet 3", "Page 2", a photo's file name), so a name read from the plan may replace it.
    public static func isDefaultSheetName(_ name: String?, fileBase: String? = nil) -> Bool {
        let s = (name ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        if s.isEmpty { return true }
        let opts: String.CompareOptions = [.regularExpression, .caseInsensitive]
        if s.range(of: #"^(?:sheet|page|floor|plan|untitled)\s*#?\s*\d*$"#, options: opts) != nil { return true }
        if let f = fileBase, s == f.trimmingCharacters(in: .whitespaces) { return true }
        return s.range(of: #"^(?:img|image|scan|photo|dsc|dscn|pxl|screenshot|whatsapp image)[\s_-]?\d"#, options: opts) != nil
    }

    /// The name to propose: the floor if found, else the sheet title (Title Case), else the number, else the current name.
    public static func propose(floor: String?, title: String? = nil, number: String? = nil, current: String) -> String {
        if let f = floor?.trimmingCharacters(in: .whitespaces), !f.isEmpty { return f }
        if let t = title?.trimmingCharacters(in: .whitespaces), !t.isEmpty { return titleCase(t) }
        if let n = number?.trimmingCharacters(in: .whitespaces), !n.isEmpty { return n }
        return current
    }
}
