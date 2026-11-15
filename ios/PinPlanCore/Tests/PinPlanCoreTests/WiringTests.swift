import XCTest
@testable import PinPlanCore

final class WiringTests: XCTestCase {
    let catalog = Catalog.seed()

    func bundle() -> ProjectBundle {
        var b = ProjectBundle(project: Project(id: "p", clientName: "", address: ""))
        b.sheets = [Sheet(id: "s2", projectId: "p", name: "2nd Fl", pageNumber: 2, order: 1, imageId: "i", width: 100, height: 100, pxPerFt: 1),
                    Sheet(id: "s1", projectId: "p", name: "1st Fl", pageNumber: 1, order: 0, imageId: "i", width: 100, height: 100, pxPerFt: 1)]
        b.closets = [Closet(id: "eq", projectId: "p", sheetId: "s1", kind: .equipment, x: 0, y: 0, name: "Equipment closet")]
        func mk(_ id: String, _ type: String, _ sheet: String, _ label: String, wire: String = "Cat6", wires: [String]? = nil, closet: String? = "eq") -> Marker {
            var m = Marker(id: id, projectId: "p", sheetId: sheet, deviceTypeId: type, x: 0.5, y: 0.5, label: label, room: "Den", wireType: wire, closetId: closet)
            m.wires = wires
            return m
        }
        b.markers = [mk("tv", "tv", "s2", "TV-2-01", wire: "HDMI", wires: ["HDMI", "Cat6", "Cat6"]), mk("w2", "wap", "s1", "WAP-1-02"),
                     mk("w10", "wap", "s1", "WAP-1-10"), mk("spk", "speaker", "s1", "SPK-1-01", wire: "16/4 speaker"), mk("nc", "wap", "s1", "WAP-1-11", closet: nil)]
        var r = Run(id: "r", projectId: "p", sheetId: "s2", kind: .wire, points: [0, 0, 1, 1], typedFt: 60, wireType: "HDMI", markerId: "tv", closetId: "eq")
        r.wireTypes = ["HDMI", "Cat6", "Cat6"]
        b.runs = [r]
        return b
    }

    func testPortsMatchTheWebApp() {
        let rows = Wiring.portSchedule(bundle(), catalog: catalog)
        XCTAssertEqual(rows.map { "\($0.label):\($0.port)" },
                       ["SPK-1-01:SPK-01", "WAP-1-02:PP1-01", "WAP-1-10:PP1-02", "WAP-1-11:", "TV-2-01:HD-01", "TV-2-01-A:PP1-03", "TV-2-01-B:PP1-04"])
        XCTAssertEqual(rows.first { $0.label == "TV-2-01-A" }?.lengthFt, 60)
        XCTAssertTrue(Wiring.cableLabelsCSV(rows).contains("TV-2-01-A,TV-2-01-A → Equipment closet PP1-03,PP1-03 → TV-2-01-A Den,Cat6,Equipment closet,PP1-03,Den,2nd Fl"))
    }

    func testMaterialListBoxesAndTerminations() {
        var b = bundle()
        b.runs.append(Run(id: "r2", projectId: "p", sheetId: "s1", kind: .wire, points: [0, 0, 1, 1], typedFt: 1000, wireType: "Cat6", markerId: "w2", closetId: "eq"))
        let list = Wiring.materialList(b, catalog: catalog, products: [], includeTentative: false)
        let cat6 = list.first { $0.item.contains("Cat6 cable") }!
        XCTAssertEqual(cat6.qty, 2) // 1000 + 2×60 ft → two 1000 ft boxes
        XCTAssertEqual(list.first { $0.item.hasPrefix("HDMI cable") }?.item, "HDMI cable — 75 ft")
        XCTAssertEqual(list.first { $0.item == "Cat6 keystone jack" }?.qty, 5)
        XCTAssertEqual(list.first { $0.item == "24-port Cat6 patch panel" }?.qty, 1)
    }
}
