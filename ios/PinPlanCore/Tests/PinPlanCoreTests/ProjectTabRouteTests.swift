import XCTest
@testable import PinPlanCore

final class ProjectTabRouteTests: XCTestCase {
    private func r(_ id: String) -> String? {
        guard let x = ProjectTabRoute.resolve(id) else { return nil }
        return x.page.map { "\(x.section.rawValue)/\($0)" } ?? x.section.rawValue
    }

    func testSectionIdsOpenThemselves() {
        for s in ProjectTabRoute.Section.allCases { XCTAssertEqual(r(s.rawValue), s.rawValue) }
    }

    func testWebAndOlderIds() {
        XCTAssertEqual(r("info"), "overview")
        XCTAssertEqual(r("job"), "overview")
        XCTAssertEqual(r("sheets"), "plan/managePlans")
        XCTAssertEqual(r("crew"), "takeoff/wiring")
        XCTAssertEqual(r("wiring"), "takeoff/wiring")
        XCTAssertEqual(r("estimate"), "money")
        XCTAssertEqual(r("billing"), "money")
        XCTAssertEqual(r("pricing"), "money")
        XCTAssertEqual(r("photos"), "field/photos")
        XCTAssertNil(r("nope"))
        XCTAssertNil(r(""))
        XCTAssertNil(r("Plan"), "ids are lower case")
    }

    /// Every web tab id a next step can point at (JobTab in src/lib/jobSummary.ts) leads somewhere.
    func testEveryNextStepTabResolves() {
        for tab in ["plan", "sheets", "photos", "field", "takeoff", "estimate", "crew", "info"] {
            XCTAssertNotNil(ProjectTabRoute.resolve(tab), tab)
        }
    }
}
