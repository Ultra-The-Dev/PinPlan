import XCTest
@testable import PinPlanCore

final class GeometryTests: XCTestCase {
    func testParseFeet() {
        XCTAssertEqual(Geometry.parseFeet("12"), 12)
        XCTAssertEqual(Geometry.parseFeet("12'6\""), 12.5)
        XCTAssertEqual(Geometry.parseFeet("12' 6\""), 12.5)
        XCTAssertEqual(Geometry.parseFeet("12ft 6in"), 12.5)
        XCTAssertEqual(Geometry.parseFeet("18\""), 1.5)
        XCTAssertNil(Geometry.parseFeet("abc"))
    }

    func testParseScale() {
        XCTAssertEqual(Geometry.parseScale("1/4\" = 1'-0\"")!, 0.25, accuracy: 1e-9)
        XCTAssertEqual(Geometry.parseScale("1/8\"=1'")!, 0.125, accuracy: 1e-9)
        XCTAssertEqual(Geometry.parseScale("3/16 = 1")!, 0.1875, accuracy: 1e-9)
        XCTAssertEqual(Geometry.parseScale("1:48")!, 0.25, accuracy: 1e-9)
    }

    func testFeetInches() {
        XCTAssertEqual(Geometry.formatFeetInches(12.5), "12'-6\"")
        XCTAssertEqual(Geometry.formatFeetInches(9.999), "10'-0\"")
    }

    func testHomeRunEstimate() {
        let a = Sheet(id: "a", projectId: "p", name: "A", pageNumber: 1, order: 0, imageId: "i", width: 1000, height: 1000, pxPerFt: 10)
        let b = Sheet(id: "b", projectId: "p", name: "B", pageNumber: 2, order: 1, imageId: "i", width: 1000, height: 1000, pxPerFt: 10)
        let m = Marker(projectId: "p", sheetId: "a", deviceTypeId: "cam-indoor", x: 0.1, y: 0.1, label: "x")
        var pricing = Catalog.defaultPricing
        pricing.wireSlackPct = 10; pricing.wireDropFt = 10; pricing.floorHeightFt = 10
        let same = Closet(projectId: "p", sheetId: "a", kind: .equipment, x: 0.4, y: 0.5, name: "EQ")
        XCTAssertEqual(Geometry.estimateHomeRunFt(marker: m, closet: same, sheets: [a, b], pricing: pricing), 87)
        let other = Closet(projectId: "p", sheetId: "b", kind: .equipment, x: 0.4, y: 0.5, name: "EQ")
        XCTAssertEqual(Geometry.estimateHomeRunFt(marker: m, closet: other, sheets: [a, b], pricing: pricing), 98)
    }

    func testStairRunLength() {
        let r = Run(projectId: "p", sheetId: "s", kind: .stair, points: [], steps: 14, lfPerStep: 3.5)
        XCTAssertEqual(Geometry.runLengthFt(r), 49)
    }
}

final class EditingTests: XCTestCase {
    func bundle() -> (ProjectBundle, [DeviceType]) {
        var b = ProjectBundle(project: Project(id: "p", clientName: "C", address: "A"))
        b.sheets = [
            Sheet(id: "s1", projectId: "p", name: "1st", pageNumber: 1, order: 0, imageId: "i1", width: 1000, height: 800, pxPerFt: 10),
            Sheet(id: "s2", projectId: "p", name: "Cellar", pageNumber: 2, order: 1, imageId: "i2", width: 1000, height: 800, pxPerFt: 10),
        ]
        return (b, Catalog.seed())
    }

    func testAutoHomeRunsAssignsClosetAndFollowsMoves() {
        var (b, cat) = bundle()
        let cam = cat.first { $0.id == "cam-indoor" }!
        let m = b.addMarker(type: cam, sheetId: "s1", x: 0.2, y: 0.2)
        XCTAssertNil(m.closetId)
        b.addCloset(kind: .equipment, sheetId: "s2", x: 0.5, y: 0.5)
        XCTAssertEqual(b.autoHomeRuns(catalog: cat, pricing: Catalog.defaultPricing), 1)
        XCTAssertNotNil(b.liveMarkers[0].closetId)
        let before = b.liveRuns[0].measuredFt!
        b.updateMarker(m.id, pricing: Catalog.defaultPricing) { $0.x = 0.9 }
        XCTAssertEqual(b.liveRuns.count, 1)
        XCTAssertNotEqual(b.liveRuns[0].measuredFt!, before)
        XCTAssertEqual(b.liveRuns[0].points[0], 0.9)
        b.deleteMarker(m.id)
        XCTAssertTrue(b.liveRuns.isEmpty)
        _ = cat
    }

    func testRotateSheetRotatesMarkup() {
        var (b, cat) = bundle()
        b.addMarker(type: cat[0], sheetId: "s1", x: 0.2, y: 0.1)
        b.addRun(Run(projectId: "p", sheetId: "s1", kind: .led, points: [0, 0, 1, 0]))
        b.rotateSheetClockwise("s1", newImageId: "i1r", width: 800, height: 1000)
        XCTAssertEqual(b.liveMarkers[0].x, 0.9, accuracy: 1e-9)
        XCTAssertEqual(b.liveMarkers[0].y, 0.2, accuracy: 1e-9)
        XCTAssertEqual(b.liveRuns[0].points, [1, 0, 1, 1])
        XCTAssertEqual(b.sheets[0].width, 800)
        cat.removeAll()
    }

    func testSetScaleRemeasuresRuns() {
        var (b, _) = bundle()
        b.sheets[0].pxPerFt = nil
        let r = b.addRun(Run(projectId: "p", sheetId: "s1", kind: .led, points: [0, 0, 0.5, 0]))
        XCTAssertNil(r.measuredFt)
        b.setScale(sheetId: "s1", pxPerFt: 20, label: "test", pricing: Catalog.defaultPricing)
        XCTAssertEqual(b.liveRuns[0].measuredFt!, 25, accuracy: 1e-9)
    }

    func testDeleteClosetUnassignsDevices() {
        var (b, cat) = bundle()
        let c = b.addCloset(kind: .equipment, sheetId: "s1", x: 0.5, y: 0.5)
        let m = b.addMarker(type: cat[0], sheetId: "s1", x: 0.1, y: 0.1)
        XCTAssertEqual(m.closetId, c.id)
        b.autoHomeRuns(catalog: cat, pricing: Catalog.defaultPricing)
        b.deleteCloset(c.id)
        XCTAssertNil(b.liveMarkers[0].closetId)
        XCTAssertTrue(b.liveRuns.isEmpty)
    }
}

final class BackupTests: XCTestCase {
    func testReadsBackupExportedByTheWebApp() throws {
        let url = Bundle.module.url(forResource: "web-backup.pinplan", withExtension: "json", subdirectory: "Fixtures")!
        let f = try BackupFile.decode(Data(contentsOf: url))
        XCTAssertEqual(f.projects.count, 1)
        let b = f.projects[0].bundle
        XCTAssertEqual(b.liveSheets.map(\.name), ["Attic", "1st Fl", "2nd Fl", "Cellar"])
        XCTAssertFalse(b.liveMarkers.isEmpty)
        XCTAssertEqual(f.catalog?.count, 19)
        // Takeoff on imported data works and round-trips through our encoder.
        let t = TakeoffCalculator.compute(b)
        XCTAssertEqual(t.total.counts["cam-indoor"], b.liveMarkers.filter { $0.deviceTypeId == "cam-indoor" }.count)
        let again = try BackupFile.decode(f.encoded())
        XCTAssertEqual(again.projects[0].bundle, b)
    }

    func testRejectsOtherJSON() {
        XCTAssertThrowsError(try BackupFile.decode(Data("{\"hello\":1}".utf8)))
    }
}
