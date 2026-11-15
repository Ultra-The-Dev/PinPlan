import XCTest
@testable import PinPlanCore

final class DeviceIconTests: XCTestCase {
    func testStartingTypesHavePictogramsAndCustomTypesUseLetters() {
        for d in Catalog.seed() { XCTAssertNil(DeviceIcons.key(for: d), d.id) }
        var t = Catalog.seed().first { $0.id == "wap" }!
        t.icon = "wifi"
        XCTAssertEqual(DeviceIcons.key(for: t), "wifi")
        t.icon = "letters"
        XCTAssertNil(DeviceIcons.key(for: t))
        t.id = "custom"; t.icon = nil
        XCTAssertNil(DeviceIcons.key(for: t))
        t.icon = "doorbell"
        XCTAssertEqual(DeviceIcons.key(for: t), "doorbell")
    }

    func testIconSurvivesJSON() throws {
        var t = Catalog.seed()[0]
        t.icon = "lock"
        let back = try JSONDecoder().decode(DeviceType.self, from: JSONEncoder().encode(t))
        XCTAssertEqual(back.icon, "lock")
    }
}
