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
