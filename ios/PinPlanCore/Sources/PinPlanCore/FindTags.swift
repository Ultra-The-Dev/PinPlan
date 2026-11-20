import Foundation

// Find similar → Read tags (docs/find-similar.md): door and window tags ("D1", "D-12", "W3", "WD2") printed on a
// plan, one suggestion per tag. Port of src/lib/findSimilar/tags.ts. Pure: the words come from the sheet's PDF text
// layer (PlanTextExtractor.words in the app) or, for scans and photos, from on-device text recognition.
public enum FindTags {
    /// Default tag prefixes for a device type, from its name: doors D / DR, windows W / WD / WIN, else none.
    public static func defaultPrefixes(typeName: String) -> String {
        if typeName.range(of: #"\bwindows?\b"#, options: [.regularExpression, .caseInsensitive]) != nil { return "W, WD, WIN" }
        if typeName.range(of: #"\bdoors?\b"#, options: [.regularExpression, .caseInsensitive]) != nil { return "D, DR" }
        return ""
    }

    /// "D, DR" → ["DR", "D"]: upper case, letters and digits only, no repeats, longest first (so DR wins over D).
    public static func parsePrefixes(_ input: String) -> [String] {
        var seen = Set<String>()
        let parts = input.split(whereSeparator: { $0 == "," || $0 == ";" || $0.isWhitespace })
            .map { String($0).uppercased().filter { ("A"..."Z").contains($0) || ("0"..."9").contains($0) } }
            .filter { !$0.isEmpty && seen.insert($0).inserted }
        return parts.sorted { $0.count != $1.count ? $0.count > $1.count : $0 < $1 }
    }

    /// Whole-word tag: a prefix, an optional "-" or ".", one to three digits, an optional letter (D1, D-12, D.3, W3A,
    /// WD2). Never matches without prefixes (bare numbers would also match room numbers and dimensions).
    public static func isTag(_ word: String, prefixes: [String]) -> Bool {
        guard !prefixes.isEmpty else { return false }
        for p in prefixes where word.hasPrefix(p) {
            var rest = Substring(word.dropFirst(p.count))
            if rest.first == "-" || rest.first == "." { rest = rest.dropFirst() }
            if let last = rest.last, ("A"..."Z").contains(last) { rest = rest.dropLast() }
            if (1...3).contains(rest.count) && rest.allSatisfy({ ("0"..."9").contains($0) }) { return true }
        }
        return false
    }

    /// Punctuation around a word that isn't part of the tag ("(D1)", "D1,", "W3:"), upper-cased.
    public static func cleanWord(_ s: String) -> String {
        let u = s.uppercased()
        let ok: (Character) -> Bool = { ("A"..."Z").contains($0) || ("0"..."9").contains($0) }
        guard let a = u.firstIndex(where: ok), let b = u.lastIndex(where: ok) else { return "" }
        return String(u[a...b])
    }

    public struct FoundTag: Equatable, Sendable {
        /// The tag as printed, cleaned (e.g. "D-12").
        public var tag: String
        /// Centre, sheet-relative 0–1.
        public var x: Double, y: Double
        public init(tag: String, x: Double, y: Double) { self.tag = tag; self.x = x; self.y = y }
    }

    /// Indexes of tags that are rows of a schedule (a door or window table), not spots on the plan: four or more tags
    /// stacked in one column (centres within half a percent across) with no gap over 3% of the page between neighbours.
    public static func scheduleTags(_ tags: [FoundTag]) -> Set<Int> {
        var out = Set<Int>(), used = Set<Int>()
        let byX = tags.indices.sorted { tags[$0].x < tags[$1].x }
        for i in byX where !used.contains(i) {
            let col = byX.filter { abs(tags[$0].x - tags[i].x) <= 0.005 }.sorted { tags[$0].y < tags[$1].y }
            col.forEach { used.insert($0) }
            var run: [Int] = []
            func flush() { if run.count >= 4 { run.forEach { out.insert($0) } }; run = [] }
            for (k, j) in col.enumerated() {
                if k > 0 && tags[j].y - tags[col[k - 1]].y > 0.03 { flush() }
                run.append(j)
            }
            flush()
        }
        return out
    }

    /// Door / window tags among a sheet's words, sheet-relative. Skips schedules (tables of tags); a tag drawn twice
    /// on the same spot (some PDFs draw text twice for boldness) counts once. An item holding several words (a line
    /// of text) gives its tags at the item's position.
    public static func find(in words: [PlanTextItem], prefixes: [String], skipSchedules: Bool = true) -> [FoundTag] {
        guard !prefixes.isEmpty else { return [] }
        var found: [FoundTag] = []
        for item in words {
            for raw in item.text.split(whereSeparator: { $0.isWhitespace }) {
                let tag = cleanWord(String(raw))
                guard isTag(tag, prefixes: prefixes) else { continue }
                if found.contains(where: { $0.tag == tag && abs($0.x - item.x) < 0.004 && abs($0.y - item.y) < 0.004 }) { continue }
                found.append(FoundTag(tag: tag, x: item.x, y: item.y))
            }
        }
        guard skipSchedules else { return found }
        let sched = scheduleTags(found)
        return found.indices.filter { !sched.contains($0) }.map { found[$0] }
    }
}
