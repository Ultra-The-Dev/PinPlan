import XCTest
@testable import PinPlanCore

final class FieldDocsTests: XCTestCase {
    func testChecklistNeedsPhotosWhereRequired() {
        var c = FieldDocs.checklist(from: FieldDocs.templates[0], projectId: "p")
        c.items[0].done = true   // needs a photo
        c.items[6].done = true   // doesn't
        XCTAssertEqual(FieldDocs.progress(c, photos: []).done, 1)
        XCTAssertEqual(FieldDocs.progress(c, photos: []).missingPhotos, 1)
        var p = Photo(projectId: "p", imageId: "i", width: 4, height: 3)
        p.checklistId = c.id; p.checklistItemId = c.items[0].id
        XCTAssertEqual(FieldDocs.progress(c, photos: [p]).done, 2)
    }

    func testOldSavedJobsStillLoad() throws {
        let b = ProjectBundle(project: Project(id: "p", clientName: "c", address: "a"))
        var json = try JSONSerialization.jsonObject(with: JSONEncoder().encode(b)) as! [String: Any]
        for k in ["photos", "photoComments", "checklists", "jobLogs", "documents"] { json.removeValue(forKey: k) }
        let old = try JSONDecoder().decode(ProjectBundle.self, from: JSONSerialization.data(withJSONObject: json))
        XCTAssertEqual(old.photos, [])
        XCTAssertEqual(old.project.id, "p")
    }

    func testPhotosSyncAndTimeline() {
        var b = ProjectBundle(project: Project(id: "p1", clientName: "c", address: "a"))
        var p = Photo(projectId: "p1", imageId: "img", width: 4032, height: 3024, takenBy: "jane", lat: 40.7, lng: -73.9)
        p.tags = ["Camera"]; p.caption = "Front porch"
        p.annotations = [PhotoShape(kind: .arrow, color: "#ef4444", width: 0.006, points: [0.1, 0.1, 0.5, 0.5])]
        b.photos = [p]
        b.checklists = [FieldDocs.checklist(from: FieldDocs.templates[2], projectId: "p1")]
        b.jobLogs = [JobLog(projectId: "p1", date: "2026-11-19", title: "Rough-in", body: "Pulled 30 Cat6")]
        b.photoComments = [PhotoComment(projectId: "p1", photoId: p.id, author: "mike", text: "Move this 6 inches left")]
        let state = SyncState(bundles: [b], catalog: [], products: [])
        var other = SyncState(bundles: [], catalog: [], products: [])
        var ledger = SyncLedger()
        for row in state.changes(since: SyncLedger()) {
            var r = SyncMap.toRemote(row.table, row.json)
            r["synced_at"] = "2026-11-19 17:00:00+00"
            XCTAssertEqual(other.merge(row.table, remote: r, ledger: &ledger), .applied, "\(row.table)")
        }
        XCTAssertEqual(other.bundles["p1"]?.photos, b.photos)
        XCTAssertEqual(other.bundles["p1"]?.checklists, b.checklists)
        XCTAssertEqual(other.bundles["p1"]?.jobLogs, b.jobLogs)
        let t = FieldDocs.timeline(b)
        XCTAssertTrue(t.contains { $0.kind == .photos && $0.who == "jane" })
        XCTAssertTrue(t.contains { $0.kind == .comment })
        XCTAssertEqual(FieldDocs.filter(b.photos, tags: ["Camera"], text: "porch").count, 1)
    }

    func testLocalDayAndGrouping() {
        let ny = TimeZone(identifier: "America/New_York")!
        XCTAssertEqual(FieldDocs.localDay("2026-11-19T03:30:00.000Z", timeZone: ny), "2026-11-18")
        XCTAssertEqual(FieldDocs.localDay("2026-11-19T15:30:00Z", timeZone: ny), "2026-11-19")
        var a = Photo(projectId: "p", imageId: "a", width: 1, height: 1, takenAt: "2026-11-19T15:00:00.000Z")
        var b = Photo(projectId: "p", imageId: "b", width: 1, height: 1, takenAt: "2026-11-19T03:00:00.000Z")
        a.id = "a"; b.id = "b"
        let g = FieldDocs.byDay([b, a], timeZone: ny)
        XCTAssertEqual(g.map(\.day), ["2026-11-19", "2026-11-18"])
        XCTAssertEqual(g[0].photos.map(\.id), ["a"])
    }

    func testSaveUpdateRemoveRows() {
        var b = ProjectBundle(project: Project(clientName: "C", address: "A"))
        var p = Photo(projectId: b.project.id, imageId: "img", width: 10, height: 10, lat: 40.7, lng: -73.9)
        p.updatedAt = "2000-01-01T00:00:00.000Z"
        b.save(p, in: \.photos)
        XCTAssertEqual(b.photos.count, 1)
        XCTAssertNotEqual(b.photos[0].updatedAt, "2000-01-01T00:00:00.000Z")
        XCTAssertEqual(b.project.lat, 40.7)
        p.caption = "Rack"
        b.save(p, in: \.photos)
        XCTAssertEqual(b.photos.count, 1)
        XCTAssertEqual(b.photos[0].caption, "Rack")
        b.update([p.id], in: \.photos) { $0.tags = ["Rack"] }
        XCTAssertEqual(b.photos[0].tags, ["Rack"])
        b.save(PhotoComment(projectId: b.project.id, photoId: p.id, author: "me", text: "ok"), in: \.photoComments)
        b.remove([p.id], in: \.photos)
        XCTAssertTrue(b.livePhotos.isEmpty)
        XCTAssertTrue(b.comments(for: p.id).isEmpty)
    }

    func testTasksAcrossJobs() {
        func item(_ id: String, _ text: String, _ who: String?, _ due: String?, done: Bool = false) -> ChecklistItem {
            var i = ChecklistItem(id: id, text: text); i.assignee = who; i.due = due; i.done = done; return i
        }
        var a = ProjectBundle(project: Project(id: "a", clientName: "", address: "1 Oak"))
        a.checklists = [Checklist(projectId: "a", name: "Punch list", items: [
            item("1", "Touch up plate", "Alex", "2026-11-18"), item("2", "Re-aim camera", "Sam", "2026-11-19"),
            item("3", "Done", "Alex", "2026-11-01", done: true), ChecklistItem(id: "4", text: "Not a task"),
        ])]
        var b = ProjectBundle(project: Project(id: "b", clientName: "", address: "2 Elm"))
        b.checklists = [Checklist(projectId: "b", name: "Punch list", items: [
            item("5", "Label rack", "alex", "2026-11-24"), item("6", "Order motor", nil, "2026-12-30"), item("7", "Program keypads", "Alex", nil),
        ])]
        let all = FieldDocs.openTasks([a, b], today: "2026-11-19")
        XCTAssertEqual(all.map(\.item.id), ["1", "2", "5", "6", "7"])
        XCTAssertEqual(all.map(\.bucket), [.overdue, .today, .week, .later, .none])
        XCTAssertEqual(FieldDocs.openTasks([a, b], today: "2026-11-19", who: "Alex").map(\.item.id), ["1", "5", "7"])
        XCTAssertEqual(FieldDocs.daysUntil("2026-12-01", today: "2026-11-30"), 1)
        XCTAssertEqual(FieldDocs.teamNames([a, b], me: "Me"), ["Alex", "Me", "Sam"])
        // Same JSON keys as the web.
        let json = try! JSONSerialization.jsonObject(with: JSONEncoder().encode(a.checklists[0].items[0])) as! [String: Any]
        XCTAssertEqual(json["assignee"] as? String, "Alex")
        XCTAssertEqual(json["due"] as? String, "2026-11-18")
    }

    func testTimelineSkipsCommentsOnDeletedPhotos() {
        var b = ProjectBundle(project: Project(id: "p", clientName: "", address: ""))
        var live = Photo(projectId: "p", imageId: "ia", width: 1, height: 1); live.id = "a"
        var gone = Photo(projectId: "p", imageId: "ib", width: 1, height: 1); gone.id = "b"; gone.deleted = true
        b.photos = [live, gone]
        b.photoComments = [PhotoComment(projectId: "p", photoId: "a", author: "Sam", text: "on a"), PhotoComment(projectId: "p", photoId: "b", author: "Sam", text: "on b")]
        XCTAssertEqual(FieldDocs.timeline(b).filter { $0.kind == .comment }.map(\.text), ["Commented: “on a”"])
    }

    func testTimelineEventIdsAreUnique() {
        var b = ProjectBundle(project: Project(id: "p", clientName: "", address: ""))
        var a = Photo(projectId: "p", imageId: "ia", width: 1, height: 1); a.id = "a"
        var c = Photo(projectId: "p", imageId: "ic", width: 1, height: 1); c.id = "c"
        b.photos = [a, c]
        // Same words at the same moment, by two people / on two photos.
        var x = PhotoComment(projectId: "p", photoId: "a", author: "Sam", text: "Looks good"); x.createdAt = "2026-11-19T10:00:00.000Z"
        var y = PhotoComment(projectId: "p", photoId: "c", author: "Sam", text: "Looks good"); y.createdAt = x.createdAt
        var z = PhotoComment(projectId: "p", photoId: "a", author: "Alex", text: "Looks good"); z.createdAt = x.createdAt
        b.photoComments = [x, y, z]
        let ids = FieldDocs.timeline(b).map(\.id)
        XCTAssertEqual(Set(ids).count, ids.count)
    }
}
