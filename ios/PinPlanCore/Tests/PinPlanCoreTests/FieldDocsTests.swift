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
}
