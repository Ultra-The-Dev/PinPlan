import Foundation

/// A client proposal: a frozen copy of the estimate the client opens by link (the web app's /p page),
/// picks optional items, signs and accepts. Same JSON as src/lib/proposal.ts.
public struct ProposalSnapshot: Codable, Hashable, Sendable {
    public struct Business: Codable, Hashable, Sendable { public var name, address, phone, email, website: String }
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
                                detail: ProposalSnapshot.Detail, depositPct: Double?, images: [String: String] = [:], now: Date = Date()) -> ProposalSnapshot {
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
        let lines = estimate.lines.filter { $0.qty != 0 || $0.total != 0 }.map { l in
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
            title: t0.isEmpty ? "Proposal — \(p.address.isEmpty ? (p.clientName.isEmpty ? "your project" : p.clientName) : p.address)" : t0,
            message: message.trimmingCharacters(in: .whitespacesAndNewlines), createdAt: iso.string(from: now),
            validUntil: validDays.flatMap { $0 > 0 ? day.string(from: now.addingTimeInterval(Double($0) * 86400)) : nil },
            currency: currency, taxPct: taxPct, detail: detail, depositPct: depositPct.flatMap { $0 > 0 && $0 < 100 ? $0 : nil },
            terms: business.estimateTerms,
            business: .init(name: business.name, address: business.address, phone: business.phone, email: business.email, website: business.website),
            client: .init(name: p.clientName, email: p.clientEmail ?? "", phone: p.clientPhone ?? "", address: p.address),
            scope: scope, floors: floors, lines: lines)
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
