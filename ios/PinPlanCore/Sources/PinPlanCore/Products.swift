import Foundation

/// A specific product (brand + model) that can be installed for a device type, e.g. a Ubiquiti G5 Turret for
/// "Indoor camera". Jobs pick one per device type; single devices can use another.
public struct Product: Codable, Hashable, Identifiable, Sendable {
    public var id: String
    public var deviceTypeId: String
    public var brand: String
    public var model: String
    public var sku: String?
    /// Material cost per unit (each, or per LF for LED types).
    public var unitPrice: Double
    public var laborPrice: Double
    public var notes: String?
    public var archived: Bool?
    public var updatedAt: String
    /// Soft-deleted (from the web app, via cloud sync): never prices anything.
    public var deleted: Bool?

    public init(id: String = newId(), deviceTypeId: String, brand: String, model: String, sku: String? = nil,
                unitPrice: Double = 0, laborPrice: Double = 0, notes: String? = nil) {
        self.id = id; self.deviceTypeId = deviceTypeId; self.brand = brand; self.model = model; self.sku = sku
        self.unitPrice = unitPrice; self.laborPrice = laborPrice; self.notes = notes; self.updatedAt = isoNow()
    }

    /// "Ubiquiti G5 Turret"
    public var title: String {
        let t = [brand, model].map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }.joined(separator: " ")
        return t.isEmpty ? "Unnamed product" : t
    }

    /// Estimate line order: title (case-insensitive), then id — same as the web app's compareProducts.
    public static func ordered(_ a: Product, _ b: Product) -> Bool {
        let ta = a.title.lowercased(), tb = b.title.lowercased()
        return ta != tb ? ta < tb : a.id < b.id
    }
}

public enum ProductAssignment {
    /// The product behind an estimate line (for its SKU in Billdu): "prod:<id>" / "optprod:<id>", or the job's cable product
    /// for "wire:<type>" when it really is a product for that cable. Same as the web app's lineProductId.
    public static func lineProductId(_ key: String, project: Project, products: [Product]) -> String? {
        var id: String?
        var wantType: String?
        if key.hasPrefix("prod:") || key.hasPrefix("optprod:"), let colon = key.firstIndex(of: ":") {
            id = String(key[key.index(after: colon)...])
        } else if key.hasPrefix(Cables.productPrefix) {
            id = project.productChoices?[key]
            wantType = key
        }
        guard let id, !id.isEmpty, let p = products.first(where: { $0.id == id && $0.deleted != true }) else { return nil }
        if let wantType, p.deviceTypeId != wantType { return nil }
        return p.id
    }

    /// SKU to show as the item code in Billdu for an estimate line, if its product has one.
    public static func lineSku(_ key: String, project: Project, products: [Product]) -> String? {
        guard let pid = lineProductId(key, project: project, products: products),
              let sku = products.first(where: { $0.id == pid })?.sku?.trimmingCharacters(in: .whitespaces), !sku.isEmpty else { return nil }
        return sku
    }

    /// The product a device uses: its own choice, else the job's choice for its type (only if it fits the type).
    public static func productId(for m: Marker, project: Project, products: [Product]) -> String? {
        let byId = Dictionary(products.map { ($0.id, $0) }, uniquingKeysWith: { a, _ in a })
        for id in [m.productId, project.productChoices?[m.deviceTypeId]].compactMap({ $0 }) {
            if let p = byId[id], p.deleted != true, p.deviceTypeId == m.deviceTypeId { return id }
        }
        return nil
    }

    /// Per device type: quantities by product id, split into confirmed and tentative (? ) parts.
    /// Devices count one each; LED types use the job's product for their whole length.
    public static func split(_ b: ProjectBundle, takeoff: Takeoff, catalog: [DeviceType], products: [Product]) -> [String: [String: (confirmed: Double, tentative: Double)]] {
        var out: [String: [String: (confirmed: Double, tentative: Double)]] = [:]
        let liveSheets = Set(b.liveSheets.map(\.id))
        for m in b.liveMarkers where liveSheets.contains(m.sheetId) {
            guard let pid = productId(for: m, project: b.project, products: products) else { continue }
            var e = out[m.deviceTypeId, default: [:]][pid] ?? (0, 0)
            let q = Double(m.quantity)
            if m.tentative { e.tentative += q } else { e.confirmed += q }
            out[m.deviceTypeId, default: [:]][pid] = e
        }
        for d in catalog where d.kind == .led {
            guard let pid = b.project.productChoices?[d.id], products.contains(where: { $0.id == pid && $0.deviceTypeId == d.id && $0.deleted != true }) else { continue }
            let c = takeoff.total.ledFt[d.id] ?? 0, t = takeoff.total.ledTentativeFt[d.id] ?? 0
            if c > 0 || t > 0 { out[d.id, default: [:]][pid] = (c, t) }
        }
        return out
    }
}

public extension ProjectBundle {
    /// The job's estimate: takeoff × prices, using the chosen products where set.
    func estimate(catalog: [DeviceType], products: [Product], pricing: PricingSettings) -> Estimate {
        let t = TakeoffCalculator.compute(self)
        var cables: [String: String] = [:]
        for (k, v) in project.productChoices ?? [:] where k.hasPrefix(Cables.productPrefix) { cables[String(k.dropFirst(Cables.productPrefix.count))] = v }
        return EstimateBuilder.build(takeoff: t, catalog: catalog, pricing: pricing, overrides: estimateLines,
                                     products: products, split: ProductAssignment.split(self, takeoff: t, catalog: catalog, products: products),
                                     cableChoices: cables)
    }

    /// Choose the product for a device type on this job (nil = none, price from the device type).
    mutating func setProductChoice(typeId: String, productId: String?) {
        var c = project.productChoices ?? [:]
        c[typeId] = productId
        project.productChoices = c.isEmpty ? nil : c
        project.updatedAt = isoNow()
    }
}

/// Price lists from a spreadsheet: one product per row. Columns are found by their header (any order):
/// type / device, brand / manufacturer, model, sku / part, price / cost, labor, notes.
public enum ProductCSV {
    public struct Result: Sendable { public var products: [Product]; public var skipped: [String] }

    public static func parse(_ text: String, catalog: [DeviceType]) -> Result {
        let rows = CSV.parse(text).filter { !$0.allSatisfy { $0.trimmingCharacters(in: .whitespaces).isEmpty } }
        guard let header = rows.first else { return Result(products: [], skipped: []) }
        let h = header.map { $0.lowercased().trimmingCharacters(in: .whitespaces) }
        func col(_ names: [String]) -> Int? { h.firstIndex { cell in names.contains { cell.contains($0) } } }
        let cType = col(["type", "device", "category"]), cBrand = col(["brand", "manufacturer", "make"]), cModel = col(["model"])
        let cSku = col(["sku", "part"]), cPrice = col(["price", "cost"]), cLabor = col(["labor", "labour", "install"]), cNotes = col(["note", "spec"])
        var products: [Product] = []
        var skipped: [String] = []
        for (i, r) in rows.dropFirst().enumerated() {
            func v(_ c: Int?) -> String { c.flatMap { $0 < r.count ? r[$0].trimmingCharacters(in: .whitespaces) : nil } ?? "" }
            let typeText = v(cType)
            guard let typeKey = Cables.matchCable(typeText).map(Cables.productKey) ?? matchType(typeText, catalog: catalog)?.id else {
                skipped.append("Row \(i + 2): unknown device or cable type “\(typeText)”"); continue
            }
            let brand = v(cBrand), model = v(cModel)
            guard !(brand.isEmpty && model.isEmpty) else { skipped.append("Row \(i + 2): no brand or model"); continue }
            products.append(Product(deviceTypeId: typeKey, brand: brand, model: model, sku: v(cSku).isEmpty ? nil : v(cSku),
                                    unitPrice: number(v(cPrice)), laborPrice: number(v(cLabor)), notes: v(cNotes).isEmpty ? nil : v(cNotes)))
        }
        return Result(products: products, skipped: skipped)
    }

    /// Device type by id, abbreviation, symbol or name (case-insensitive; also partial name matches like "camera").
    public static func matchType(_ text: String, catalog: [DeviceType]) -> DeviceType? {
        let t = text.lowercased().trimmingCharacters(in: .whitespaces)
        guard !t.isEmpty else { return nil }
        let live = catalog.filter { $0.archived != true }
        return live.first { $0.id.lowercased() == t || $0.abbrev.lowercased() == t || $0.symbol.lowercased() == t || $0.name.lowercased() == t }
            ?? live.first { $0.name.lowercased().hasPrefix(t) }
            ?? live.first { $0.name.lowercased().contains(t) }
    }

    static func number(_ s: String) -> Double {
        Double(s.replacingOccurrences(of: "$", with: "").replacingOccurrences(of: ",", with: "").trimmingCharacters(in: .whitespaces)) ?? 0
    }

    public static func template(catalog: [DeviceType]) -> String {
        var rows = [["Device type", "Brand", "Model", "SKU", "Price", "Labor", "Notes"]]
        if let cam = catalog.first(where: { $0.id == "cam-indoor" }) { rows.append([cam.name, "Ubiquiti", "G5 Turret Ultra", "UVC-G5-Turret-Ultra", "129", "85", ""]) }
        if let wap = catalog.first(where: { $0.id == "wap" }) { rows.append([wap.name, "Ubiquiti", "U7 Pro", "U7-Pro", "189", "95", ""]) }
        return CSV.encode(rows)
    }
}

public extension CSV {
    /// RFC 4180-style parsing: quoted fields, doubled quotes, commas/newlines inside quotes; tabs also separate (pasted from a spreadsheet).
    static func parse(_ text: String) -> [[String]] {
        let sep: Character = text.contains("\t") && !text.contains(",") ? "\t" : ","
        var rows: [[String]] = [], row: [String] = [], field = "", inQuotes = false
        var it = Array(text.replacingOccurrences(of: "\r\n", with: "\n"))
        var i = 0
        while i < it.count {
            let c = it[i]
            if inQuotes {
                if c == "\"" {
                    if i + 1 < it.count, it[i + 1] == "\"" { field.append("\""); i += 1 } else { inQuotes = false }
                } else { field.append(c) }
            } else if c == "\"" { inQuotes = true }
            else if c == sep { row.append(field); field = "" }
            else if c == "\n" { row.append(field); rows.append(row); row = []; field = "" }
            else { field.append(c) }
            i += 1
        }
        if !field.isEmpty || !row.isEmpty { row.append(field); rows.append(row) }
        it.removeAll()
        return rows
    }
}
