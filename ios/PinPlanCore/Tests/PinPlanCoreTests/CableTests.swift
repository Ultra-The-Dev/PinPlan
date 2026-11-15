import XCTest
@testable import PinPlanCore

final class CableTests: XCTestCase {
    func testBundleHelpers() {
        XCTAssertEqual(Cables.summary(["HDMI", "Cat6", "Cat6"]), "HDMI + 2× Cat6")
        XCTAssertEqual(Cables.summary([]), "No cable")
        XCTAssertEqual(Cables.setting("Cat6", count: 3, in: ["HDMI", "Cat6"]), ["HDMI", "Cat6", "Cat6", "Cat6"])
        XCTAssertEqual(Cables.setting("HDMI", count: 0, in: ["HDMI", "Cat6"]), ["Cat6"])
        XCTAssertEqual(Cables.setting("Coax", count: 1, in: ["Cat6"]), ["Cat6", "Coax"])
        var m = Marker(projectId: "p", sheetId: "s", deviceTypeId: "tv", x: 0, y: 0, label: "TV", wireType: "Cat6")
        XCTAssertEqual(m.cables, ["Cat6"])
        m.setCables(["HDMI", "Cat6", "Cat6"])
        XCTAssertEqual(m.wireType, "HDMI")
        XCTAssertEqual(m.cables, ["HDMI", "Cat6", "Cat6"])
        m.setCables([])
        XCTAssertEqual(m.wireType, "None")
        XCTAssertTrue(m.cables.isEmpty)
    }

    func testHomeRunCarriesTheBundleAndTakeoffCountsEachCable() {
        let catalog = Catalog.seed()
        var b = ProjectBundle(project: Project(clientName: "C", address: "A"))
        var sheet = Sheet(projectId: b.project.id, name: "1st Fl", pageNumber: 1, order: 0, imageId: "img", width: 1000, height: 1000)
        sheet.pxPerFt = 10   // 100 ft square sheet
        b.sheets = [sheet]
        b.addCloset(kind: .equipment, sheetId: sheet.id, x: 0.1, y: 0.1)
        let tv = catalog.first { $0.id == "tv" }!
        let m = b.addMarker(type: tv, sheetId: sheet.id, x: 0.6, y: 0.1)
        b.updateMarker(m.id, pricing: Catalog.defaultPricing) { $0.setCables(["HDMI", "Cat6", "Cat6"]) }
        XCTAssertEqual(b.autoHomeRuns(catalog: catalog, pricing: Catalog.defaultPricing), 1)
        let run = b.liveRuns.first { $0.kind == .wire }!
        XCTAssertEqual(run.cables, ["HDMI", "Cat6", "Cat6"])
        let t = TakeoffCalculator.compute(b).total
        let len = Geometry.runLengthFt(run)!
        XCTAssertEqual(t.wireRuns["Cat6"], 2)
        XCTAssertEqual(t.wireRuns["HDMI"], 1)
        XCTAssertEqual(t.wireFt["Cat6"]!, (len * 2 * 10).rounded() / 10, accuracy: 0.11)
        XCTAssertEqual(t.wireFt["HDMI"]!, len, accuracy: 0.11)
        // Removing a cable from the device updates its home run.
        b.updateMarker(m.id, pricing: Catalog.defaultPricing) { $0.setCables(["HDMI"]) }
        XCTAssertEqual(b.liveRuns.first { $0.kind == .wire }?.cables, ["HDMI"])
    }
}
