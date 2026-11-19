import XCTest
@testable import PinPlanCore

/// Trade packs (same rules as tests/trades.test.ts): low voltage unchanged, other trades well formed, tolerant decoding
/// of categories/closet kinds synced from the web, circuits round-trip, panel schedule.
final class TradeTests: XCTestCase {
    private let lv: [TradeId] = [.lowvoltage]
    private let el: [TradeId] = [.electrical]

    func testNothingSetMeansLowVoltage() {
        XCTAssertEqual(Trades.normalize(nil as [String]?), [.lowvoltage])
        XCTAssertEqual(Trades.normalize(["nope", "electrical", "electrical"]), [.electrical])
    }

    func testLowVoltageLooksExactlyAsBefore() {
        XCTAssertEqual(Trades.categories(for: lv).map(\.id), Catalog.lowVoltageCategories)
        XCTAssertEqual(Trades.categories(for: lv).map(\.name), ["Security", "Network", "Audio", "Video", "Smart home", "Lighting", "Shades", "Infrastructure"])
        XCTAssertEqual(Trades.layers(for: lv).map(\.id), [.security, .network, .audio, .video, .smarthome, .lighting, .shades, .infrastructure, .wiring])
        XCTAssertEqual(Trades.layers(for: lv).last?.name, "Wiring")
        XCTAssertEqual(Trades.wireTypes(for: lv), Catalog.wireTypes.filter { $0 != "None" })
        XCTAssertEqual(Trades.closetKinds(for: lv).map(\.id), [.equipment, .switch, .rack])
        XCTAssertEqual(Trades.checklists(for: lv).map(\.id), FieldDocs.templates.map(\.id))
        XCTAssertEqual(Trades.vocab(for: lv), TradeVocab(run: "Wire run", runs: "Home runs", runHint: "device → closet", closet: "closet", wire: "Cable"))
        for d in Catalog.seed() { XCTAssertTrue(Trades.typeVisible(d, for: lv), d.id) }
    }

    func testPacksAreWellFormed() {
        XCTAssertEqual(Trades.packs.map(\.id), TradeId.allCases)
        for p in Trades.packs {
            let ids = p.catalog.map(\.type.id)
            XCTAssertEqual(Set(ids).count, ids.count, "\(p.id)")
            for s in p.catalog { XCTAssertTrue(p.categories.contains { $0.id == s.type.category }, s.type.id) }
        }
        let electrical = Trades.pack(.electrical)
        let symbols = Dictionary(electrical.catalog.map { ($0.type.id, $0.type.symbol) }, uniquingKeysWith: { a, _ in a })
        XCTAssertEqual(symbols["el-gfci"], "GFI")
        XCTAssertEqual(symbols["el-sw3"], "S3")
        XCTAssertEqual(symbols["el-can6"], "CAN")
        XCTAssertEqual(Trades.vocab(for: el).run, "Circuit")
        XCTAssertEqual(Trades.closetKinds(for: el).map(\.id), [.panel, .subpanel])
    }

    func testElectricalPaletteHidesTheLowVoltageStarters() {
        let cam = Catalog.seed().first { $0.id == "cam-indoor" }!
        XCTAssertFalse(Trades.typeVisible(cam, for: el))
        XCTAssertTrue(Trades.typeVisible(cam, for: [.electrical, .lowvoltage]))
        let rec = Trades.pack(.electrical).catalog.first { $0.type.id == "el-rec20" }!.type
        XCTAssertTrue(Trades.typeVisible(rec, for: el))
        XCTAssertEqual(Trades.categories(for: [.electrical, .lowvoltage]).first?.name, "Receptacles")
    }

    func testAddingAPackNeverReplacesOrDeletes() {
        var mine = Trades.pack(.electrical).catalog[0].type
        mine.name = "My receptacle"; mine.unitPrice = 9.99
        let catalog = Catalog.seed() + [mine]
        let add = Trades.packAdditions(.electrical, catalog: catalog, wirePrices: ["12/2 NM-B": 1.11], now: "2026-11-20T00:00:00.000Z")
        XCTAssertFalse(add.types.contains { $0.id == mine.id })
        XCTAssertEqual(add.types.count, Trades.pack(.electrical).catalog.count - 1)
        XCTAssertNil(add.wirePrices["12/2 NM-B"])
        XCTAssertEqual(add.wirePrices["14/2 NM-B"], 0.65)
        XCTAssertGreaterThan(add.types.map(\.sort).min()!, catalog.map(\.sort).max()!)
    }

    func testUnknownIdsFromANewerAppDecodeInsteadOfFailing() throws {
        let type = ##"{"id":"x","name":"X","category":"spaceport","symbol":"X","abbrev":"X","shape":"circle","color":"#000000","unit":"each","unitPrice":0,"laborPrice":0,"defaultWire":"","defaultMount":"wall","kind":"device","sort":0,"updatedAt":"2026-11-20T00:00:00.000Z"}"##
        XCTAssertEqual(try JSONDecoder().decode(DeviceType.self, from: Data(type.utf8)).category, .general)
        let power = type.replacingOccurrences(of: "spaceport", with: "power")
        XCTAssertEqual(try JSONDecoder().decode(DeviceType.self, from: Data(power.utf8)).category, .power)
        let closet = #"{"id":"c","projectId":"p","sheetId":"s","kind":"bunker","x":0.1,"y":0.1,"name":"C","createdAt":"t","updatedAt":"t"}"#
        XCTAssertEqual(try JSONDecoder().decode(Closet.self, from: Data(closet.utf8)).kind, .equipment)
        let panel = closet.replacingOccurrences(of: "bunker", with: "subpanel")
        XCTAssertEqual(try JSONDecoder().decode(Closet.self, from: Data(panel.utf8)).kind, .subpanel)
        XCTAssertEqual(try JSONDecoder().decode([Layer].self, from: Data(#"["fire","holodeck"]"#.utf8)), [.fire, .general])
        // Encoding keeps the raw ids.
        XCTAssertEqual(String(data: try JSONEncoder().encode([Category.switching]), encoding: .utf8), #"["switching"]"#)
    }

    func testCircuitsRoundTripWithTheWebFormat() throws {
        let run = #"{"id":"r","projectId":"p","sheetId":"s","kind":"wire","points":[0,0,1,1],"closetId":"mp","circuit":{"number":"3/5","breakerA":30,"volts":240,"poles":2,"description":"Dryer"},"createdAt":"t","updatedAt":"t"}"#
        let r = try JSONDecoder().decode(Run.self, from: Data(run.utf8))
        XCTAssertEqual(r.circuit, CircuitInfo(number: "3/5", breakerA: 30, volts: 240, poles: 2, description: "Dryer"))
        let marker = #"{"id":"m","projectId":"p","sheetId":"s","deviceTypeId":"el-rec20","x":0.5,"y":0.5,"label":"R-1","room":"","mount":"wall","wireType":"12/2 NM-B","closetId":"mp","circuit":"12","tentative":false,"notes":"","createdAt":"t","updatedAt":"t"}"#
        XCTAssertEqual(try JSONDecoder().decode(Marker.self, from: Data(marker.utf8)).circuit, "12")
        XCTAssertTrue(SyncMap.specs[.runs]!.columns.contains { $0.remote == "circuit" })
        XCTAssertTrue(SyncMap.specs[.markers]!.columns.contains { $0.remote == "circuit" })
    }

    func testDeviceSpecs() {
        let range = Trades.pack(.electrical).catalog.first { $0.type.id == "el-range" }!.type
        XCTAssertEqual(Trades.deviceSpec(range), DeviceSpec(va: 8000, breakerA: 50, volts: 240, poles: 2))
        XCTAssertEqual(Trades.deviceSpec(Catalog.seed()[0]).va, 0)
        XCTAssertEqual(Trades.wireForBreaker(20), "12/2 NM-B")
        XCTAssertEqual(Trades.wireForBreaker(30, volts: 240), "10/3 NM-B")
    }

    /// Same job as the web test (tests/trades.test.ts, "panel schedule").
    func testPanelSchedule() {
        let catalog = Trades.pack(.electrical).catalog.enumerated().map { i, s -> DeviceType in var d = s.type; d.sort = i; return d }
        var b = ProjectBundle(project: Project(id: "p", clientName: "", address: ""))
        b.sheets = [Sheet(id: "s1", projectId: "p", name: "1st Fl", pageNumber: 1, order: 0, imageId: "i", width: 100, height: 100, pxPerFt: 1)]
        b.closets = [Closet(id: "mp", projectId: "p", sheetId: "s1", kind: .panel, x: 0, y: 0, name: "Main panel")]
        func mk(_ id: String, _ type: String, _ room: String, circuit: String? = nil, wire: String = "12/2 NM-B") -> Marker {
            var m = Marker(id: id, projectId: "p", sheetId: "s1", deviceTypeId: type, x: 0.5, y: 0.5, label: id.uppercased(), room: room, mount: .wall, wireType: wire, closetId: "mp")
            m.circuit = circuit
            return m
        }
        b.markers = [mk("r1", "el-rec20", "Kitchen", circuit: "1"), mk("r2", "el-rec20", "Kitchen", circuit: "1"), mk("g1", "el-gfci", "Kitchen", circuit: "1"),
                     mk("dry", "el-dryer", "Laundry", wire: "10/3 NM-B"), mk("c1", "el-can6", "Living", wire: "14/2 NM-B")]
        var k = Run(id: "k", projectId: "p", sheetId: "s1", kind: .wire, points: [0, 0, 0.3, 0], typedFt: 30, wireType: "12/2 NM-B", markerId: "r1", closetId: "mp")
        k.circuit = CircuitInfo(number: "1", breakerA: 20, volts: 120, poles: 1, description: "Kitchen counter")
        var d = Run(id: "d", projectId: "p", sheetId: "s1", kind: .wire, points: [0, 0, 1, 1], typedFt: 25, wireType: "10/3 NM-B", markerId: "dry", closetId: "mp")
        d.circuit = CircuitInfo(breakerA: 30, volts: 240, poles: 2)
        b.runs = [k, d]
        let s = PanelSchedule.build(b, catalog: catalog)[0]
        XCTAssertEqual(s.circuits.map(\.number), ["1", "", "unassigned"])
        XCTAssertEqual(s.circuits.map(\.breakerA), [20, 30, 15])
        XCTAssertEqual(s.circuits.map(\.devices), [3, 1, 1])
        XCTAssertEqual(s.circuits.map(\.va), [540, 5000, 15])
        XCTAssertEqual(s.circuits[0].devicesText, "2 × Duplex receptacle 20A (TR), 1 × GFCI receptacle")
        XCTAssertEqual(s.circuits[0].description, "Kitchen counter")
        XCTAssertEqual(s.circuits[1].description, "Laundry")
        XCTAssertEqual(s.totalVA, 5555)
        XCTAssertEqual(s.amps240, 23.1)
        XCTAssertEqual(PanelSchedule.numberCircuits(s), ["d": "2/4"])
        let csv = PanelSchedule.csv([s])
        XCTAssertTrue(csv.contains("Main panel,1,20,1,120,Kitchen counter"))
        XCTAssertTrue(csv.contains("Main panel,Total,,,,,,5,,,5555"))
        // Panels count in the takeoff and estimate by their own names.
        let t = TakeoffCalculator.compute(b)
        XCTAssertEqual(t.total.closets[.panel], 1)
        let est = EstimateBuilder.build(takeoff: t, catalog: catalog, pricing: Catalog.defaultPricing)
        XCTAssertEqual(est.lines.first { $0.key == "closet:panel" }?.description, "Main panel")
    }

    func testLegendUsesTheTradesNames() {
        let catalog = Trades.pack(.electrical).catalog.map(\.type)
        var bucket = TakeoffBucket()
        bucket.counts = ["el-gfci": 2]
        bucket.closets[.panel] = 1
        let t = Takeoff(floors: [], total: bucket)
        let legend = Legend.build(takeoff: t, catalog: catalog, icon: { _ in nil }, trades: el)
        XCTAssertEqual(legend.first?.category, "Receptacles")
        XCTAssertTrue(legend.first?.description.contains("Ground-fault") == true)
        XCTAssertTrue(legend.last?.description.contains("electrical panel") == true)
    }
}
