import XCTest
@testable import PinPlanCore

/// Same cases as tests/floorName.test.ts, read from the shared fixture (tests/fixtures/floorNames.json), including the
/// text PDF.js reads from the sample plan sets in samples/.
final class FloorNameTests: XCTestCase {
    struct Fixture: Decodable {
        struct Item: Decodable { let str: String; let x: Double; let y: Double; let w: Double; let h: Double }
        let titleBlock: [[String]]
        let notFloors: [String]
        let text: [[String?]]
        let samplesExpected: [String: [String]]
        let samples: [String: [[Item]]]
    }

    lazy var fixture: Fixture = {
        let url = URL(fileURLWithPath: #filePath).deletingLastPathComponent().appendingPathComponent("../../../../tests/fixtures/floorNames.json").standardized
        return try! JSONDecoder().decode(Fixture.self, from: Data(contentsOf: url))
    }()

    func t(_ s: String, _ x: Double, _ y: Double, _ h: Double = 0.01) -> FloorTextItem {
        FloorTextItem(text: s, x: x, y: y, w: Double(s.count) * h * 0.6, h: h)
    }

    func titleBlock(_ name: String, extra: [FloorTextItem] = []) -> [FloorTextItem] {
        [t("LIVING", 0.2, 0.3, 0.02), t("KITCHEN", 0.45, 0.3, 0.02), t("BEDROOM", 0.3, 0.6, 0.02),
         t("12 MAPLE RIDGE RD", 0.86, 0.86, 0.011), t(name, 0.86, 0.9, 0.028), t("A-101 · SCALE 1/8\" = 1'-0\"", 0.86, 0.94, 0.016)] + extra
    }

    func testTitleBlockWording() {
        XCTAssertGreaterThan(fixture.titleBlock.count, 30)
        for c in fixture.titleBlock {
            XCTAssertEqual(FloorName.parse(titleBlock(c[0])), c[1], c[0])
        }
    }

    func testFalsePositives() {
        for s in fixture.notFloors {
            XCTAssertNil(FloorName.parse([t(s, 0.4, 0.4, 0.012), t("RISER DIAGRAM", 0.85, 0.9, 0.02)]), s)
        }
        let notes = titleBlock("2ND FLOOR", extra: [t("1. PROVIDE 2\" CONDUIT FROM RACK TO ATTIC.", 0.05, 0.05), t("ATTIC ACCESS HATCH", 0.6, 0.4, 0.012)])
        XCTAssertEqual(FloorName.parse(notes), "2nd Floor")
        XCTAssertEqual(FloorName.parse(titleBlock("1ST. FL", extra: [t("ATTIC", 0.6, 0.5, 0.02)])), "1st Fl")
        XCTAssertNil(FloorName.parse([]))
    }

    func testVerticalStripAndLargeType() {
        let strip = [t("LIVING", 0.2, 0.3, 0.02), FloorTextItem(text: "THIRD FLOOR PLAN", x: 0.95, y: 0.4, w: 0.02, h: 0.25)]
        XCTAssertEqual(FloorName.parse(strip), "Third Floor")
        XCTAssertEqual(FloorName.parse([t("BASEMENT", 0.4, 0.05, 0.04), t("STORAGE", 0.3, 0.5, 0.012)]), "Basement")
        XCTAssertEqual(FloorName.parse([t("LIVING", 0.2, 0.3, 0.02), t("SECOND", 0.8, 0.9, 0.025), t("FLOOR", 0.88, 0.9, 0.025)]), "Second Floor")
    }

    func testPlainText() {
        for c in fixture.text {
            XCTAssertEqual(FloorName.parse(text: c[0]!), c[1], c[0]!)
        }
        // Recognised text comes one line at a time.
        XCTAssertEqual(FloorName.parse(text: "LIVING\nKITCHEN\nL2\nSCALE 1/8\""), "Level 2")
    }

    func testSamplePlanSets() {
        for (file, expected) in fixture.samplesExpected {
            let pages = fixture.samples[file] ?? []
            let names = pages.map { page in FloorName.parse(page.map { FloorTextItem(text: $0.str, x: $0.x, y: $0.y, w: $0.w, h: $0.h) }) }
            XCTAssertEqual(names, expected, file)
            // The text without positions (PDFKit's page.string) gives the same names.
            XCTAssertEqual(pages.map { FloorName.parse(text: $0.map(\.str).joined(separator: "\n")) }, expected, file)
        }
    }

    func testHelpers() {
        XCTAssertEqual(FloorName.titleCase("1ST. FL"), "1st Fl")
        XCTAssertEqual(FloorName.titleCase("ELECTRICAL RISER DIAGRAM"), "Electrical Riser Diagram")
        XCTAssertEqual(FloorName.key("FIRST FLOOR"), FloorName.key("1st Fl"))
        XCTAssertEqual(FloorName.key("2nd Fl"), FloorName.key("Second Floor"))
        XCTAssertEqual(FloorName.key("Level 2"), FloorName.key("L2"))
        XCTAssertNotEqual(FloorName.key("Level 2"), FloorName.key("2nd Floor"))
        XCTAssertTrue(FloorName.isDefaultSheetName("Sheet 3"))
        XCTAssertTrue(FloorName.isDefaultSheetName("IMG_4031"))
        XCTAssertTrue(FloorName.isDefaultSheetName("plans-rev2", fileBase: "plans-rev2"))
        XCTAssertFalse(FloorName.isDefaultSheetName("1st Fl"))
        XCTAssertEqual(FloorName.propose(floor: "First Floor", title: "FIRST FLOOR POWER PLAN", number: "E-101", current: "Sheet 1"), "First Floor")
        XCTAssertEqual(FloorName.propose(floor: nil, title: "ELECTRICAL RISER DIAGRAM", number: "E-501", current: "Sheet 2"), "Electrical Riser Diagram")
        XCTAssertEqual(FloorName.propose(floor: nil, number: "E-001", current: "Sheet 3"), "E-001")
        XCTAssertEqual(FloorName.propose(floor: nil, current: "Sheet 4"), "Sheet 4")
    }
}

/// Deleting a plan (sheet pill, plans screen): a soft delete; its devices stay stored but the takeoff drops them,
/// and putting the sheet back (Undo) counts them again. Same as tests/sheetDelete.test.ts.
final class SheetDeleteTakeoffTests: XCTestCase {
    func testDeletedSheetsDevicesDontCount() {
        var b = ProjectBundle(project: Project(id: "p", clientName: "", address: ""))
        b.sheets = [Sheet(id: "s1", projectId: "p", name: "Attic", pageNumber: 1, order: 0, imageId: "i1", width: 10, height: 10),
                    Sheet(id: "s2", projectId: "p", name: "1st Fl", pageNumber: 2, order: 1, imageId: "i2", width: 10, height: 10)]
        b.markers = [Marker(id: "m1", projectId: "p", sheetId: "s1", deviceTypeId: "cam", x: 0, y: 0, label: "a"),
                     Marker(id: "m2", projectId: "p", sheetId: "s2", deviceTypeId: "cam", x: 0, y: 0, label: "b"),
                     Marker(id: "m3", projectId: "p", sheetId: "s2", deviceTypeId: "cam", x: 0, y: 0, label: "c")]
        XCTAssertEqual(TakeoffCalculator.compute(b).total.counts["cam"], 3)
        let before = b
        b.sheets[1].deleted = true
        let t = TakeoffCalculator.compute(b)
        XCTAssertEqual(t.floors.map(\.name), ["Attic"])
        XCTAssertEqual(t.total.counts["cam"], 1)
        XCTAssertEqual(b.liveMarkers.count, 3, "devices stay stored")
        XCTAssertEqual(TakeoffCalculator.compute(before).total.counts["cam"], 3)
    }
}
