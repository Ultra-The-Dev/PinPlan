import XCTest
@testable import PinPlanCore

/// The same fixture as the web app's tests/estimateParity.test.ts: both apps must price it to the same cents.
final class EstimateParityTests: XCTestCase {
    func testMoneyRoundsHalfAwayFromZeroWithoutFloatSlips() {
        XCTAssertEqual(Money.round(1.005), 1.01)
        XCTAssertEqual(Money.round(-1.005), -1.01)
        XCTAssertEqual(Money.round(0.735), 0.74)
        XCTAssertEqual(Money.round(-0.025), -0.03)
        XCTAssertEqual(Money.round(2.675), 2.68)
        XCTAssertEqual(Money.round(1.004999), 1)
        XCTAssertEqual(Money.round(-0.001).sign, .plus, "no negative zero")
        XCTAssertEqual(Money.round(.nan), 0)
        XCTAssertEqual(Money.deposit(subtotal: 1234.5, pct: 30), 370.35)
    }

    func line(_ id: String, _ key: String, description: String?, unit: String? = nil, price: Double, qty: Double, sort: Double) -> EstimateLine {
        var l = EstimateLine(id: id, projectId: "p", key: key)
        l.description = description; l.unit = unit; l.unitPrice = price; l.qty = qty; l.sort = sort
        return l
    }

    func fixture() -> Estimate {
        var pricing = Catalog.defaultPricing
        pricing.markupPct = 12.5; pricing.taxPct = 8.875; pricing.laborMode = .separate; pricing.includeTentative = false
        pricing.wirePrices = ["Cat6": 0.335]
        let ax = Product(id: "p-ax", deviceTypeId: "cam-indoor", brand: "axis", model: "M3086", unitPrice: 199.99, laborPrice: 85.005)
        let ub = Product(id: "p-ub", deviceTypeId: "cam-indoor", brand: "Ubiquiti", model: "G5", unitPrice: 129.5, laborPrice: 0)
        var total = TakeoffBucket()
        total.counts = ["cam-indoor": 3, "wap": 2]
        total.tentative = ["cam-indoor": 1]
        total.wireFt = ["Cat6": 123.4]
        total.wireRuns = ["Cat6": 5]
        let overrides = [
            line("o3", "custom:blank", description: "", unit: "", price: 10, qty: 2, sort: 3),
            line("o2", "custom:disc", description: "Discount", price: -12.345, qty: 1, sort: 2),
            line("o1", "custom:trip", description: "Trip", price: 1.005, qty: 1, sort: 1),
        ]
        return EstimateBuilder.build(takeoff: Takeoff(floors: [], total: total), catalog: Catalog.seed(), pricing: pricing, overrides: overrides,
                                     products: [ub, ax], split: ["cam-indoor": ["p-ub": (confirmed: 1, tentative: 0), "p-ax": (confirmed: 1, tentative: 1)]])
    }

    func testSameLinesAndTotalsAsTheWebApp() {
        let e = fixture()
        func row(_ key: String) -> ComputedLine? { e.lines.first { $0.key == key } }
        XCTAssertEqual(e.lines.filter { $0.group == .devices }.map(\.key), ["prod:p-ax", "optprod:p-ax", "prod:p-ub", "dev:wap"], "axis before Ubiquiti")
        XCTAssertEqual(row("prod:p-ax")?.unitPrice, 224.99)
        XCTAssertEqual(row("prod:p-ub")?.unitPrice, 145.69)
        XCTAssertEqual(row("labor:prod:p-ax")?.unitPrice, 85.01)
        XCTAssertEqual(row("optlabor:prod:p-ax")?.included, false)
        XCTAssertEqual(row("wire:Cat6")?.unitPrice, 0.38)
        XCTAssertEqual(row("wire:Cat6")?.total, 46.89)
        XCTAssertEqual(row("custom:trip")?.total, 1.01)
        XCTAssertEqual(row("custom:disc")?.total, -12.35)
        XCTAssertEqual(row("custom:blank")?.description, "Custom item")
        XCTAssertEqual(row("custom:blank")?.unit, "each")
        XCTAssertEqual(e.lines.filter { $0.group == .custom }.map(\.key), ["custom:trip", "custom:disc", "custom:blank"])
        XCTAssertEqual(e.subtotal, 511.24)
        XCTAssertEqual(e.tax, 45.37)
        XCTAssertEqual(e.total, 556.61)
        XCTAssertEqual(e.optionalTotal, 310)
    }

    func testChargesFromBothAppsInterleaveByTime() {
        XCTAssertEqual(Money.chargeOrder(1_763_000_000), 1_763_000_000_000)
        XCTAssertEqual(Money.chargeOrder(1_763_000_100_000), 1_763_000_100_000)
        XCTAssertEqual(Money.chargeOrder(nil), 0)
        let overrides = [
            line("a", "custom:ipad-late", description: "iPad later", price: 1, qty: 1, sort: 1_763_000_200),
            line("b", "custom:web", description: "Web", price: 1, qty: 1, sort: 1_763_000_100_000),
            line("c", "custom:ipad-early", description: "iPad earlier", price: 1, qty: 1, sort: 1_763_000_000),
        ]
        let e = EstimateBuilder.build(takeoff: Takeoff(floors: [], total: TakeoffBucket()), catalog: Catalog.seed(), pricing: Catalog.defaultPricing, overrides: overrides)
        XCTAssertEqual(e.lines.filter { $0.group == .custom }.map(\.key), ["custom:ipad-early", "custom:web", "custom:ipad-late"])
    }

    /// Same cases as the web's tests/estimateOverrides.test.ts: two rows for one key (older builds gave every override a
    /// random id) → the newest by updatedAt wins wherever it sits, a charge is listed once, deleted rows never count.
    func testNewestOverrideRowPerKeyWins() {
        func row(_ id: String, _ key: String, _ at: String, price: Double? = nil, qty: Double? = nil, desc: String? = nil, sort: Double? = nil, deleted: Bool? = nil) -> EstimateLine {
            var l = EstimateLine(id: id, projectId: "p", key: key)
            l.updatedAt = at; l.unitPrice = price; l.qty = qty; l.description = desc; l.sort = sort; l.deleted = deleted
            return l
        }
        var total = TakeoffBucket()
        total.counts = ["wap": 2]
        let t = Takeoff(floors: [], total: total)
        let newer = [row("a", "dev:wap", "2026-11-16T00:00:00.000Z", price: 99.99), row("c", "custom:trip", "2026-11-16T00:00:00Z", price: 45, qty: 1, desc: "Trip", sort: 1)]
        let older = [row("a-old", "dev:wap", "2026-11-15T00:00:00.000Z", price: 1), row("c-old", "custom:trip", "2026-11-15T00:00:00.000Z", price: 1000, qty: 1, desc: "Old trip", sort: 1)]
        for list in [older + newer, newer + older] {
            let e = EstimateBuilder.build(takeoff: t, catalog: Catalog.seed(), pricing: Catalog.defaultPricing, overrides: list)
            XCTAssertEqual(e.lines.first { $0.key == "dev:wap" }?.unitPrice, 99.99)
            XCTAssertEqual(e.lines.filter { $0.key == "custom:trip" }.map(\.total), [45])
        }
        let gone = [row("a", "dev:wap", "2026-11-16T00:00:00.000Z", price: 99.99), row("a2", "dev:wap", "2026-11-17T00:00:00.000Z", price: 5, deleted: true)]
        XCTAssertEqual(EstimateBuilder.latestOverrides(gone)["dev:wap"]?.id, "a")
        let tie = [row("y1", "k", "2026-11-16T00:00:00.000Z"), row("y2", "k", "2026-11-16T00:00:00.000Z")]
        XCTAssertEqual(EstimateBuilder.latestOverrides(tie)["k"]?.id, "y2")
        // A removed newest row hides the charge, even when an older row for it isn't removed.
        var removed = row("c2", "custom:trip", "2026-11-17T00:00:00.000Z", price: 45, qty: 1, desc: "Trip", sort: 1)
        removed.removed = true
        let e2 = EstimateBuilder.build(takeoff: t, catalog: Catalog.seed(), pricing: Catalog.defaultPricing, overrides: older + [removed])
        XCTAssertTrue(e2.lines.filter { $0.key == "custom:trip" }.isEmpty)
    }

    func testEditingAnOverrideEditsTheRowTheEstimateShows() {
        var b = ProjectBundle(project: Project(clientName: "C", address: "A"))
        var old = EstimateLine(id: "old", projectId: b.project.id, key: "dev:wap")
        old.updatedAt = "2026-11-15T00:00:00.000Z"; old.unitPrice = 1
        var new = EstimateLine(id: "new", projectId: b.project.id, key: "dev:wap")
        new.updatedAt = "2026-11-16T00:00:00.000Z"; new.unitPrice = 2
        b.estimateLines = [new, old]
        b.upsertEstimateLine(key: "dev:wap") { $0.unitPrice = 3 }
        XCTAssertEqual(EstimateBuilder.latestOverrides(b.estimateLines)["dev:wap"]?.unitPrice, 3)
        XCTAssertEqual(b.estimateLines.first { $0.id == "new" }?.unitPrice, 3)
        // A new override gets the id the web app gives it; after a reset, overriding again reuses that row.
        b.upsertEstimateLine(key: "opt:cam-indoor") { $0.include = true }
        XCTAssertEqual(b.estimateLines.filter { $0.key == "opt:cam-indoor" }.map(\.id), ["\(b.project.id):opt:cam-indoor"])
        b.resetEstimateLine(key: "opt:cam-indoor")
        b.upsertEstimateLine(key: "opt:cam-indoor") { $0.include = false }
        let rows = b.estimateLines.filter { $0.key == "opt:cam-indoor" }
        XCTAssertEqual(rows.count, 1)
        XCTAssertEqual(rows.first?.deleted, nil)
        XCTAssertEqual(rows.first?.include, false)
    }

    func testDeletedProductsStayOffTheMaterialList() {
        var b = ProjectBundle(project: Project(clientName: "C", address: "A"))
        var gone = Product(id: "c-old", deviceTypeId: "wire:Cat6", brand: "Old", model: "Cable", sku: "OLD", unitPrice: 0.5)
        gone.deleted = true
        b.setProductChoice(typeId: "wire:Cat6", productId: gone.id)
        let sheet = Sheet(projectId: b.project.id, name: "1st Fl", pageNumber: 1, order: 0, imageId: "img", width: 1000, height: 800)
        b.sheets = [sheet]
        b.runs = [Run(id: "r1", projectId: b.project.id, sheetId: sheet.id, kind: .wire, points: [0, 0, 1, 1], typedFt: 200, wireType: "Cat6")]
        let rows = Wiring.materialList(b, catalog: Catalog.seed(), products: [gone], includeTentative: true)
        let cat6 = rows.first { $0.item.contains("Cat6 cable") }
        XCTAssertNotNil(cat6)
        XCTAssertEqual(cat6?.sku, "")
        XCTAssertFalse(cat6?.item.contains("Old Cable") ?? true)
    }

    func testProductBehindALine() {
        var project = Project(clientName: "C", address: "A")
        project.productChoices = ["wire:Cat6": "c1", "wire:HDMI": "p1", "cam-indoor": "p1"]
        let cable = Product(id: "c1", deviceTypeId: "wire:Cat6", brand: "Belden", model: "2412", sku: "2412")
        let cam = Product(id: "p1", deviceTypeId: "cam-indoor", brand: "Ubiquiti", model: "G5", sku: " UVC-G5 ")
        var gone = Product(id: "p2", deviceTypeId: "cam-indoor", brand: "Old", model: "Cam", sku: "OLD")
        gone.deleted = true
        let products = [cable, cam, gone]
        XCTAssertEqual(ProductAssignment.lineProductId("prod:p1", project: project, products: products), "p1")
        XCTAssertEqual(ProductAssignment.lineProductId("optprod:p1", project: project, products: products), "p1")
        XCTAssertEqual(ProductAssignment.lineProductId("wire:Cat6", project: project, products: products), "c1")
        XCTAssertNil(ProductAssignment.lineProductId("wire:HDMI", project: project, products: products))
        XCTAssertNil(ProductAssignment.lineProductId("prod:p2", project: project, products: products))
        XCTAssertNil(ProductAssignment.lineProductId("labor:prod:p1", project: project, products: products))
        XCTAssertNil(ProductAssignment.lineProductId("dev:cam-indoor", project: project, products: products))
        XCTAssertEqual(ProductAssignment.lineSku("prod:p1", project: project, products: products), "UVC-G5")
    }

    func testDeletedProductsNeverPrice() {
        var b = ProjectBundle(project: Project(clientName: "C", address: "A"))
        let sheet = Sheet(projectId: b.project.id, name: "1st Fl", pageNumber: 1, order: 0, imageId: "img", width: 1000, height: 800)
        b.sheets = [sheet]
        let catalog = Catalog.seed()
        let cam = catalog.first { $0.id == "cam-indoor" }!
        _ = b.addMarker(type: cam, sheetId: sheet.id, x: 0.2, y: 0.5, room: "Living", tentative: false)
        var p = Product(deviceTypeId: "cam-indoor", brand: "Ubiquiti", model: "G5", unitPrice: 129)
        p.deleted = true
        b.setProductChoice(typeId: "cam-indoor", productId: p.id)
        let e = b.estimate(catalog: catalog, products: [p], pricing: Catalog.defaultPricing)
        XCTAssertNil(e.lines.first { $0.key == "prod:\(p.id)" })
        XCTAssertEqual(e.lines.first { $0.key == "dev:cam-indoor" }?.qty, 1)
    }

    func testDeletedFlagSurvivesDecoding() throws {
        let json = #"{"id":"x","deviceTypeId":"cam-indoor","brand":"B","model":"M","unitPrice":1,"laborPrice":0,"updatedAt":"2026-01-01T00:00:00Z","deleted":true}"#
        let p = try JSONDecoder().decode(Product.self, from: Data(json.utf8))
        XCTAssertEqual(p.deleted, true)
    }
}
