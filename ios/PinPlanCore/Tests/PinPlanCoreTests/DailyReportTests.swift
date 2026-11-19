import XCTest
@testable import PinPlanCore

/// Same cases as tests/dailyReport.test.ts (and the same Open-Meteo fixture).
final class DailyReportTests: XCTestCase {
    private func log(_ id: String, _ date: String, _ report: DailyReport? = nil, deleted: Bool = false) -> JobLog {
        var l = JobLog(id: id, projectId: "p", date: date)
        l.createdAt = "\(date)T08:00:00.000Z"
        l.report = report
        l.deleted = deleted ? true : nil
        return l
    }
    private func fixture() throws -> Data {
        let url = try XCTUnwrap(Bundle.module.url(forResource: "open-meteo-daily", withExtension: "json", subdirectory: "Fixtures"))
        return try Data(contentsOf: url)
    }
    private typealias C = DailyReport.Crew

    func testDecodesLogsWithAndWithoutReport() throws {
        let legacy = #"{"id":"a","projectId":"p","date":"2026-11-19","body":"Pulled wire","createdAt":"x","updatedAt":"x"}"#
        let l = try JSONDecoder().decode(JobLog.self, from: Data(legacy.utf8))
        XCTAssertNil(l.report)
        XCTAssertFalse(DailyReportLogic.isStructured(l))
        let nullReport = #"{"id":"a","projectId":"p","date":"2026-11-19","body":"","createdAt":"x","updatedAt":"x","report":null}"#
        XCTAssertNil(try JSONDecoder().decode(JobLog.self, from: Data(nullReport.utf8)).report)
        // Odd and unknown fields are tolerated.
        let odd = #"{"id":"a","projectId":"p","date":"2026-11-19","body":"","createdAt":"x","updatedAt":"x","report":{"crew":[{"name":"Ana","hours":8,"extra":1},{"hours":"x"}],"weather":{"summary":3,"tempHighF":50},"safety":{"incident":true},"signature":null,"future":{"a":1}}}"#
        let o = try JSONDecoder().decode(JobLog.self, from: Data(odd.utf8))
        XCTAssertTrue(DailyReportLogic.isStructured(o))
        XCTAssertEqual(o.report?.crew?.first, C(name: "Ana", hours: 8))
        XCTAssertEqual(o.report?.crew?.count, 2)
        XCTAssertNil(o.report?.weather?.summary)
        XCTAssertEqual(o.report?.weather?.tempHighF, 50)
        XCTAssertEqual(o.report?.safety?.incident, true)
        XCTAssertNil(o.report?.signature)
        // Round trip.
        let back = try JSONDecoder().decode(JobLog.self, from: try JSONEncoder().encode(o))
        XCTAssertEqual(back.report, o.report)
    }

    func testParsesAndClampsHours() {
        XCTAssertEqual(DailyReportLogic.parseHours("8"), 8)
        XCTAssertEqual(DailyReportLogic.parseHours("7,5"), 7.5)
        XCTAssertEqual(DailyReportLogic.parseHours(" 10.25 "), 10.25)
        XCTAssertEqual(DailyReportLogic.parseHours("30"), 24)
        XCTAssertEqual(DailyReportLogic.parseHours("-2"), 0)
        XCTAssertNil(DailyReportLogic.parseHours(""))
        XCTAssertNil(DailyReportLogic.parseHours("abc"))
    }

    func testMergesDuplicateCrew() {
        let m = DailyReportLogic.mergeCrew([C(name: "Ana Ruiz", hours: 8, role: "Foreman"), C(name: " ana  ruiz ", hours: 4, role: "Tech"), C(name: "", hours: 3),
                                            C(name: "Ben", hours: 20), C(name: "BEN", hours: 10)])
        XCTAssertEqual(m.crew, [C(name: "Ana Ruiz", hours: 12, role: "Foreman"), C(name: "Ben", hours: 24)])
        XCTAssertEqual(m.duplicates, ["Ana Ruiz", "Ben"])
    }

    func testCleansForSaving() {
        var r = DailyReport()
        r.weather = DailyReport.Weather(summary: " Rain ", tempHighF: 50, source: "manual")
        r.crew = [C(name: "Ana", hours: 8), C(name: "ana", hours: 2)]
        r.work = [DailyReport.Work(text: " Pulled Cat6 ", sheetId: "s1", area: " "), DailyReport.Work(text: " ")]
        r.deliveries = ["", " 2 boxes Cat6 "]
        r.delays = [DailyReport.Delay(reason: "Waiting on GC", hours: 30, ongoing: true), DailyReport.Delay(reason: "")]
        r.safety = DailyReport.Safety(incident: false, notes: "  ")
        let c = DailyReportLogic.cleaned(r)
        XCTAssertEqual(c.duplicates, ["Ana"])
        XCTAssertEqual(c.report.weather, DailyReport.Weather(summary: "Rain", tempHighF: 50, source: "manual"))
        XCTAssertEqual(c.report.crew, [C(name: "Ana", hours: 10)])
        XCTAssertEqual(c.report.work, [DailyReport.Work(text: "Pulled Cat6", sheetId: "s1", area: nil)])
        XCTAssertEqual(c.report.deliveries, ["2 boxes Cat6"])
        XCTAssertEqual(c.report.delays, [DailyReport.Delay(reason: "Waiting on GC", hours: 24, ongoing: true)])
        XCTAssertEqual(c.report.safety, DailyReport.Safety(incident: false, notes: nil))
        XCTAssertFalse(DailyReportLogic.hasContent(DailyReport()))
        XCTAssertTrue(DailyReportLogic.hasContent(c.report))
    }

    private var prevReport: DailyReport {
        DailyReport(weather: DailyReport.Weather(summary: "Rain", tempHighF: 50),
                    crew: [C(name: "Ana", hours: 8, role: "Foreman"), C(name: "Ben", hours: 6.5)],
                    work: [DailyReport.Work(text: "Rough-in 2nd floor")], deliveries: ["Cat6"], equipment: ["Scissor lift", " "],
                    delays: [DailyReport.Delay(reason: "Waiting on inspection", hours: 2, ongoing: true), DailyReport.Delay(reason: "Rain", hours: 1)],
                    safety: DailyReport.Safety(incident: true, notes: "Cut finger"), visitors: ["GC"],
                    signature: DailyReport.Signature(name: "Ana", imageId: "img", signedAt: "2026-11-18T17:00:00.000Z"))
    }

    func testCopyFromPrevious() {
        let r = DailyReportLogic.copyFromPrevious(log("y", "2026-11-18", prevReport))
        XCTAssertEqual(r.crew, [C(name: "Ana", hours: 8, role: "Foreman"), C(name: "Ben", hours: 6.5)])
        XCTAssertEqual(r.equipment, ["Scissor lift"])
        XCTAssertEqual(r.delays, [DailyReport.Delay(reason: "Waiting on inspection", hours: nil, ongoing: true)])
        XCTAssertEqual(r.work, [])
        XCTAssertEqual(r.weather, DailyReport.Weather())
        XCTAssertEqual(r.deliveries, [])
        XCTAssertNil(r.safety)
        XCTAssertNil(r.signature)
        XCTAssertEqual(DailyReportLogic.copyFromPrevious(log("y", "2026-11-18")), DailyReport())
        XCTAssertEqual(DailyReportLogic.copyFromPrevious(nil), DailyReport())

        let logs = [log("old", "2026-11-10", prevReport), log("legacy", "2026-11-17"), log("y", "2026-11-17", prevReport),
                    log("today", "2026-11-19", prevReport), log("gone", "2026-11-18", prevReport, deleted: true)]
        XCTAssertEqual(DailyReportLogic.previousLog(logs, before: "2026-11-19")?.id, "y")
        XCTAssertEqual(DailyReportLogic.previousLog(logs, before: "2026-11-17")?.id, "old")
        XCTAssertEqual(DailyReportLogic.previousLog([log("legacy", "2026-11-17")], before: "2026-11-19")?.id, "legacy")
        XCTAssertNil(DailyReportLogic.previousLog(logs, before: "2026-11-01"))
    }

    func testTotals() {
        XCTAssertEqual(DailyReportLogic.totals(nil), DailyReportLogic.Totals(crew: 0, manHours: 0, delayHours: 0))
        let r = DailyReport(crew: [C(name: "Ana", hours: 8), C(name: "Ben", hours: 7.5), C(name: "", hours: 9), C(name: "Cy", hours: 40)],
                            delays: [DailyReport.Delay(reason: "Rain", hours: 1.5), DailyReport.Delay(reason: "Parts"), DailyReport.Delay(reason: "", hours: 3)])
        XCTAssertEqual(DailyReportLogic.totals(r), DailyReportLogic.Totals(crew: 3, manHours: 39.5, delayHours: 1.5))
        XCTAssertEqual(DailyReportLogic.hoursText(16), "16 h")
        XCTAssertEqual(DailyReportLogic.hoursText(7.5), "7.5 h")
    }

    func testWeeklyHours() {
        XCTAssertEqual(DailyReportLogic.weekStart(of: "2026-11-19"), "2026-11-16")
        XCTAssertEqual(DailyReportLogic.weekStart(of: "2026-11-16"), "2026-11-16")
        XCTAssertEqual(DailyReportLogic.weekStart(of: "2026-11-22"), "2026-11-16")
        XCTAssertEqual(DailyReportLogic.addDays("2026-12-30", 3), "2027-01-02")
        let logs = [
            log("a", "2026-11-16", DailyReport(crew: [C(name: "Ana", hours: 8), C(name: "Ben", hours: 8)])),
            log("b", "2026-11-16", DailyReport(crew: [C(name: "ana", hours: 2)])),
            log("c", "2026-11-18", DailyReport(crew: [C(name: "Ben", hours: 7.5)])),
            log("d", "2026-11-23", DailyReport(crew: [C(name: "Ana", hours: 8)])),
            log("e", "2026-11-17", DailyReport(crew: [C(name: "Ana", hours: 8)]), deleted: true),
            log("f", "2026-11-17"),
        ]
        let w = DailyReportLogic.weeklyHours(logs, weekStart: "2026-11-16")
        XCTAssertEqual(w.days, ["2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20", "2026-11-21", "2026-11-22"])
        XCTAssertEqual(w.rows.map(\.name), ["Ana", "Ben"])
        XCTAssertEqual(w.rows[0].hours, [10, 0, 0, 0, 0, 0, 0])
        XCTAssertEqual(w.rows[1].hours, [8, 0, 7.5, 0, 0, 0, 0])
        XCTAssertEqual(w.rows[1].total, 15.5)
        XCTAssertEqual(w.dayTotals, [18, 0, 7.5, 0, 0, 0, 0])
        XCTAssertEqual(w.total, 25.5)
        let csv = DailyReportLogic.weeklyHoursCSV(w).split(separator: "\n").map(String.init)
        XCTAssertEqual(csv[0], "Name,2026-11-16,2026-11-17,2026-11-18,2026-11-19,2026-11-20,2026-11-21,2026-11-22,Total")
        XCTAssertEqual(csv[2], "Ben,8,0,7.5,0,0,0,0,15.5")
        XCTAssertEqual(csv[3], "Total,18,0,7.5,0,0,0,0,25.5")
    }

    func testWeatherFromOpenMeteoFixture() throws {
        let data = try fixture()
        XCTAssertEqual(DailyReportLogic.weatherFromOpenMeteo(data, date: "2026-11-18"),
                       DailyReport.Weather(summary: "Rain", tempHighF: 55, tempLowF: 46, precipIn: 0.83, windMph: 22, source: "auto"))
        XCTAssertEqual(DailyReportLogic.weatherFromOpenMeteo(data, date: "2026-11-16"),
                       DailyReport.Weather(summary: "Clear", tempHighF: 58, tempLowF: 41, precipIn: 0, windMph: 9, source: "auto"))
        XCTAssertEqual(DailyReportLogic.weatherFromOpenMeteo(data, date: "2026-11-20", today: "2026-11-19"),
                       DailyReport.Weather(summary: "Light snow", tempHighF: 33, tempLowF: 28, precipIn: 1.24, windMph: 18, source: "auto", forecast: true))
        XCTAssertEqual(DailyReportLogic.weatherFromOpenMeteo(data, date: "2026-11-21")?.summary, "Thunderstorms")
        XCTAssertNil(DailyReportLogic.weatherFromOpenMeteo(data, date: "2026-11-22"))
        XCTAssertNil(DailyReportLogic.weatherFromOpenMeteo(data, date: "2026-12-01"))
        XCTAssertNil(DailyReportLogic.weatherFromOpenMeteo(Data("null".utf8), date: "2026-11-18"))

        let metric = #"{"daily_units":{"temperature_2m_max":"°C","temperature_2m_min":"°C","precipitation_sum":"mm","wind_speed_10m_max":"km/h"},"daily":{"time":["2026-01-02"],"weathercode":[45],"temperature_2m_max":[10],"temperature_2m_min":[0],"precipitation_sum":[25.4],"wind_speed_10m_max":[16.09344]}}"#
        XCTAssertEqual(DailyReportLogic.weatherFromOpenMeteo(Data(metric.utf8), date: "2026-01-02"),
                       DailyReport.Weather(summary: "Fog", tempHighF: 50, tempLowF: 32, precipIn: 1, windMph: 10, source: "auto"))
    }

    func testOpenMeteoURLAndWeatherLine() throws {
        let u = try XCTUnwrap(DailyReportLogic.openMeteoURL(lat: 40.7128, lng: -74.006, date: "2026-11-18", today: "2026-11-19"))
        XCTAssertTrue(u.absoluteString.hasPrefix("https://api.open-meteo.com/v1/forecast?"))
        let q = URLComponents(url: u, resolvingAgainstBaseURL: false)?.queryItems ?? []
        let get: (String) -> String? = { name in q.first(where: { $0.name == name })?.value }
        XCTAssertEqual(get("start_date"), "2026-11-18")
        XCTAssertEqual(get("timezone"), "auto")
        XCTAssertEqual(get("temperature_unit"), "fahrenheit")
        XCTAssertTrue(DailyReportLogic.openMeteoURL(lat: 40.7, lng: -74, date: "2026-08-21", today: "2026-11-19")?.absoluteString.contains("api.open-meteo.com") == true)
        XCTAssertTrue(DailyReportLogic.openMeteoURL(lat: 40.7, lng: -74, date: "2026-08-20", today: "2026-11-19")?.absoluteString.hasPrefix("https://archive-api.open-meteo.com/v1/archive?") == true)
        XCTAssertNil(DailyReportLogic.openMeteoURL(lat: 40.7, lng: -74, date: "2026-12-20", today: "2026-11-19"))

        XCTAssertEqual(DailyReportLogic.weatherLine(DailyReport.Weather(summary: "Rain", tempHighF: 55, tempLowF: 46, precipIn: 0.83, windMph: 22)),
                       "Rain · 55° / 46°F · 0.83 in precip · wind 22 mph")
        XCTAssertEqual(DailyReportLogic.weatherLine(DailyReport.Weather(summary: "Clear", tempHighF: 58, precipIn: 0, forecast: true)), "Clear · High 58°F · forecast")
        XCTAssertEqual(DailyReportLogic.weatherLine(DailyReport.Weather()), "")
        XCTAssertEqual(DailyReportLogic.weatherSymbol("Light snow"), "cloud.snow")
        XCTAssertEqual(DailyReportLogic.weatherSymbol("Clear"), "sun.max")
    }

    func testCompletenessAndEditAccess() {
        XCTAssertEqual(DailyReportLogic.completeness(DailyReport()), [.weather, .crew, .work, .safety, .signature])
        XCTAssertEqual(DailyReportLogic.completeness(nil), [.weather, .crew, .work, .safety, .signature])
        let full = DailyReport(weather: DailyReport.Weather(tempHighF: 50), crew: [C(name: "Ana", hours: 8)], work: [DailyReport.Work(text: "Trim-out")],
                               safety: DailyReport.Safety(incident: false), signature: DailyReport.Signature(name: "Ana", imageId: "i", signedAt: "x"))
        XCTAssertEqual(DailyReportLogic.completeness(full), [])
        XCTAssertEqual(DailyReportLogic.completeness(DailyReport(crew: [C(name: "Ana", hours: 0)], safety: DailyReport.Safety(incident: true))), [.weather, .crew, .work, .signature])

        var signed = log("s", "2026-11-19", DailyReport(signature: DailyReport.Signature(name: "Ana Ruiz", imageId: "i", signedAt: "x")))
        signed.author = "ana"
        XCTAssertEqual(DailyReportLogic.editAccess(log("u", "2026-11-19"), role: .tech, me: "ben"), .edit)
        XCTAssertEqual(DailyReportLogic.editAccess(signed, role: .admin, me: "ben"), .confirm)
        XCTAssertEqual(DailyReportLogic.editAccess(signed, role: nil, me: "ben"), .confirm)
        XCTAssertEqual(DailyReportLogic.editAccess(signed, role: .tech, me: "Ana"), .confirm)
        XCTAssertEqual(DailyReportLogic.editAccess(signed, role: .tech, me: "ana ruiz"), .confirm)
        XCTAssertEqual(DailyReportLogic.editAccess(signed, role: .tech, me: "ben"), .denied)

        let logs = [log("a", "2026-11-17", DailyReport(crew: [C(name: "Cy", hours: 8), C(name: "ana", hours: 8)])), log("b", "2026-11-18", DailyReport(crew: [C(name: "Dee", hours: 8)]))]
        XCTAssertEqual(DailyReportLogic.crewSuggestions(members: ["Ana", "Ben", " "], logs: logs), ["Ana", "Ben", "Dee", "Cy"])
    }

    func testSyncMapsTheReportColumn() {
        let cols = SyncMap.specs[.jobLogs]?.columns.map { $0.1 } ?? []
        XCTAssertTrue(cols.contains("report"))
    }
}
