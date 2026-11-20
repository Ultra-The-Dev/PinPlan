import XCTest
@testable import PinPlanCore

/// Job documents upload with a type the plans bucket takes (anything else as application/octet-stream).
final class StorageTypesTests: XCTestCase {
    func testUploadType() {
        XCTAssertEqual(StorageTypes.plansUploadType("image/jpeg"), "image/jpeg")
        XCTAssertEqual(StorageTypes.plansUploadType("Application/PDF"), "application/pdf")
        XCTAssertEqual(StorageTypes.plansUploadType("application/vnd.ms-excel.sheet.macroEnabled.12"), "application/vnd.ms-excel.sheet.macroenabled.12")
        XCTAssertEqual(StorageTypes.plansUploadType("image/svg+xml"), "application/octet-stream")
        XCTAssertEqual(StorageTypes.plansUploadType("text/html; charset=utf-8"), "application/octet-stream")
        XCTAssertEqual(StorageTypes.plansUploadType(""), "application/octet-stream")
        XCTAssertEqual(StorageTypes.plansUploadType(nil), "application/octet-stream")
    }

    func testNoBrowserRunnableTypes() {
        for t in StorageTypes.plansBucketTypes {
            XCTAssertNil(t.range(of: "svg|html|[/+]xml$|javascript", options: [.regularExpression, .caseInsensitive]), t)
        }
    }
}
