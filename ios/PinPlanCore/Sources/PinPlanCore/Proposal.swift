import Foundation

/// A client proposal: a frozen copy of the estimate the client opens by link (the web app's /p page),
/// picks optional items, signs and accepts. Same JSON as src/lib/proposal.ts.
public struct ProposalSnapshot: Codable, Hashable, Sendable {
    public struct Business: Codable, Hashable, Sendable {
        public var name, address, phone, email, website: String
        public var tagline, logo, brandColor, accentColor, serviceArea: String?
    }
    public struct Client: Codable, Hashable, Sendable { public var name, email, phone, address: String }
    public struct Scope: Codable, Hashable, Sendable { public var label, value: String }
    public struct Floor: Codable, Hashable, Sendable {
        public struct Item: Codable, Hashable, Sendable { public var name, count: String }
        public var name: String
        public var image: String?
        public var items: [Item]
    }
    public struct Line: Codable, Hashable, Sendable, Identifiable {
        public var key: String
        public var description: String
        public var qty: Double
        public var unit: String
        public var unitPrice: Double
        public var total: Double
        public var group: LineGroup
        public var optional: Bool
        public var included: Bool
        public var id: String { key }
    }
    public enum Detail: String, Codable, Sendable, CaseIterable { case lines, sections }

    public var version = 1
    public var title: String
    public var message: String
    public var createdAt: String
    public var validUntil: String?
    public var currency: String
    public var taxPct: Double
    public var detail: Detail
    public var depositPct: Double?
    public var terms: String
    public var business: Business
    public var client: Client
    public var scope: [Scope]
    public var floors: [Floor]
    public var lines: [Line]
    /// "review": the plans only (no prices) for the client to check where everything goes; nil = a priced proposal.
    public var kind: String? = nil
    /// What each symbol on the plans means.
    public var legend: [LegendItem]? = nil
    public var isReview: Bool { kind == "review" }
}

/// One legend row for clients (same JSON as src/lib/legend.ts).
public struct LegendItem: Codable, Hashable, Sendable, Identifiable {
    public var key: String
    public var name: String
    public var description: String
    public var category: String
    public var icon: String?
    public var color: String?
    public var count: String
    public var id: String { key }
}

public enum Legend {
    /// Plain-English lines for homeowners; custom types fall back to their category.
    public static let descriptions: [String: String] = [
        "cam-indoor": "Security camera inside the home, viewable on your phone.",
        "cam-outdoor": "Weatherproof security camera on the outside of the home.",
        "vs": "Screen or wall-mounted iPad to view your cameras.",
        "wap": "Ceiling Wi-Fi access point for strong wireless coverage.",
        "net-switch": "Network switch that connects the wired devices.",
        "data-drop": "Wired internet jack (Cat6) in the wall.",
        "speaker": "Speaker built into the ceiling for music around the home.",
        "tv": "TV location, wired for picture, sound and internet.",
        "sh": "Smart-home control point (hub or controller location).",
        "keypad": "Wall keypad to control lights, scenes or shades.",
        "led-ceiling": "Hidden LED strip lighting in the ceiling moulding.",
        "led-furniture": "LED strip lighting built into furniture.",
        "led-cabinet": "LED strip lighting under or inside cabinets.",
        "led-bench": "LED strip lighting under a bench.",
        "led-bed": "LED backlight behind the bed.",
        "led-stair": "LED lights on the stair steps.",
        "led-spot-ceiling": "Small LED spotlight in the ceiling.",
        "led-driver": "LED power supply / lighting zone.",
        "shade": "Motorized curtain or shade.",
    ]
    static let categoryText: [Category: String] = [
        .security: "Security", .network: "Network", .audio: "Audio", .video: "Video", .smarthome: "Smart home",
        .lighting: "Lighting", .shades: "Shades", .infrastructure: "Equipment",
    ]

    /// Every symbol a client sees on the plans, in category order, with counts ("3", "2 + 1 optional", "45 LF").
    public static func build(takeoff: Takeoff, catalog: [DeviceType], icon: (DeviceType) -> String?) -> [LegendItem] {
        let t = takeoff.total
        var out: [(LegendItem, Int)] = []
        for d in catalog {
            let o = Category.allCases.firstIndex(of: d.category) ?? 99
            let cat = categoryText[d.category] ?? d.category.rawValue
            let desc = descriptions[d.id] ?? "\(cat) — \(d.name)."
            if d.kind == .led {
                let ft = t.ledFt[d.id] ?? 0, opt = t.ledTentativeFt[d.id] ?? 0
                guard ft > 0 || opt > 0 else { continue }
                let count = opt > 0 ? (ft > 0 ? "\(Wiring.num(ft)) LF + \(Wiring.num(opt)) LF optional" : "\(Wiring.num(opt)) LF optional") : "\(Wiring.num(ft)) LF"
                out.append((LegendItem(key: "led:\(d.id)", name: d.name, description: desc, category: cat, icon: nil, color: d.color, count: count), o))
                continue
            }
            let n = t.counts[d.id] ?? 0
            guard n > 0 else { continue }
            let opt = t.tentative[d.id] ?? 0, firm = n - opt
            let count = opt > 0 ? (firm > 0 ? "\(firm) + \(opt) optional" : "\(opt) optional") : "\(firm)"
            out.append((LegendItem(key: d.id, name: d.name, description: desc, category: cat, icon: icon(d), color: d.color, count: count), o))
        }
        for k in Catalog.closetKinds {
            let n = t.closets[k.id] ?? 0
            if n > 0 { out.append((LegendItem(key: "closet:\(k.id.rawValue)", name: k.name, description: "Where the equipment and cables come together.", category: "Equipment", icon: nil, color: k.color, count: "\(n)"), 100)) }
        }
        return out.enumerated().sorted { ($0.element.1, $0.offset) < ($1.element.1, $1.offset) }.map(\.element.0)
    }
}

public enum Proposals {
    /// Random link token (URL-safe, ~143 bits), same alphabet as the web app.
    public static func newToken() -> String {
        let alphabet = Array("abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789")
        var g = SystemRandomNumberGenerator()
        let body = String((0..<18).map { _ in alphabet[Int(g.next(upperBound: UInt32(alphabet.count)))] })
        return body + String(Int(Date().timeIntervalSince1970 * 1000), radix: 36).suffix(4)
    }

    static func round2(_ v: Double) -> Double { (v * 100).rounded() / 100 }

    public static func snapshot(bundle b: ProjectBundle, catalog: [DeviceType], takeoff: Takeoff, estimate: Estimate, business: BusinessSettings,
                                currency: String, taxPct: Double, title: String = "", message: String = "", validDays: Int?,
                                detail: ProposalSnapshot.Detail, depositPct: Double?, images: [String: String] = [:], origin: String? = nil, now: Date = Date(),
                                review: Bool = false, legend: [LegendItem]? = nil) -> ProposalSnapshot {
        func name(_ id: String) -> String { catalog.first { $0.id == id }?.name ?? id }
        let t = takeoff.total
        let devices = t.counts.values.reduce(0, +) - t.tentative.values.reduce(0, +)
        var scope = [ProposalSnapshot.Scope(label: "Floors", value: "\(takeoff.floors.count)"), .init(label: "Devices", value: "\(devices)")]
        if t.ledTotalFt > 0 { scope.append(.init(label: "LED lighting", value: "\(Wiring.num(t.ledTotalFt)) LF")) }
        let floors = takeoff.floors.map { f -> ProposalSnapshot.Floor in
            var items = f.bucket.counts.filter { $0.value > 0 }.sorted { $0.key < $1.key }.map { id, n -> ProposalSnapshot.Floor.Item in
                let opt = f.bucket.tentative[id] ?? 0, firm = n - opt
                return .init(name: name(id), count: opt > 0 ? (firm > 0 ? "\(firm) (+\(opt) optional)" : "\(opt) optional") : "\(firm)")
            }
            items += f.bucket.ledFt.filter { $0.value > 0 }.sorted { $0.key < $1.key }.map { .init(name: name($0.key), count: "\(Wiring.num($0.value)) LF") }
            return .init(name: f.name, image: images[f.sheetId], items: items)
        }
        let lines: [ProposalSnapshot.Line] = review ? [] : estimate.lines.filter { $0.qty != 0 || $0.total != 0 }.map { l in
            ProposalSnapshot.Line(key: l.key, description: l.description.replacingOccurrences(of: " (optional — marked ?)", with: ""), qty: l.qty, unit: l.unit,
                                  unitPrice: l.unitPrice, total: round2(l.total), group: l.group, optional: l.optional, included: l.optional && l.included)
        }
        let iso = ISO8601DateFormatter()
        iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let day = ISO8601DateFormatter()
        day.formatOptions = [.withFullDate]
        let p = b.project
        let t0 = title.trimmingCharacters(in: .whitespaces)
        return ProposalSnapshot(
            title: t0.isEmpty ? "\(review ? "Preliminary plan" : "Proposal") — \(p.address.isEmpty ? (p.clientName.isEmpty ? "your project" : p.clientName) : p.address)" : t0,
            message: message.trimmingCharacters(in: .whitespacesAndNewlines), createdAt: iso.string(from: now),
            validUntil: review ? nil : validDays.flatMap { $0 > 0 ? day.string(from: now.addingTimeInterval(Double($0) * 86400)) : nil },
            currency: currency, taxPct: review ? 0 : taxPct, detail: detail, depositPct: review ? nil : depositPct.flatMap { $0 > 0 && $0 < 100 ? $0 : nil },
            terms: review ? "" : business.estimateTerms,
            business: .init(name: business.name, address: business.address, phone: business.phone, email: business.email, website: business.website,
                            tagline: business.tagline, logo: absolute(business.logo, origin: origin), brandColor: business.brandColor,
                            accentColor: business.accentColor, serviceArea: business.serviceArea),
            client: .init(name: p.clientName, email: p.clientEmail ?? "", phone: p.clientPhone ?? "", address: p.address),
            scope: scope, floors: floors, lines: lines, kind: review ? "review" : nil, legend: (legend?.isEmpty ?? true) ? nil : legend)
    }

    /// "/brand/logo.png" on the PinPlan server → full URL (the client page loads it from there).
    static func absolute(_ path: String?, origin: String?) -> String? {
        guard let path, path.hasPrefix("/"), let origin, !origin.isEmpty else { return path }
        var o = origin.trimmingCharacters(in: .whitespaces)
        if !o.hasPrefix("http") { o = "https://" + o }
        while o.hasSuffix("/") { o.removeLast() }
        return o + path
    }

    /// Totals for a set of chosen optional line keys (matches the server's respond_proposal).
    public static func totals(_ s: ProposalSnapshot, chosen: Set<String>) -> (subtotal: Double, tax: Double, total: Double, deposit: Double?) {
        let sub = round2(s.lines.filter { !$0.optional || chosen.contains($0.key) }.reduce(0) { $0 + $1.total })
        let tax = round2(sub * s.taxPct / 100)
        let total = round2(sub + tax)
        return (sub, tax, total, s.depositPct.map { round2(total * $0 / 100) })
    }

    public static func url(base: String, token: String) -> String {
        var b = base.trimmingCharacters(in: .whitespaces)
        if !b.hasPrefix("http") { b = "https://" + b }
        while b.hasSuffix("/") { b.removeLast() }
        return "\(b)/p?t=\(token)"
    }
}
