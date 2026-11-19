import XCTest
@testable import PinPlanCore

final class InstallProgressTests: XCTestCase {
    private let ts = "2026-11-19T10:00:00.000Z"
    private let later = "2026-11-19T11:00:00.000Z"

    private func type(_ id: String, _ cat: Category, kind: DeviceKind = .device) -> DeviceType {
        DeviceType(id: id, name: id, category: cat, symbol: "X", abbrev: "X", shape: .circle, color: "#000", unit: .each, unitPrice: 1, laborPrice: 1,
                   defaultWire: "Cat6", defaultMount: .ceiling, kind: kind, billduProductId: nil, sort: 0, archived: nil, updatedAt: ts)
    }
    private var catalog: [DeviceType] { [type("cam", .security), type("wap", .network), type("led", .lighting, kind: .led)] }
    private func mk(_ id: String, _ sheet: String, _ t: String, _ s: InstallStatus? = nil, tentative: Bool = false) -> Marker {
        var m = Marker(id: id, projectId: "p", sheetId: sheet, deviceTypeId: t, x: 0.5, y: 0.5, label: id, tentative: tentative)
        if let s { m.install = InstallState(status: s, at: ts) }
        return m
    }
    private var sheets: [Sheet] {
        [Sheet(id: "s1", projectId: "p", name: "1st Fl", pageNumber: 1, order: 0, imageId: "i", width: 100, height: 100),
         Sheet(id: "s2", projectId: "p", name: "2nd Fl", pageNumber: 2, order: 1, imageId: "i", width: 100, height: 100),
         Sheet(id: "s3", projectId: "p", name: "Roof", pageNumber: 3, order: 2, imageId: "i", width: 100, height: 100)]
    }

    func testWorkflowsPerTrade() {
        let lv = InstallProgress.workflow(category: .security)
        XCTAssertEqual(lv.steps, [.roughed, .installed, .tested])
        XCTAssertEqual(lv.label(.roughed), "Pre-wired")
        let el = InstallProgress.workflow(category: .power, trades: [.electrical])
        XCTAssertEqual(el.label(.installed), "Trimmed out")
        XCTAssertEqual(InstallProgress.workflow(category: .lighting, trades: [.electrical]).id, "electrical")
        XCTAssertEqual(InstallProgress.workflow(category: .lighting, trades: [.lowvoltage]).id, "lowvoltage")
        XCTAssertEqual(InstallProgress.workflow(category: .panels, trades: [.electrical]).steps, [.installed, .tested])
        let cable = InstallProgress.workflow(run: .wire)
        XCTAssertEqual([cable.label(.roughed), cable.label(.installed), cable.label(.tested)], ["Pulled", "Terminated", "Certified"])
        XCTAssertEqual(InstallProgress.workflow(run: .wire, trades: [.plumbing]).label(.tested), "Pressure tested")
        XCTAssertEqual(InstallProgress.workflow(run: .led).steps, [.installed, .tested])
        XCTAssertEqual(InstallProgress.workflow(category: .hvac, trades: [.hvac]).label(.tested), "Started up")
        XCTAssertEqual(InstallProgress.workflow(category: .solar, trades: [.solar]).label(.tested), "Commissioned")
    }

    func testNextStatus() {
        let w = InstallProgress.workflow(category: .security)
        XCTAssertEqual(InstallProgress.next(nil, w), .roughed)
        XCTAssertEqual(InstallProgress.next(.roughed, w), .installed)
        XCTAssertEqual(InstallProgress.next(.installed, w), .tested)
        XCTAssertNil(InstallProgress.next(.tested, w))
        XCTAssertNil(InstallProgress.next(.verified, w))
        XCTAssertEqual(InstallProgress.next(.issue, w), .roughed)
        XCTAssertEqual(InstallProgress.next(.planned, InstallProgress.workflow(category: .infrastructure)), .installed)
    }

    func testApplyInstallHistory() {
        let a = InstallProgress.apply(nil, to: .roughed, by: "Sam", at: ts)
        XCTAssertEqual(a.status, .roughed)
        XCTAssertEqual(a.history, [InstallState.Entry(status: .roughed, by: "Sam", at: ts)])
        let b = InstallProgress.apply(a, to: .installed, by: "Ana", at: later, photoId: "ph1", note: " box set ")
        XCTAssertEqual(b.history?.count, 2)
        XCTAssertEqual(b.history?.last?.note, "box set")
        XCTAssertEqual(b.photoIds, ["ph1"])
        let c = InstallProgress.apply(b, to: .tested, by: "Ana", at: later, photoId: "ph1", test: .init(pass: true, value: "0.4 dB"))
        XCTAssertEqual(c.photoIds, ["ph1"])
        XCTAssertEqual(c.test, InstallState.Test(pass: true, value: "0.4 dB"))
        XCTAssertEqual(InstallProgress.apply(c, to: .verified, by: "Office", at: later).test?.value, "0.4 dB")
        XCTAssertNil(InstallProgress.apply(c, to: .issue, by: "Office", at: later, clearTest: true).test)
        XCTAssertEqual(InstallProgress.testText(c.test), "Pass · 0.4 dB")
        XCTAssertEqual(InstallProgress.testText(.init(pass: false)), "Fail")
    }

    func testPermissions() {
        for s in [InstallStatus.planned, .roughed, .installed, .tested, .issue] { XCTAssertTrue(InstallProgress.canSet(.tech, s)) }
        XCTAssertFalse(InstallProgress.canSet(.tech, .verified))
        XCTAssertFalse(InstallProgress.canSet(.tech, .issue, from: .verified))
        XCTAssertTrue(InstallProgress.canSet(.admin, .verified))
        XCTAssertTrue(InstallProgress.canSet(nil, .verified))
        XCTAssertFalse(InstallProgress.canReset(.tech))
        XCTAssertTrue(InstallProgress.canReset(.owner))
    }

    func testRequiresPhoto() {
        XCTAssertTrue(InstallProgress.requiresPhoto(nil, .installed))
        XCTAssertFalse(InstallProgress.requiresPhoto(nil, .tested))
        XCTAssertFalse(InstallProgress.requiresPhoto([], .installed))
        XCTAssertTrue(InstallProgress.requiresPhoto([.roughed, .tested], .tested))
    }

    func testProgressGrouping() {
        var gone = mk("gone", "s2", "wap", .tested); gone.deleted = true
        let markers = [mk("a", "s1", "cam", .tested), mk("b", "s1", "cam", .verified), mk("c", "s1", "wap", .installed), mk("d", "s1", "wap"),
                       mk("t", "s1", "cam", .tested, tentative: true), mk("x", "s2", "wap", .issue), gone, mk("ledm", "s2", "led", .tested)]
        var r1 = Run(id: "r1", projectId: "p", sheetId: "s1", kind: .wire, points: [0, 0, 1, 1], wireType: "Cat6", markerId: "a", closetId: "eq")
        r1.install = InstallState(status: .tested)
        let r2 = Run(id: "r2", projectId: "p", sheetId: "s1", kind: .wire, points: [0, 0, 1, 1], wireType: "Cat6", markerId: "c", closetId: "eq")
        let rows = InstallProgress.progress(markers: markers, runs: [r1, r2], sheets: sheets, catalog: catalog, by: .sheet)
        XCTAssertEqual(rows.map(\.name), ["1st Fl", "2nd Fl"])
        XCTAssertEqual(rows[0].devices.total, 4)
        XCTAssertEqual(rows[0].devices.done, 2)
        XCTAssertEqual(rows[0].devices.pct, 50)
        XCTAssertEqual(rows[0].runs.total, 2)
        XCTAssertEqual(rows[0].runs.pct, 50)
        XCTAssertEqual(rows[1].devices.count(.issue), 1)
        let byCat = InstallProgress.progress(markers: markers, runs: [r1, r2], sheets: sheets, catalog: catalog, by: .category)
        XCTAssertEqual(byCat.first { $0.id == "security" }?.devices.pct, 100)
        XCTAssertEqual(byCat.first { $0.id == "network" }?.devices.total, 3)
        XCTAssertEqual(byCat.first { $0.id == "wiring" }?.runs.total, 2)
        let closet = Closet(id: "eq", projectId: "p", sheetId: "s1", kind: .equipment, x: 0, y: 0, name: "Equipment")
        var a = mk("a", "s1", "cam", .tested); a.closetId = "eq"
        let byCloset = InstallProgress.progress(markers: [a, mk("b", "s1", "cam")], runs: [r1, r2], sheets: sheets, catalog: catalog, by: .closet, closets: [closet])
        XCTAssertEqual(byCloset.map(\.name), ["Equipment", "No closet"])
        XCTAssertEqual(byCloset[0].runs.total, 2)
        XCTAssertEqual(InstallProgress.totals(markers, catalog: catalog).pct, 40)
        XCTAssertEqual(InstallProgress.installedQuantities(markers: markers, catalog: catalog), ["cam": 2, "wap": 1])
        let c = InstallProgress.countAtLeast(markers, catalog: catalog, .installed)
        XCTAssertEqual(c.n, 3)
        XCTAssertEqual(c.total, 5)
    }

    func testIssues() {
        var m = mk("i1", "s1", "cam")
        m.install = InstallProgress.apply(nil, to: .issue, by: "Sam", at: ts, note: "Box missing")
        var r = Run(id: "r2", projectId: "p", sheetId: "s1", kind: .wire, points: [0, 0, 1, 1], wireType: "Cat6")
        r.install = InstallProgress.apply(nil, to: .issue, by: "Ana", at: later)
        let list = InstallProgress.issues(markers: [m, mk("ok", "s1", "cam", .tested)], runs: [r])
        XCTAssertEqual(list.map(\.id), ["r2", "i1"])
        XCTAssertEqual(list.last?.note, "Box missing")
        XCTAssertEqual(InstallProgress.nearest([(0, 0), (10, 0), (30, 0)], to: (8, 0), within: 24), 1)
        XCTAssertNil(InstallProgress.nearest([(100, 0)], to: (0, 0), within: 24))
        XCTAssertEqual(InstallProgress.distance(to: [0, 0, 10, 0, 10, 10], from: (12, 5)), 2, accuracy: 1e-9)
        XCTAssertEqual(InstallProgress.distance(to: [0, 0, 10, 0], from: (5, 3)), 3, accuracy: 1e-9)
        XCTAssertEqual(InstallProgress.distance(to: [], from: (0, 0)), .infinity)
    }

    func testTakeoffUnchangedWithInstall() {
        let b = buildSampleJob()
        let before = TakeoffCalculator.compute(b)
        var withInstall = b
        let statuses: [InstallStatus] = [.roughed, .installed, .tested, .verified, .issue, .planned]
        for i in withInstall.markers.indices {
            withInstall.markers[i].install = InstallProgress.apply(nil, to: statuses[i % statuses.count], by: "Sam", at: ts, test: .init(pass: true, value: "1"))
        }
        for i in withInstall.runs.indices { withInstall.runs[i].install = InstallState(status: statuses[i % statuses.count]) }
        XCTAssertNotEqual(withInstall, b)
        XCTAssertEqual(TakeoffCalculator.compute(withInstall), before)
    }

    func testCodableToleratesMissingAndUnknown() throws {
        let old = #"{"id":"m","projectId":"p","sheetId":"s","deviceTypeId":"cam","x":0.5,"y":0.5,"label":"C","room":"","mount":"ceiling","wireType":"Cat6","tentative":false,"notes":"","createdAt":"t","updatedAt":"t"}"#
        let m = try JSONDecoder().decode(Marker.self, from: Data(old.utf8))
        XCTAssertNil(m.install)
        let newer = #"{"id":"m","projectId":"p","sheetId":"s","deviceTypeId":"cam","x":0.5,"y":0.5,"label":"C","room":"","mount":"ceiling","wireType":"Cat6","tentative":false,"notes":"","createdAt":"t","updatedAt":"t","install":{"status":"commissioned","future":1,"history":[{"status":"tested","at":"t","extra":true},{"by":"x"}],"test":{"pass":true,"value":"0.4 dB","unit":"dB"}}}"#
        let n = try JSONDecoder().decode(Marker.self, from: Data(newer.utf8))
        XCTAssertEqual(n.install?.status, .planned)
        XCTAssertEqual(n.install?.history?.first?.status, .tested)
        XCTAssertEqual(n.install?.history?.count, 2)
        XCTAssertEqual(n.install?.test?.value, "0.4 dB")
        // Round trip keeps the web app's JSON keys.
        let data = try JSONEncoder().encode(n)
        let obj = try JSONSerialization.jsonObject(with: data) as? [String: Any]
        XCTAssertNotNil((obj?["install"] as? [String: Any])?["history"])
    }

    func testSyncMapsInstall() {
        let markerCols = SyncMap.specs[.markers]!.columns.map(\.0)
        let runCols = SyncMap.specs[.runs]!.columns.map(\.0)
        XCTAssertTrue(markerCols.contains("install"))
        XCTAssertTrue(runCols.contains("install"))
        let remote = SyncMap.toRemote(.markers, ["id": "m", "install": ["status": "tested"]])
        XCTAssertEqual((remote["install"] as? [String: Any])?["status"] as? String, "tested")
    }
}
