import Foundation

// Structured daily reports: weather, crew & hours, work, deliveries, equipment, delays, safety, visitors and the
// foreman's signature, stored as JSON on the daily log (`JobLog.report`). Same JSON and rules as the web app
// (src/lib/types.ts DailyReport, src/lib/dailyReport.ts); the tests share the Open-Meteo fixture with the web tests.
// Decoding never fails on a missing or odd field, so logs from older or newer app versions still load.

private func lossy<T: Decodable>(_ c: KeyedDecodingContainer<DailyReport.AnyKey>, _ key: String, _ t: T.Type) -> T? {
    guard let k = DailyReport.AnyKey(stringValue: key) else { return nil }
    return (try? c.decodeIfPresent(T.self, forKey: k)) ?? nil
}

public struct DailyReport: Codable, Hashable, Sendable {
    struct AnyKey: CodingKey {
        var stringValue: String
        var intValue: Int? { nil }
        init?(stringValue: String) { self.stringValue = stringValue }
        init?(intValue: Int) { nil }
    }

    public struct Weather: Codable, Hashable, Sendable {
        public var summary: String?
        public var tempHighF: Double?
        public var tempLowF: Double?
        public var precipIn: Double?
        public var windMph: Double?
        /// "auto" (Open-Meteo) or "manual".
        public var source: String?
        /// Filled from the forecast (the day was in the future when fetched).
        public var forecast: Bool?
        public init(summary: String? = nil, tempHighF: Double? = nil, tempLowF: Double? = nil, precipIn: Double? = nil, windMph: Double? = nil, source: String? = nil, forecast: Bool? = nil) {
            self.summary = summary; self.tempHighF = tempHighF; self.tempLowF = tempLowF; self.precipIn = precipIn; self.windMph = windMph
            self.source = source; self.forecast = forecast
        }
        public init(from decoder: Decoder) throws {
            guard let c = try? decoder.container(keyedBy: AnyKey.self) else { return }
            summary = lossy(c, "summary", String.self); tempHighF = lossy(c, "tempHighF", Double.self); tempLowF = lossy(c, "tempLowF", Double.self)
            precipIn = lossy(c, "precipIn", Double.self); windMph = lossy(c, "windMph", Double.self); source = lossy(c, "source", String.self)
            forecast = lossy(c, "forecast", Bool.self)
        }
    }

    public struct Crew: Codable, Hashable, Sendable {
        public var name: String
        public var hours: Double
        public var role: String?
        public init(name: String, hours: Double, role: String? = nil) { self.name = name; self.hours = hours; self.role = role }
        public init(from decoder: Decoder) throws {
            let c = try? decoder.container(keyedBy: AnyKey.self)
            name = c.flatMap { lossy($0, "name", String.self) } ?? ""
            hours = c.flatMap { lossy($0, "hours", Double.self) } ?? 0
            role = c.flatMap { lossy($0, "role", String.self) }
        }
    }

    public struct Work: Codable, Hashable, Sendable {
        public var text: String
        public var sheetId: String?
        public var area: String?
        public init(text: String, sheetId: String? = nil, area: String? = nil) { self.text = text; self.sheetId = sheetId; self.area = area }
        public init(from decoder: Decoder) throws {
            let c = try? decoder.container(keyedBy: AnyKey.self)
            text = c.flatMap { lossy($0, "text", String.self) } ?? ""
            sheetId = c.flatMap { lossy($0, "sheetId", String.self) }
            area = c.flatMap { lossy($0, "area", String.self) }
        }
    }

    public struct Delay: Codable, Hashable, Sendable {
        public var reason: String
        public var hours: Double?
        /// Carries over to the next day's report ("Copy from yesterday").
        public var ongoing: Bool?
        public init(reason: String, hours: Double? = nil, ongoing: Bool? = nil) { self.reason = reason; self.hours = hours; self.ongoing = ongoing }
        public init(from decoder: Decoder) throws {
            let c = try? decoder.container(keyedBy: AnyKey.self)
            reason = c.flatMap { lossy($0, "reason", String.self) } ?? ""
            hours = c.flatMap { lossy($0, "hours", Double.self) }
            ongoing = c.flatMap { lossy($0, "ongoing", Bool.self) }
        }
    }

    public struct Safety: Codable, Hashable, Sendable {
        public var incident: Bool
        public var notes: String?
        public init(incident: Bool, notes: String? = nil) { self.incident = incident; self.notes = notes }
        public init(from decoder: Decoder) throws {
            let c = try? decoder.container(keyedBy: AnyKey.self)
            incident = c.flatMap { lossy($0, "incident", Bool.self) } ?? false
            notes = c.flatMap { lossy($0, "notes", String.self) }
        }
    }

    public struct Signature: Codable, Hashable, Sendable {
        public var name: String
        public var imageId: String
        public var signedAt: String
        public init(name: String, imageId: String, signedAt: String) { self.name = name; self.imageId = imageId; self.signedAt = signedAt }
        public init(from decoder: Decoder) throws {
            let c = try? decoder.container(keyedBy: AnyKey.self)
            name = c.flatMap { lossy($0, "name", String.self) } ?? ""
            imageId = c.flatMap { lossy($0, "imageId", String.self) } ?? ""
            signedAt = c.flatMap { lossy($0, "signedAt", String.self) } ?? ""
        }
    }

    public var weather: Weather?
    public var crew: [Crew]?
    public var work: [Work]?
    public var deliveries: [String]?
    public var equipment: [String]?
    public var delays: [Delay]?
    public var safety: Safety?
    public var visitors: [String]?
    public var signature: Signature?

    public init(weather: Weather? = Weather(), crew: [Crew]? = [], work: [Work]? = [], deliveries: [String]? = [], equipment: [String]? = [],
                delays: [Delay]? = [], safety: Safety? = nil, visitors: [String]? = [], signature: Signature? = nil) {
        self.weather = weather; self.crew = crew; self.work = work; self.deliveries = deliveries; self.equipment = equipment
        self.delays = delays; self.safety = safety; self.visitors = visitors; self.signature = signature
    }

    public init(from decoder: Decoder) throws {
        // Not an object: an empty report (every section stays nil).
        guard let c = try? decoder.container(keyedBy: AnyKey.self) else { return }
        weather = lossy(c, "weather", Weather.self)
        crew = lossy(c, "crew", [Crew].self)
        work = lossy(c, "work", [Work].self)
        deliveries = lossy(c, "deliveries", [String].self)
        equipment = lossy(c, "equipment", [String].self)
        delays = lossy(c, "delays", [Delay].self)
        safety = lossy(c, "safety", Safety.self)
        visitors = lossy(c, "visitors", [String].self)
        // A cleared signature is null; one without an image is treated as unsigned.
        let s = lossy(c, "signature", Signature.self)
        signature = (s?.imageId.isEmpty ?? true) ? nil : s
    }
}

/// The rules behind the daily report editor, list badges, weekly hours and the PDF (src/lib/dailyReport.ts).
public enum DailyReportLogic {
    public static func empty() -> DailyReport { DailyReport() }

    public static func isStructured(_ log: JobLog) -> Bool { log.report != nil }

    static func round2(_ n: Double) -> Double { (n * 100).rounded() / 100 }

    /// Hours for one person on one day: 0–24, two decimals.
    public static func clampHours(_ n: Double?) -> Double {
        guard let n, n.isFinite else { return 0 }
        return round2(min(24, max(0, n)))
    }

    /// "7,5", "8", " 10.25 " → hours clamped to 0–24; nil when it isn't a number.
    public static func parseHours(_ input: String) -> Double? {
        let t = input.trimmingCharacters(in: .whitespaces).replacingOccurrences(of: ",", with: ".")
        guard !t.isEmpty, t != ".", t != "-", let n = Double(t), n.isFinite else { return nil }
        return clampHours(n)
    }

    static func key(_ s: String) -> String {
        s.split(whereSeparator: { $0 == " " || $0 == "\t" || $0 == "\n" }).joined(separator: " ").lowercased()
    }
    static func tidy(_ s: String) -> String {
        s.split(whereSeparator: { $0 == " " || $0 == "\t" || $0 == "\n" }).joined(separator: " ")
    }
    static func trimmed(_ s: String?) -> String { (s ?? "").trimmingCharacters(in: .whitespacesAndNewlines) }
    static func lines(_ xs: [String]?) -> [String] { (xs ?? []).map { trimmed($0) }.filter { !$0.isEmpty } }

    /// Merge crew rows with the same name (case and spacing ignored): hours add up (max 24), the first role wins.
    /// Rows without a name are dropped; `duplicates` lists the merged names.
    public static func mergeCrew(_ crew: [DailyReport.Crew]) -> (crew: [DailyReport.Crew], duplicates: [String]) {
        var out: [DailyReport.Crew] = []
        var at: [String: Int] = [:]
        var dupes: [String] = []
        for c in crew {
            let name = tidy(c.name)
            if name.isEmpty { continue }
            let k = key(name)
            let role: String? = trimmed(c.role).isEmpty ? nil : trimmed(c.role)
            if let i = at[k] {
                out[i].hours = clampHours(out[i].hours + clampHours(c.hours))
                if out[i].role == nil { out[i].role = role }
                if !dupes.contains(out[i].name) { dupes.append(out[i].name) }
            } else {
                at[k] = out.count
                out.append(DailyReport.Crew(name: name, hours: clampHours(c.hours), role: role))
            }
        }
        return (out, dupes)
    }

    /// Tidy a report for saving: trim text, drop empty rows, merge duplicate crew, clamp hours.
    public static func cleaned(_ r: DailyReport) -> (report: DailyReport, duplicates: [String]) {
        let m = mergeCrew(r.crew ?? [])
        let w = r.weather ?? DailyReport.Weather()
        var weather = DailyReport.Weather()
        if !trimmed(w.summary).isEmpty { weather.summary = trimmed(w.summary) }
        weather.tempHighF = w.tempHighF; weather.tempLowF = w.tempLowF; weather.precipIn = w.precipIn; weather.windMph = w.windMph
        if weather.summary != nil || weather.tempHighF != nil || weather.tempLowF != nil || weather.precipIn != nil || weather.windMph != nil {
            weather.source = w.source
            weather.forecast = w.forecast == true ? true : nil
        }
        var out = DailyReport(weather: weather, crew: m.crew)
        out.work = (r.work ?? []).map { (x: DailyReport.Work) -> DailyReport.Work in
            DailyReport.Work(text: trimmed(x.text), sheetId: trimmed(x.sheetId).isEmpty ? nil : x.sheetId, area: trimmed(x.area).isEmpty ? nil : trimmed(x.area))
        }.filter { !$0.text.isEmpty }
        out.deliveries = lines(r.deliveries)
        out.equipment = lines(r.equipment)
        out.delays = (r.delays ?? []).map { (d: DailyReport.Delay) -> DailyReport.Delay in
            DailyReport.Delay(reason: trimmed(d.reason), hours: d.hours.map { clampHours($0) }, ongoing: d.ongoing == true ? true : nil)
        }.filter { !$0.reason.isEmpty }
        out.visitors = lines(r.visitors)
        if let s = r.safety { out.safety = DailyReport.Safety(incident: s.incident, notes: trimmed(s.notes).isEmpty ? nil : trimmed(s.notes)) }
        out.signature = r.signature
        return (out, m.duplicates)
    }

    /// Anything worth saving in the report.
    public static func hasContent(_ r: DailyReport?) -> Bool {
        guard let r else { return false }
        let w = r.weather
        if !trimmed(w?.summary).isEmpty || w?.tempHighF != nil || w?.tempLowF != nil || w?.precipIn != nil || w?.windMph != nil { return true }
        if (r.crew ?? []).contains(where: { !trimmed($0.name).isEmpty }) { return true }
        if (r.work ?? []).contains(where: { !trimmed($0.text).isEmpty }) { return true }
        if !lines(r.deliveries).isEmpty || !lines(r.equipment).isEmpty || !lines(r.visitors).isEmpty { return true }
        if (r.delays ?? []).contains(where: { !trimmed($0.reason).isEmpty }) { return true }
        return r.safety != nil || r.signature != nil
    }

    /// Start a report from the previous one: crew (names, roles, hours), equipment and the ongoing delays (hours
    /// lost start empty). Work, weather, deliveries, visitors, safety and the signature are per day.
    public static func copyFromPrevious(_ prev: JobLog?) -> DailyReport {
        var out = empty()
        guard let r = prev?.report else { return out }
        out.crew = mergeCrew(r.crew ?? []).crew
        out.equipment = lines(r.equipment)
        out.delays = (r.delays ?? []).filter { $0.ongoing == true && !trimmed($0.reason).isEmpty }
            .map { DailyReport.Delay(reason: trimmed($0.reason), hours: nil, ongoing: true) }
        return out
    }

    /// The log to copy from for `date`: the latest live log on an earlier day, preferring one with a report.
    public static func previousLog(_ logs: [JobLog], before date: String, excluding id: String? = nil) -> JobLog? {
        let before = logs.filter { $0.deleted != true && $0.id != id && $0.date < date }
            .sorted { ($0.date, $0.createdAt) > ($1.date, $1.createdAt) }
        return before.first(where: { $0.report != nil }) ?? before.first
    }

    public struct Totals: Equatable, Sendable {
        public var crew: Int
        public var manHours: Double
        public var delayHours: Double
    }

    public static func totals(_ r: DailyReport?) -> Totals {
        guard let r else { return Totals(crew: 0, manHours: 0, delayHours: 0) }
        let named = (r.crew ?? []).filter { !trimmed($0.name).isEmpty }
        let people = Set(named.map { key($0.name) }).count
        let man = named.reduce(0.0) { $0 + clampHours($1.hours) }
        let delay = (r.delays ?? []).filter { !trimmed($0.reason).isEmpty }.reduce(0.0) { $0 + clampHours($1.hours) }
        return Totals(crew: people, manHours: round2(man), delayHours: round2(delay))
    }

    /// "16 h", "7.5 h"
    public static func hoursText(_ n: Double) -> String { "\(number(n)) h" }
    /// 16 → "16", 7.5 → "7.5"
    public static func number(_ n: Double) -> String {
        let r = round2(n)
        return r == r.rounded() ? String(Int(r)) : String(r)
    }

    // MARK: Weather (Open-Meteo)

    public static func weatherCodeText(_ code: Int?) -> String? {
        guard let code else { return nil }
        switch code {
        case 0: return "Clear"
        case 1: return "Mostly clear"
        case 2: return "Partly cloudy"
        case 3: return "Overcast"
        case 45: return "Fog"
        case 48: return "Freezing fog"
        case 51: return "Light drizzle"
        case 53: return "Drizzle"
        case 55: return "Heavy drizzle"
        case 56, 57: return "Freezing drizzle"
        case 61: return "Light rain"
        case 63: return "Rain"
        case 65: return "Heavy rain"
        case 66, 67: return "Freezing rain"
        case 71: return "Light snow"
        case 73: return "Snow"
        case 75: return "Heavy snow"
        case 77: return "Snow grains"
        case 80, 81: return "Rain showers"
        case 82: return "Heavy rain showers"
        case 85: return "Snow showers"
        case 86: return "Heavy snow showers"
        case 95: return "Thunderstorms"
        case 96, 99: return "Thunderstorms with hail"
        default: return nil
        }
    }

    public static let weatherChoices = ["Clear", "Partly cloudy", "Overcast", "Fog", "Light rain", "Rain", "Heavy rain", "Snow", "Thunderstorms", "Windy"]

    /// SF Symbol for a weather summary.
    public static func weatherSymbol(_ summary: String?) -> String {
        let s = (summary ?? "").lowercased()
        if s.contains("thunder") || s.contains("storm") { return "cloud.bolt.rain" }
        if s.contains("snow") || s.contains("sleet") || s.contains("freezing") || s.contains("hail") { return "cloud.snow" }
        if s.contains("drizzle") { return "cloud.drizzle" }
        if s.contains("rain") || s.contains("shower") { return "cloud.rain" }
        if s.contains("fog") || s.contains("mist") || s.contains("haze") { return "cloud.fog" }
        if s.contains("partly") || s.contains("mostly clear") { return "cloud.sun" }
        if s.contains("overcast") || s.contains("cloud") { return "cloud" }
        if s.contains("wind") { return "wind" }
        if s.contains("clear") || s.contains("sun") { return "sun.max" }
        return "cloud"
    }

    private static func value(_ xs: Any?, _ i: Int) -> Double? {
        guard let a = xs as? [Any], i < a.count else { return nil }
        if let d = a[i] as? Double { return d.isFinite ? d : nil }
        if let n = a[i] as? Int { return Double(n) }
        return nil
    }

    /// One day of an Open-Meteo `daily` response → report weather (°F, inches, mph; converted if metric).
    /// Nil when the day isn't in the response or has no data. Days after `today` are marked as a forecast.
    public static func weatherFromOpenMeteo(_ data: Data, date: String, today: String? = nil) -> DailyReport.Weather? {
        guard let obj = try? JSONSerialization.jsonObject(with: data) else { return nil }
        return weatherFromOpenMeteo(json: obj, date: date, today: today)
    }

    public static func weatherFromOpenMeteo(json: Any, date: String, today: String? = nil) -> DailyReport.Weather? {
        guard let j = json as? [String: Any], let d = j["daily"] as? [String: Any], let times = d["time"] as? [String],
              let i = times.firstIndex(of: date) else { return nil }
        let u = j["daily_units"] as? [String: String] ?? [:]
        let code = value(d["weather_code"] ?? d["weathercode"], i)
        var hi = value(d["temperature_2m_max"], i)
        var lo = value(d["temperature_2m_min"], i)
        var precip = value(d["precipitation_sum"], i)
        var wind = value(d["wind_speed_10m_max"] ?? d["windspeed_10m_max"], i)
        if code == nil && hi == nil && lo == nil && precip == nil && wind == nil { return nil }
        if (u["temperature_2m_max"] ?? "").contains("C"), let h = hi { hi = h * 9 / 5 + 32 }
        if (u["temperature_2m_min"] ?? "").contains("C"), let l = lo { lo = l * 9 / 5 + 32 }
        if (u["precipitation_sum"] ?? "").contains("mm"), let p = precip { precip = p / 25.4 }
        let wu = u["wind_speed_10m_max"] ?? u["windspeed_10m_max"] ?? ""
        if let w = wind, wu.contains("km") { wind = w / 1.609344 } else if let w = wind, wu.contains("m/s") { wind = w * 2.236936 }
        var out = DailyReport.Weather(summary: weatherCodeText(code.map { Int($0) }),
                                      tempHighF: hi.map { $0.rounded() }, tempLowF: lo.map { $0.rounded() },
                                      precipIn: precip.map { round2($0) }, windMph: wind.map { $0.rounded() }, source: "auto")
        if let today, date > today { out.forecast = true }
        return out
    }

    private static var dayFormatter: DateFormatter {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = TimeZone(identifier: "UTC")
        f.dateFormat = "yyyy-MM-dd"
        return f
    }
    private static var utc: Calendar {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = TimeZone(identifier: "UTC") ?? .current
        return c
    }

    /// Whole days from `a` to `b` (YYYY-MM-DD).
    public static func daysBetween(_ a: String, _ b: String) -> Int {
        let f = dayFormatter
        guard let x = f.date(from: a), let y = f.date(from: b) else { return 0 }
        return utc.dateComponents([.day], from: x, to: y).day ?? 0
    }

    /// YYYY-MM-DD `n` days after `d`.
    public static func addDays(_ d: String, _ n: Int) -> String {
        let f = dayFormatter
        guard let x = f.date(from: d), let y = utc.date(byAdding: .day, value: n, to: x) else { return d }
        return f.string(from: y)
    }

    /// Open-Meteo URL for one day: the forecast API for the last 90 days and the next 15, the archive for older days,
    /// nil beyond the forecast. Imperial units, the job's own time zone.
    public static func openMeteoURL(lat: Double, lng: Double, date: String, today: String) -> URL? {
        guard lat.isFinite, lng.isFinite, date.count == 10, dayFormatter.date(from: date) != nil else { return nil }
        let ahead = daysBetween(today, date)
        if ahead > 15 { return nil }
        var c = URLComponents(string: ahead >= -90 ? "https://api.open-meteo.com/v1/forecast" : "https://archive-api.open-meteo.com/v1/archive")
        c?.queryItems = [
            URLQueryItem(name: "latitude", value: String(format: "%.4f", lat)),
            URLQueryItem(name: "longitude", value: String(format: "%.4f", lng)),
            URLQueryItem(name: "daily", value: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max"),
            URLQueryItem(name: "temperature_unit", value: "fahrenheit"),
            URLQueryItem(name: "wind_speed_unit", value: "mph"),
            URLQueryItem(name: "precipitation_unit", value: "inch"),
            URLQueryItem(name: "timezone", value: "auto"),
            URLQueryItem(name: "start_date", value: date),
            URLQueryItem(name: "end_date", value: date),
        ]
        return c?.url
    }

    /// "Rain · 55° / 46°F · 0.83 in precip · wind 22 mph" (+ " · forecast"); empty when nothing is filled in.
    public static func weatherLine(_ w: DailyReport.Weather?) -> String {
        guard let w else { return "" }
        var temp = ""
        if let hi = w.tempHighF, let lo = w.tempLowF { temp = "\(number(hi))° / \(number(lo))°F" }
        else if let hi = w.tempHighF { temp = "High \(number(hi))°F" }
        else if let lo = w.tempLowF { temp = "Low \(number(lo))°F" }
        var parts: [String] = [trimmed(w.summary), temp]
        if let p = w.precipIn, p > 0 { parts.append("\(number(p)) in precip") }
        if let wind = w.windMph { parts.append("wind \(number(wind)) mph") }
        parts = parts.filter { !$0.isEmpty }
        if parts.isEmpty { return "" }
        if w.forecast == true { parts.append("forecast") }
        return parts.joined(separator: " · ")
    }

    // MARK: Weekly hours

    /// Monday of the week containing `date`.
    public static func weekStart(of date: String) -> String {
        guard let d = dayFormatter.date(from: date) else { return date }
        let weekday = utc.component(.weekday, from: d) // 1 = Sunday
        return addDays(date, -((weekday + 5) % 7))
    }

    public struct WeeklyHours: Equatable, Sendable {
        public struct Row: Equatable, Sendable {
            public var name: String
            public var hours: [Double]
            public var total: Double
        }
        public var days: [String]
        public var rows: [Row]
        public var dayTotals: [Double]
        public var total: Double
    }

    /// Hours per person per day for the week starting `weekStart` (several logs a day add up; names merge ignoring case).
    public static func weeklyHours(_ logs: [JobLog], weekStart: String) -> WeeklyHours {
        let days = (0..<7).map { addDays(weekStart, $0) }
        var rows: [String: WeeklyHours.Row] = [:]
        for l in logs where l.deleted != true {
            guard let r = l.report, let di = days.firstIndex(of: l.date) else { continue }
            for c in r.crew ?? [] {
                let name = tidy(c.name)
                if name.isEmpty { continue }
                let k = key(name)
                var row = rows[k] ?? WeeklyHours.Row(name: name, hours: Array(repeating: 0, count: 7), total: 0)
                row.hours[di] = round2(row.hours[di] + clampHours(c.hours))
                rows[k] = row
            }
        }
        var list = rows.values.sorted { $0.name.localizedCompare($1.name) == .orderedAscending }
        for i in list.indices { list[i].total = round2(list[i].hours.reduce(0, +)) }
        let dayTotals = (0..<7).map { i in round2(list.reduce(0.0) { $0 + $1.hours[i] }) }
        return WeeklyHours(days: days, rows: list, dayTotals: dayTotals, total: round2(dayTotals.reduce(0, +)))
    }

    private static func csvCell(_ s: String) -> String {
        s.contains(",") || s.contains("\"") || s.contains("\n") ? "\"\(s.replacingOccurrences(of: "\"", with: "\"\""))\"" : s
    }

    /// Name, the seven dates, Total; a totals row at the end.
    public static func weeklyHoursCSV(_ w: WeeklyHours) -> String {
        var lines: [[String]] = [["Name"] + w.days + ["Total"]]
        for r in w.rows { lines.append([r.name] + r.hours.map { number($0) } + [number(r.total)]) }
        lines.append(["Total"] + w.dayTotals.map { number($0) } + [number(w.total)])
        return lines.map { $0.map(csvCell).joined(separator: ",") }.joined(separator: "\n") + "\n"
    }

    // MARK: Completeness and editing

    public enum Section: String, CaseIterable, Sendable {
        case weather, crew, work, safety, signature
        public var label: String {
            switch self {
            case .weather: return "Weather"
            case .crew: return "Crew & hours"
            case .work: return "Work performed"
            case .safety: return "Safety"
            case .signature: return "Signature"
            }
        }
    }

    /// Recommended sections still empty, in form order.
    public static func completeness(_ r: DailyReport?) -> [Section] {
        var out: [Section] = []
        let w = r?.weather
        if trimmed(w?.summary).isEmpty && w?.tempHighF == nil && w?.tempLowF == nil { out.append(.weather) }
        if !(r?.crew ?? []).contains(where: { !trimmed($0.name).isEmpty && clampHours($0.hours) > 0 }) { out.append(.crew) }
        if !(r?.work ?? []).contains(where: { !trimmed($0.text).isEmpty }) { out.append(.work) }
        if r?.safety == nil { out.append(.safety) }
        if r?.signature == nil { out.append(.signature) }
        return out
    }

    public enum EditAccess: Equatable, Sendable { case edit, confirm, denied }

    /// Unsigned logs: anyone. Signed logs: the author or the office (owner, admin, or working alone), after confirming
    /// that editing clears the signature.
    public static func editAccess(_ log: JobLog, role: TeamRole?, me: String?) -> EditAccess {
        guard let sig = log.report?.signature else { return .edit }
        if role != .tech { return .confirm }
        let m = key(me ?? "")
        if !m.isEmpty && (m == key(log.author ?? "") || m == key(sig.name)) { return .confirm }
        return .denied
    }

    /// Names for the crew picker: team members first, then people on recent reports.
    public static func crewSuggestions(members: [String], logs: [JobLog], limit: Int = 30) -> [String] {
        var out: [String] = []
        var seen = Set<String>()
        func add(_ n: String?) {
            let name = tidy(n ?? "")
            if name.isEmpty || seen.contains(key(name)) { return }
            seen.insert(key(name)); out.append(name)
        }
        members.forEach { add($0) }
        for l in logs.filter({ $0.deleted != true && $0.report != nil }).sorted(by: { $0.date > $1.date }) {
            for c in l.report?.crew ?? [] { add(c.name) }
        }
        return Array(out.prefix(limit))
    }
}

extension ProjectBundle {
    /// Signature images of the live daily reports (synced to <project>/<image id> like photos).
    public var signatureImageIds: [String] {
        jobLogs.filter { $0.deleted != true }.compactMap { $0.report?.signature?.imageId }.filter { !$0.isEmpty }
    }
}
