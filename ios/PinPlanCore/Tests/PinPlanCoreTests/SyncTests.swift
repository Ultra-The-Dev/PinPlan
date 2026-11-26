import XCTest
@testable import PinPlanCore

final class SyncTests: XCTestCase {
    func sample() -> ProjectBundle {
        var b = ProjectBundle(project: Project(id: "p1", clientName: "Client", address: "12 Maple Ridge Rd"))
        b.sheets = [Sheet(id: "s1", projectId: "p1", name: "1st Fl", pageNumber: 1, order: 0, imageId: "img1", width: 1000, height: 800, pxPerFt: 10)]
        b.closets = [Closet(id: "c1", projectId: "p1", sheetId: "s1", kind: .equipment, x: 0.1, y: 0.1, name: "EQ")]
        var m = Marker(id: "m1", projectId: "p1", sheetId: "s1", deviceTypeId: "tv", x: 0.5, y: 0.5, label: "TV-1-01", closetId: "c1")
        m.setCables(["HDMI", "Cat6"])
        b.markers = [m]
        return b
    }

    /// The remote row a server would send back for a local row.
    func echo(_ t: SyncTable, _ json: [String: Any], updatedAt: String? = nil) -> [String: Any] {
        var r = SyncMap.toRemote(t, json)
        if let updatedAt { r["updated_at"] = updatedAt }
        r["synced_at"] = "2026-11-15 17:00:00+00"
        return r
    }

    func testEveryRowRoundTripsThroughTheServerFormat() {
        let state = SyncState(bundles: [sample()], catalog: Catalog.seed(), products: [Product(id: "u7", deviceTypeId: "wap", brand: "Ubiquiti", model: "U7 Pro")])
        var other = SyncState(bundles: [], catalog: [], products: [])
        var ledger = SyncLedger()
        for row in state.changes(since: SyncLedger()) {
            XCTAssertEqual(other.merge(row.table, remote: echo(row.table, row.json), ledger: &ledger), .applied, "\(row.table) \(row.id)")
        }
        XCTAssertEqual(other.bundles["p1"], state.bundles["p1"])
        XCTAssertEqual(other.bundles["p1"]?.markers.first?.cables, ["HDMI", "Cat6"])
        XCTAssertEqual(other.catalog.count, state.catalog.count)
        XCTAssertEqual(other.products.first?.title, "Ubiquiti U7 Pro")
        XCTAssertTrue(other.changes(since: ledger).isEmpty, "a fresh copy has nothing to push")
    }

    func testOnlyChangedRowsArePushed() {
        var state = SyncState(bundles: [sample()], catalog: [], products: [])
        var ledger = SyncLedger()
        state.markSynced(state.rows(), ledger: &ledger)
        XCTAssertTrue(state.changes(since: ledger).isEmpty)
        state.bundles["p1"]!.deleteMarker("m1") // soft delete, no timestamp bump
        let changed = state.changes(since: ledger)
        XCTAssertEqual(changed.map(\.table), [.projects, .markers].filter { t in changed.contains { $0.table == t } })
        XCTAssertTrue(changed.contains { $0.table == .markers && ($0.json["deleted"] as? Bool) == true })
    }

    func testRemoteWinsUnlessLocalEditIsNewer() {
        var state = SyncState(bundles: [sample()], catalog: [], products: [])
        var ledger = SyncLedger()
        state.markSynced(state.rows(), ledger: &ledger)
        let row = state.rows().first { $0.table == .markers }!

        // Untouched here → the server copy is taken.
        var remote = echo(.markers, row.json, updatedAt: "2020-01-01T00:00:00Z")
        remote["room"] = "Den"
        XCTAssertEqual(state.merge(.markers, remote: remote, ledger: &ledger), .applied)
        XCTAssertEqual(state.bundles["p1"]!.markers[0].room, "Den")

        // Edited here after that → an older server copy doesn't overwrite it…
        state.bundles["p1"]!.markers[0].room = "Kitchen"
        state.bundles["p1"]!.markers[0].updatedAt = "2026-11-15T12:00:00.000Z"
        remote["room"] = "Office"
        remote["updated_at"] = "2026-11-15 11:00:00+00"
        XCTAssertEqual(state.merge(.markers, remote: remote, ledger: &ledger), .keptLocal)
        XCTAssertEqual(state.bundles["p1"]!.markers[0].room, "Kitchen")
        // …but a newer one does.
        remote["updated_at"] = "2026-11-15 13:00:00+00"
        XCTAssertEqual(state.merge(.markers, remote: remote, ledger: &ledger), .applied)
        XCTAssertEqual(state.bundles["p1"]!.markers[0].room, "Office")
    }

    func testProjectDeletionBothWays() {
        var state = SyncState(bundles: [sample()], catalog: [], products: [])
        var ledger = SyncLedger()
        state.markSynced(state.rows(), ledger: &ledger)
        var gone = state
        gone.bundles["p1"] = nil
        XCTAssertEqual(gone.removedProjects(since: ledger), ["p1"])

        var remote = echo(.projects, state.rows().first { $0.table == .projects }!.json)
        remote["deleted"] = true
        XCTAssertEqual(state.merge(.projects, remote: remote, ledger: &ledger), .removedProject)
        XCTAssertNil(state.bundles["p1"])
        XCTAssertTrue(state.removedProjects(since: ledger).isEmpty)
    }

    func testAJobDeleteGoesUpWithTheTimeItWasDeletedNotThePushTime() {
        var state = SyncState(bundles: [sample()], catalog: [], products: [])
        var ledger = SyncLedger()
        state.markSynced(state.rows(), ledger: &ledger)
        let own: String? = state.bundles["p1"]!.project.updatedAt
        // Deleted here at 09:00 (offline); the next syncs (noteDirty) keep that time; it goes up at 18:00.
        ledger.noteRemoved(projectId: "p1", own: own, now: "2099-11-15T09:00:00.000Z")
        state.bundles["p1"] = nil
        let removed: [String] = state.removedProjects(since: ledger)
        ledger.noteDirty(state.changes(since: ledger), now: "2099-11-15T12:00:00.000Z", removedProjects: removed)
        ledger.noteDirty(state.changes(since: ledger), now: "2099-11-15T18:00:00.000Z", removedProjects: removed)
        XCTAssertEqual(ledger.deleteTime(projectId: "p1", fallback: "2099-11-15T18:00:00.000Z"), "2099-11-15T09:00:00.000Z")
        // A delete that wasn't noted (an app version from before) gets the first time a sync saw it.
        var other = SyncLedger()
        other.hashes[SyncLedger.key(.projects, "p2")] = "h"
        other.noteDirty([], now: "2099-11-15T10:00:00.000Z", removedProjects: ["p2"])
        other.noteDirty([], now: "2099-11-15T11:00:00.000Z", removedProjects: ["p2"])
        XCTAssertEqual(other.deleteTime(projectId: "p2", fallback: "x"), "2099-11-15T10:00:00.000Z")
        // A job that never went up isn't noted.
        var fresh = SyncLedger()
        fresh.noteRemoved(projectId: "p3", own: nil, now: "2099-11-15T09:00:00.000Z")
        XCTAssertTrue(fresh.dirtyAt.isEmpty)
    }

    func testADeleteTheServerKeptBringsTheWholeJobBack() {
        var state = SyncState(bundles: [sample()], catalog: [], products: [])
        var ledger = SyncLedger()
        state.markSynced(state.rows(), ledger: &ledger)
        ledger.watermarks = ["markers": "2026-11-15T10:00:00.000Z", "projects": "2026-11-15T10:00:00.000Z"]
        ledger.noteRemoved(projectId: "p1", own: nil, now: "2026-11-15T09:00:00.000Z")
        // Deleted on the server: done, nothing else to fetch.
        var a = ledger
        XCTAssertEqual(a.finishRemoval(projectId: "p1", returned: [["id": "p1", "deleted": true]]), .deleted)
        XCTAssertNil(a.hashes[SyncLedger.key(.projects, "p1")])
        XCTAssertNil(a.dirtyAt[SyncLedger.key(.projects, "p1")])
        XCTAssertFalse(a.watermarks.isEmpty)
        // Not visible to this account (nothing returned): stop sending it, as before.
        var b = ledger
        XCTAssertEqual(b.finishRemoval(projectId: "p1", returned: []), .deleted)
        XCTAssertFalse(b.watermarks.isEmpty)
        // Changed elsewhere after the delete here: the server keeps its newer copy; pull everything again.
        var c = ledger
        XCTAssertEqual(c.finishRemoval(projectId: "p1", returned: [["id": "p1", "deleted": false]]), .keptOnServer)
        XCTAssertTrue(c.watermarks.isEmpty)
        XCTAssertNil(c.hashes[SyncLedger.key(.projects, "p1")])
    }

    func testRemoteDeletionOnlyForgetsThatJob() {
        var other = sample()
        other.project.id = "p10"
        var state = SyncState(bundles: [sample(), other], catalog: [], products: [])
        var ledger = SyncLedger()
        state.markSynced(state.rows(), ledger: &ledger)
        var remote = echo(.projects, state.rows().first { $0.table == .projects && $0.id == "p1" }!.json)
        remote["deleted"] = true
        XCTAssertEqual(state.merge(.projects, remote: remote, ledger: &ledger), .removedProject)
        XCTAssertNil(ledger.hashes[SyncLedger.key(.projects, "p1")])
        XCTAssertNotNil(ledger.hashes[SyncLedger.key(.projects, "p10")], "p10 starts with p1 but is still synced")
        XCTAssertFalse(state.changes(since: ledger).contains { $0.table == .projects }, "p10 isn't pushed again")
    }

    func testTimestampsAreNormalised() {
        XCTAssertEqual(SyncMap.normalizeTimestamp("2026-11-15 16:59:33.12+00"), "2026-11-15T16:59:33.120Z")
        XCTAssertEqual(SyncMap.normalizeTimestamp("2026-11-15T16:59:33+00:00"), "2026-11-15T16:59:33.000Z")
    }

    /// Every column the app sends must exist in the Supabase schema (same contract as the web app's schema test).
    func testColumnsExistInTheSchema() throws {
        let dir = URL(fileURLWithPath: #filePath).deletingLastPathComponent().appendingPathComponent("../../../../supabase/migrations").standardized
        let files = try FileManager.default.contentsOfDirectory(atPath: dir.path).filter { $0.hasSuffix(".sql") }.sorted()
        let sql = try files.map { try String(contentsOf: dir.appendingPathComponent($0), encoding: .utf8) }.joined(separator: "\n").lowercased()
        // The office-only price tables come with 20261125000100_price_split_stale_writes.sql (merged separately): checked
        // once that migration is in the tree.
        let priceTables: Set<SyncTable> = [.deviceTypePrices, .productPrices, .projectFinance]
        let priceMigration = sql.contains("create table if not exists public.device_type_prices")
        for (t, spec) in SyncMap.specs {
            if priceTables.contains(t) && !priceMigration { continue }
            for (_, col) in spec.columns {
                let created = sql.range(of: "create table (if not exists )?public.\(spec.remote) \\(", options: .regularExpression) != nil
                XCTAssertTrue(created, "\(spec.remote) missing")
                let pattern = "(\\n\\s+\"?\(col)\"?\\s)|(add column if not exists \(col)\\s)"
                XCTAssertNotNil(sql.range(of: pattern, options: .regularExpression), "\(t).\(col) is not in the schema")
            }
        }
    }

    func testUploadBacklogCountsLocalFilesNotYetUploaded() {
        var b = sample()
        var gone = Photo(projectId: "p1", imageId: "gone", width: 1, height: 1)
        gone.deleted = true
        b.photos = [Photo(projectId: "p1", imageId: "a", width: 1, height: 1), Photo(projectId: "p1", imageId: "b", width: 1, height: 1),
                    Photo(projectId: "p1", imageId: "remote", width: 1, height: 1), Photo(projectId: "p1", imageId: "a", width: 1, height: 1), gone]
        b.documents = [JobDocument(projectId: "p1", name: "Permit.pdf", mime: "application/pdf", size: 10, fileId: "d1")]
        var ledger = SyncLedger()
        ledger.uploadedImages = ["b"]
        let local: Set<String> = ["a", "b", "gone", "d1"]
        let backlog = ledger.uploadBacklog(b) { id, _ in local.contains(id) }
        XCTAssertEqual(backlog, UploadBacklog(photos: 1, documents: 1))
        XCTAssertEqual(backlog.total, 2)
        XCTAssertEqual(backlog.summary, "1 photo and 1 file waiting to upload")
        XCTAssertEqual(UploadBacklog(photos: 3).summary, "3 photos waiting to upload")
        XCTAssertEqual(UploadBacklog().summary, "")
        ledger.uploadedImages.formUnion(["a", "d1"])
        XCTAssertEqual(ledger.uploadBacklog(b) { id, _ in local.contains(id) }.total, 0)
    }
}
