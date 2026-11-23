import XCTest
@testable import PinPlanCore

// Count pins ("Add by count"): one pin that stands for several devices of its type (12 windows). Same cases as the
// web's tests/markerCount.test.ts.
final class MarkerCountTests: XCTestCase {
    let catalog = Catalog.seed()

    func mk(_ id: String, _ type: String, _ sheet: String, count: Int? = nil, tentative: Bool = false, wire: String = "Cat6") -> Marker {
        var m = Marker(id: id, projectId: "p", sheetId: sheet, deviceTypeId: type, x: 0.5, y: 0.5, label: id, room: "Den", wireType: wire, closetId: "eq", tentative: tentative)
        m.count = count
        return m
    }

    func bundle(_ markers: [Marker]) -> ProjectBundle {
        var b = ProjectBundle(project: Project(id: "p", clientName: "", address: ""))
        b.sheets = [Sheet(id: "s1", projectId: "p", name: "1st Fl", pageNumber: 1, order: 0, imageId: "i", width: 100, height: 100, pxPerFt: 1),
                    Sheet(id: "s2", projectId: "p", name: "2nd Fl", pageNumber: 2, order: 1, imageId: "i", width: 100, height: 100, pxPerFt: 1)]
        b.closets = [Closet(id: "eq", projectId: "p", sheetId: "s1", kind: .equipment, x: 0, y: 0, name: "Equipment closet")]
        b.markers = markers
        return b
    }

    func testQuantityAndNormalize() {
        let counts: [Int?] = [nil, 0, 1, -3]
        XCTAssertEqual(counts.map { mk("a", "wap", "s1", count: $0).quantity }, [1, 1, 1, 1])
        XCTAssertEqual([2, 12, 9999, 20000].map { mk("a", "wap", "s1", count: $0).quantity }, [2, 12, 9999, 9999])
        XCTAssertEqual([nil, 0, 1].map { Marker.normalizeCount($0) }, [nil, nil, nil])
        XCTAssertEqual([2, 12, 10000].map { Marker.normalizeCount($0) }, [2, 12, 9999])
        XCTAssertEqual(mk("WIN-1-01", "gen-window", "s1", count: 12).pinLabel, "WIN-1-01 ×12")
        XCTAssertEqual(mk("WIN-1-01", "gen-window", "s1").pinLabel, "WIN-1-01")
        XCTAssertEqual([mk("a", "wap", "s1", count: 12), mk("b", "wap", "s1"), mk("c", "wap", "s1", count: 3)].quantitySum, 16)
    }

    func testCountPinSpot() {
        XCTAssertEqual(Marker.countPinSpot(center: PlanPoint(x: 0.5, y: 0.4), taken: []), PlanPoint(x: 0.5, y: 0.4))
        XCTAssertEqual(Marker.countPinSpot(center: PlanPoint(x: -2, y: 1.5), taken: []), PlanPoint(x: 0.03, y: 0.97))
        let p = Marker.countPinSpot(center: PlanPoint(x: 0.5, y: 0.4), taken: [PlanPoint(x: 0.5, y: 0.4)])
        XCTAssertEqual(p.x, 0.52, accuracy: 1e-9)
        XCTAssertEqual(p.y, 0.42, accuracy: 1e-9)
    }

    func testTakeoffCountsTheCount() {
        var gone = mk("x", "gen-door", "s2", count: 5)
        gone.deleted = true
        let b = bundle([mk("w", "gen-window", "s1", count: 12), mk("w1", "gen-window", "s1"), mk("c", "cam-indoor", "s2", count: 3, tentative: true), gone])
        let t = TakeoffCalculator.compute(b)
        XCTAssertEqual(t.floors[0].bucket.counts["gen-window"], 13)
        XCTAssertEqual(t.floors[1].bucket.counts["cam-indoor"], 3)
        XCTAssertEqual(t.floors[1].bucket.tentative["cam-indoor"], 3)
        XCTAssertNil(t.total.counts["gen-door"])
        let s = AlarmSensors.summary(t, catalog: catalog + Trades.builtInAdditions(catalog: catalog))
        XCTAssertEqual(s.total.windows, 13)
    }

    func testProductSplitAndOrderList() {
        let p = Product(id: "pr", deviceTypeId: "cam-indoor", brand: "Axis", model: "M1", unitPrice: 50, laborPrice: 0)
        var a = mk("a", "cam-indoor", "s1", count: 4)
        a.productId = "pr"
        let b = bundle([a, mk("b", "cam-indoor", "s1")])
        let split = ProductAssignment.split(b, takeoff: TakeoffCalculator.compute(b), catalog: catalog, products: [p])
        XCTAssertEqual(split["cam-indoor"]?["pr"]?.confirmed, 4)
        let rows = Wiring.materialList(b, catalog: catalog, products: [p], includeTentative: true)
        XCTAssertEqual(rows.filter { $0.item.contains("Indoor camera") }.map(\.qty), [4, 1])
    }

    func testPortScheduleRowPerDevice() {
        var b = bundle([mk("WC-1-01", "window-contact", "s1", count: 3, wire: "22/4 alarm"), mk("WC-1-02", "window-contact", "s1", wire: "22/4 alarm")])
        b.runs = [Run(id: "r", projectId: "p", sheetId: "s1", kind: .wire, points: [0, 0, 1, 1], typedFt: 40, wireType: "22/4 alarm", markerId: "WC-1-01", closetId: "eq")]
        let rows = Wiring.portSchedule(b, catalog: catalog)
        XCTAssertEqual(rows.map { "\($0.label):\($0.port)" }, ["WC-1-01.1:ZN-01", "WC-1-01.2:ZN-02", "WC-1-01.3:ZN-03", "WC-1-02:ZN-04"])
        XCTAssertEqual(rows.map(\.lengthFt), [40, 40, 40, nil])
    }

    func testInstallProgressOneStatusCountedPerDevice() {
        var a = mk("a", "cam-indoor", "s1", count: 4)
        a.install = InstallState(status: .installed)
        let ms = [a, mk("b", "cam-indoor", "s1")]
        let c = InstallProgress.totals(ms, catalog: catalog)
        XCTAssertEqual(c.total, 5)
        XCTAssertEqual(c.count(.installed), 4)
        XCTAssertEqual(c.count(.planned), 1)
        XCTAssertEqual(InstallProgress.installedQuantities(markers: ms, catalog: catalog), ["cam-indoor": 4])
    }

    func testJobSummaryDevices() {
        let s = JobSummary.make(bundle([mk("a", "wap", "s1", count: 12), mk("b", "wap", "s1", tentative: true)]), today: "2026-11-23")
        XCTAssertEqual(s.devices, 13)
        XCTAssertEqual(s.tentative, 1)
    }

    func testSyncSendsCountOrNull() {
        let base: [String: Any] = ["id": "m", "projectId": "p", "sheetId": "s", "deviceTypeId": "gen-window"]
        var row = base
        row["count"] = 12
        XCTAssertEqual(SyncMap.toRemote(.markers, row)["count"] as? Int, 12)
        row["count"] = 1
        XCTAssertTrue(SyncMap.toRemote(.markers, row)["count"] is NSNull)
        XCTAssertTrue(SyncMap.toRemote(.markers, base)["count"] is NSNull)
        row["count"] = 123456
        XCTAssertEqual(SyncMap.toRemote(.markers, row)["count"] as? Int, 9999)
        // A count pin survives the local JSON round trip.
        let json = SyncState.json(mk("w", "gen-window", "s1", count: 7)).0
        XCTAssertEqual(SyncMap.toRemote(.markers, json)["count"] as? Int, 7)
    }
}
