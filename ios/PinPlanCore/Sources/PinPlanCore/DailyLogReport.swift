import Foundation

/// Daily log PDF export helpers: which logs go in, their photos, and the file name (same as src/lib/dailyLogReport.ts).
public enum DailyLogReport {
    /// Live logs whose day is within [from, to] (YYYY-MM-DD, inclusive; either may be nil/empty), oldest day first.
    public static func logs(_ logs: [JobLog], from: String? = nil, to: String? = nil) -> [JobLog] {
        var lo = from ?? "", hi = to ?? ""
        if !lo.isEmpty, !hi.isEmpty, lo > hi { swap(&lo, &hi) }
        return logs
            .filter { $0.deleted != true && (lo.isEmpty || $0.date >= lo) && (hi.isEmpty || $0.date <= hi) }
            .sorted { ($0.date, $0.createdAt) < ($1.date, $1.createdAt) }
    }

    /// The photos linked to a log (skipping deleted / missing ones), in the order they were taken.
    public static func photos(for log: JobLog, in photos: [Photo]) -> [Photo] {
        let ids = Set(log.photoIds ?? [])
        return photos.filter { ids.contains($0.id) && $0.deleted != true }.sorted { $0.takenAt < $1.takenAt }
    }

    /// First and last day covered by the logs, or nil when there are none.
    public static func days(_ logs: [JobLog]) -> (first: String, last: String)? {
        let d = logs.map(\.date).sorted()
        guard let first = d.first, let last = d.last else { return nil }
        return (first, last)
    }

    /// e.g. `12-oak-st-daily-log-2026-03-02.pdf` or `…-daily-logs-2026-03-02-to-2026-03-06.pdf`.
    public static func fileName(jobSlug: String, logs: [JobLog]) -> String {
        let base = "\(jobSlug.isEmpty ? "job" : jobSlug)-daily-log\(logs.count == 1 ? "" : "s")"
        guard let d = days(logs) else { return "\(base).pdf" }
        return d.first == d.last ? "\(base)-\(d.first).pdf" : "\(base)-\(d.first)-to-\(d.last).pdf"
    }
}
