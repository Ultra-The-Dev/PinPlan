import XCTest
@testable import PinPlanCore

final class AppUpdateLogicTests: XCTestCase {
    func testOffer() {
        XCTAssertEqual(AppUpdateLogic.offer(current: 10, latest: 12, dismissed: 0, eligible: true), 12)
        XCTAssertNil(AppUpdateLogic.offer(current: 12, latest: 12, dismissed: 0, eligible: true))
        XCTAssertNil(AppUpdateLogic.offer(current: 13, latest: 12, dismissed: 0, eligible: true))
        XCTAssertNil(AppUpdateLogic.offer(current: 10, latest: nil, dismissed: 0, eligible: true))
        XCTAssertNil(AppUpdateLogic.offer(current: 10, latest: 12, dismissed: 12, eligible: true))
        XCTAssertEqual(AppUpdateLogic.offer(current: 10, latest: 13, dismissed: 12, eligible: true), 13)
        XCTAssertNil(AppUpdateLogic.offer(current: 10, latest: 12, dismissed: 0, eligible: false))
    }

    func testShouldCheck() {
        let now = Date(timeIntervalSince1970: 1_000_000)
        XCTAssertTrue(AppUpdateLogic.shouldCheck(last: nil, now: now))
        XCTAssertFalse(AppUpdateLogic.shouldCheck(last: now.addingTimeInterval(-3600), now: now))
        XCTAssertTrue(AppUpdateLogic.shouldCheck(last: now.addingTimeInterval(-7 * 3600), now: now))
        XCTAssertTrue(AppUpdateLogic.shouldCheck(last: now.addingTimeInterval(3600), now: now))
    }

    func testParse() {
        XCTAssertEqual(AppUpdateLogic.parse(Data(#"{"build":42}"#.utf8)), 42)
        XCTAssertNil(AppUpdateLogic.parse(Data(#"{"build":null}"#.utf8)))
        XCTAssertNil(AppUpdateLogic.parse(Data(#"{"build":0}"#.utf8)))
        XCTAssertNil(AppUpdateLogic.parse(Data("nope".utf8)))
    }
}
