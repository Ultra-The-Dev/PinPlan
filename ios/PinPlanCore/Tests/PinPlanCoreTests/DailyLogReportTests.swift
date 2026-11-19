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
}
