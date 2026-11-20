import XCTest
@testable import PinPlanCore

/// Pull paging, ledger rules and account / team changes — the same rules as src/lib/syncMap.ts and src/lib/team.ts.
final class SyncPagingTests: XCTestCase {
    func rows(_ stamps: [String]) -> [[String: Any]] { stamps.enumerated().map { ["id": "r\($0.offset)", "synced_at": $0.element] } }

    func testPullStartLooksBack30Seconds() {
        XCTAssertEqual(SyncPaging.pullStart(nil), SyncPaging.epoch)
        XCTAssertEqual(SyncPaging.pullStart(""), SyncPaging.epoch)
        XCTAssertEqual(SyncPaging.pullStart("1970-01-01T00:00:00Z"), "1970-01-01T00:00:00Z", "the epoch isn't moved")
        XCTAssertEqual(SyncPaging.pullStart("2026-11-15T17:00:30.000Z"), "2026-11-15T17:00:00.000Z")
        XCTAssertEqual(SyncPaging.pullStart("2026-11-15 17:00:30.123456+00"), "2026-11-15T17:00:00.123Z", "Postgres stamps read too")
        XCTAssertEqual(SyncPaging.pullStart("not a date"), "not a date")
    }

    func testPagesRestartPartWayThroughATimestamp() {
        // A short page ends the pull.
        var n = SyncPaging.next(.init(since: "a"), rows: rows(["t1", "t2"]), pageSize: 3)
        XCTAssertEqual(n, .init(cursor: .init(since: "t2", skip: 0), done: true))
        // A full page whose last two rows share a stamp: restart at that stamp, skipping those two.
        n = SyncPaging.next(.init(since: "a"), rows: rows(["t1", "t2", "t2"]), pageSize: 3)
        XCTAssertEqual(n, .init(cursor: .init(since: "t2", skip: 2), done: false))
        // The whole page sits on the cursor's own stamp: keep counting past it.
        n = SyncPaging.next(n.cursor, rows: rows(["t2", "t2", "t2"]), pageSize: 3)
        XCTAssertEqual(n, .init(cursor: .init(since: "t2", skip: 5), done: false))
        // An empty page ends without moving.
        n = SyncPaging.next(n.cursor, rows: [], pageSize: 3)
        XCTAssertEqual(n, .init(cursor: .init(since: "t2", skip: 5), done: true))
    }

    func testQueries() {
        let q = SyncPaging.query(.init(since: "2026-11-15T17:00:00.000Z", skip: 7))
        XCTAssertEqual(q, "select=*&synced_at=gte.2026%2D11%2D15T17%3A00%3A00%2E000Z&order=synced_at.asc,id.asc&offset=7&limit=1000")
        XCTAssertEqual(SyncPaging.byIdQuery(["a1", "b_2"]), "select=*&id=in.(a1,b%5F2)")
        XCTAssertFalse(SyncPaging.byIdQuery(["x,y)"]).contains(",y)"), "an odd id can't break the list")
    }

    func testWatermarkNeverMovesBack() {
        XCTAssertEqual(SyncPaging.advance(nil, to: "2026-11-15T17:00:00.000Z"), "2026-11-15T17:00:00.000Z")
        XCTAssertEqual(SyncPaging.advance("2026-11-15T17:00:00.000Z", to: "2026-11-15T16:59:30.000Z"), "2026-11-15T17:00:00.000Z")
        XCTAssertEqual(SyncPaging.advance("2026-11-15T17:00:00.000Z", to: "2026-11-15 17:00:01+00"), "2026-11-15 17:00:01+00")
    }

    func testMissingTables() {
        XCTAssertTrue(SyncPaging.isMissingTable(code: "PGRST205", message: nil))
        XCTAssertTrue(SyncPaging.isMissingTable(code: "42P01", message: nil))
        XCTAssertTrue(SyncPaging.isMissingTable(code: nil, message: "Could not find the table 'public.rfis' in the schema cache"))
        XCTAssertTrue(SyncPaging.isMissingTable(code: nil, message: #"relation "public.rfis" does not exist"#))
        XCTAssertFalse(SyncPaging.isMissingTable(code: "42501", message: "permission denied"))
    }
}

final class SyncLedgerTests: XCTestCase {
    func testOldLedgersStillLoad() throws {
        let old = Data(#"{"hashes":{"projects:p1":"abc"},"watermarks":{"projects":"2026-11-15T17:00:00Z"},"uploadedImages":["i1"]}"#.utf8)
        let l = SyncLedger.load(old, for: "u1")
        XCTAssertEqual(l.hashes["projects:p1"], "abc")
        XCTAssertEqual(l.watermarks["projects"], "2026-11-15T17:00:00Z")
        XCTAssertEqual(l.uploadedImages, ["i1"])
        XCTAssertEqual(l.userId, "u1", "an unowned ledger is taken by the account using it")
        XCTAssertTrue(l.retry.isEmpty)
    }

    func testAnotherAccountsLedgerIsNeverUsed() throws {
        var mine = SyncLedger(userId: "u1")
        mine.hashes["projects:p1"] = "abc"
        let data = try JSONEncoder().encode(mine)
        XCTAssertEqual(SyncLedger.load(data, for: "u1").hashes["projects:p1"], "abc")
        let other = SyncLedger.load(data, for: "u2")
        XCTAssertTrue(other.hashes.isEmpty)
        XCTAssertEqual(other.userId, "u2")
        XCTAssertEqual(SyncLedger.load(Data("junk".utf8), for: "u2"), SyncLedger(userId: "u2"))
    }

    func testJoiningOrChangingTeamsPullsEverythingAgain() {
        var l = SyncLedger(userId: "u1")
        l.watermarks = ["projects": "2026-11-15T17:00:00Z"]
        // Joining (nil → X) clears the watermarks once.
        XCTAssertTrue(l.noteTeam("t1"))
        XCTAssertTrue(l.watermarks.isEmpty)
        l.watermarks = ["projects": "2026-11-16T17:00:00Z"]
        XCTAssertFalse(l.noteTeam("t1"), "same team: nothing to do")
        XCTAssertEqual(l.watermarks.count, 1)
        // Moving teams (X → Y) clears them again.
        XCTAssertTrue(l.noteTeam("t2"))
        XCTAssertTrue(l.watermarks.isEmpty)
        // Leaving a team brings nothing new.
        l.watermarks = ["projects": "2026-11-17T17:00:00Z"]
        XCTAssertFalse(l.noteTeam(nil))
        XCTAssertEqual(l.watermarks.count, 1)
        XCTAssertNil(l.teamId)
        // The team survives a save.
        XCTAssertTrue(l.noteTeam("t3"))
        let back = SyncLedger.load(try? JSONEncoder().encode(l), for: "u1")
        XCTAssertEqual(back.teamId, "t3")
    }

    func testRetryList() {
        var l = SyncLedger()
        l.addRetry(.markers, ["a", "b"])
        l.addRetry(.markers, ["b", "c"])
        XCTAssertEqual(l.retry["markers"], ["a", "b", "c"])
        l.clearRetry(.markers, ["a", "c"])
        XCTAssertEqual(l.retry["markers"], ["b"])
        l.clearRetry(.markers, ["b"])
        XCTAssertNil(l.retry["markers"])
        l.addRetry(.runs, (0..<(SyncLedger.retryLimit + 5)).map { "r\($0)" })
        XCTAssertEqual(l.retry["runs"]?.count, SyncLedger.retryLimit)
        XCTAssertEqual(l.retry["runs"]?.first, "r5", "the oldest go first")
    }

    func testAccountSwitch() {
        // Same account, or nothing on the device: sync.
        XCTAssertEqual(AccountSwitch.decide(dataOwner: "u1", signingIn: "u1", hasLocalJobs: true), .proceed)
        XCTAssertEqual(AccountSwitch.decide(dataOwner: "u1", signingIn: "u2", hasLocalJobs: false), .proceed)
        // Another account's jobs on the device: ask first.
        XCTAssertEqual(AccountSwitch.decide(dataOwner: "u1", signingIn: "u2", hasLocalJobs: true), .askToRemoveLocalJobs)
        // Not recorded: jobs made signed out go to the first account…
        XCTAssertEqual(AccountSwitch.decide(dataOwner: nil, signingIn: "u2", hasLocalJobs: true), .proceed)
        XCTAssertEqual(AccountSwitch.decide(dataOwner: nil, signingIn: "u2", hasLocalJobs: true, otherAccountLedgers: true, ownLedger: true), .proceed)
        // …unless only another account ever synced on this device.
        XCTAssertEqual(AccountSwitch.decide(dataOwner: nil, signingIn: "u2", hasLocalJobs: true, otherAccountLedgers: true), .askToRemoveLocalJobs)
    }

    func testAfterRemovingTheOtherAccountsJobsNothingOfItsIsPushed() {
        let catalog = Catalog.seed()
        let products = [Product(id: "u7", deviceTypeId: "wap", brand: "Ubiquiti", model: "U7 Pro")]
        let l = AccountSwitch.freshLedger(for: "u2", keeping: catalog, products: products)
        XCTAssertEqual(l.userId, "u2")
        let s = SyncState(bundles: [], catalog: catalog, products: products)
        XCTAssertTrue(s.changes(since: l).isEmpty, "the kept catalog and products aren't sent to the new account")
    }

    func testOtherAccountsCatalogIsNotPushedEvenWithNoJobsLeft() {
        // The jobs were removed by hand, so no prompt: still, the catalog is the other account's.
        XCTAssertTrue(AccountSwitch.isOtherAccount(dataOwner: "u1", signingIn: "u2"))
        XCTAssertFalse(AccountSwitch.isOtherAccount(dataOwner: "u2", signingIn: "u2"))
        XCTAssertFalse(AccountSwitch.isOtherAccount(dataOwner: nil, signingIn: "u2"), "made signed out: the first account's")
        XCTAssertTrue(AccountSwitch.isOtherAccount(dataOwner: nil, signingIn: "u2", otherAccountLedgers: true))
        let catalog = Catalog.seed()
        var l = SyncLedger(userId: "u2")
        l.watermarks["markers"] = "2026-11-15T17:00:00Z"
        AccountSwitch.keepWithoutSending(catalog, products: [], in: &l)
        XCTAssertTrue(SyncState(bundles: [], catalog: catalog, products: []).changes(since: l).isEmpty)
        XCTAssertEqual(l.watermarks["markers"], "2026-11-15T17:00:00Z", "the account's own sync record is kept")
    }
}

final class SyncMergeTests: XCTestCase {
    func job() -> ProjectBundle {
        var b = ProjectBundle(project: Project(id: "p1", clientName: "Client", address: "1 Test St"))
        var s = Sheet(id: "s1", projectId: "p1", name: "1st Fl", pageNumber: 1, order: 0, imageId: "img1", width: 1000, height: 800)
        s.sourcePdfId = "pdf1"; s.sourcePage = 0; s.sourceRotation = 1
        b.sheets = [s]
        return b
    }

    func remote(_ t: SyncTable, _ json: [String: Any]) -> [String: Any] {
        var r = SyncMap.toRemote(t, json)
        r["synced_at"] = "2026-11-15 17:00:00+00"
        return r
    }

    func testUnknownEnumValuesDontDropTheRow() {
        var state = SyncState(bundles: [job()], catalog: [], products: [])
        var ledger = SyncLedger()
        state.markSynced(state.rows(), ledger: &ledger)
        let m = Marker(id: "m1", projectId: "p1", sheetId: "s1", deviceTypeId: "cam", x: 0.5, y: 0.5, label: "CAM-1")
        var row = remote(.markers, SyncState.json(m).0)
        row["mount"] = "soffit"
        XCTAssertEqual(state.merge(.markers, remote: row, ledger: &ledger), .applied)
        XCTAssertEqual(state.bundles["p1"]?.markers.first?.mount, .other)
        let r = Run(id: "r1", projectId: "p1", sheetId: "s1", kind: .wire, points: [0, 0, 1, 1])
        var runRow = remote(.runs, SyncState.json(r).0)
        runRow["kind"] = "conduit"
        XCTAssertEqual(state.merge(.runs, remote: runRow, ledger: &ledger), .applied)
        XCTAssertEqual(state.bundles["p1"]?.runs.first?.kind, .wire)
        var p = remote(.projects, SyncState.json(state.bundles["p1"]!.project).0)
        p["status"] = "on_hold"
        XCTAssertEqual(state.merge(.projects, remote: p, ledger: &ledger), .applied)
        XCTAssertEqual(state.bundles["p1"]?.project.status, .estimate)
        var d = SyncState.json(Catalog.seed()[0]).0
        d["shape"] = "octagon"; d["kind"] = "fixture"
        XCTAssertEqual(state.merge(.deviceTypes, remote: remote(.deviceTypes, d), ledger: &ledger), .applied)
        XCTAssertEqual(state.catalog.first?.shape, .circle)
        XCTAssertEqual(state.catalog.first?.kind, .device)
    }

    func testUnreadableAndOrphanRowsAreRetried() {
        var state = SyncState(bundles: [job()], catalog: [], products: [])
        var ledger = SyncLedger()
        // No id: nothing to do.
        XCTAssertEqual(state.merge(.markers, remote: ["x": 1], ledger: &ledger), .skipped)
        // A marker without its required fields can't be read: fetch it again later.
        XCTAssertEqual(state.merge(.markers, remote: ["id": "m9", "project_id": "p1"], ledger: &ledger), .unreadable)
        XCTAssertTrue(SyncState.needsRetry(.unreadable, parentsFailed: false))
        // A row of a job this device doesn't have: retried only when the jobs pull failed.
        let m = Marker(id: "m2", projectId: "p9", sheetId: "s1", deviceTypeId: "cam", x: 0, y: 0, label: "x")
        XCTAssertEqual(state.merge(.markers, remote: remote(.markers, SyncState.json(m).0), ledger: &ledger), .orphan)
        XCTAssertFalse(SyncState.needsRetry(.orphan, parentsFailed: false))
        XCTAssertTrue(SyncState.needsRetry(.orphan, parentsFailed: true))
        // A deleted row of a job that isn't here is simply skipped.
        var gone = remote(.markers, SyncState.json(m).0)
        gone["deleted"] = true
        XCTAssertEqual(state.merge(.markers, remote: gone, ledger: &ledger), .skipped)
    }

    func testANewDrawingDropsTheOldPDFDetail() {
        var state = SyncState(bundles: [job()], catalog: [], products: [])
        var ledger = SyncLedger()
        state.markSynced(state.rows(), ledger: &ledger)
        let local = state.rows().first { $0.table == .sheets }!.json
        // Same image: the local PDF detail stays.
        var same = remote(.sheets, local)
        same["name"] = "First floor"
        XCTAssertEqual(state.merge(.sheets, remote: same, ledger: &ledger), .applied)
        XCTAssertEqual(state.bundles["p1"]?.sheets[0].sourcePdfId, "pdf1")
        XCTAssertEqual(state.bundles["p1"]?.sheets[0].sourceRotation, 1)
        // A new drawing (re-issued sheet): the PDF detail belonged to the old one.
        var reissued = same
        reissued["image_id"] = "img2"
        reissued["revision_label"] = "Rev B"
        reissued["sheet_number"] = "E-101"
        reissued["tags"] = ["power"]
        reissued["revisions"] = [["id": "rv1", "label": "Rev A", "imageId": "img1", "width": 1000, "height": 800, "uploadedAt": "2026-11-01T00:00:00Z"], "junk"]
        XCTAssertEqual(state.merge(.sheets, remote: reissued, ledger: &ledger), .applied)
        let s = state.bundles["p1"]!.sheets[0]
        XCTAssertEqual(s.imageId, "img2")
        XCTAssertNil(s.sourcePdfId)
        XCTAssertNil(s.sourcePage)
        XCTAssertNil(s.sourceRotation)
        XCTAssertEqual(s.revisionLabel, "Rev B")
        XCTAssertEqual(s.number, "E-101")
        XCTAssertEqual(s.tags, ["power"])
        XCTAssertEqual(s.revisions?.map(\.imageId), ["img1"], "an unreadable revision is dropped, not the sheet")
        XCTAssertEqual(state.bundles["p1"]?.storedImageIds.contains("img1"), true, "earlier drawings are kept with the job")
        // Odd sheet index values are dropped, not the sheet.
        var odd = reissued
        odd["tags"] = "power"
        odd["revisions"] = ["not": "a list"]
        XCTAssertEqual(state.merge(.sheets, remote: odd, ledger: &ledger), .applied)
        XCTAssertNil(state.bundles["p1"]!.sheets[0].tags)
    }

    func testPullOnlyTablesAreNeverSent() {
        var b = job()
        b.planMarkups = [PlanMarkup(projectId: "p1", sheetId: "s1", kind: .cloud, points: [0, 0, 1, 1])]
        b.measurements = [Measurement(projectId: "p1", sheetId: "s1", kind: .length, points: [0, 0, 1, 1])]
        b.scheduleItems = [ScheduleItem(projectId: "p1", name: "Rough-in", start: "2026-11-20", end: "2026-11-22")]
        b.sheetLinks = [SheetLink(projectId: "p1", sheetId: "s1", x: 0, y: 0, w: 0.1, h: 0.1, target: SheetLinkTarget(kind: "sheet", sheetId: "s1"))]
        b.salesDocs = [SalesDoc(projectId: "p1", kind: .invoice, status: .sent, total: 100)]
        b.salesPayments = [SalesPayment(projectId: "p1", documentId: "d", amount: 50, date: "2026-11-20")]
        var draft = Rfi(projectId: "p1", number: 1, subject: "Panel location")
        var sent = Rfi(projectId: "p1", number: 2, subject: "Ceiling height")
        sent.status = .open
        draft.question = "Where?"
        b.rfis = [draft, sent]
        let state = SyncState(bundles: [b], catalog: [], products: [])
        let changed = state.changes(since: SyncLedger())
        XCTAssertEqual(Set(changed.map(\.table)), [.projects, .sheets, .rfis])
        XCTAssertEqual(changed.filter { $0.table == .rfis }.map(\.id), [draft.id], "only a draft RFI made here goes up")
        let row = SyncMap.toRemote(.rfis, changed.first { $0.table == .rfis }!.json)
        XCTAssertEqual(row["ball_in_court"] as? String, "us")
        XCTAssertEqual(row["status"] as? String, "draft")
    }

    func testTechniciansDontSendCatalogOrPrices() {
        for t in [SyncTable.deviceTypes, .products, .estimateLines, .salesDocs, .salesPayments, .sheetLinks] {
            XCTAssertFalse(TeamLogic.mayPush(t, role: .tech), "\(t)")
            XCTAssertTrue(TeamLogic.mayPush(t, role: .admin), "\(t)")
            XCTAssertTrue(TeamLogic.mayPush(t, role: nil), "\(t)")
        }
        for t in [SyncTable.markers, .runs, .photos, .tasks, .forms, .rfis] { XCTAssertTrue(TeamLogic.mayPush(t, role: .tech), "\(t)") }
        XCTAssertFalse(TeamLogic.mayPull(.salesDocs, role: .tech))
        XCTAssertFalse(TeamLogic.mayPull(.salesPayments, role: .tech))
        XCTAssertTrue(TeamLogic.mayPull(.salesDocs, role: .owner))
        XCTAssertTrue(TeamLogic.mayPull(.markers, role: .tech))
    }

    func testTeamTrades() throws {
        let t = try JSONDecoder().decode(Team.self, from: Data(#"{"id":"t1","name":"Acme","owner_id":"u1","trades":["electrical","lowvoltage"]}"#.utf8))
        XCTAssertEqual(t.trades, ["electrical", "lowvoltage"])
        let old = try JSONDecoder().decode(Team.self, from: Data(#"{"id":"t1","name":"Acme","owner_id":"u1"}"#.utf8))
        XCTAssertNil(old.trades)
        // A new device follows the team; a change made here stands until the team's trades change.
        XCTAssertEqual(Team.tradesToAdopt(team: t.trades, seen: nil, local: [.lowvoltage]), [.electrical, .lowvoltage])
        XCTAssertNil(Team.tradesToAdopt(team: t.trades, seen: nil, local: [.electrical, .lowvoltage]))
        XCTAssertNil(Team.tradesToAdopt(team: t.trades, seen: ["electrical", "lowvoltage"], local: [.fire]))
        XCTAssertEqual(Team.tradesToAdopt(team: ["fire"], seen: ["electrical", "lowvoltage"], local: [.electrical]), [.fire])
        XCTAssertNil(Team.tradesToAdopt(team: [], seen: nil, local: [.electrical]))
        XCTAssertNil(Team.tradesToAdopt(team: nil, seen: nil, local: [.electrical]))
    }
}
