import Foundation

// A company's setup in the cloud, so a new iPhone or iPad gets it back on sign-in (mirrors src/lib/companySettings.ts
// and src/lib/companyPreferences.ts; schema in supabase/migrations/20261124100600_company_settings.sql and
// 20261125004000_company_preferences.sql):
//   company_settings columns       the business details: name, phone, email, website, address, quote terms, logo
//   company_settings.preferences   (the whole team reads) branding, takeoff, checklist / form templates, install photo
//                                  rules, and the trades of someone working alone (a team keeps them on the team row)
//   document_settings.preferences  (the office only) pricing and the Billdu document type
// The device keeps its copy in its settings. Newest change wins; technicians only read. Pure logic only: the calls are
// in the app (CloudSync).

// MARK: - business details

/// The business details every quote, invoice and report carries (company_settings' columns).
public struct CompanyDetails: Codable, Equatable, Sendable {
    public var name: String
    public var phone: String
    public var email: String
    public var website: String
    public var address: String
    /// Standard terms on quotes (BusinessSettings.estimateTerms).
    public var terms: String
    /// A site path, https URL or data: URL (BusinessSettings.logo).
    public var logo: String
    public var logoImageId: String?

    public init(name: String = "", phone: String = "", email: String = "", website: String = "", address: String = "",
                terms: String = "", logo: String = "", logoImageId: String? = nil) {
        self.name = name; self.phone = phone; self.email = email; self.website = website; self.address = address
        self.terms = terms; self.logo = logo; self.logoImageId = logoImageId
    }

    /// The company part of this device's business settings.
    public init(business b: BusinessSettings) {
        let ws = CharacterSet.whitespacesAndNewlines
        self.init(name: b.name.trimmingCharacters(in: ws), phone: b.phone.trimmingCharacters(in: ws),
                  email: b.email.trimmingCharacters(in: ws), website: b.website.trimmingCharacters(in: ws),
                  address: b.address.trimmingCharacters(in: ws), terms: b.estimateTerms, logo: b.logo ?? "")
    }

    /// A company_settings row.
    public init(row r: [String: Any]) {
        func s(_ k: String) -> String { r[k] as? String ?? "" }
        let image: String? = r["logo_image_id"] as? String
        self.init(name: s("business_name"), phone: s("phone"), email: s("email"), website: s("website"),
                  address: s("address"), terms: s("terms"), logo: s("logo"),
                  logoImageId: (image ?? "").isEmpty ? nil : image)
    }

    /// This device's business settings with the company's details put in (branding is a preference section).
    public func applied(to b: BusinessSettings) -> BusinessSettings {
        var out = b
        out.name = name; out.phone = phone; out.email = email; out.website = website; out.address = address
        out.estimateTerms = terms
        out.logo = logo.isEmpty ? nil : logo
        return out
    }

    /// The row to send (lengths as the database allows; a logo too big for the row stays on this device).
    public func row(ownerId: String, updatedAt: String) -> [String: Any] {
        var r: [String: Any] = [
            "owner_id": ownerId,
            "business_name": String(name.prefix(200)),
            "phone": String(phone.prefix(60)),
            "email": String(email.prefix(254)),
            "website": String(website.prefix(300)),
            "address": String(address.prefix(500)),
            "terms": String(terms.prefix(20000)),
            "logo": logo.utf8.count <= 1_500_000 ? logo : "",
            "updated_at": updatedAt,
        ]
        r["logo_image_id"] = logoImageId ?? NSNull()
        return r
    }
}

extension CompanyDetails {
    /// As kept in the device's record of what it synced: a long logo (an uploaded image as a data: URL, up to 1.5 MB)
    /// is kept as a fingerprint, so the record stays small.
    public var forMark: CompanyDetails {
        guard logo.utf8.count > 300 else { return self }
        var out = self
        out.logo = "fingerprint:" + CompanyPrefs.fingerprint(logo)
        return out
    }
}

public enum CompanySyncAction: String, Sendable { case push, pull, none }

/// What this device last synced of the business details, per account.
public struct CompanyDetailsMark: Codable, Equatable, Sendable {
    public var userId: String
    public var updatedAt: String
    public var values: CompanyDetails
    public init(userId: String, updatedAt: String, values: CompanyDetails) {
        self.userId = userId; self.updatedAt = updatedAt; self.values = values
    }
}

public enum CompanySync {
    /// Same rule as the web app's companySyncAction.
    public static func detailsAction(local: CompanyDetails, localSavedAt: String?, mark: CompanyDetailsMark?,
                                     remote: CompanyDetails?, remoteUpdatedAt: String?, canWrite: Bool) -> CompanySyncAction {
        let changedHere: Bool = mark == nil || mark?.values != local.forMark
        // Only a business with its own name is worth sending; a blank device just takes the company's.
        let worthSending: Bool = canWrite && changedHere && !local.name.isEmpty
        guard let remote else { return worthSending ? .push : .none }
        if remote == local { return .none }
        if !worthSending { return .pull }
        // First sync for this account on this device: the company's copy wins.
        if mark == nil && !remote.name.isEmpty { return .pull }
        let localAt: Date = parseTime(localSavedAt) ?? .distantPast
        let remoteAt: Date = parseTime(remoteUpdatedAt) ?? .distantPast
        return localAt > remoteAt ? .push : .pull
    }

    /// An ISO time from either app or the database ("2026-11-20T10:00:00.000Z", "2026-11-20T10:00:00+00:00").
    public static func parseTime(_ s: String?) -> Date? {
        guard let s, !s.isEmpty else { return nil }
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let d = f.date(from: s) { return d }
        f.formatOptions = [.withInternetDateTime]
        if let d = f.date(from: s) { return d }
        // Postgres can give microseconds: keep three digits.
        if let dot = s.firstIndex(of: "."), let end = s[dot...].firstIndex(where: { $0 == "Z" || $0 == "+" || $0 == "-" }) {
            let frac = s[s.index(after: dot)..<end]
            let trimmed = String(s[..<dot]) + "." + String(frac.prefix(3)) + String(s[end...])
            f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            return f.date(from: trimmed)
        }
        return nil
    }
}

// MARK: - preference sections

public enum PrefKey: String, CaseIterable, Codable, Sendable {
    case branding, takeoff, checklistTemplates, formTemplates, installPhotoRequired, trades, pricing, billduDocType
    /// Office only (document_settings): prices never reach technicians.
    public var office: Bool { self == .pricing || self == .billduDocType }
}

public struct BrandingPrefs: Codable, Equatable, Sendable {
    public var tagline: String
    public var brandColor: String
    public var accentColor: String
    public var serviceArea: String
    public init(tagline: String = "", brandColor: String = "", accentColor: String = "", serviceArea: String = "") {
        self.tagline = tagline; self.brandColor = brandColor; self.accentColor = accentColor; self.serviceArea = serviceArea
    }
    public init(business b: BusinessSettings) {
        self.init(tagline: b.tagline ?? "", brandColor: b.brandColor ?? "", accentColor: b.accentColor ?? "", serviceArea: b.serviceArea ?? "")
    }
    public init(from d: Decoder) throws {
        let c = try d.container(keyedBy: CodingKeys.self)
        tagline = (try? c.decodeIfPresent(String.self, forKey: .tagline)) ?? ""
        brandColor = (try? c.decodeIfPresent(String.self, forKey: .brandColor)) ?? ""
        accentColor = (try? c.decodeIfPresent(String.self, forKey: .accentColor)) ?? ""
        serviceArea = (try? c.decodeIfPresent(String.self, forKey: .serviceArea)) ?? ""
    }
    public func applied(to b: BusinessSettings) -> BusinessSettings {
        var out = b
        out.tagline = tagline; out.brandColor = brandColor; out.accentColor = accentColor; out.serviceArea = serviceArea
        return out
    }
}

public struct TakeoffPrefs: Codable, Equatable, Sendable {
    public var wireSlackPct: Double
    public var wireDropFt: Double
    public var floorHeightFt: Double
    public init(_ p: PricingSettings) { wireSlackPct = p.wireSlackPct; wireDropFt = p.wireDropFt; floorHeightFt = p.floorHeightFt }
}

/// The office part of the pricing settings.
public struct OfficePricing: Codable, Equatable, Sendable {
    public var markupPct: Double
    public var taxPct: Double
    public var laborMode: String
    public var wirePrices: [String: Double]
    public var includeTentative: Bool
    public var currency: String
    public init(_ p: PricingSettings) {
        markupPct = p.markupPct; taxPct = p.taxPct; laborMode = p.laborMode.rawValue; wirePrices = p.wirePrices
        includeTentative = p.includeTentative; currency = p.currency
    }
}

/// Everything the preference sections carry, as this device has it.
public struct CompanyPrefsValues: Equatable, Sendable {
    public var business: BusinessSettings
    public var pricing: PricingSettings
    public var billduDocType: String
    public var checklistTemplates: [ChecklistTemplate]
    public var formTemplates: [FormTemplate]
    public var installPhotoRequired: [InstallStatus]
    public var trades: [String]

    public init(business: BusinessSettings, pricing: PricingSettings, billduDocType: String, checklistTemplates: [ChecklistTemplate]?,
                formTemplates: [FormTemplate]?, installPhotoRequired: [InstallStatus], trades: [String]?) {
        self.business = business
        self.pricing = pricing
        self.billduDocType = billduDocType
        self.checklistTemplates = FieldDocs.normalizeTemplates(checklistTemplates)
        self.formTemplates = Forms.normalizeTemplates(formTemplates)
        self.installPhotoRequired = installPhotoRequired
        self.trades = Trades.normalize(trades).map(\.rawValue)
    }

    /// What a fresh install has.
    public static var fresh: CompanyPrefsValues {
        CompanyPrefsValues(business: .neutral, pricing: Catalog.defaultPricing, billduDocType: "estimate", checklistTemplates: [],
                           formTemplates: [], installPhotoRequired: InstallProgress.defaultPhotoRequired, trades: nil)
    }
}

/// What this device last synced of each section, per account.
public struct CompanyPrefsMark: Codable, Equatable, Sendable {
    public struct Entry: Codable, Equatable, Sendable {
        public var updatedAt: String
        public var hash: String
        public init(updatedAt: String, hash: String) { self.updatedAt = updatedAt; self.hash = hash }
    }
    public var userId: String
    public var sections: [String: Entry]
    public init(userId: String, sections: [String: Entry] = [:]) { self.userId = userId; self.sections = sections }
}

/// What to take and what to send.
public struct CompanyPrefsPlan {
    /// This device's values with the pulled sections put in.
    public var values: CompanyPrefsValues
    public var pulled: Set<PrefKey> = []
    /// Sections to send ({"value": …, "updatedAt": …}), by key, to company_settings / document_settings.
    public var pushShared: [String: [String: Any]] = [:]
    public var pushOffice: [String: [String: Any]] = [:]
    public var mark: CompanyPrefsMark
    public init(values: CompanyPrefsValues, mark: CompanyPrefsMark) { self.values = values; self.mark = mark }
}

public enum CompanyPrefs {
    private static let encoder: JSONEncoder = {
        let e = JSONEncoder()
        e.outputFormatting = [.sortedKeys]
        return e
    }()

    /// A section's value as canonical JSON text (sorted keys), so equal values read the same.
    public static func json(_ key: PrefKey, _ v: CompanyPrefsValues) -> String {
        let data: Data?
        switch key {
        case .branding: data = try? encoder.encode(BrandingPrefs(business: v.business))
        case .takeoff: data = try? encoder.encode(TakeoffPrefs(v.pricing))
        case .checklistTemplates: data = try? encoder.encode(v.checklistTemplates)
        case .formTemplates: data = try? encoder.encode(v.formTemplates)
        case .installPhotoRequired: data = try? encoder.encode(v.installPhotoRequired.map(\.rawValue))
        case .trades: data = try? encoder.encode(v.trades)
        case .pricing: data = try? encoder.encode(OfficePricing(v.pricing))
        case .billduDocType: data = try? encoder.encode([v.billduDocType])
        }
        return data.flatMap { String(data: $0, encoding: .utf8) } ?? "null"
    }

    /// A section's value as a JSON object to send.
    public static func value(_ key: PrefKey, _ v: CompanyPrefsValues) -> Any {
        if key == .billduDocType { return v.billduDocType }
        let text = json(key, v)
        return (try? JSONSerialization.jsonObject(with: Data(text.utf8), options: [.fragmentsAllowed])) ?? NSNull()
    }

    /// Each entry decoded on its own, so one bad entry doesn't lose the rest.
    static func decodeEach<T: Decodable>(_ raw: Any?, as: T.Type) -> [T] {
        guard let list = raw as? [Any] else { return [] }
        var out: [T] = []
        for item in list {
            guard JSONSerialization.isValidJSONObject(item), let d = try? JSONSerialization.data(withJSONObject: item),
                  let t = try? JSONDecoder().decode(T.self, from: d) else { continue }
            out.append(t)
        }
        return out
    }

    static func number(_ raw: Any?, _ fallback: Double) -> Double {
        var d: Double? = nil
        if let x = raw as? Double { d = x } else if let x = raw as? Int { d = Double(x) } else if let x = raw as? NSNumber { d = x.doubleValue }
        guard let d, d.isFinite else { return fallback }
        return d
    }

    /// `v` with the cloud's value for `key` put in (checked: anything malformed falls back).
    public static func applying(_ key: PrefKey, raw: Any?, to v: CompanyPrefsValues) -> CompanyPrefsValues {
        var out = v
        let o: [String: Any] = raw as? [String: Any] ?? [:]
        switch key {
        case .branding:
            var b = BrandingPrefs()
            b.tagline = String((o["tagline"] as? String ?? "").prefix(500))
            b.brandColor = String((o["brandColor"] as? String ?? "").prefix(500))
            b.accentColor = String((o["accentColor"] as? String ?? "").prefix(500))
            b.serviceArea = String((o["serviceArea"] as? String ?? "").prefix(500))
            out.business = b.applied(to: v.business)
        case .takeoff:
            out.pricing.wireSlackPct = max(0, number(o["wireSlackPct"], v.pricing.wireSlackPct))
            out.pricing.wireDropFt = max(0, number(o["wireDropFt"], v.pricing.wireDropFt))
            out.pricing.floorHeightFt = max(0, number(o["floorHeightFt"], v.pricing.floorHeightFt))
        case .checklistTemplates:
            out.checklistTemplates = FieldDocs.normalizeTemplates(decodeEach(raw, as: ChecklistTemplate.self))
        case .formTemplates:
            out.formTemplates = Forms.normalizeTemplates(decodeEach(raw, as: FormTemplate.self))
        case .installPhotoRequired:
            var list: [InstallStatus] = []
            for s in raw as? [Any] ?? [] {
                if let str = s as? String, let st = InstallStatus(rawValue: str), !list.contains(st) { list.append(st) }
            }
            out.installPhotoRequired = raw is [Any] ? list : InstallProgress.defaultPhotoRequired
        case .trades:
            let list: [String] = (raw as? [Any] ?? []).compactMap { $0 as? String }
            out.trades = Trades.normalize(list).map(\.rawValue)
        case .pricing:
            out.pricing.markupPct = number(o["markupPct"], v.pricing.markupPct)
            out.pricing.taxPct = number(o["taxPct"], v.pricing.taxPct)
            if let m = o["laborMode"] as? String, let mode = LaborMode(rawValue: m) { out.pricing.laborMode = mode }
            if let w = o["wirePrices"] as? [String: Any] {
                var prices: [String: Double] = [:]
                for (k, p) in w {
                    let n = number(p, -1)
                    if !k.isEmpty, k.count <= 100, n >= 0 { prices[k] = n }
                }
                out.pricing.wirePrices = prices
            }
            if let t = o["includeTentative"] as? Bool { out.pricing.includeTentative = t }
            let currency = (o["currency"] as? String ?? "").trimmingCharacters(in: .whitespaces)
            if !currency.isEmpty { out.pricing.currency = String(currency.prefix(10)) }
        case .billduDocType:
            let t = raw as? String ?? ""
            out.billduDocType = ["order", "invoice"].contains(t) ? t : "estimate"
        }
        return out
    }

    /// Still what a fresh install has (never sent: a new device must not seed the company's copy with defaults).
    public static func isDefault(_ key: PrefKey, _ v: CompanyPrefsValues) -> Bool {
        let fresh = CompanyPrefsValues.fresh
        if key == .branding {
            // Blank fields show the defaults, so blank or default is the same untouched branding.
            let b = BrandingPrefs(business: v.business), d = BrandingPrefs(business: fresh.business)
            let pairs: [(String, String)] = [(b.tagline, d.tagline), (b.brandColor, d.brandColor), (b.accentColor, d.accentColor), (b.serviceArea, d.serviceArea)]
            return pairs.allSatisfy { $0.0.isEmpty || $0.0 == $0.1 }
        }
        return json(key, v) == json(key, fresh)
    }

    /// A short fingerprint of a section's text (FNV-1a, 64 bits). Only this device reads it.
    public static func fingerprint(_ text: String) -> String {
        var h: UInt64 = 0xcbf29ce484222325
        for b in text.utf8 {
            h ^= UInt64(b)
            h = h &* 0x100000001b3
        }
        return String(h, radix: 36)
    }

    /// Same rule as the web app's sectionAction.
    public static func action(local: String, isDefault: Bool, localSavedAt: String?, mark: CompanyPrefsMark.Entry?,
                              remote: String?, remoteUpdatedAt: String?, canWrite: Bool) -> CompanySyncAction {
        if let remote, remote == local { return .none }
        let changedHere: Bool = mark.map { $0.hash != fingerprint(local) } ?? !isDefault
        guard remote != nil else { return canWrite && changedHere ? .push : .none }
        if !canWrite || !changedHere { return .pull }
        if mark == nil { return .pull }
        let localAt: Date = CompanySync.parseTime(localSavedAt) ?? .distantPast
        let remoteAt: Date = CompanySync.parseTime(remoteUpdatedAt) ?? .distantPast
        return localAt > remoteAt ? .push : .pull
    }

    /// A section as the cloud stores it ({"value": …, "updatedAt": …}), or nil.
    public static func section(_ raw: Any?) -> (value: Any?, updatedAt: String)? {
        guard let o = raw as? [String: Any], o.keys.contains("value"), let at = o["updatedAt"] as? String,
              CompanySync.parseTime(at) != nil else { return nil }
        let v: Any? = o["value"] is NSNull ? nil : o["value"]
        return (v, at)
    }

    /// Work out, section by section, what to take and what to send.
    /// - office: document_settings.preferences, or nil when this device doesn't sync office sections (technicians,
    ///   no row yet, offline).
    /// - savedAt: when each section was last saved here (missing: `localSavedAt`).
    public static func plan(local: CompanyPrefsValues, localSavedAt: String?, savedAt: [PrefKey: String] = [:], mark: CompanyPrefsMark?,
                            userId: String, shared: [String: Any]?, office: [String: Any]?, canWrite: Bool, trades: Bool) -> CompanyPrefsPlan {
        let ownMark: CompanyPrefsMark? = mark?.userId == userId ? mark : nil
        var plan = CompanyPrefsPlan(values: local, mark: ownMark ?? CompanyPrefsMark(userId: userId))
        let fallback: String = localSavedAt ?? "1970-01-01T00:00:00.000Z"
        for key in PrefKey.allCases {
            if key == .trades && !trades { continue }
            if key.office && office == nil { continue }
            let source: [String: Any]? = key.office ? office : shared
            let text: String = json(key, local)
            let found = section(source?[key.rawValue])
            var remoteText: String? = nil
            if let found { remoteText = json(key, applying(key, raw: found.value, to: local)) }
            let at: String = savedAt[key] ?? fallback
            let act = action(local: text, isDefault: isDefault(key, local), localSavedAt: at, mark: ownMark?.sections[key.rawValue],
                             remote: remoteText, remoteUpdatedAt: found?.updatedAt, canWrite: canWrite)
            switch act {
            case .push:
                let s: [String: Any] = ["value": value(key, local), "updatedAt": at]
                if key.office { plan.pushOffice[key.rawValue] = s } else { plan.pushShared[key.rawValue] = s }
                plan.mark.sections[key.rawValue] = .init(updatedAt: at, hash: fingerprint(text))
            case .pull:
                guard let found, let remoteText else { continue }
                plan.values = applying(key, raw: found.value, to: plan.values)
                plan.pulled.insert(key)
                plan.mark.sections[key.rawValue] = .init(updatedAt: found.updatedAt, hash: fingerprint(remoteText))
            case .none:
                if let found { plan.mark.sections[key.rawValue] = .init(updatedAt: found.updatedAt, hash: fingerprint(text)) }
            }
        }
        return plan
    }
}
