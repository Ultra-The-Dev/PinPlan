import XCTest
@testable import PinPlanCore

final class ProposalTests: XCTestCase {
    func testSnapshotMatchesTheWebFormat() throws {
        var catalog = Catalog.seed()
        for i in catalog.indices where catalog[i].id == "wap" { catalog[i].unitPrice = 300 }
        for i in catalog.indices where catalog[i].id == "speaker" { catalog[i].unitPrice = 150 }
        var b = ProjectBundle(project: Project(id: "p", clientName: "Jane Client", address: "12 Maple Ridge Rd", clientEmail: "jane@example.com"))
        b.sheets = [Sheet(id: "s1", projectId: "p", name: "1st Fl", pageNumber: 1, order: 0, imageId: "i", width: 100, height: 100)]
        b.markers = [Marker(projectId: "p", sheetId: "s1", deviceTypeId: "wap", x: 0.5, y: 0.5, label: "W1"),
                     Marker(projectId: "p", sheetId: "s1", deviceTypeId: "wap", x: 0.4, y: 0.5, label: "W2"),
                     Marker(projectId: "p", sheetId: "s1", deviceTypeId: "speaker", x: 0.3, y: 0.5, label: "S1", tentative: true)]
        var pricing = Catalog.defaultPricing
        pricing.taxPct = 10
        let t = TakeoffCalculator.compute(b)
        let est = EstimateBuilder.build(takeoff: t, catalog: catalog, pricing: pricing)
        let s = Proposals.snapshot(bundle: b, catalog: catalog, takeoff: t, estimate: est, business: BusinessSettings(), currency: "USD", taxPct: 10,
                                   validDays: 30, detail: .lines, depositPct: 50, images: ["s1": "https://x/s1.jpg"], now: Date(timeIntervalSince1970: 1_794_744_000))
        XCTAssertEqual(s.validUntil, "2026-12-15")
        XCTAssertEqual(s.floors.first?.image, "https://x/s1.jpg")
        XCTAssertTrue(s.floors[0].items.contains(.init(name: "In-ceiling speaker", count: "1 optional")))
        XCTAssertEqual(s.lines.first { $0.optional }?.description, "In-ceiling speaker — installed")
        let opt = s.lines.first { $0.optional }!.key
        XCTAssertEqual(Proposals.totals(s, chosen: []).total, 660)
        XCTAssertEqual(Proposals.totals(s, chosen: [opt]).total, 825)
        XCTAssertEqual(Proposals.totals(s, chosen: []).deposit, 330)
        // Encodes with the web app's keys.
        let json = try JSONSerialization.jsonObject(with: JSONEncoder().encode(s)) as! [String: Any]
        XCTAssertEqual(json["detail"] as? String, "lines")
        XCTAssertNotNil((json["lines"] as? [[String: Any]])?.first?["unitPrice"])
        XCTAssertEqual(Proposals.url(base: "pinplan.vercel.app/", token: "abc"), "https://pinplan.vercel.app/p?t=abc")
        XCTAssertGreaterThanOrEqual(Proposals.newToken().count, 22)
    }
}
