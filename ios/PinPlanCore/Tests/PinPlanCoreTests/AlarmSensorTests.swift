import XCTest
@testable import PinPlanCore

// Alarm sensors from openings (docs/find-similar.md): the same cases as the web's tests/alarmSensors.test.ts.
final class AlarmSensorTests: XCTestCase {
    typealias A = AlarmSensors

    let dx = 20 * 0.5.squareRoot() / 1000
    let dy = 20 * 0.5.squareRoot() / 500

    func op(_ id: String, _ kind: A.OpeningKind, _ x: Double, _ y: Double, _ room: String = "") -> A.Opening {
        A.Opening(id: id, kind: kind, x: x, y: y, room: room)
    }

    func mk(_ id: String, _ type: String, _ x: Double, _ y: Double, _ room: String = "", sheet: String = "s1") -> Marker {
        Marker(id: id, projectId: "p1", sheetId: sheet, deviceTypeId: type, x: x, y: y, label: id, room: room)
    }

    /// Two doors, two kitchen windows (room written two ways), two windows close together with no room, one far away.
    var openings: [A.Opening] {
        [op("d1", .door, 0.1, 0.5), op("d2", .door, 0.5, 0.5, "Kitchen"), op("w1", .window, 0.2, 0.2, "Kitchen"),
         op("w2", .window, 0.3, 0.2, "kitchen "), op("w3", .window, 0.8, 0.2), op("w4", .window, 0.85, 0.25), op("w5", .window, 0.8, 0.9)]
    }

    func plan(_ existing: [Marker] = [], kinds: Set<A.SensorKind>, excluded: Set<String> = []) -> A.Plan {
        A.plan(openings: openings, existing: existing.filter { $0.deleted != true }.map(A.Placed.init), sheetId: "s1", width: 1000, height: 500,
               pxPerFt: 10, kinds: kinds, excluded: excluded)
    }

    func testWhichTypesAreOpenings() {
        XCTAssertEqual(A.openingKind(id: "gen-door", name: "Anything"), .door)
        XCTAssertEqual(A.openingKind(id: "gen-window", name: "Anything"), .window)
        XCTAssertEqual(A.openingKind(id: "x1", name: "Sliding door"), .door)
        XCTAssertEqual(A.openingKind(id: "x2", name: "Doors"), .door)
        XCTAssertEqual(A.openingKind(id: "x3", name: "Window"), .window)
        for name in ["Door contact", "Window contact", "Window sensor", "Door strike", "Doorbell", "Window shade", "Door chime", "Garage door opener", "Glass-break detector", "Indoor camera"] {
            XCTAssertNil(A.openingKind(id: "x", name: name), name)
        }
        for id in Catalog.alarmSeedIds { XCTAssertNil(A.openingKind(id: id, name: "Door")) }
    }

    func testSheetOpenings() {
        let catalog = Catalog.seed() + Trades.builtInAdditions(catalog: Catalog.seed())
        var gone = mk("e", "gen-window", 0.5, 0.5)
        gone.deleted = true
        let markers = [mk("a", "gen-door", 0.1, 0.1, " Hall "), mk("b", "gen-window", 0.2, 0.2), mk("c", "cam-indoor", 0.3, 0.3), mk("d", "gen-door", 0.4, 0.4, sheet: "s2"), gone]
        XCTAssertEqual(A.sheetOpenings(markers: markers, catalog: catalog, sheetId: "s1"), [op("a", .door, 0.1, 0.1, "Hall"), op("b", .window, 0.2, 0.2)])
    }

    func testDistances() {
        XCTAssertEqual(A.offsetPx(width: 1000, height: 500, pxPerFt: 10), 20)
        XCTAssertEqual(A.offsetPx(width: 2000, height: 1000, pxPerFt: nil), 50)
        XCTAssertEqual(A.clusterPx(width: 1000, height: 500, pxPerFt: 10), 150)
        XCTAssertEqual(A.clusterPx(width: 2000, height: 1000, pxPerFt: nil), 120, accuracy: 1e-9)
    }

    func testContactOnEachDoorAndWindow() {
        let p = plan(kinds: [.door, .window])
        XCTAssertEqual([p.count(.door), p.count(.window), p.count(.glass)], [2, 5, 0])
        XCTAssertEqual(p.placements.map(\.deviceTypeId), ["door-contact", "door-contact"] + Array(repeating: "window-contact", count: 5))
        let d2 = p.placements[1]
        XCTAssertEqual(d2.openingIds, ["d2"])
        XCTAssertEqual(d2.room, "Kitchen")
        XCTAssertEqual(d2.x, 0.5 + dx, accuracy: 1e-9)
        XCTAssertEqual(d2.y, 0.5 - dy, accuracy: 1e-9)
    }

    func testGlassBreakPerRoomOrGroup() {
        let p = plan(kinds: [.glass])
        XCTAssertEqual(p.count(.glass), 3)
        XCTAssertEqual(p.placements.map(\.openingIds), [["w1", "w2"], ["w3", "w4"], ["w5"]])
        XCTAssertEqual(p.placements[0].room, "Kitchen")
        XCTAssertEqual(p.placements[0].x, 0.25 - dx, accuracy: 1e-9)
        XCTAssertEqual(p.placements[0].y, 0.2 - dy, accuracy: 1e-9)
        XCTAssertEqual(p.placements[1].x, 0.825 - dx, accuracy: 1e-9)
        XCTAssertEqual(p.placements[1].y, 0.225 - dy, accuracy: 1e-9)
    }

    func testNeverTwice() {
        let existing = [mk("e1", "door-contact", 0.11, 0.5), mk("e2", "glass-break", 0.5, 0.5, "KITCHEN"), mk("e3", "window-contact", 0.2, 0.2, sheet: "s2")]
        let p = plan(existing, kinds: [.door, .window, .glass])
        XCTAssertEqual([p.count(.door), p.count(.window), p.count(.glass)], [1, 5, 2])
        XCTAssertEqual(p.covered, [.door: 1, .window: 0, .glass: 1])
        let placed = p.placements.enumerated().map { mk("n\($0.offset)", $0.element.deviceTypeId, $0.element.x, $0.element.y, $0.element.room) }
        let again = plan(existing + placed, kinds: [.door, .window, .glass])
        XCTAssertTrue(again.placements.isEmpty)
        XCTAssertEqual(again.covered, [.door: 2, .window: 5, .glass: 3])
    }

    func testGlassBreakNearLooseWindowsCoversThem() {
        let p = plan([mk("g", "glass-break", 0.82, 0.3)], kinds: [.glass])
        XCTAssertEqual(p.placements.map(\.openingIds), [["w1", "w2"], ["w5"]])
    }

    func testLeftOutOpeningsGetNothing() {
        let p = plan(kinds: [.door, .window, .glass], excluded: ["w5", "d1"])
        XCTAssertEqual([p.count(.door), p.count(.window), p.count(.glass)], [1, 4, 2])
        XCTAssertFalse(p.placements.contains { $0.openingIds.contains("w5") || $0.openingIds.contains("d1") })
    }

    func testStaysOnTheSheet() {
        let p = A.plan(openings: [op("d", .door, 1, 0)], existing: [], sheetId: "s1", width: 1000, height: 500, pxPerFt: 10, kinds: [.door])
        XCTAssertEqual([p.placements[0].x, p.placements[0].y], [1, 0])
    }

    func testGroupOrder() {
        let g = A.windowGroups([op("a", .window, 0, 0), op("b", .window, 0.5, 0, "Den"), op("c", .window, 0.01, 0), op("d", .window, 0.6, 0, "den")],
                               near: { abs($0.x - $1.x) < 0.05 })
        XCTAssertEqual(g.map(\.room), ["", "Den"])
        XCTAssertEqual(g.map { $0.windows.map(\.id) }, [["a", "c"], ["b", "d"]])
    }

    func testMissingTypes() {
        let cat = Catalog.seed()
        XCTAssertEqual(A.missingTypes(cat), [])
        XCTAssertEqual(A.missingTypes(cat.map { var d = $0; if d.id == "glass-break" { d.archived = true }; return d }), [.glass])
        XCTAssertEqual(A.missingTypes(cat.filter { $0.id != "door-contact" }, kinds: [.door, .window]), [.door])
    }

    func testTakeoffOpenings() {
        var catalog = Catalog.seed() + Trades.builtInAdditions(catalog: Catalog.seed())
        var mine = catalog[0]
        mine.id = "my-door"; mine.name = "Patio door"
        catalog.append(mine)
        var b = ProjectBundle(project: Project(clientName: "C", address: "A"))
        var s1 = Sheet(projectId: b.project.id, name: "1st Fl", pageNumber: 1, order: 0, imageId: "i1", width: 1000, height: 500)
        s1.id = "s1"
        var s2 = Sheet(projectId: b.project.id, name: "2nd Fl", pageNumber: 2, order: 1, imageId: "i2", width: 1000, height: 500)
        s2.id = "s2"
        b.sheets = [s1, s2]
        b.markers = [mk("a", "gen-door", 0.1, 0.1), mk("b", "my-door", 0.2, 0.1), mk("c", "gen-window", 0.3, 0.1), mk("d", "gen-window", 0.3, 0.1, sheet: "s2"),
                     mk("e", "door-contact", 0.1, 0.1), mk("f", "window-contact", 0.3, 0.1, sheet: "s2"), mk("g", "glass-break", 0.3, 0.1, sheet: "s2"), mk("h", "cam-indoor", 0.5, 0.5)]
        let s = A.summary(TakeoffCalculator.compute(b), catalog: catalog)
        XCTAssertEqual(s.floors.map(\.name), ["1st Fl", "2nd Fl"])
        XCTAssertEqual(s.floors[0].counts, A.Count(doors: 2, windows: 1, doorContacts: 1))
        XCTAssertEqual(s.floors[1].counts, A.Count(windows: 1, windowContacts: 1, glassBreaks: 1))
        XCTAssertEqual(s.total, A.Count(doors: 2, windows: 2, doorContacts: 1, windowContacts: 1, glassBreaks: 1))
        XCTAssertTrue(s.hasOpenings && s.hasSensors)
    }

    func testOlderCatalogsGetTheBuiltIns() {
        let old = Catalog.seed().filter { !Catalog.alarmSeedIds.contains($0.id) }
        let add = Trades.builtInAdditions(catalog: old)
        XCTAssertEqual(add.map(\.id), Catalog.alarmSeedIds + Catalog.openingTypeIds)
        XCTAssertTrue(add.allSatisfy { $0.updatedAt == "1970-01-01T00:00:00.000Z" })
        XCTAssertEqual(add.map(\.sort), Array(old.count..<(old.count + add.count)))
        let dc = add.first { $0.id == "door-contact" }!
        XCTAssertEqual([dc.name, dc.symbol, dc.defaultWire], ["Door contact", "DC", "22/4 alarm"])
        XCTAssertEqual(dc.category, .security)
        XCTAssertEqual([dc.unitPrice, dc.laborPrice], [8, 45])
        XCTAssertEqual(add.first { $0.id == "gen-door" }?.category, .general)
        XCTAssertTrue(Trades.builtInAdditions(catalog: old + add).isEmpty)
        XCTAssertTrue(Trades.builtInAdditions(catalog: old + add.map { var d = $0; d.archived = true; return d }).isEmpty)
        XCTAssertEqual(Trades.builtInAdditions(catalog: Catalog.seed()).map(\.id), Catalog.openingTypeIds)
        XCTAssertEqual(Trades.packDescription("door-contact"), "Alarm sensor that trips when the door opens.")
    }

    func testOpeningsInEveryPalette() {
        let door = Trades.pack(.general).catalog.first { $0.type.id == "gen-door" }!.type
        for t in TradeId.allCases { XCTAssertTrue(Trades.typeVisible(door, for: [t]), t.rawValue) }
        var archived = door
        archived.archived = true
        XCTAssertFalse(Trades.typeVisible(archived, for: [.electrical]))
        let item = Trades.pack(.general).catalog.first { $0.type.id == "gen-item" }!.type
        XCTAssertFalse(Trades.typeVisible(item, for: [.electrical]))
    }

    func testUnpricedOpeningsStayOffTheEstimate() {
        let catalog = Catalog.seed() + Trades.builtInAdditions(catalog: Catalog.seed())
        var b = ProjectBundle(project: Project(clientName: "C", address: "A"))
        var s1 = Sheet(projectId: b.project.id, name: "1", pageNumber: 1, order: 0, imageId: "i", width: 1000, height: 500)
        s1.id = "s1"
        b.sheets = [s1]
        b.markers = [mk("a", "gen-door", 0.1, 0.1), mk("b", "gen-window", 0.2, 0.1), mk("c", "door-contact", 0.1, 0.1)]
        let t = TakeoffCalculator.compute(b)
        for mode in [LaborMode.combined, .separate] {
            var pricing = Catalog.defaultPricing
            pricing.laborMode = mode
            let keys = EstimateBuilder.build(takeoff: t, catalog: catalog, pricing: pricing).lines.map(\.key)
            XCTAssertFalse(keys.contains { $0.contains("gen-") })
            XCTAssertTrue(keys.contains("dev:door-contact"))
            let priced = catalog.map { d -> DeviceType in var d = d; if d.id == "gen-window" { d.laborPrice = 30 }; return d }
            let pk = EstimateBuilder.build(takeoff: t, catalog: priced, pricing: pricing).lines.map(\.key)
            XCTAssertTrue(pk.contains("dev:gen-window"))
            XCTAssertFalse(pk.contains("dev:gen-door"))
        }
        let est = EstimateBuilder.build(takeoff: t, catalog: catalog, pricing: Catalog.defaultPricing)
        let line = est.lines.first { $0.key == "dev:door-contact" }!
        XCTAssertEqual([line.qty, line.unitPrice], [1, 53])
    }
}
