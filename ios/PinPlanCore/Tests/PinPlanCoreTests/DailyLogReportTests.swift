import XCTest
@testable import PinPlanCore

final class DailyLogReportTests: XCTestCase {
    private func log(_ id: String, _ date: String, created: String? = nil, deleted: Bool = false, photos: [String]? = nil) -> JobLog {
        var l = JobLog(id: id, projectId: "p", date: date)
        l.createdAt = created ?? "\(date)T08:00:00.000Z"
        l.deleted = deleted ? true : nil
        l.photoIds = photos
        return l
    }

    func testPicksLiveLogsInRangeOldestFirst() {
        let logs = [log("c", "2026-03-04"), log("a", "2026-03-02"), log("x", "2026-03-03", deleted: true), log("b", "2026-03-03"),
                    log("b2", "2026-03-03", created: "2026-03-03T07:00:00.000Z")]
        XCTAssertEqual(DailyLogReport.logs(logs).map(\.id), ["a", "b2", "b", "c"])
        XCTAssertEqual(DailyLogReport.logs(logs, from: "2026-03-03", to: "2026-03-03").map(\.id), ["b2", "b"])
        XCTAssertEqual(DailyLogReport.logs(logs, from: "2026-03-03").map(\.id), ["b2", "b", "c"])
        XCTAssertEqual(DailyLogReport.logs(logs, to: "2026-03-02").map(\.id), ["a"])
        XCTAssertEqual(DailyLogReport.logs(logs, from: "2026-03-04", to: "2026-03-03").map(\.id), ["b2", "b", "c"])
        XCTAssertEqual(DailyLogReport.logs(logs, from: "2026-04-01", to: "2026-04-30").count, 0)
    }

    func testLogPhotosInOrderTaken() {
        let p2 = Photo(id: "p2", projectId: "p", imageId: "i2", width: 4, height: 3, takenAt: "2026-03-02T15:00:00.000Z")
        let p1 = Photo(id: "p1", projectId: "p", imageId: "i1", width: 4, height: 3, takenAt: "2026-03-02T09:00:00.000Z")
        var p3 = Photo(id: "p3", projectId: "p", imageId: "i3", width: 4, height: 3, takenAt: "2026-03-02T10:00:00.000Z")
        p3.deleted = true
        let other = Photo(id: "other", projectId: "p", imageId: "i4", width: 4, height: 3, takenAt: "2026-03-02T11:00:00.000Z")
        let l = log("a", "2026-03-02", photos: ["p2", "p1", "p3", "gone"])
        XCTAssertEqual(DailyLogReport.photos(for: l, in: [p2, p1, p3, other]).map(\.id), ["p1", "p2"])
        XCTAssertEqual(DailyLogReport.photos(for: log("n", "2026-03-02"), in: [p1]).count, 0)
    }

    func testFileName() {
        XCTAssertNil(DailyLogReport.days([]))
        XCTAssertEqual(DailyLogReport.fileName(jobSlug: "12-oak-st", logs: [log("a", "2026-03-02")]), "12-oak-st-daily-log-2026-03-02.pdf")
        XCTAssertEqual(DailyLogReport.fileName(jobSlug: "12-oak-st", logs: [log("a", "2026-03-02"), log("b", "2026-03-02")]), "12-oak-st-daily-logs-2026-03-02.pdf")
        XCTAssertEqual(DailyLogReport.fileName(jobSlug: "12-oak-st", logs: [log("b", "2026-03-04"), log("a", "2026-03-02")]), "12-oak-st-daily-logs-2026-03-02-to-2026-03-04.pdf")
        XCTAssertEqual(DailyLogReport.fileName(jobSlug: "", logs: []), "job-daily-logs.pdf")
    }

    func testLegacyLogsHaveNoStructuredSections() {
        XCTAssertNil(DailyLogReport.sections(for: log("a", "2026-03-02")))
        XCTAssertNil(DailyLogReport.rangeSummary([log("a", "2026-03-02"), log("b", "2026-03-03")]))
    }

    func testStructuredSections() {
        var l = log("a", "2026-03-02")
        l.report = DailyReport(
            weather: DailyReport.Weather(summary: "Rain", tempHighF: 55, tempLowF: 46, precipIn: 0.83, windMph: 22, source: "auto"),
            crew: [DailyReport.Crew(name: "Ana", hours: 8, role: "Foreman"), DailyReport.Crew(name: "Ben", hours: 7.5), DailyReport.Crew(name: " ", hours: 4)],
            work: [DailyReport.Work(text: "Pulled Cat6", sheetId: "s1", area: "Kitchen"), DailyReport.Work(text: "Set boxes"), DailyReport.Work(text: "")],
            deliveries: ["2 boxes Cat6", ""], equipment: ["Lift"],
            delays: [DailyReport.Delay(reason: "Waiting on GC", hours: 1.5, ongoing: true), DailyReport.Delay(reason: "Parts")],
            safety: DailyReport.Safety(incident: true, notes: "Cut finger, first aid"), visitors: ["Inspector — passed rough-in"],
            signature: DailyReport.Signature(name: "Ana", imageId: "sig", signedAt: "2026-03-02T22:00:00.000Z"))
        let s = DailyLogReport.sections(for: l, sheetName: { $0 == "s1" ? "Level 1" : nil })
        XCTAssertEqual(s?.weather, "Rain · 55° / 46°F · 0.83 in precip · wind 22 mph")
        XCTAssertEqual(s?.crew.map(\.name), ["Ana", "Ben"])
        XCTAssertEqual(s?.crew.first?.role, "Foreman")
        XCTAssertEqual(s?.manHours, 15.5)
        XCTAssertEqual(s?.work, ["Pulled Cat6 (Level 1 · Kitchen)", "Set boxes"])
        XCTAssertEqual(s?.deliveries, ["2 boxes Cat6"])
        XCTAssertEqual(s?.delays, ["Waiting on GC · 1.5 h lost · ongoing", "Parts"])
        XCTAssertEqual(s?.delayHours, 1.5)
        XCTAssertEqual(s?.safety, "Incident: Cut finger, first aid")
        XCTAssertEqual(s?.incident, true)
        XCTAssertEqual(s?.signature?.imageId, "sig")
        var ok = log("b", "2026-03-02")
        ok.report = DailyReport(safety: DailyReport.Safety(incident: false))
        XCTAssertEqual(DailyLogReport.sections(for: ok)?.safety, "No incidents")
    }

    func testRangeSummary() {
        var a = log("a", "2026-03-03")
        a.report = DailyReport(crew: [DailyReport.Crew(name: "Ana", hours: 8), DailyReport.Crew(name: "Ben", hours: 8)], delays: [DailyReport.Delay(reason: "Rain", hours: 2)])
        var b = log("b", "2026-03-02")
        b.report = DailyReport(crew: [DailyReport.Crew(name: "Ana", hours: 6)], safety: DailyReport.Safety(incident: true))
        var c = log("c", "2026-03-03")
        c.report = DailyReport(crew: [DailyReport.Crew(name: "Cy", hours: 4)])
        var x = log("x", "2026-03-04", deleted: true)
        x.report = DailyReport(crew: [DailyReport.Crew(name: "Ana", hours: 8)])
        let s = DailyLogReport.rangeSummary([a, b, c, log("d", "2026-03-04"), x])
        XCTAssertEqual(s?.rows, [DailyLogReport.SummaryRow(date: "2026-03-02", crew: 1, manHours: 6, delayHours: 0, incident: true),
                                 DailyLogReport.SummaryRow(date: "2026-03-03", crew: 3, manHours: 20, delayHours: 2, incident: false)])
        XCTAssertEqual(s?.manHours, 26)
        XCTAssertEqual(s?.delayHours, 2)
        XCTAssertEqual(s?.incidents, 1)
    }
}
