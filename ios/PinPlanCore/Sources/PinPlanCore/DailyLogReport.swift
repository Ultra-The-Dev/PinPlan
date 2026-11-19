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

// MARK: - Structured daily reports in the PDF (same as reportPdfSections / rangeSummary in dailyLogReport.ts)

extension DailyLogReport {
    /// What the PDF prints for a structured log. Legacy logs (no report) give nil and print as before.
    public struct Sections: Equatable, Sendable {
        public struct CrewLine: Equatable, Sendable { public var name: String; public var role: String; public var hours: Double }
        public var weather: String
        public var crew: [CrewLine]
        public var manHours: Double
        public var work: [String]
        public var deliveries: [String]
        public var equipment: [String]
        public var delays: [String]
        public var delayHours: Double
        /// "No incidents", "Incident: …", or "" when not answered.
        public var safety: String
        public var incident: Bool
        public var visitors: [String]
        public var signature: DailyReport.Signature?
    }

    private static func tidy(_ s: String?) -> String { (s ?? "").trimmingCharacters(in: .whitespacesAndNewlines) }
    private static func list(_ xs: [String]?) -> [String] { (xs ?? []).map { tidy($0) }.filter { !$0.isEmpty } }

    public static func sections(for log: JobLog, sheetName: (String) -> String? = { _ in nil }) -> Sections? {
        guard let r = log.report else { return nil }
        let t = DailyReportLogic.totals(r)
        let crew = (r.crew ?? []).filter { !tidy($0.name).isEmpty }
            .map { Sections.CrewLine(name: tidy($0.name), role: tidy($0.role), hours: DailyReportLogic.clampHours($0.hours)) }
        let work = (r.work ?? []).filter { !tidy($0.text).isEmpty }.map { (w: DailyReport.Work) -> String in
            let sheet: String = w.sheetId.flatMap { sheetName($0) } ?? ""
            let whereParts: [String] = [sheet, tidy(w.area)].filter { !$0.isEmpty }
            return whereParts.isEmpty ? tidy(w.text) : "\(tidy(w.text)) (\(whereParts.joined(separator: " · ")))"
        }
        let delays = (r.delays ?? []).filter { !tidy($0.reason).isEmpty }.map { (d: DailyReport.Delay) -> String in
            var parts: [String] = [tidy(d.reason)]
            if let h = d.hours, h > 0 { parts.append("\(DailyReportLogic.hoursText(DailyReportLogic.clampHours(h))) lost") }
            if d.ongoing == true { parts.append("ongoing") }
            return parts.joined(separator: " · ")
        }
        var safety = ""
        if let s = r.safety {
            let notes = tidy(s.notes)
            if s.incident { safety = notes.isEmpty ? "Incident reported" : "Incident: \(notes)" } else { safety = notes.isEmpty ? "No incidents" : "No incidents · \(notes)" }
        }
        return Sections(weather: DailyReportLogic.weatherLine(r.weather), crew: crew, manHours: t.manHours, work: work,
                        deliveries: list(r.deliveries), equipment: list(r.equipment), delays: delays, delayHours: t.delayHours,
                        safety: safety, incident: r.safety?.incident == true, visitors: list(r.visitors), signature: r.signature)
    }

    public struct SummaryRow: Equatable, Sendable {
        public var date: String
        public var crew: Int
        public var manHours: Double
        public var delayHours: Double
        public var incident: Bool
    }
    public struct Summary: Equatable, Sendable {
        public var rows: [SummaryRow]
        public var manHours: Double
        public var delayHours: Double
        public var incidents: Int
    }

    /// Totals page for a date range: per day crew, man-hours and delay hours. Nil when no log has a report.
    public static func rangeSummary(_ logs: [JobLog]) -> Summary? {
        let structured = logs.filter { $0.deleted != true && $0.report != nil }
        if structured.isEmpty { return nil }
        var byDay: [String: SummaryRow] = [:]
        for l in structured {
            let t = DailyReportLogic.totals(l.report)
            var d = byDay[l.date] ?? SummaryRow(date: l.date, crew: 0, manHours: 0, delayHours: 0, incident: false)
            d.crew += t.crew
            d.manHours = DailyReportLogic.round2(d.manHours + t.manHours)
            d.delayHours = DailyReportLogic.round2(d.delayHours + t.delayHours)
            if l.report?.safety?.incident == true { d.incident = true }
            byDay[l.date] = d
        }
        let rows = byDay.values.sorted { $0.date < $1.date }
        let man = rows.reduce(0.0) { $0 + $1.manHours }
        let delay = rows.reduce(0.0) { $0 + $1.delayHours }
        return Summary(rows: rows, manHours: DailyReportLogic.round2(man), delayHours: DailyReportLogic.round2(delay), incidents: rows.filter { $0.incident }.count)
    }
}
