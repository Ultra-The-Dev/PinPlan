import Foundation

/// Paging over the server's `synced_at` stamps when pulling. Same rules as `pullStart` / `nextPullPage` in src/lib/syncMap.ts.
public enum SyncPaging {
    /// Rows per pull request.
    public static let pageSize = 1000
    /// Lookback on the pull watermark, so rows stamped in a transaction that committed after a later-stamped one aren't skipped.
    public static let lookback: TimeInterval = 30
    /// Where an empty watermark starts.
    public static let epoch = "1970-01-01T00:00:00Z"

    /// A pull cursor: rows with `synced_at >= since`, ordered by (synced_at, id), skipping the first `skip`.
    public struct Cursor: Equatable, Sendable {
        public var since: String
        public var skip: Int
        public init(since: String, skip: Int = 0) { self.since = since; self.skip = skip }
    }

    public struct Next: Equatable, Sendable {
        public var cursor: Cursor
        public var done: Bool
    }

    static func parse(_ s: String) -> Date? {
        let t = s.replacingOccurrences(of: " ", with: "T")
        if let d = TeamLogic.parseDate(t) { return d }
        return nil
    }

    static func iso(_ d: Date) -> String {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f.string(from: d)
    }

    /// Where a pull starts: a little before the saved watermark (rows seen again are no-ops under last-write-wins).
    public static func pullStart(_ watermark: String?, lookback: TimeInterval = lookback) -> String {
        guard let w = watermark, !w.isEmpty else { return epoch }
        guard let d = parse(w), d.timeIntervalSince1970 > lookback else { return w }
        return iso(d.addingTimeInterval(-lookback))
    }

    /// The next page. Many rows share one `synced_at` (a bulk upsert is one transaction), so a page can end part-way
    /// through a timestamp: the next page restarts at that timestamp and skips the rows of it already seen, instead of
    /// `synced_at > last`, which would lose the rest.
    public static func next(_ cur: Cursor, rows: [[String: Any]], pageSize: Int = pageSize) -> Next {
        guard let lastRow = rows.last else { return Next(cursor: cur, done: true) }
        let last = stamp(lastRow)
        if rows.count < pageSize { return Next(cursor: Cursor(since: last, skip: 0), done: true) }
        var tail = 0
        for r in rows.reversed() {
            guard stamp(r) == last else { break }
            tail += 1
        }
        // The whole page sits on the cursor's own timestamp: keep counting past it.
        if tail == rows.count && last == cur.since { return Next(cursor: Cursor(since: last, skip: cur.skip + tail), done: false) }
        return Next(cursor: Cursor(since: last, skip: tail), done: false)
    }

    static func stamp(_ row: [String: Any]) -> String {
        if let s = row["synced_at"] as? String { return s }
        if let v = row["synced_at"], !(v is NSNull) { return "\(v)" }
        return ""
    }

    /// PostgREST query for one page of a table.
    public static func query(_ cur: Cursor, pageSize: Int = pageSize) -> String {
        let since = cur.since.addingPercentEncoding(withAllowedCharacters: .alphanumerics) ?? cur.since
        return "select=*&synced_at=gte.\(since)&order=synced_at.asc,id.asc&offset=\(cur.skip)&limit=\(pageSize)"
    }

    /// PostgREST query fetching rows by id (rows to try again: `id=in.(…)`).
    public static func byIdQuery(_ ids: [String]) -> String {
        let list = ids.map { id -> String in
            // Ids are app-generated (letters, digits, - and _); quote anything else so the list can't be broken.
            let safe = id.unicodeScalars.allSatisfy { CharacterSet.alphanumerics.contains($0) || $0 == "-" || $0 == "_" }
            let v = safe ? id : "\"\(id.replacingOccurrences(of: "\"", with: ""))\""
            return v.addingPercentEncoding(withAllowedCharacters: .alphanumerics) ?? v
        }.joined(separator: ",")
        return "select=*&id=in.(\(list))"
    }

    /// The saved watermark never moves back (the lookback re-reads rows older than it).
    public static func advance(_ saved: String?, to next: String) -> String {
        guard let saved, let a = parse(saved) else { return next }
        guard let b = parse(next) else { return saved }
        return b < a ? saved : next
    }

    /// The cloud table (or view) doesn't exist yet: the database is a migration behind. PostgREST PGRST205, Postgres 42P01.
    public static func isMissingTable(code: String?, message: String?) -> Bool {
        if let code, code == "PGRST205" || code == "42P01" { return true }
        let m = message ?? ""
        return m.range(of: #"Could not find the table|relation "?[\w.]+"? does not exist"#, options: [.regularExpression, .caseInsensitive]) != nil
    }
}
