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

final class BrandTests: XCTestCase {
    func testBlankBusinessFieldsTakeTheFounderDefaultsOnlyForTheFounder() throws {
        var b = BusinessSettings()
        b.phone = "(212) 555-0100"
        let full = b.withDefaults(founder: true)
        XCTAssertEqual(full.name, "Smart Living Solutions")
        XCTAssertEqual(full.phone, "(212) 555-0100")
        XCTAssertEqual(full.accentColor, "#13e57c")
        // A new customer gets neutral defaults: nobody else's name, contact details or logo.
        let neutral = b.withDefaults(founder: false)
        XCTAssertEqual(neutral.name, "")
        XCTAssertEqual(neutral.email, "")
        XCTAssertEqual(neutral.website, "")
        XCTAssertNil(neutral.logo)
        XCTAssertNil(neutral.tagline)
        XCTAssertNil(neutral.serviceArea)
        XCTAssertEqual(neutral.phone, "(212) 555-0100")
        XCTAssertEqual(neutral.brandColor, "#c2410c")
        XCTAssertEqual(neutral.accentColor, "#f59e0b")
        XCTAssertFalse(neutral.estimateTerms.isEmpty)
        XCTAssertEqual(BusinessSettings.defaults(founder: false), BusinessSettings.neutral)
        XCTAssertEqual(BusinessSettings.defaults(founder: true), BusinessSettings.founder)
        // Older settings files without the brand fields still load.
        let old = try JSONDecoder().decode(BusinessSettings.self, from: Data(#"{"name":"","address":"","phone":"","email":"","website":"","estimateTerms":"x"}"#.utf8))
        XCTAssertNil(old.logo)
        XCTAssertEqual(Proposals.absolute("/brand/l.png", origin: "pinplan.vercel.app/"), "https://pinplan.vercel.app/brand/l.png")
        // No marker: settings from before this update keep the founder defaults.
        XCTAssertNil(old.brandDefaults)
        XCTAssertEqual(old.resolved(plan: nil).name, "Smart Living Solutions")
    }

    func testWhichDefaultsApply() throws {
        let neutral = BusinessSettings.neutralMarker
        // Fresh install: neutral, unless the team is the founder's (comped).
        XCTAssertFalse(BusinessSettings.usesFounderDefaults(marker: neutral, plan: nil))
        XCTAssertFalse(BusinessSettings.usesFounderDefaults(marker: neutral, plan: .trialing))
        XCTAssertFalse(BusinessSettings.usesFounderDefaults(marker: neutral, plan: .active))
        XCTAssertTrue(BusinessSettings.usesFounderDefaults(marker: neutral, plan: .comped))
        // Existing install (no marker): unchanged behaviour.
        XCTAssertTrue(BusinessSettings.usesFounderDefaults(marker: nil, plan: nil))
        XCTAssertTrue(BusinessSettings.usesFounderDefaults(marker: nil, plan: .active))

        var fresh = BusinessSettings()
        fresh.brandDefaults = neutral
        XCTAssertEqual(fresh.resolved(plan: .trialing).name, "")
        XCTAssertEqual(fresh.resolved(plan: .comped).name, "Smart Living Solutions")
        // The customer's own values always win.
        fresh.name = "Acme AV"
        fresh.brandColor = "#112233"
        XCTAssertEqual(fresh.resolved(plan: .comped).name, "Acme AV")
        XCTAssertEqual(fresh.resolved(plan: .comped).brandColor, "#112233")
        // The marker is saved with the settings.
        let back = try JSONDecoder().decode(BusinessSettings.self, from: JSONEncoder().encode(fresh))
        XCTAssertEqual(back.brandDefaults, neutral)

        // A proposal from a new customer's device carries no founder details.
        var b = ProjectBundle(project: Project(id: "p", clientName: "Jane", address: "1 Main St"))
        b.sheets = [Sheet(id: "s1", projectId: "p", name: "1st Fl", pageNumber: 1, order: 0, imageId: "i", width: 100, height: 100)]
        let catalog = Catalog.seed()
        let takeoff = TakeoffCalculator.compute(b)
        let est = EstimateBuilder.build(takeoff: takeoff, catalog: catalog, pricing: Catalog.defaultPricing, overrides: [])
        var mine = BusinessSettings()
        mine.brandDefaults = neutral
        let snap = Proposals.snapshot(bundle: b, catalog: catalog, takeoff: takeoff, estimate: est, business: mine.resolved(plan: .trialing),
                                      currency: "USD", taxPct: 0, validDays: 30, detail: .lines, depositPct: nil, origin: "pinplan.example.com")
        let json = String(decoding: try JSONEncoder().encode(snap), as: UTF8.self)
        for leak in ["Smart Living", "smartliving", "290-1922", "smart-living-logo", "0a1b54"] {
            XCTAssertFalse(json.contains(leak), leak)
        }
    }
}

final class QuickChargeTests: XCTestCase {
    func testPerDeviceChargesCountThePlan() {
        var b = ProjectBundle(project: Project(id: "p", clientName: "", address: ""))
        b.sheets = [Sheet(id: "s1", projectId: "p", name: "1st Fl", pageNumber: 1, order: 0, imageId: "i", width: 100, height: 100)]
        b.markers = ["cam-indoor", "cam-indoor", "cam-outdoor"].map { Marker(projectId: "p", sheetId: "s1", deviceTypeId: $0, x: 0.5, y: 0.5, label: "") }
        b.markers.append(Marker(projectId: "p", sheetId: "s1", deviceTypeId: "cam-outdoor", x: 0.5, y: 0.5, label: "", tentative: true))
        let key = QuickCharges.key(for: QuickCharges.defaults[0], id: "abc")
        XCTAssertEqual(key, "custom:abc@cam-indoor+cam-outdoor")
        b.upsertEstimateLine(key: key) { $0.description = "Prewire"; $0.unitPrice = 180 }
        let line = EstimateBuilder.build(takeoff: TakeoffCalculator.compute(b), catalog: Catalog.seed(), pricing: Catalog.defaultPricing, overrides: b.estimateLines)
            .lines.first { $0.key == key }!
        XCTAssertEqual(line.qty, 3)
        XCTAssertEqual(line.total, 540)
    }

    func testPlanReviewHasLegendAndNoPrices() throws {
        let catalog = Catalog.seed()
        var b = ProjectBundle(project: Project(id: "p", clientName: "Jane Client", address: "12 Maple Ridge Rd"))
        b.sheets = [Sheet(id: "s1", projectId: "p", name: "1st Fl", pageNumber: 1, order: 0, imageId: "i", width: 100, height: 100)]
        b.markers = [Marker(projectId: "p", sheetId: "s1", deviceTypeId: "wap", x: 0.5, y: 0.5, label: "W1"),
                     Marker(projectId: "p", sheetId: "s1", deviceTypeId: "wap", x: 0.4, y: 0.5, label: "W2"),
                     Marker(projectId: "p", sheetId: "s1", deviceTypeId: "speaker", x: 0.3, y: 0.5, label: "S1", tentative: true),
                     Marker(projectId: "p", sheetId: "s1", deviceTypeId: "cam-outdoor", x: 0.2, y: 0.5, label: "C1")]
        let t = TakeoffCalculator.compute(b)
        let legend = Legend.build(takeoff: t, catalog: catalog) { "icon:\($0.id)" }
        XCTAssertEqual(legend.map(\.key), ["cam-outdoor", "wap", "speaker"])
        XCTAssertEqual(legend[1].count, "2")
        XCTAssertEqual(legend[1].icon, "icon:wap")
        XCTAssertEqual(legend[2].count, "1 optional")
        let est = EstimateBuilder.build(takeoff: t, catalog: catalog, pricing: Catalog.defaultPricing)
        let s = Proposals.snapshot(bundle: b, catalog: catalog, takeoff: t, estimate: est, business: BusinessSettings(), currency: "USD", taxPct: 10,
                                   validDays: 30, detail: .lines, depositPct: 50, review: true, legend: legend)
        XCTAssertTrue(s.isReview)
        XCTAssertEqual(s.title, "Preliminary plan — 12 Maple Ridge Rd")
        XCTAssertTrue(s.lines.isEmpty)
        XCTAssertNil(s.validUntil)
        XCTAssertNil(s.depositPct)
        let json = try JSONSerialization.jsonObject(with: JSONEncoder().encode(s)) as! [String: Any]
        XCTAssertEqual(json["kind"] as? String, "review")
        XCTAssertEqual((json["legend"] as? [[String: Any]])?.count, 3)
        // A priced proposal has no kind key, like the web.
        let p = Proposals.snapshot(bundle: b, catalog: catalog, takeoff: t, estimate: est, business: BusinessSettings(), currency: "USD", taxPct: 10, validDays: 30, detail: .lines, depositPct: 50)
        XCTAssertNil((try JSONSerialization.jsonObject(with: JSONEncoder().encode(p)) as! [String: Any])["kind"])
    }

    func testClientNotePinsParseLikeTheWeb() {
        // Written by packClientNote on the web client page.
        let note = "General: darker speaker grilles\n\nPinned on the plan:\n1st Fl, east wing, pin 1 at (42%, 31%): move TV: other wall\n2nd Fl, pin 2 at (7%, 90%):"
        let r = Proposals.parseClientNote(note)
        XCTAssertEqual(r.text, "General: darker speaker grilles")
        XCTAssertEqual(r.pins, [
            Proposals.ClientPin(n: 1, floor: "1st Fl, east wing", x: 0.42, y: 0.31, note: "move TV: other wall"),
            Proposals.ClientPin(n: 2, floor: "2nd Fl", x: 0.07, y: 0.9, note: ""),
        ])
        let plain = Proposals.parseClientNote("Please move the TV.\nThanks!")
        XCTAssertEqual(plain.text, "Please move the TV.\nThanks!")
        XCTAssertTrue(plain.pins.isEmpty)
        XCTAssertEqual(Proposals.parseClientNote(nil).text, "")
    }
}
