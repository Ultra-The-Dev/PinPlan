import Foundation

/// Closet port schedule, cable labels and the material order list — derived from placed devices and runs.
/// Mirrors src/lib/wiring.ts in the web app.
public enum Wiring {
    /// "HDMI + Cat6" (the older combined wire type) is two cables.
    public static func expand(_ c: String) -> [String] { c == "HDMI + Cat6" ? ["HDMI", "Cat6"] : [c] }

    public static let portPrefix: [String: String] = [
        "16/4 speaker": "SPK", "HDMI": "HD", "18/2": "LV", "LV per driver": "DRV", "LV per manufacturer": "MFR", "Coax": "CX", "Fiber": "FB",
        "22/4 alarm": "ZN",
    ]
    public static let panelPorts = 24

    public struct PortRow: Hashable, Sendable, Identifiable {
        public var closetId: String?
        public var closetName: String
        /// "PP1-07", "SPK-03"; empty when the device has no closet.
        public var port: String
        public var cable: String
        public var markerId: String
        /// Device label, with -A/-B when a device has several cables of one type.
        public var label: String
        public var device: String
        public var room: String
        public var floor: String
        public var lengthFt: Double?
        public var tentative: Bool
        public var id: String { markerId + "|" + label + "|" + cable }
    }

    static func natural(_ a: String, _ b: String) -> Bool { a.localizedStandardCompare(b) == .orderedAscending }

    /// Every cable from a device to its closet, with a port numbered per closet in floor then label order.
    public static func portSchedule(_ b: ProjectBundle, catalog: [DeviceType], products: [Product] = []) -> [PortRow] {
        let sheets = b.liveSheets
        let order = Dictionary(sheets.enumerated().map { ($1.id, $0) }, uniquingKeysWith: { a, _ in a })
        let runs = b.liveRuns.filter { $0.kind == .wire }
        func type(_ id: String) -> DeviceType? { catalog.first { $0.id == id } }
        let markers = b.liveMarkers
            .filter { order[$0.sheetId] != nil && type($0.deviceTypeId)?.kind != .led }
            .sorted { order[$0.sheetId]! != order[$1.sheetId]! ? order[$0.sheetId]! < order[$1.sheetId]! : natural($0.label, $1.label) }
        var counters: [String: Int] = [:]
        var rows: [PortRow] = []
        for m in markers {
            let cables = m.cables.flatMap(expand)
            guard !cables.isEmpty else { continue }
            let closet = b.liveClosets.first { $0.id == m.closetId }
            let len = runs.first { $0.markerId == m.id }.flatMap(Geometry.runLengthFt)
            let t = type(m.deviceTypeId)
            let p = ProductAssignment.productId(for: m, project: b.project, products: products).flatMap { id in products.first { $0.id == id } }
            let device = p.map { "\($0.title) (\(t?.name ?? m.deviceTypeId))" } ?? (t?.name ?? m.deviceTypeId)
            var perType: [String: Int] = [:]
            for c in cables { perType[c, default: 0] += 1 }
            var seen: [String: Int] = [:]
            for cable in cables {
                let i = seen[cable, default: 0]
                seen[cable] = i + 1
                let suffix = perType[cable]! > 1 ? "-" + String(UnicodeScalar(UInt8(65 + i))) : ""
                var port = ""
                if let closet {
                    let prefix = cable == "Cat6" ? "PP" : (portPrefix[cable] ?? String(cable.filter { $0.isLetter || $0.isNumber }.prefix(3)).uppercased())
                    let key = closet.id + "|" + prefix
                    let n = counters[key, default: 0] + 1
                    counters[key] = n
                    port = prefix == "PP"
                        ? "PP\((n + panelPorts - 1) / panelPorts)-\(String(format: "%02d", (n - 1) % panelPorts + 1))"
                        : "\(prefix)-\(String(format: "%02d", n))"
                }
                rows.append(PortRow(closetId: closet?.id, closetName: closet?.name ?? "No closet", port: port, cable: cable, markerId: m.id,
                                    label: m.label + suffix, device: device, room: m.room, floor: sheets.first { $0.id == m.sheetId }?.name ?? "",
                                    lengthFt: len, tentative: m.tentative))
            }
        }
        return rows
    }

    static func num(_ v: Double?) -> String {
        guard let v else { return "" }
        return v == v.rounded() ? String(Int(v)) : String(format: "%.2f", v).replacingOccurrences(of: #"0+$"#, with: "", options: .regularExpression)
    }

    public static func portScheduleCSV(_ rows: [PortRow]) -> String {
        CSV.encode([["Closet", "Port", "Cable", "Label", "Device", "Room", "Floor", "Length ft"]]
            + rows.map { [$0.closetName, $0.port, $0.cable, $0.label, $0.device, $0.room, $0.floor, num($0.lengthFt)] })
    }

    /// Two labels per cable (device end and closet end), one row per cable, for Brady / Dymo / P-touch CSV import.
    public static func cableLabelsCSV(_ rows: [PortRow]) -> String {
        CSV.encode([["Cable ID", "Device end", "Closet end", "Cable", "Closet", "Port", "Room", "Floor"]] + rows.map { r in
            let at = r.port.isEmpty ? r.closetName : "\(r.closetName) \(r.port)"
            return [r.label, "\(r.label) → \(at)", "\(r.port.isEmpty ? "—" : r.port) → \(r.label)\(r.room.isEmpty ? "" : " \(r.room)")", r.cable, r.closetName, r.port, r.room, r.floor]
        })
    }

    // MARK: material order list

    public static let boxFt: [String: Double] = [
        "Cat6": 1000, "16/4 speaker": 500, "18/2": 500, "LV per driver": 500, "LV per manufacturer": 500, "Coax": 1000, "Fiber": 1000,
        "22/4 alarm": 500,
    ]
    public static let hdmiLengths: [Double] = [6, 10, 15, 25, 35, 50, 75, 100, 150, 200]
    public static let noProduct = "No product chosen"
    public static let hardware = "Terminations & hardware"

    public struct MaterialRow: Hashable, Sendable, Identifiable {
        public var supplier: String
        public var item: String
        public var sku: String
        public var qty: Double
        public var unit: String
        /// Your cost per unit (product price, else catalog price).
        public var unitCost: Double
        public var total: Double
        public var note: String
        public var id: String { supplier + "|" + item }
    }

    public static func materialList(_ b: ProjectBundle, catalog: [DeviceType], products: [Product], includeTentative: Bool, wirePrices: [String: Double] = [:]) -> [MaterialRow] {
        let takeoff = TakeoffCalculator.compute(b)
        let t = takeoff.total
        let split = ProductAssignment.split(b, takeoff: takeoff, catalog: catalog, products: products)
        let byId = Dictionary(products.filter { $0.deleted != true }.map { ($0.id, $0) }, uniquingKeysWith: { a, _ in a })
        var rows: [MaterialRow] = []
        func round2(_ v: Double) -> Double { (v * 100).rounded() / 100 }
        func push(_ supplier: String, _ item: String, _ sku: String, _ qty: Double, _ unit: String, _ cost: Double, _ note: String = "") {
            rows.append(MaterialRow(supplier: supplier, item: item, sku: sku, qty: qty, unit: unit, unitCost: cost, total: round2(qty * cost), note: note))
        }

        for d in catalog.sorted(by: { $0.sort < $1.sort }) {
            let led = d.kind == .led
            let all = led ? (t.ledFt[d.id] ?? 0) + (includeTentative ? (t.ledTentativeFt[d.id] ?? 0) : 0)
                : Double((t.counts[d.id] ?? 0) - (includeTentative ? 0 : (t.tentative[d.id] ?? 0)))
            guard all > 0 else { continue }
            let unit = led ? "LF" : "each"
            var rest = all
            for (pid, q) in (split[d.id] ?? [:]).sorted(by: { $0.key < $1.key }) {
                guard let p = byId[pid] else { continue }
                let n = min(rest, q.confirmed + (includeTentative ? q.tentative : 0))
                guard n > 0 else { continue }
                rest -= n
                push(p.brand.isEmpty ? noProduct : p.brand, "\(p.title) — \(d.name)", p.sku ?? "", (n * 10).rounded() / 10, unit, p.unitPrice, p.notes ?? "")
            }
            if rest > 0.0001 { push(noProduct, d.name, "", (rest * 10).rounded() / 10, unit, d.unitPrice) }
        }

        var ft: [String: Double] = [:]
        for (w, n) in t.wireFt { for c in expand(w) { ft[c, default: 0] += n } }
        var choices: [String: String] = [:]
        for (k, v) in b.project.productChoices ?? [:] { if let c = Cables.cableType(fromKey: k) { choices[c] = v } }
        for c in ft.keys.sorted() where c != "Unspecified" && c != "HDMI" && ft[c]! > 0 {
            let p = choices[c].flatMap { byId[$0] }
            let box = boxFt[c] ?? 1000
            let need = ft[c]!.rounded()
            let boxes = (ft[c]! / box).rounded(.up)
            let perFt = p?.unitPrice ?? wirePrices[c] ?? 0
            push(p.map { $0.brand.isEmpty ? noProduct : $0.brand } ?? noProduct, "\(p.map { $0.title + " " } ?? "")\(c) cable — \(num(box)) ft box", p?.sku ?? "",
                 boxes, "box", round2(perFt * box), "\(num(need)) ft needed · \(num(boxes * box - need)) ft left over")
        }

        let liveSheets = Set(b.liveSheets.map(\.id))
        var hdmi: [Double] = []
        for r in b.liveRuns where r.kind == .wire && liveSheets.contains(r.sheetId) {
            let n = r.cables.flatMap(expand).filter { $0 == "HDMI" }.count
            for _ in 0..<n { hdmi.append(Geometry.runLengthFt(r) ?? 0) }
        }
        if !hdmi.isEmpty {
            let p = choices["HDMI"].flatMap { byId[$0] }
            var counts: [Double: Int] = [:]
            for l in hdmi { counts[hdmiLengths.first { $0 >= l } ?? (l / 50).rounded(.up) * 50, default: 0] += 1 }
            for (stock, n) in counts.sorted(by: { $0.key < $1.key }) {
                push(p.map { $0.brand.isEmpty ? noProduct : $0.brand } ?? noProduct, "\(p.map { $0.title + " " } ?? "")HDMI cable — \(num(stock)) ft", p?.sku ?? "",
                     Double(n), "each", round2((p?.unitPrice ?? wirePrices["HDMI"] ?? 0) * stock), hdmi.contains(0) ? "Some HDMI runs have no length yet" : "")
            }
        }

        let ports = portSchedule(b, catalog: catalog, products: products).filter { includeTentative || !$0.tentative }
        let cat6 = ports.filter { $0.cable == "Cat6" }
        if !cat6.isEmpty {
            let closets = Set(cat6.compactMap(\.closetId))
            let panels = closets.reduce(0) { n, id in n + (cat6.filter { $0.closetId == id }.count + panelPorts - 1) / panelPorts }
            push(hardware, "Cat6 keystone jack", "", Double(cat6.count), "each", 0, "Device end")
            if panels > 0 { push(hardware, "\(panelPorts)-port Cat6 patch panel", "", Double(panels), "each", 0, "Per closet, from the port schedule") }
            push(hardware, "Cat6 patch cord", "", Double(cat6.count), "each", 0, "Patch panel to switch")
        }
        let coax = ports.filter { $0.cable == "Coax" }.count
        if coax > 0 { push(hardware, "Coax F-connector", "", Double(coax * 2), "each", 0, "Both ends") }
        return rows
    }

    public static func materialCSV(_ rows: [MaterialRow]) -> String {
        CSV.encode([["Supplier", "Item", "SKU", "Qty", "Unit", "Unit cost", "Total", "Note"]]
            + rows.map { [$0.supplier, $0.item, $0.sku, num($0.qty), $0.unit, num($0.unitCost), num($0.total), $0.note] })
    }
}
