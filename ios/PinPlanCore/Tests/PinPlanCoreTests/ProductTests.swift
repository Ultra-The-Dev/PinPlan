import XCTest
@testable import PinPlanCore

final class ProductTests: XCTestCase {
    let catalog = Catalog.seed()
    var pricing: PricingSettings {
        var p = Catalog.defaultPricing
        p.laborMode = .combined; p.markupPct = 0; p.taxPct = 0; p.includeTentative = false
        return p
    }

    func job(cams: Int, tentativeCams: Int = 0) -> ProjectBundle {
        var b = ProjectBundle(project: Project(clientName: "C", address: "A"))
        let sheet = Sheet(projectId: b.project.id, name: "1st Fl", pageNumber: 1, order: 0, imageId: "img", width: 1000, height: 800)
        b.sheets = [sheet]
        let cam = catalog.first { $0.id == "cam-indoor" }!
        for i in 0..<(cams + tentativeCams) {
            _ = b.addMarker(type: cam, sheetId: sheet.id, x: 0.1 + Double(i) * 0.05, y: 0.5, room: "Living", tentative: i >= cams)
        }
        return b
    }

    func testJobProductPricesAllDevicesOfThatType() {
        var b = job(cams: 3, tentativeCams: 1)
        let p = Product(deviceTypeId: "cam-indoor", brand: "Ubiquiti", model: "G5 Turret", unitPrice: 129, laborPrice: 85)
        b.setProductChoice(typeId: "cam-indoor", productId: p.id)
        let e = b.estimate(catalog: catalog, products: [p], pricing: pricing)
        let line = e.lines.first { $0.key == "prod:\(p.id)" }
        XCTAssertEqual(line?.qty, 3)
        XCTAssertEqual(line?.unitPrice, 214)
        XCTAssertEqual(line?.description, "Ubiquiti G5 Turret — Indoor camera — installed")
        XCTAssertEqual(e.lines.first { $0.key == "optprod:\(p.id)" }?.qty, 1)
        XCTAssertNil(e.lines.first { $0.key == "dev:cam-indoor" }, "nothing left on the generic line")
        XCTAssertEqual(e.subtotal, 642)
    }

    func testSingleDeviceCanUseAnotherProduct() {
        var b = job(cams: 3)
        let a = Product(deviceTypeId: "cam-indoor", brand: "Ubiquiti", model: "G5 Turret", unitPrice: 100)
        let z = Product(deviceTypeId: "cam-indoor", brand: "Axis", model: "M3086-V", unitPrice: 300)
        b.setProductChoice(typeId: "cam-indoor", productId: a.id)
        b.markers[0].productId = z.id
        let e = b.estimate(catalog: catalog, products: [a, z], pricing: pricing)
        XCTAssertEqual(e.lines.first { $0.key == "prod:\(a.id)" }?.qty, 2)
        XCTAssertEqual(e.lines.first { $0.key == "prod:\(z.id)" }?.qty, 1)
        XCTAssertEqual(e.subtotal, 500)
    }

    func testDevicesWithoutAProductStayOnTheTypeLineAndWrongTypeProductsAreIgnored() {
        var b = job(cams: 2)
        let wrong = Product(deviceTypeId: "wap", brand: "Ubiquiti", model: "U7 Pro", unitPrice: 189)
        b.markers[0].productId = wrong.id
        let e = b.estimate(catalog: catalog, products: [wrong], pricing: pricing)
        XCTAssertEqual(e.lines.first { $0.key == "dev:cam-indoor" }?.qty, 2)
        XCTAssertNil(e.lines.first { $0.key.hasPrefix("prod:") })
    }

    func testSeparateLaborUsesTheProductsLabor() {
        var b = job(cams: 2)
        let p = Product(deviceTypeId: "cam-indoor", brand: "Ubiquiti", model: "G5 Turret", unitPrice: 100, laborPrice: 60)
        b.setProductChoice(typeId: "cam-indoor", productId: p.id)
        var pr = pricing; pr.laborMode = .separate
        let e = b.estimate(catalog: catalog, products: [p], pricing: pr)
        XCTAssertEqual(e.lines.first { $0.key == "labor:prod:\(p.id)" }?.total, 120)
        XCTAssertEqual(e.lines.first { $0.key == "prod:\(p.id)" }?.total, 200)
    }

    func testCSVImportFindsColumnsAndTypes() {
        let csv = """
        Brand,Model,Device type,SKU,Price,Labor,Notes
        Ubiquiti,G5 Turret Ultra,Indoor camera,UVC-G5,"$1,129.00",85,4K
        Sonos,In-Ceiling,speaker,,449,90,
        Acme,Thing,Teleporter,,10,0,
        """
        let r = ProductCSV.parse(csv, catalog: catalog)
        XCTAssertEqual(r.products.count, 2)
        XCTAssertEqual(r.products[0].deviceTypeId, "cam-indoor")
        XCTAssertEqual(r.products[0].unitPrice, 1129)
        XCTAssertEqual(r.products[0].sku, "UVC-G5")
        XCTAssertEqual(r.products[1].deviceTypeId, "speaker")
        XCTAssertEqual(r.skipped.count, 1)
        // Pasted straight from a spreadsheet (tabs).
        let tsv = "Type\tBrand\tModel\tPrice\nWi-Fi access point\tUbiquiti\tU7 Pro\t189"
        XCTAssertEqual(ProductCSV.parse(tsv, catalog: catalog).products.first?.deviceTypeId, "wap")
    }

    func testBackupCarriesProducts() throws {
        let p = Product(deviceTypeId: "wap", brand: "Ubiquiti", model: "U7 Pro", unitPrice: 189)
        let file = BackupFile(catalog: catalog, products: [p], projects: [])
        let back = try BackupFile.decode(file.encoded())
        XCTAssertEqual(back.products?.first?.title, "Ubiquiti U7 Pro")
    }

    func testRoomFromPlanLabels() {
        let d = [PlanDetail(kind: .room, text: "Great Room · 18'-6\" × 22'-0\"", x: 0.3, y: 0.4),
                 PlanDetail(kind: .room, text: "Kitchen", x: 0.7, y: 0.4)]
        XCTAssertEqual(PlanReader.room(atX: 0.33, y: 0.45, details: d), "Great Room")
        XCTAssertEqual(PlanReader.room(atX: 0.68, y: 0.3, details: d), "Kitchen")
        XCTAssertNil(PlanReader.room(atX: 0.05, y: 0.95, details: d))
    }
}
