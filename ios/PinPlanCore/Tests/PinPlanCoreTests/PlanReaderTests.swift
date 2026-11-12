import XCTest
@testable import PinPlanCore

final class PlanReaderTests: XCTestCase {
    func testParsesFeetInchDimensions() {
        let d = PlanReader.dimensions(in: "14'-6\" x 12'-0\"  and 3'-4 1/2\" plus 10'")
        XCTAssertEqual(d.map(\.1).map { ($0 * 1000).rounded() / 1000 }, [14.5, 12, 3.375, 10])
        XCTAssertTrue(PlanReader.dimensions(in: "SCALE 1/4\" = 1'-0\"").isEmpty == false) // raw parser sees 1'-0"; classify() routes it to scale
        XCTAssertTrue(PlanReader.dimensions(in: "LED 24 LF").isEmpty)
    }

    func testClassifiesSheetText() {
        let items = [
            PlanTextItem(text: "KITCHEN", x: 0.4, y: 0.3),
            PlanTextItem(text: "PRIMARY BEDROOM 16'-0\" x 14'-6\"", x: 0.2, y: 0.6),
            PlanTextItem(text: "S21,22,23  24 LF", x: 0.45, y: 0.1),
            PlanTextItem(text: "SCALE: 1/8\" = 1'-0\"", x: 0.9, y: 0.95),
            PlanTextItem(text: "Cabinet LED under uppers — driver in pantry, 24V", x: 0.5, y: 0.45),
            PlanTextItem(text: "12'-6\"", x: 0.3, y: 0.05),
            PlanTextItem(text: "A", x: 0, y: 0),
        ]
        let d = PlanReader.classify(items)
        XCTAssertEqual(d.filter { $0.kind == .room }.map(\.text), ["Kitchen", "Primary Bedroom · 16'-0\" × 14'-6\""])
        XCTAssertEqual(d.filter { $0.kind == .callout }.count, 1)
        XCTAssertEqual(d.filter { $0.kind == .scale }.map(\.text), ["1/8\" = 1'-0\""])
        XCTAssertEqual(d.filter { $0.kind == .note }.count, 1)
        XCTAssertEqual(d.filter { $0.kind == .dimension }.compactMap(\.feet), [12.5])
    }

    func testScaleError() {
        XCTAssertEqual(PlanReader.scaleError(printedFeet: 12.5, measuredFeet: 12.75)!, 0.02, accuracy: 1e-9)
        XCTAssertNil(PlanReader.scaleError(printedFeet: 12.5, measuredFeet: nil))
    }
}

final class WrappedLineTests: XCTestCase {
    func seg(_ t: String, _ x: Double, _ y: Double, w: Double = 200, h: Double = 10) -> TextSegment {
        TextSegment(text: t, minX: x, minY: y, maxX: x + w, maxY: y + h)
    }

    func testJoinsWrappedTitleBlockLine() {
        let out = PlanReader.joinWrappedLines([
            seg("PINPLAN DEMO", 100, 100, w: 80), seg("LED BACKLIT STRIPS (AMBIENT", 100, 112), seg("LIGHT)", 100, 124, w: 40),
        ])
        XCTAssertEqual(out.map(\.text), ["PINPLAN DEMO", "LED BACKLIT STRIPS (AMBIENT LIGHT)"])
    }

    func testJoinsThreeLineNote() {
        let out = PlanReader.joinWrappedLines([
            seg("Provide blocking for all TV mounts and", 0, 0), seg("speaker brackets before drywall; coordinate", 0, 12),
            seg("with GC.", 0, 24, w: 50),
        ])
        XCTAssertEqual(out.count, 1)
        XCTAssertTrue(out[0].text.hasSuffix("coordinate with GC."))
    }

    func testKeepsStackedRoomLabelsSeparate() {
        let out = PlanReader.joinWrappedLines([seg("BEDROOM 2", 0, 0, w: 60), seg("12'-0\" x 14'-6\"", 0, 12, w: 70)])
        XCTAssertEqual(out.count, 2)
    }

    func testKeepsDistantOrDifferentSizeLinesSeparate() {
        let out = PlanReader.joinWrappedLines([
            seg("GENERAL NOTES FOR LOW VOLTAGE WORK", 0, 0, h: 20), seg("All cable home-runs to the AV rack", 0, 22),
            seg("Separate note elsewhere on the page", 0, 200),
        ])
        XCTAssertEqual(out.count, 3)
    }
}

final class RoomSizeTests: XCTestCase {
    func testAttachesSizeFromLineBelow() {
        let d = PlanReader.classify([
            PlanTextItem(text: "GREAT ROOM", x: 0.30, y: 0.40),
            PlanTextItem(text: "18'-6\" x 22'-0\"", x: 0.30, y: 0.42),
            PlanTextItem(text: "MUD ROOM", x: 0.70, y: 0.40),
        ])
        let rooms = d.filter { $0.kind == .room }.map(\.text)
        XCTAssertEqual(rooms, ["Great Room · 18'-6\" × 22'-0\"", "Mud Room"])
        // The size line still lists as dimensions.
        XCTAssertEqual(d.filter { $0.kind == .dimension }.count, 2)
    }

    func testDoesNotStealFarAwaySize() {
        let d = PlanReader.classify([
            PlanTextItem(text: "OFFICE", x: 0.2, y: 0.2),
            PlanTextItem(text: "12'-0\" x 10'-0\"", x: 0.6, y: 0.21),
        ])
        XCTAssertEqual(d.first { $0.kind == .room }?.text, "Office")
    }
}

final class FloorNameTests: XCTestCase {
    func testTitleBeatsMentionInNotes() {
        let text = """
        GENERAL NOTES
        1. ALL LOW VOLTAGE CABLING TO HOME RUN TO THE AV RACK. PROVIDE 2" CONDUIT FROM RACK TO ATTIC.
        SAMPLE RESIDENCE
        FIRST FLOOR PLAN
        SCALE: 1/4" = 1'-0"
        """
        XCTAssertEqual(PlanReader.floorName(in: text), "1st Fl")
    }

    func testStandaloneLabel() {
        XCTAssertEqual(PlanReader.floorName(in: "LIVING\nKITCHEN\nPINPLAN DEMO\nATTIC\nSCALE: 1/8\" = 1'-0\""), "Attic")
        XCTAssertEqual(PlanReader.floorName(in: "CELLAR"), "Cellar")
        XCTAssertEqual(PlanReader.floorName(in: "2nd Fl"), "2nd Fl")
    }

    func testOtherNamesAndNone() {
        XCTAssertEqual(PlanReader.floorName(in: "A-102\nMAIN LEVEL PLAN"), "1st Fl")
        XCTAssertEqual(PlanReader.floorName(in: "BASEMENT PLAN"), "Basement")
        XCTAssertNil(PlanReader.floorName(in: "ELECTRICAL LEGEND"))
    }
}

/// Modeled on a real Revit sheet (room tags on the plan + a room schedule table).
final class RoomScheduleTests: XCTestCase {
    func row(_ y: Double, _ cells: [String]) -> [PlanTextItem] {
        cells.enumerated().map { PlanTextItem(text: $1, x: 0.52 + Double($0) * 0.03, y: y) }
    }

    func testScheduleAreasAttachToPlanRoomsAndScheduleIsNotDuplicated() {
        var items = [
            PlanTextItem(text: "GUEST RM #2", x: 0.63, y: 0.44), PlanTextItem(text: "107", x: 0.63, y: 0.45),
            PlanTextItem(text: "UTILITY", x: 0.49, y: 0.43), PlanTextItem(text: "1/2 BATH", x: 0.42, y: 0.51),
            PlanTextItem(text: "3' - 5\"", x: 0.60, y: 0.37),
        ]
        items += row(0.21, ["107", "GUEST RM #2", "106 SF", "41' - 6\"", "WHITE", "FLAT WHITE", "8' - 0\"", "POLISHED CONCRETE"])
        items += row(0.215, ["110", "UTILITY", "110 SF", "50' - 4\"", "WHITE", "FLAT WHITE", "8' - 0\""])
        items += row(0.22, ["104", "MASTER BED", "118 SF", "43' - 6\"", "WHITE", "FLAT WHITE", "8' - 0\""])
        let d = PlanReader.classify(items)
        let rooms = d.filter { $0.kind == .room }.map(\.text)
        XCTAssertTrue(rooms.contains("Guest Rm #2 · 106 SF"), "\(rooms)")
        XCTAssertTrue(rooms.contains("Utility · 110 SF"), "\(rooms)")
        XCTAssertTrue(rooms.contains("1/2 Bath"), "\(rooms)")
        XCTAssertTrue(rooms.contains("Master Bed · 118 SF (schedule)"), "\(rooms)")
        XCTAssertEqual(rooms.count, 4, "\(rooms)")
        // Perimeters and ceiling heights from the table are not plan dimensions.
        XCTAssertEqual(d.filter { $0.kind == .dimension }.map(\.text), ["3' - 5\""])
    }

    func testDimensionStringRowIsNotASchedule() {
        let items = (0..<8).map { PlanTextItem(text: "2'-\($0)\"", x: 0.2 + Double($0) * 0.05, y: 0.1) }
        XCTAssertEqual(PlanReader.classify(items).filter { $0.kind == .dimension }.count, 8)
    }
}
