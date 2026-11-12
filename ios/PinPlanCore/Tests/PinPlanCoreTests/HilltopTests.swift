import XCTest
@testable import PinPlanCore

/// 20 Hilltop Dr E — the installer's hand counts from PLAN.md rebuilt as placed markers and runs,
/// plus the agreed decisions (circled M = shade; extra circled S = tentative speakers; Attic "Setup LED 60" = tentative 60 LF run).
struct FloorCounts { let indoorCam, outdoorCam, speakers, tvs, sh, vs, wap, shades, ledZones: Int; let ledTotal: Double? }
let HILLTOP: [(String, FloorCounts)] = [
    ("Attic", .init(indoorCam: 3, outdoorCam: 0, speakers: 0, tvs: 1, sh: 1, vs: 0, wap: 1, shades: 0, ledZones: 3, ledTotal: 48)),
    ("1st Fl", .init(indoorCam: 3, outdoorCam: 9, speakers: 2, tvs: 1, sh: 0, vs: 0, wap: 2, shades: 0, ledZones: 9, ledTotal: 305)),
    ("2nd Fl", .init(indoorCam: 4, outdoorCam: 0, speakers: 2, tvs: 1, sh: 1, vs: 1, wap: 0, shades: 1, ledZones: 16, ledTotal: 520)),
    ("Cellar", .init(indoorCam: 3, outdoorCam: 0, speakers: 0, tvs: 1, sh: 1, vs: 1, wap: 1, shades: 0, ledZones: 8, ledTotal: nil)),
]
let EXTRA_S = ["1st Fl": 2, "Cellar": 3]

func buildHilltop() -> ProjectBundle {
    var b = ProjectBundle(project: Project(id: "hilltop", clientName: "Client", address: "20 Hilltop Dr E"))
    let catalog = Catalog.seed()
    func type(_ id: String) -> DeviceType { catalog.first { $0.id == id }! }
    for (order, (name, c)) in HILLTOP.enumerated() {
        let s = Sheet(id: "sheet-\(order)", projectId: "hilltop", name: name, pageNumber: order + 1, order: order, imageId: "img", width: 3000, height: 2000, pxPerFt: 12)
        b.sheets.append(s)
        let items: [(String, Int)] = [("cam-indoor", c.indoorCam), ("cam-outdoor", c.outdoorCam), ("speaker", c.speakers), ("tv", c.tvs),
                                      ("sh", c.sh), ("vs", c.vs), ("wap", c.wap), ("shade", c.shades)]
        var k = 0
        for (id, qty) in items {
            for _ in 0..<qty {
                k += 1
                b.addMarker(type: type(id), sheetId: s.id, x: Double(k % 20) / 20, y: 0.5, tentative: name == "1st Fl" && id == "speaker")
            }
        }
        for i in 0..<(EXTRA_S[name] ?? 0) { b.addMarker(type: type("speaker"), sheetId: s.id, x: 0.9, y: Double(i + 1) / 10, tentative: true) }
        if name == "Attic" {
            b.addRun(Run(projectId: "hilltop", sheetId: s.id, kind: .led, deviceTypeId: "led-ceiling", points: [0.5, 0.5, 0.6, 0.5], typedFt: 60, tentative: true))
        }
        // LED zones: split the written LF exactly across the zones; the Cellar LF wasn't written.
        for z in 0..<c.ledZones {
            var lf: Double? = nil
            if let total = c.ledTotal {
                let base = (total / Double(c.ledZones)).rounded(.down)
                lf = base + (Double(z) < total - base * Double(c.ledZones) ? 1 : 0)
            }
            var r = Run(projectId: "hilltop", sheetId: s.id, kind: .led, deviceTypeId: "led-ceiling", points: [0.1, 0.1, 0.2, 0.1], typedFt: lf, zone: String(z + 1), switchLabel: "S\(z + 1)")
            if lf == nil { r.typedFt = nil }
            b.runs.append(r)
            if lf == nil { b.runs[b.runs.count - 1].measuredFt = nil }
        }
    }
    b.closets.append(Closet(id: "closet-av", projectId: "hilltop", sheetId: "sheet-3", kind: .equipment, x: 0.5, y: 0.5, name: "AV Equipment"))
    return b
}

final class HilltopTests: XCTestCase {
    let t = TakeoffCalculator.compute(buildHilltop())

    func testFloorsInOrder() {
        XCTAssertEqual(t.floors.map(\.name), ["Attic", "1st Fl", "2nd Fl", "Cellar"])
    }

    func testPerFloorCountsMatchHandCounts() {
        for (name, c) in HILLTOP {
            let f = t.floors.first { $0.name == name }!.bucket
            XCTAssertEqual(f.counts["cam-indoor"] ?? 0, c.indoorCam, "\(name) indoor cameras")
            XCTAssertEqual(f.counts["cam-outdoor"] ?? 0, c.outdoorCam, "\(name) outdoor cameras")
            XCTAssertEqual((f.counts["speaker"] ?? 0) - (EXTRA_S[name] ?? 0), c.speakers, "\(name) speakers (written)")
            XCTAssertEqual(f.counts["tv"] ?? 0, c.tvs, "\(name) TVs")
            XCTAssertEqual(f.counts["sh"] ?? 0, c.sh, "\(name) SH")
            XCTAssertEqual(f.counts["vs"] ?? 0, c.vs, "\(name) VS")
            XCTAssertEqual(f.counts["wap"] ?? 0, c.wap, "\(name) Wi-Fi APs")
            XCTAssertEqual(f.counts["shade"] ?? 0, c.shades, "\(name) shades")
            XCTAssertEqual(f.ledZones, c.ledZones, "\(name) LED zones")
            if let total = c.ledTotal { XCTAssertEqual(f.ledTotalFt, total, "\(name) LED total") } else {
                XCTAssertEqual(f.ledTotalFt, 0)
                XCTAssertEqual(f.unmeasuredRuns, c.ledZones)
            }
        }
    }

    func testTentativeItemsAreSeparate() {
        let first = t.floors[1].bucket
        XCTAssertEqual(first.tentative["speaker"], 2 + EXTRA_S["1st Fl"]!)
        XCTAssertEqual(first.count(["speaker"], confirmedOnly: true), 0)
        let attic = t.floors[0].bucket
        XCTAssertEqual(attic.ledZones, 3)
        XCTAssertEqual(attic.ledTotalFt, 48)
        XCTAssertEqual(attic.ledTentativeFt["led-ceiling"], 60)
    }

    func testWholeHouse() {
        let tot = t.total
        XCTAssertEqual(tot.counts["cam-indoor"], 13)
        XCTAssertEqual(tot.count(["cam-indoor", "cam-outdoor"]), 22)
        XCTAssertEqual(tot.count(["speaker"], confirmedOnly: true), 2)
        XCTAssertEqual(tot.counts["tv"], 4)
        XCTAssertEqual(tot.counts["sh"], 3)
        XCTAssertEqual(tot.counts["vs"], 2)
        XCTAssertEqual(tot.counts["wap"], 4)
        XCTAssertEqual(tot.counts["shade"], 1)
        XCTAssertEqual(tot.ledZones, 36)
        XCTAssertEqual(tot.ledTotalFt, 873)
        XCTAssertEqual(tot.closets[.equipment], 1)
    }

    func testLabelsAreNumberedPerFloor() {
        let b = buildHilltop()
        let atticCams = b.markers.filter { $0.sheetId == "sheet-0" && $0.deviceTypeId == "cam-indoor" }.map(\.label)
        XCTAssertEqual(atticCams, ["CAM-1-01", "CAM-1-02", "CAM-1-03"])
        XCTAssertTrue(b.markers.contains { $0.label == "CAM-3-04" })
    }

    func testEstimateKeepsTentativeOptional() {
        var catalog = Catalog.seed()
        for i in catalog.indices {
            switch catalog[i].id {
            case "cam-indoor": catalog[i].unitPrice = 200; catalog[i].laborPrice = 100
            case "speaker": catalog[i].unitPrice = 150
            case "led-ceiling": catalog[i].unitPrice = 10
            default: break
            }
        }
        var pricing = Catalog.defaultPricing
        pricing.markupPct = 10; pricing.taxPct = 5
        let e = EstimateBuilder.build(takeoff: t, catalog: catalog, pricing: pricing)
        let cam = e.lines.first { $0.key == "dev:cam-indoor" }!
        XCTAssertEqual(cam.qty, 13)
        XCTAssertEqual(cam.unitPrice, 320, accuracy: 0.001)
        XCTAssertEqual(e.lines.first { $0.key == "dev:speaker" }!.qty, 2)
        let opt = e.lines.first { $0.key == "opt:speaker" }!
        XCTAssertEqual(opt.qty, 7)
        XCTAssertFalse(opt.included)
        XCTAssertEqual(e.lines.first { $0.key == "dev:led-ceiling" }!.qty, 873)
        let camTotal: Double = 13 * 320
        let spkTotal: Double = 2 * 165
        let ledTotal: Double = 873 * 11
        let expectedSubtotal = camTotal + spkTotal + ledTotal
        XCTAssertEqual(e.subtotal, expectedSubtotal, accuracy: 0.001)
        let optSpk: Double = 7 * 165
        let optLed: Double = 60 * 11
        let expectedOptional = optSpk + optLed
        XCTAssertEqual(e.optionalTotal, expectedOptional, accuracy: 0.001)

        var o1 = EstimateLine(projectId: "hilltop", key: "dev:cam-indoor"); o1.unitPrice = 300
        var o2 = EstimateLine(projectId: "hilltop", key: "opt:speaker"); o2.include = true
        var o3 = EstimateLine(projectId: "hilltop", key: "custom:x"); o3.description = "Programming"; o3.qty = 8; o3.unit = "hr"; o3.unitPrice = 125
        let e2 = EstimateBuilder.build(takeoff: t, catalog: catalog, pricing: pricing, overrides: [o1, o2, o3])
        XCTAssertEqual(e2.lines.first { $0.key == "dev:cam-indoor" }!.total, 3900, accuracy: 0.001)
        XCTAssertTrue(e2.lines.first { $0.key == "opt:speaker" }!.included)
        XCTAssertEqual(e2.lines.first { $0.key == "custom:x" }!.total, 1000, accuracy: 0.001)
    }
}
