import Foundation

public enum LineGroup: String, CaseIterable, Codable, Sendable { case devices, lighting, wire, labor, infrastructure, custom
    public var title: String {
        switch self {
        case .devices: return "Devices"
        case .lighting: return "Lighting"
        case .wire: return "Wire"
        case .labor: return "Labor"
        case .infrastructure: return "Infrastructure"
        case .custom: return "Other"
        }
    }
}

public struct ComputedLine: Hashable, Identifiable, Codable, Sendable {
    public var key: String
    public var description: String
    public var qty: Double
    public var unit: String
    public var unitPrice: Double
    public var total: Double
    /// Tentative (?) items are optional: listed, counted only when included.
    public var optional: Bool
    public var included: Bool
    public var deviceTypeId: String?
    public var group: LineGroup
    public var overridden: Bool
    public var id: String { key }
}

public struct Estimate: Hashable, Sendable {
    public var lines: [ComputedLine]
    public var subtotal: Double
    public var tax: Double
    public var total: Double
    public var optionalTotal: Double
}

private func money(_ v: Double) -> Double { (v * 100).rounded() / 100 }

public enum EstimateBuilder {
    public static func build(takeoff: Takeoff, catalog: [DeviceType], pricing: PricingSettings, overrides: [EstimateLine] = []) -> Estimate {
        let t = takeoff.total
        let mk = 1 + pricing.markupPct / 100
        var base: [ComputedLine] = []
        func push(_ key: String, _ desc: String, _ qty: Double, _ unit: String, _ price: Double, optional: Bool, _ group: LineGroup, _ dt: String? = nil) {
            base.append(ComputedLine(key: key, description: desc, qty: qty, unit: unit, unitPrice: price, total: 0, optional: optional,
                                     included: !optional, deviceTypeId: dt, group: group, overridden: false))
        }
        let sorted = catalog.sorted { $0.sort < $1.sort }
        let combined = pricing.laborMode == .combined
        let suffix = combined ? " — installed" : ""
        func price(_ d: DeviceType) -> Double { combined ? d.unitPrice * mk + d.laborPrice : d.unitPrice * mk }
        func qty(_ d: DeviceType) -> (confirmed: Double, tentative: Double) {
            if d.kind == .led { return (t.ledFt[d.id] ?? 0, t.ledTentativeFt[d.id] ?? 0) }
            let all = Double(t.counts[d.id] ?? 0), tent = Double(t.tentative[d.id] ?? 0)
            return (all - tent, tent)
        }

        for d in sorted {
            let q = qty(d)
            let unit = d.unit == .LF ? "LF" : "each"
            let group: LineGroup = d.kind == .led ? .lighting : .devices
            if q.confirmed > 0 { push("dev:\(d.id)", d.name + suffix, q.confirmed, unit, price(d), optional: false, group, d.id) }
            if q.tentative > 0 { push("opt:\(d.id)", "\(d.name)\(suffix) (optional — marked ?)", q.tentative, unit, price(d), optional: true, group, d.id) }
        }
        if let un = t.ledFt["led-unassigned"], un > 0 { push("dev:led-unassigned", "LED strip", un, "LF", 0, optional: false, .lighting) }
        for wt in t.wireFt.keys.sorted() {
            let ft = t.wireFt[wt]!
            if ft > 0 { push("wire:\(wt)", "\(wt) cable (home runs: \(t.wireRuns[wt] ?? 0))", ft, "ft", (pricing.wirePrices[wt] ?? 0) * mk, optional: false, .wire) }
        }
        for k in ClosetKind.allCases where (t.closets[k] ?? 0) > 0 {
            push("closet:\(k.rawValue)", Catalog.closetInfo(k).name, Double(t.closets[k]!), "each", 0, optional: false, .infrastructure)
        }
        if !combined {
            for d in sorted where d.laborPrice > 0 {
                let q = qty(d)
                let unit = d.unit == .LF ? "LF" : "each"
                if q.confirmed > 0 { push("labor:\(d.id)", "Labor — \(d.name)", q.confirmed, unit, d.laborPrice, optional: false, .labor, d.id) }
                if q.tentative > 0 { push("optlabor:\(d.id)", "Labor — \(d.name) (optional — marked ?)", q.tentative, unit, d.laborPrice, optional: true, .labor, d.id) }
            }
        }

        let live = overrides.filter { $0.deleted != true }
        let byKey = Dictionary(live.map { ($0.key, $0) }, uniquingKeysWith: { _, b in b })
        var lines: [ComputedLine] = []
        for var l in base {
            let o = byKey[l.key]
            if o?.removed == true { continue }
            if let o {
                if let d = o.description, !d.isEmpty { l.description = d }
                if let q = o.qty { l.qty = q }
                if let u = o.unit, !u.isEmpty { l.unit = u }
                if let p = o.unitPrice { l.unitPrice = p }
                l.overridden = o.description != nil || o.qty != nil || o.unitPrice != nil || (o.unit?.isEmpty == false)
            }
            l.included = l.optional ? (o?.include ?? pricing.includeTentative) : true
            lines.append(l)
        }
        for o in live.sorted(by: { ($0.sort ?? 0) < ($1.sort ?? 0) }) where o.key.hasPrefix("custom:") && o.removed != true {
            lines.append(ComputedLine(key: o.key, description: o.description ?? "Custom item", qty: o.qty ?? 1, unit: o.unit ?? "each",
                                      unitPrice: o.unitPrice ?? 0, total: 0, optional: false, included: true, deviceTypeId: nil, group: .custom, overridden: true))
        }
        var subtotal = 0.0, optionalTotal = 0.0
        for i in lines.indices {
            lines[i].unitPrice = money(lines[i].unitPrice)
            lines[i].total = money(lines[i].qty * lines[i].unitPrice)
            if lines[i].included { subtotal += lines[i].total } else { optionalTotal += lines[i].total }
        }
        subtotal = money(subtotal)
        let tax = money(subtotal * pricing.taxPct / 100)
        return Estimate(lines: lines, subtotal: subtotal, tax: tax, total: money(subtotal + tax), optionalTotal: money(optionalTotal))
    }

    public static func csv(_ e: Estimate) -> String {
        var rows: [[String]] = [["Description", "Qty", "Unit", "Unit price", "Total", "Included"]]
        for l in e.lines { rows.append([l.description, String(l.qty), l.unit, String(format: "%.2f", l.unitPrice), String(format: "%.2f", l.total), l.included ? "yes" : "optional"]) }
        rows.append(["Subtotal", "", "", "", String(format: "%.2f", e.subtotal), ""])
        rows.append(["Tax", "", "", "", String(format: "%.2f", e.tax), ""])
        rows.append(["Total", "", "", "", String(format: "%.2f", e.total), ""])
        return CSV.encode(rows)
    }
}

public enum Money {
    public static func format(_ v: Double, currency: String = "USD") -> String {
        let f = NumberFormatter()
        f.numberStyle = .currency
        f.currencyCode = currency
        f.locale = Locale(identifier: "en_US")
        return f.string(from: NSNumber(value: v)) ?? String(format: "%.2f %@", v, currency)
    }
}
