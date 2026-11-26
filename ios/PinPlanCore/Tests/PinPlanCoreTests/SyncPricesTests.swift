import XCTest
@testable import PinPlanCore

/// Prices kept apart (office only), named pull columns, edit times and refused ids: the iPad side of
/// 20261125000100_price_split_stale_writes.sql and src/lib/syncMap.ts.
final class SyncPricesTests: XCTestCase {
    private let priceColumns: [SyncTable: [String]] = [
        .projects: ["pricing", "billdu_docs", "billdu_client_id"],
        .deviceTypes: ["unit_price", "labor_price", "billdu_product_id"],
        .products: ["unit_price", "labor_price"],
    ]

    func job() -> ProjectBundle {
        var b = ProjectBundle(project: Project(id: "p1", clientName: "Client", address: "1 Test St"))
        b.project.pricing = PricingOverrides()
        b.project.billduClientId = 42
        b.project.updatedAt = "2026-11-01T10:00:00.000Z"
        b.sheets = [Sheet(id: "s1", projectId: "p1", name: "1st Fl", pageNumber: 1, order: 0, imageId: "img1", width: 100, height: 100)]
        return b
    }

    func type(_ price: Double = 120) -> DeviceType {
        var d = Catalog.seed()[0]
        d.unitPrice = price
        d.laborPrice = 40
        d.updatedAt = "2026-11-10T10:00:00.000Z"
        return d
    }

    func product() -> Product {
        var p = Product(id: "u7", deviceTypeId: "wap", brand: "Ubiquiti", model: "U7 Pro", unitPrice: 189, laborPrice: 45)
        p.updatedAt = "2026-11-10T10:00:00.000Z"
        return p
    }

    // MARK: columns

    func testPullsNameTheirColumnsAndNeverThePriceColumns() {
        for t in SyncMap.pushOrder {
            let q = SyncMap.pullQuery(t, .init(since: "2026-11-15T17:00:00.000Z", skip: 3))
            XCTAssertFalse(q.contains("select=*"), "\(t) selects *")
            XCTAssertTrue(q.contains("synced_at"), "\(t)")
            let cols = Set(SyncMap.selectColumns(t).split(separator: ",").map(String.init))
            for c in priceColumns[t] ?? [] { XCTAssertFalse(cols.contains(c), "\(t) reads \(c)") }
            XCTAssertFalse(SyncMap.byIdQuery(t, ["a1"]).contains("select=*"), "\(t)")
        }
        XCTAssertEqual(SyncMap.pullQuery(.deviceTypePrices, .init(since: "x", skip: 0)),
                       "select=device_type_id,unit_price,labor_price,billdu_product_id,updated_at,synced_at&synced_at=gte.x&order=synced_at.asc,device_type_id.asc&offset=0&limit=1000")
        XCTAssertEqual(SyncMap.byIdQuery(.projectFinance, ["p1", "p_2"]),
                       "select=project_id,pricing,billdu_docs,billdu_client_id,updated_at,synced_at&project_id=in.(p1,p%5F2)")
        XCTAssertTrue(SyncMap.selectColumns(.sheets).contains("image_path"), "the sheet's uploaded image path still comes down")
        XCTAssertFalse(SyncMap.selectColumns(.markers, missing: ["install"]).contains("install"), "a column the database lacks is left out")
    }

    func testRowsGoUpWithoutPrices() {
        let s = SyncState(bundles: [job()], catalog: [type()], products: [product()])
        for r in s.changes(since: SyncLedger()) {
            let remote = SyncMap.toRemote(r.table, r.json)
            for c in priceColumns[r.table] ?? [] { XCTAssertNil(remote[c], "\(r.table) sends \(c)") }
        }
        let rows = s.changes(since: SyncLedger())
        let dtp = SyncMap.toRemote(.deviceTypePrices, rows.first { $0.table == .deviceTypePrices }!.json)
        XCTAssertEqual(dtp["device_type_id"] as? String, Catalog.seed()[0].id)
        XCTAssertEqual(dtp["unit_price"] as? Double, 120)
        XCTAssertEqual(dtp["labor_price"] as? Double, 40)
        XCTAssertNil(dtp["id"])
        let fin = SyncMap.toRemote(.projectFinance, rows.first { $0.table == .projectFinance }!.json)
        XCTAssertEqual(fin["project_id"] as? String, "p1")
        XCTAssertEqual(fin["billdu_client_id"] as? Int, 42)
        XCTAssertNotNil(fin["billdu_docs"] as? [Any])
        let pp = SyncMap.toRemote(.productPrices, rows.first { $0.table == .productPrices }!.json)
        XCTAssertEqual(pp["product_id"] as? String, "u7")
        XCTAssertEqual(pp["unit_price"] as? Double, 189)
    }

    func testAPriceEditSendsOnlyThePriceRowAndANameEditOnlyTheRow() {
        var s = SyncState(bundles: [job()], catalog: [type()], products: [product()])
        var ledger = SyncLedger()
        s.markSynced(s.rows(), ledger: &ledger)
        s.catalog[0].unitPrice = 150
        s.products[0].laborPrice = 50
        s.bundles["p1"]!.project.billduClientId = 7
        XCTAssertEqual(Set(s.changes(since: ledger).map(\.table)), [.deviceTypePrices, .productPrices, .projectFinance])
        s.markSynced(s.rows(), ledger: &ledger)
        s.catalog[0].name = "Dome camera"
        s.catalog[0].updatedAt = "2026-11-11T10:00:00.000Z"
        XCTAssertEqual(s.changes(since: ledger).map(\.table), [.deviceTypes], "the prices aren't sent again")
    }

    // MARK: merging

    func testPriceRowsMergeIntoTheirRowAndPulledRowsKeepLocalPrices() {
        var s = SyncState(bundles: [job()], catalog: [type()], products: [product()])
        var ledger = SyncLedger()
        s.markSynced(s.rows(), ledger: &ledger)
        let id = s.catalog[0].id
        // The catalog row comes down without prices (they aren't selected): the local prices stay.
        var row = SyncMap.toRemote(.deviceTypes, SyncState.json(s.catalog[0]).0)
        row["name"] = "Renamed"
        row["updated_at"] = "2026-11-12 10:00:00+00"
        XCTAssertEqual(s.merge(.deviceTypes, remote: row, ledger: &ledger), .applied)
        XCTAssertEqual(s.catalog[0].name, "Renamed")
        XCTAssertEqual(s.catalog[0].unitPrice, 120)
        // The office's price row sets the prices, not the row's own time.
        let before = s.catalog[0].updatedAt
        XCTAssertEqual(s.merge(.deviceTypePrices, remote: ["device_type_id": id, "unit_price": 99, "labor_price": 11, "billdu_product_id": NSNull(),
                                                         "updated_at": "2026-11-13 10:00:00+00"], ledger: &ledger), .applied)
        XCTAssertEqual(s.catalog[0].unitPrice, 99)
        XCTAssertEqual(s.catalog[0].laborPrice, 11)
        XCTAssertEqual(s.catalog[0].updatedAt, before)
        XCTAssertEqual(s.merge(.productPrices, remote: ["product_id": "u7", "unit_price": 200, "labor_price": 60, "updated_at": "2026-11-13 10:00:00+00"], ledger: &ledger), .applied)
        XCTAssertEqual(s.products[0].unitPrice, 200)
        XCTAssertEqual(s.merge(.projectFinance, remote: ["project_id": "p1", "pricing": NSNull(), "billdu_docs": NSNull(), "billdu_client_id": 9,
                                                       "updated_at": "2026-11-13 10:00:00+00"], ledger: &ledger), .applied)
        XCTAssertEqual(s.bundles["p1"]!.project.billduClientId, 9)
        XCTAssertNil(s.bundles["p1"]!.project.pricing)
        XCTAssertEqual(s.bundles["p1"]!.project.billduDocs, [])
        XCTAssertTrue(s.changes(since: ledger).isEmpty, "nothing pulled goes back up")
        XCTAssertEqual(s.merge(.deviceTypePrices, remote: ["device_type_id": "nope", "unit_price": 1, "labor_price": 1], ledger: &ledger), .orphan)
    }

    func testARowNewToThisDeviceHasNoPricesToSend() {
        var s = SyncState(bundles: [], catalog: [], products: [])
        var ledger = SyncLedger()
        let d = type()
        XCTAssertEqual(s.merge(.deviceTypes, remote: SyncMap.toRemote(.deviceTypes, SyncState.json(d).0), ledger: &ledger), .applied)
        XCTAssertEqual(s.catalog[0].unitPrice, 0, "prices come from the price table")
        XCTAssertEqual(s.merge(.projects, remote: SyncMap.toRemote(.projects, SyncState.json(job().project).0), ledger: &ledger), .applied)
        XCTAssertTrue(s.changes(since: ledger).isEmpty, "an empty price row isn't sent over the office's prices")
    }

    func testTechniciansDropPricesWithoutSendingAnything() {
        var b = job()
        var line = EstimateLine(id: "e1", projectId: "p1", key: "dev:tv")
        line.unitPrice = 99
        b.estimateLines = [line]
        var s = SyncState(bundles: [b], catalog: [type()], products: [product()])
        var ledger = SyncLedger()
        s.markSynced(s.rows(), ledger: &ledger)
        ledger.watermarks[SyncTable.deviceTypePrices.rawValue] = "2026-11-10T10:00:00.000Z"
        ledger.watermarks[SyncTable.estimateLines.rawValue] = "2026-11-10T10:00:00.000Z"
        ledger.watermarks[SyncTable.markers.rawValue] = "2026-11-10T10:00:00.000Z"
        XCTAssertTrue(s.dropPrices(ledger: &ledger))
        XCTAssertEqual(s.catalog[0].unitPrice, 0)
        XCTAssertEqual(s.catalog[0].laborPrice, 0)
        XCTAssertEqual(s.products[0].unitPrice, 0)
        // A former office member's job keeps no pricing, Billdu links or estimate lines either.
        XCTAssertNil(s.bundles["p1"]!.project.pricing)
        XCTAssertNil(s.bundles["p1"]!.project.billduClientId)
        XCTAssertTrue(s.bundles["p1"]!.estimateLines.isEmpty)
        XCTAssertTrue(s.changes(since: ledger).isEmpty)
        // Back in the office later, the price tables come down again from the start; other tables keep their place.
        XCTAssertNil(ledger.watermarks[SyncTable.deviceTypePrices.rawValue])
        XCTAssertNil(ledger.watermarks[SyncTable.estimateLines.rawValue])
        XCTAssertNotNil(ledger.watermarks[SyncTable.markers.rawValue])
        XCTAssertFalse(s.dropPrices(ledger: &ledger))
        XCTAssertTrue(TeamLogic.mayPull(.deviceTypePrices, role: .admin))
        for t in [SyncTable.deviceTypePrices, .productPrices, .projectFinance] {
            XCTAssertFalse(TeamLogic.mayPull(t, role: .tech), "\(t)")
            XCTAssertFalse(TeamLogic.mayPush(t, role: .tech), "\(t)")
            XCTAssertTrue(TeamLogic.mayPush(t, role: .owner), "\(t)")
        }
    }

    // MARK: ids

    func testRowsWithUnsafeIdsAreRefused() {
        XCTAssertTrue(SyncMap.isSafeId("a1_B-2"))
        for bad in ["", "../etc", "a/b", "a b", "a.b", String(repeating: "x", count: 65), "é"] {
            XCTAssertFalse(SyncMap.isSafeId(bad), bad)
        }
        var s = SyncState(bundles: [job()], catalog: [], products: [])
        var ledger = SyncLedger()
        var m = SyncMap.toRemote(.markers, SyncState.json(Marker(id: "../../x", projectId: "p1", sheetId: "s1", deviceTypeId: "tv", x: 0, y: 0, label: "TV")).0)
        XCTAssertEqual(s.merge(.markers, remote: m, ledger: &ledger), .refused)
        m["id"] = "m1"
        m["project_id"] = "p1/../p2"
        XCTAssertEqual(s.merge(.markers, remote: m, ledger: &ledger), .refused)
        var p = SyncMap.toRemote(.projects, SyncState.json(job().project).0)
        p["id"] = "p 1"
        XCTAssertEqual(s.merge(.projects, remote: p, ledger: &ledger), .refused)
        XCTAssertFalse(SyncState.needsRetry(.refused, parentsFailed: true), "a refused row isn't fetched again")
        XCTAssertEqual(s.bundles.count, 1)
    }

    /// The web app gives a price override the id "<job id>:<line key>" (estimateLineId), the same on every device. Those
    /// rows must reach the iPad (they are never file names here); anything else unsafe is still refused.
    func testWebEstimateOverrideIdsArePulled() {
        var s = SyncState(bundles: [job()], catalog: [], products: [])
        var ledger = SyncLedger()
        var o = EstimateLine(id: "p1:dev:wap", projectId: "p1", key: "dev:wap")
        o.unitPrice = 99.99
        o.updatedAt = "2026-11-20T10:00:00.000Z"
        let remote = SyncMap.toRemote(.estimateLines, SyncState.json(o).0)
        XCTAssertEqual(s.merge(.estimateLines, remote: remote, ledger: &ledger), .applied)
        XCTAssertEqual(s.bundles["p1"]?.estimateLines.first { $0.id == "p1:dev:wap" }?.unitPrice, 99.99)
        var charge = remote
        charge["id"] = "p1:custom:abc@cam-indoor+cam-outdoor"
        charge["key"] = "custom:abc@cam-indoor+cam-outdoor"
        XCTAssertEqual(s.merge(.estimateLines, remote: charge, ledger: &ledger), .applied)
        for (id, pid) in [("p2:dev:wap", "p1"), ("../x", "p1"), ("p1:", "p1"), ("p1:dev\nwap", "p1"), ("x:dev:wap", "x/../p1")] {
            var bad = remote
            bad["id"] = id
            bad["project_id"] = pid
            XCTAssertEqual(s.merge(.estimateLines, remote: bad, ledger: &ledger), .refused, id)
        }
        var marker = SyncMap.toRemote(.markers, SyncState.json(Marker(id: "p1:m", projectId: "p1", sheetId: "s1", deviceTypeId: "tv", x: 0, y: 0, label: "TV")).0)
        marker["project_id"] = "p1"
        XCTAssertEqual(s.merge(.markers, remote: marker, ledger: &ledger), .refused, "only price overrides take this form")
    }

    // MARK: edit times

    func testRowsGoUpWithTheirEditTimeNotThePushTime() {
        var s = SyncState(bundles: [job()], catalog: [], products: [])
        var ledger = SyncLedger()
        s.markSynced(s.rows(), ledger: &ledger)
        // An edit that doesn't stamp the row: the time this device saw it change is the edit time.
        s.bundles["p1"]!.project.notes = "gate code 1234"
        ledger.noteDirty(s.changes(since: ledger), now: "2026-11-15T09:00:00.000Z")
        // Seen again later (the next sync): the first time stays.
        ledger.noteDirty(s.changes(since: ledger), now: "2026-11-15T18:00:00.000Z")
        let row = s.changes(since: ledger).first { $0.table == .projects }!
        XCTAssertEqual(ledger.editTime(row, fallback: "2026-11-15T18:00:00.000Z"), "2026-11-15T09:00:00.000Z")
        // A newer server copy (another device edited later) wins; an older one doesn't.
        var remote = SyncMap.toRemote(.projects, SyncState.json(job().project).0)
        remote["notes"] = "server"
        remote["updated_at"] = "2026-11-15 08:00:00+00"
        XCTAssertEqual(s.merge(.projects, remote: remote, ledger: &ledger), .keptLocal)
        remote["updated_at"] = "2026-11-15 10:00:00+00"
        XCTAssertEqual(s.merge(.projects, remote: remote, ledger: &ledger), .applied)
        XCTAssertTrue(ledger.dirtyAt.isEmpty, "the server's copy replaced the edit")
        // A row stamped by its edit keeps its own time when that is later.
        s.bundles["p1"]!.project.notes = "again"
        ledger.noteDirty(s.changes(since: ledger), now: "2026-11-15T11:00:00.000Z")
        s.bundles["p1"]!.project.updatedAt = "2026-11-15T12:00:00.000Z"
        let r2 = s.changes(since: ledger).first { $0.table == .projects }!
        XCTAssertEqual(ledger.editTime(r2, fallback: "x"), "2026-11-15T12:00:00.000Z")
        s.markSynced([r2], ledger: &ledger)
        XCTAssertNil(ledger.dirtyAt[SyncLedger.key(.projects, "p1")], "sent: forgotten")
        // Rows no longer changed are forgotten too.
        ledger.dirtyAt["markers:gone"] = "2026-11-01T00:00:00.000Z"
        ledger.noteDirty([], now: "x")
        XCTAssertTrue(ledger.dirtyAt.isEmpty)
    }

    func testAnEditOnADeviceWhoseClockIsBehindStillLooksNewerThanTheCopyItChanged() {
        var s = SyncState(bundles: [job()], catalog: [], products: [])
        var ledger = SyncLedger()
        // Another device saved the job at 10:00 (server time); this device has that copy.
        s.bundles["p1"]!.project.updatedAt = "2026-11-15T10:00:00.000Z"
        s.markSynced(s.rows(), ledger: &ledger)
        // Edited here, without stamping the row, while this device's clock says 07:00.
        s.bundles["p1"]!.project.notes = "gate code 1234"
        ledger.noteDirty(s.changes(since: ledger), now: "2026-11-15T07:00:00.000Z")
        let row = s.changes(since: ledger).first { $0.table == .projects }!
        let sent = ledger.editTime(row, fallback: "2026-11-15T07:00:00.000Z")
        XCTAssertGreaterThan(SyncMap.date(sent), SyncMap.date("2026-11-15T10:00:00.000Z"), "goes up newer than the copy it changed: \(sent)")
        XCTAssertLessThan(SyncMap.date(sent), SyncMap.date("2026-11-15T10:00:01.000Z"))
        // With the clock right, the edit time is simply now.
        XCTAssertEqual(SyncLedger.editedAfter("2026-11-15T10:00:00.000Z", now: "2026-11-15T11:00:00.000Z"), "2026-11-15T11:00:00.000Z")
        XCTAssertEqual(SyncLedger.editedAfter(nil, now: "2026-11-15T11:00:00.000Z"), "2026-11-15T11:00:00.000Z")
        // The server's own format is read too.
        XCTAssertGreaterThan(SyncMap.date(SyncLedger.editedAfter("2026-11-15 10:00:00+00", now: "2026-11-15T07:00:00.000Z")), SyncMap.date("2026-11-15T10:00:00.000Z"))
    }

    func testRowsThatOnlyLookChangedAfterTheUpdateKeepTheirOwnTime() throws {
        // A ledger from before prices were split: its fingerprints include the prices, so every job looks changed once.
        let s = SyncState(bundles: [job()], catalog: [type()], products: [])
        let old = Data(#"{"hashes":{"projects:p1":"0ld","deviceTypes:\#(s.catalog[0].id)":"0ld"},"watermarks":{}}"#.utf8)
        var ledger = SyncLedger.load(old, for: "u1")
        XCTAssertEqual(ledger.hashVersion, 1)
        let changed = s.changes(since: ledger)
        XCTAssertTrue(changed.contains { $0.table == .projects })
        XCTAssertTrue(changed.contains { $0.table == .projectFinance }, "never sent before")
        ledger.noteDirty(changed, now: "2026-11-20T12:00:00.000Z")
        for r in changed {
            XCTAssertEqual(ledger.editTime(r, fallback: "x"), r.json["updatedAt"] as? String, "\(r.table) isn't stamped as edited now")
        }
        XCTAssertEqual(ledger.hashVersion, SyncLedger.currentHashVersion)
        XCTAssertEqual(SyncLedger().hashVersion, SyncLedger.currentHashVersion, "a new ledger needs no upgrade")
    }

    func testDirtyTimesSurviveSavingTheLedger() throws {
        var l = SyncLedger(userId: "u1")
        l.dirtyAt["projects:p1"] = "2026-11-15T09:00:00.000Z"
        let back = SyncLedger.load(try JSONEncoder().encode(l), for: "u1")
        XCTAssertEqual(back.dirtyAt["projects:p1"], "2026-11-15T09:00:00.000Z")
    }

    // MARK: where the app connects

    func testServerAddressesMustBeHTTPS() {
        XCTAssertEqual(CloudEndpoint.url("pinplan.example.com")?.absoluteString, "https://pinplan.example.com")
        XCTAssertEqual(CloudEndpoint.url(" https://x.supabase.co/ ")?.host, "x.supabase.co")
        XCTAssertNil(CloudEndpoint.url("http://pinplan.example.com"), "plain http is refused")
        XCTAssertNotNil(CloudEndpoint.url("http://localhost:3000", allowHTTP: true), "debug builds may use a local server")
        XCTAssertNil(CloudEndpoint.url("ftp://pinplan.example.com"))
        XCTAssertNil(CloudEndpoint.url("https://user:pw@pinplan.example.com"))
        XCTAssertNil(CloudEndpoint.url(""))
        XCTAssertNil(CloudEndpoint.url("https://"))
    }

    func testTheSessionOnlyGoesToTrustedServers() {
        let builtIn = "https://app.pinplan.example"
        XCTAssertTrue(CloudEndpoint.mayCarrySession(host: "app.pinplan.example", builtIn: builtIn, confirmed: []))
        XCTAssertTrue(CloudEndpoint.mayCarrySession(host: "APP.pinplan.example", builtIn: builtIn, confirmed: []))
        XCTAssertFalse(CloudEndpoint.mayCarrySession(host: "evil.example", builtIn: builtIn, confirmed: []))
        XCTAssertTrue(CloudEndpoint.mayCarrySession(host: "pinplan.acme.com", builtIn: builtIn, confirmed: ["pinplan.acme.com"]))
        XCTAssertFalse(CloudEndpoint.mayCarrySession(host: "app.pinplan.example.evil.com", builtIn: builtIn, confirmed: []))
        XCTAssertFalse(CloudEndpoint.mayCarrySession(host: nil, builtIn: builtIn, confirmed: []))
        XCTAssertFalse(CloudEndpoint.mayCarrySession(host: "", builtIn: "", confirmed: []), "no built-in server: nobody gets it")
    }
}
