import XCTest
@testable import PinPlanCore

final class PhotoReportLayoutTests: XCTestCase {
    private let utc = TimeZone(identifier: "UTC")!
    private func photo(_ id: String, _ takenAt: String, room: String? = nil, beforeId: String? = nil) -> Photo {
        var p = Photo(id: id, projectId: "p", imageId: "i-\(id)", width: 4, height: 3, takenAt: takenAt)
        p.room = room; p.beforeId = beforeId
        return p
    }
    private func ids(_ s: PhotoReportLayout.Section<Photo>) -> [String] { s.cells.map { $0.map(\.id).joined(separator: "+") } }

    private lazy var all: [Photo] = [
        photo("e", "2026-11-19T09:00:00Z", room: "Kitchen", beforeId: "a"),
        photo("d", "2026-11-18T11:00:00Z"),
        photo("c", "2026-11-18T09:00:00Z", room: " Living  Room "),
        photo("b", "2026-11-17T10:00:00Z", room: "living room"),
        photo("a", "2026-11-17T09:00:00Z", room: "Kitchen"),
    ]

    func testDefaultIsOneSectionInOrder() {
        let s = PhotoReportLayout.sections(all, groupBy: .none, pairs: false)
        XCTAssertEqual(s.count, 1)
        XCTAssertEqual(s[0].title, "")
        XCTAssertEqual(ids(s[0]), ["a", "b", "c", "d", "e"])
        XCTAssertTrue(PhotoReportLayout.sections([], groupBy: .none, pairs: false).isEmpty)
    }

    func testGroupsByRoomAndDay() {
        let rooms = PhotoReportLayout.sections(all, groupBy: .room, pairs: false)
        XCTAssertEqual(rooms.map(\.title), ["Kitchen", "living room", PhotoReportLayout.noRoom])
        XCTAssertEqual(rooms.map(ids), [["a", "e"], ["b", "c"], ["d"]])
        let days = PhotoReportLayout.sections(all, groupBy: .day, pairs: false, timeZone: utc, dayTitle: { "Day \($0)" })
        XCTAssertEqual(days.map(\.title), ["Day 2026-11-17", "Day 2026-11-18", "Day 2026-11-19"])
        XCTAssertEqual(days.map(ids), [["a", "b"], ["c", "d"], ["e"]])
    }

    func testPairsBeforeAndAfter() {
        XCTAssertEqual(ids(PhotoReportLayout.sections(all, groupBy: .none, pairs: true)[0]), ["a+e", "b", "c", "d"])
        let days = PhotoReportLayout.sections(all, groupBy: .day, pairs: true, timeZone: utc, dayTitle: { $0 })
        XCTAssertEqual(days.map(ids), [["a+e", "b"], ["c", "d"]])
        let extra = [all[4], all[0], photo("e2", "2026-11-20T09:00:00Z", beforeId: "a"), photo("f", "2026-11-21T09:00:00Z", beforeId: "e")]
        XCTAssertEqual(ids(PhotoReportLayout.sections(extra, groupBy: .none, pairs: true)[0]), ["a+e", "e2", "f"])
    }

    private func shape(_ pages: [[PhotoReportLayout.Row<Int>]]) -> [[String]] {
        pages.map { $0.map { r in
            switch r {
            case .heading(let t): return "#\(t)"
            case .photos(let items, let pair): return (pair ? "P" : "") + items.map(String.init).joined(separator: ",")
            }
        } }
    }

    func testPagesKeepOldLayoutAndPlaceHeadingsAndPairs() {
        let singles = [PhotoReportLayout.Section(key: "", title: "", cells: (0..<5).map { [$0] })]
        XCTAssertEqual(shape(PhotoReportLayout.pages(singles, perPage: 2)), [["0,1"], ["2,3"], ["4"]])
        XCTAssertEqual(shape(PhotoReportLayout.pages(singles, perPage: 4)), [["0,1", "2,3"], ["4"]])
        let secs = [PhotoReportLayout.Section(key: "k", title: "Kitchen", cells: [[0], [1, 2], [3]]),
                    PhotoReportLayout.Section(key: "l", title: "Living", cells: [[4], [5]])]
        XCTAssertEqual(shape(PhotoReportLayout.pages(secs, perPage: 4)), [["#Kitchen", "0", "P1,2"], ["3", "#Living", "4,5"]])
        XCTAssertEqual(shape(PhotoReportLayout.pages(secs, perPage: 1)), [["#Kitchen", "0"], ["P1,2"], ["3"], ["#Living", "4"], ["5"]])
    }

    func testCommentsAndSnapshot() {
        var c1 = PhotoComment(projectId: "p", photoId: "a", author: " Sam ", text: "second"); c1.createdAt = "2026-11-19T02:00:00Z"
        var c2 = PhotoComment(projectId: "p", photoId: "a", author: nil, text: " first "); c2.createdAt = "2026-11-19T01:00:00Z"
        var c3 = PhotoComment(projectId: "p", photoId: "a", author: nil, text: "gone"); c3.deleted = true
        let c4 = PhotoComment(projectId: "p", photoId: "b", author: nil, text: "other")
        let list = PhotoReportLayout.comments([c1, c2, c3, c4], photoId: "a")
        XCTAssertEqual(list.map(\.text), ["first", "second"])
        XCTAssertEqual(list.map(\.author), ["", "Sam"])

        let secs = PhotoReportLayout.sections(all, groupBy: .room, pairs: true)
        let order = ["a", "b", "c", "d", "e"]
        let snap = PhotoReportLayout.snapshotSections(secs, indexOf: Dictionary(uniqueKeysWithValues: order.enumerated().map { ($1, $0) }))
        XCTAssertEqual(snap.map { $0["title"] as? String }, ["Kitchen", "living room", PhotoReportLayout.noRoom])
        XCTAssertEqual(snap.map { $0["cells"] as? [[Int]] }, [[[0, 4]], [[1], [2]], [[3]]])
        XCTAssertNoThrow(try JSONSerialization.data(withJSONObject: snap))
    }
}
