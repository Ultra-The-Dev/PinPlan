import Foundation

// Domain models. Field names match the web app's JSON (camelCase) so backups are interchangeable.
// Positions (x, y, points) are relative to the sheet image (0…1).

/// Device categories: one fixed superset shared with the web app and the database (see docs/trades.md).
/// Decoding is tolerant: an id this build doesn't know (from a newer app) reads as `.general` instead of failing the row.
public enum Category: String, Codable, CaseIterable, Sendable, Identifiable {
    case security, network, audio, video, smarthome, lighting, shades, infrastructure
    // Other trades (Trades.swift).
    case power, switching, panels, fire, hvac, plumbing, solar, ev, general
    public var id: String { rawValue }
    public init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = Category(rawValue: raw) ?? .general
    }
}

/// Trades the crew can show/hide: one per category plus wiring. Unknown ids read as `.general`.
public enum Layer: String, Codable, CaseIterable, Sendable, Identifiable {
    case security, network, audio, video, smarthome, lighting, shades, infrastructure
    case power, switching, panels, fire, hvac, plumbing, solar, ev, general
    case wiring
    public var id: String { rawValue }
    public init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = Layer(rawValue: raw) ?? .general
    }
}

public enum MeasureUnit: String, Codable, Sendable { case each, LF }
public enum Mount: String, Codable, CaseIterable, Sendable { case ceiling, wall, exterior, floor, cabinet, other }
public enum MarkerShape: String, Codable, CaseIterable, Sendable { case circle, square, triangle, diamond, hexagon, star }
public enum ProjectStatus: String, Codable, CaseIterable, Sendable { case estimate, approved, installed }
public enum RunKind: String, Codable, Sendable { case led, stair, wire }
/// Where runs end: low-voltage closets, plus other trades' panels and equipment. Unknown ids read as `.equipment`.
public enum ClosetKind: String, Codable, CaseIterable, Sendable, Identifiable {
    case equipment, `switch`, rack
    case panel, subpanel, facp, nac, airhandler, condenser, waterheater, manifold, inverter
    public var id: String { rawValue }
    public init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = ClosetKind(rawValue: raw) ?? .equipment
    }
}

/// Electrical circuit details on a wire run (a circuit's home run to its panel). All optional; same JSON as the web app.
public struct CircuitInfo: Codable, Hashable, Sendable {
    /// Breaker space(s), e.g. "12" or "3/5" for a 2-pole breaker.
    public var number: String?
    public var breakerA: Double?
    public var volts: Double?
    public var poles: Double?
    /// What the circuit feeds.
    public var description: String?
    public init(number: String? = nil, breakerA: Double? = nil, volts: Double? = nil, poles: Double? = nil, description: String? = nil) {
        self.number = number; self.breakerA = breakerA; self.volts = volts; self.poles = poles; self.description = description
    }
}
public enum DeviceKind: String, Codable, Sendable { case device, led }
public enum LaborMode: String, Codable, Sendable { case combined, separate }

public struct BillduDocRef: Codable, Hashable, Sendable {
    public var id: Int
    public var type: String
    public var serial: String?
    public var amount: Double
    public var percent: Double?
    public var label: String?
    public var createdAt: String
    public init(id: Int, type: String, serial: String?, amount: Double, percent: Double?, label: String?, createdAt: String) {
        self.id = id; self.type = type; self.serial = serial; self.amount = amount; self.percent = percent; self.label = label; self.createdAt = createdAt
    }
}

public struct PricingOverrides: Codable, Hashable, Sendable {
    public var markupPct: Double?
    public var taxPct: Double?
    public var laborMode: LaborMode?
    public var includeTentative: Bool?
    public init() {}
}

public struct Project: Codable, Hashable, Identifiable, Sendable {
    public var id: String
    public var clientName: String
    public var clientEmail: String?
    public var clientPhone: String?
    public var address: String
    public var status: ProjectStatus
    public var notes: String?
    public var billduClientId: Int?
    public var billduDocs: [BillduDocRef]
    public var pricing: PricingOverrides?
    /// Which product (brand/model) this job uses for each device type: device type id → product id.
    public var productChoices: [String: String]?
    /// Free-form job labels ("Pre-wire", "Service") and location for the jobs map.
    public var labels: [String]?
    public var lat: Double?
    public var lng: Double?
    public var createdAt: String
    public var updatedAt: String
    public var deleted: Bool?

    public init(id: String = newId(), clientName: String, address: String, clientEmail: String? = nil, clientPhone: String? = nil) {
        self.id = id; self.clientName = clientName; self.address = address
        self.clientEmail = clientEmail; self.clientPhone = clientPhone
        self.status = .estimate; self.billduDocs = []
        let now = isoNow(); self.createdAt = now; self.updatedAt = now
    }
}

public struct Sheet: Codable, Hashable, Identifiable, Sendable {
    public var id: String
    public var projectId: String
    public var name: String
    public var pageNumber: Int
    public var order: Int
    public var imageId: String
    public var imageUrl: String?
    public var width: Double
    public var height: Double
    public var pxPerFt: Double?
    public var pxPerInch: Double?
    public var scaleLabel: String?
    /// Original vector PDF kept for crisp detail when zooming (file id in the app's storage) and its page index.
    public var sourcePdfId: String?
    public var sourcePage: Int?
    /// Quarter turns clockwise applied to the sheet since import (so the PDF detail can be drawn rotated).
    public var sourceRotation: Int?
    public var createdAt: String
    public var updatedAt: String
    public var deleted: Bool?

    public init(id: String = newId(), projectId: String, name: String, pageNumber: Int, order: Int, imageId: String, width: Double, height: Double, pxPerInch: Double? = nil, pxPerFt: Double? = nil) {
        self.id = id; self.projectId = projectId; self.name = name; self.pageNumber = pageNumber; self.order = order
        self.imageId = imageId; self.width = width; self.height = height; self.pxPerInch = pxPerInch; self.pxPerFt = pxPerFt
        let now = isoNow(); self.createdAt = now; self.updatedAt = now
    }
}

public struct DeviceType: Codable, Hashable, Identifiable, Sendable {
    public var id: String
    public var name: String
    public var category: Category
    public var symbol: String
    /// Pictogram drawn inside the symbol (a DeviceIcons key), "letters" for the symbol text, nil for the default.
    public var icon: String?
    public var abbrev: String
    public var shape: MarkerShape
    public var color: String
    public var unit: MeasureUnit
    public var unitPrice: Double
    public var laborPrice: Double
    public var defaultWire: String
    public var defaultMount: Mount
    public var kind: DeviceKind
    public var billduProductId: Int?
    public var sort: Int
    public var archived: Bool?
    public var updatedAt: String

    public init(id: String, name: String, category: Category, symbol: String, abbrev: String, shape: MarkerShape, color: String,
                unit: MeasureUnit, unitPrice: Double, laborPrice: Double, defaultWire: String, defaultMount: Mount, kind: DeviceKind,
                billduProductId: Int?, sort: Int, archived: Bool?, updatedAt: String, icon: String? = nil) {
        self.id = id; self.name = name; self.category = category; self.symbol = symbol; self.abbrev = abbrev; self.shape = shape
        self.color = color; self.unit = unit; self.unitPrice = unitPrice; self.laborPrice = laborPrice; self.defaultWire = defaultWire
        self.defaultMount = defaultMount; self.kind = kind; self.billduProductId = billduProductId; self.sort = sort
        self.archived = archived; self.updatedAt = updatedAt; self.icon = icon
    }
}

public struct Marker: Codable, Hashable, Identifiable, Sendable {
    public var id: String
    public var projectId: String
    public var sheetId: String
    public var deviceTypeId: String
    public var x: Double
    public var y: Double
    public var label: String
    public var room: String
    public var mount: Mount
    public var wireType: String
    public var closetId: String?
    public var tentative: Bool
    public var notes: String
    public var photoId: String?
    /// A different product for just this device (else the job's choice for its type).
    public var productId: String?
    /// Every cable pulled to this device, repeats meaning several (e.g. ["HDMI", "Cat6", "Cat6"]). Nil = just `wireType`.
    public var wires: [String]?
    /// Electrical: the panel circuit number this device is on ("12"); its panel is `closetId`.
    public var circuit: String?
    public var createdAt: String
    public var updatedAt: String
    public var deleted: Bool?
    /// Install progress (roughed → installed → tested → verified) with history and photo proof. Never counted.
    public var install: InstallState?

    public init(id: String = newId(), projectId: String, sheetId: String, deviceTypeId: String, x: Double, y: Double, label: String,
                room: String = "", mount: Mount = .ceiling, wireType: String = "Cat6", closetId: String? = nil, tentative: Bool = false, notes: String = "") {
        self.id = id; self.projectId = projectId; self.sheetId = sheetId; self.deviceTypeId = deviceTypeId; self.x = x; self.y = y
        self.label = label; self.room = room; self.mount = mount; self.wireType = wireType; self.closetId = closetId
        self.tentative = tentative; self.notes = notes
        let now = isoNow(); self.createdAt = now; self.updatedAt = now
    }
}

public struct Run: Codable, Hashable, Identifiable, Sendable {
    public var id: String
    public var projectId: String
    public var sheetId: String
    public var kind: RunKind
    public var deviceTypeId: String?
    /// Flat relative coordinates [x0, y0, x1, y1, …].
    public var points: [Double]
    public var measuredFt: Double?
    public var typedFt: Double?
    public var zone: String?
    public var switchLabel: String?
    public var steps: Int?
    public var lfPerStep: Double?
    public var wireType: String?
    /// A home run carrying several cables along one path (copied from the device's bundle).
    public var wireTypes: [String]?
    public var markerId: String?
    public var closetId: String?
    /// Electrical: circuit number, breaker, voltage, poles (the run is that circuit's home run).
    public var circuit: CircuitInfo?
    public var tentative: Bool?
    public var notes: String?
    public var createdAt: String
    public var updatedAt: String
    public var deleted: Bool?
    /// Install progress (wire runs: roughed = pulled, installed = terminated, tested = certified). Never counted.
    public var install: InstallState?

    public init(id: String = newId(), projectId: String, sheetId: String, kind: RunKind, deviceTypeId: String? = nil, points: [Double],
                measuredFt: Double? = nil, typedFt: Double? = nil, zone: String? = nil, switchLabel: String? = nil,
                steps: Int? = nil, lfPerStep: Double? = nil, wireType: String? = nil, markerId: String? = nil, closetId: String? = nil, tentative: Bool? = nil) {
        self.id = id; self.projectId = projectId; self.sheetId = sheetId; self.kind = kind; self.deviceTypeId = deviceTypeId; self.points = points
        self.measuredFt = measuredFt; self.typedFt = typedFt; self.zone = zone; self.switchLabel = switchLabel; self.steps = steps
        self.lfPerStep = lfPerStep; self.wireType = wireType; self.markerId = markerId; self.closetId = closetId; self.tentative = tentative
        let now = isoNow(); self.createdAt = now; self.updatedAt = now
    }
}

public struct Closet: Codable, Hashable, Identifiable, Sendable {
    public var id: String
    public var projectId: String
    public var sheetId: String
    public var kind: ClosetKind
    public var x: Double
    public var y: Double
    public var name: String
    public var notes: String?
    public var createdAt: String
    public var updatedAt: String
    public var deleted: Bool?

    public init(id: String = newId(), projectId: String, sheetId: String, kind: ClosetKind, x: Double, y: Double, name: String) {
        self.id = id; self.projectId = projectId; self.sheetId = sheetId; self.kind = kind; self.x = x; self.y = y; self.name = name
        let now = isoNow(); self.createdAt = now; self.updatedAt = now
    }
}

/// User overrides on the computed estimate, plus custom lines (key "custom:<id>").
public struct EstimateLine: Codable, Hashable, Identifiable, Sendable {
    public var id: String
    public var projectId: String
    public var key: String
    public var description: String?
    public var qty: Double?
    public var unit: String?
    public var unitPrice: Double?
    public var removed: Bool?
    public var include: Bool?
    public var sort: Double?
    public var updatedAt: String
    public var deleted: Bool?

    public init(id: String = newId(), projectId: String, key: String) {
        self.id = id; self.projectId = projectId; self.key = key; self.updatedAt = isoNow()
    }
}

public struct PricingSettings: Codable, Hashable, Sendable {
    public var markupPct: Double
    public var taxPct: Double
    public var laborMode: LaborMode
    public var wirePrices: [String: Double]
    public var wireSlackPct: Double
    public var wireDropFt: Double
    public var floorHeightFt: Double
    public var includeTentative: Bool
    public var currency: String

    public func applying(_ o: PricingOverrides?) -> PricingSettings {
        guard let o else { return self }
        var p = self
        if let v = o.markupPct { p.markupPct = v }
        if let v = o.taxPct { p.taxPct = v }
        if let v = o.laborMode { p.laborMode = v }
        if let v = o.includeTentative { p.includeTentative = v }
        return p
    }
}

public struct BusinessSettings: Codable, Hashable, Sendable {
    public var name = ""
    public var address = ""
    public var phone = ""
    public var email = ""
    public var website = ""
    public var estimateTerms = "Estimate valid for 30 days. 50% deposit due on approval, balance on completion. Quantities are based on the marked-up plans; changes on site are billed at the same unit rates."
    /// Branding for client-facing pages (optional so older settings files still load).
    public var tagline: String?
    /// A site path on the PinPlan server ("/brand/…png") or a full URL.
    public var logo: String?
    public var brandColor: String?
    public var accentColor: String?
    public var serviceArea: String?
    /// Which defaults fill blank fields: "neutral" (written once when settings are first created on a fresh install)
    /// or nil, which means founder defaults (devices that had settings before this marker existed keep their look).
    public var brandDefaults: String?
    public init() {}

    /// The marker stored in `brandDefaults` on fresh installs.
    public static let neutralMarker = "neutral"

    /// Neutral defaults for a new customer: no name or contact details, PinPlan's own colours, generic terms.
    public static let neutral: BusinessSettings = {
        var b = BusinessSettings()
        b.brandColor = "#c2410c"
        b.accentColor = "#f59e0b"
        return b
    }()

    /// The founder's company, Smart Living Solutions (smartlivingny.com). Only for the founder's own devices and
    /// team (comped billing) — never shown to other customers.
    public static let founder: BusinessSettings = {
        var b = BusinessSettings()
        b.name = "Smart Living Solutions"
        b.address = "New York, NY"
        b.phone = "(646) 290-1922"
        b.email = "smartlivingny@gmail.com"
        b.website = "smartlivingny.com"
        b.tagline = "Smart Home · Lighting · AV & Home Theater · Security"
        b.logo = "/brand/smart-living-logo.png"
        b.brandColor = "#0a1b54"
        b.accentColor = "#13e57c"
        b.serviceArea = "Serving New York City, Long Island, Westchester & the Tri-State Area"
        return b
    }()

    /// The defaults that fill blank fields: the founder's company or neutral ones.
    public static func defaults(founder: Bool) -> BusinessSettings { founder ? Self.founder : Self.neutral }

    /// Founder defaults when the team is the founder's (comped billing), or when this device had business settings
    /// before neutral defaults existed (no marker). Everyone else gets neutral defaults.
    public static func usesFounderDefaults(marker: String?, plan: PlanStatus?) -> Bool {
        if plan == .comped { return true }
        return marker != neutralMarker
    }

    /// This device's settings with blank fields filled in, given the team's plan (nil when solo or unknown).
    public func resolved(plan: PlanStatus?) -> BusinessSettings {
        withDefaults(founder: Self.usesFounderDefaults(marker: brandDefaults, plan: plan))
    }

    /// Blank fields take the defaults (founder or neutral). Never overwrites a field that has a value.
    public func withDefaults(founder: Bool) -> BusinessSettings {
        let d = Self.defaults(founder: founder)
        func pick(_ v: String, _ f: String) -> String { v.isEmpty ? f : v }
        func pick(_ v: String?, _ f: String?) -> String? { (v ?? "").isEmpty ? f : v }
        var b = self
        b.name = pick(name, d.name); b.address = pick(address, d.address); b.phone = pick(phone, d.phone)
        b.email = pick(email, d.email); b.website = pick(website, d.website)
        b.tagline = pick(tagline, d.tagline); b.logo = pick(logo, d.logo); b.brandColor = pick(brandColor, d.brandColor)
        b.accentColor = pick(accentColor, d.accentColor); b.serviceArea = pick(serviceArea, d.serviceArea)
        return b
    }
}

/// Everything belonging to one project (the unit the app saves, undoes and backs up).
public struct ProjectBundle: Codable, Hashable, Sendable {
    public var project: Project
    public var sheets: [Sheet]
    public var markers: [Marker]
    public var runs: [Run]
    public var closets: [Closet]
    public var estimateLines: [EstimateLine]
    /// Field documentation.
    public var photos: [Photo] = []
    public var photoComments: [PhotoComment] = []
    public var checklists: [Checklist] = []
    public var jobLogs: [JobLog] = []
    public var documents: [JobDocument] = []
    /// Filled forms and inspections.
    public var forms: [JobForm] = []

    public init(project: Project, sheets: [Sheet] = [], markers: [Marker] = [], runs: [Run] = [], closets: [Closet] = [], estimateLines: [EstimateLine] = []) {
        self.project = project; self.sheets = sheets; self.markers = markers; self.runs = runs; self.closets = closets; self.estimateLines = estimateLines
    }

    private enum CodingKeys: String, CodingKey {
        case project, sheets, markers, runs, closets, estimateLines, photos, photoComments, checklists, jobLogs, documents
        case forms
    }

    /// Jobs saved before field documentation existed load with empty photo/checklist/log lists.
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        project = try c.decode(Project.self, forKey: .project)
        sheets = try c.decodeIfPresent([Sheet].self, forKey: .sheets) ?? []
        markers = try c.decodeIfPresent([Marker].self, forKey: .markers) ?? []
        runs = try c.decodeIfPresent([Run].self, forKey: .runs) ?? []
        closets = try c.decodeIfPresent([Closet].self, forKey: .closets) ?? []
        estimateLines = try c.decodeIfPresent([EstimateLine].self, forKey: .estimateLines) ?? []
        photos = try c.decodeIfPresent([Photo].self, forKey: .photos) ?? []
        photoComments = try c.decodeIfPresent([PhotoComment].self, forKey: .photoComments) ?? []
        checklists = try c.decodeIfPresent([Checklist].self, forKey: .checklists) ?? []
        jobLogs = try c.decodeIfPresent([JobLog].self, forKey: .jobLogs) ?? []
        documents = try c.decodeIfPresent([JobDocument].self, forKey: .documents) ?? []
        forms = (try? c.decodeIfPresent([JobForm].self, forKey: .forms)) ?? []
    }

    public var livePhotos: [Photo] { photos.filter { $0.deleted != true }.sorted { $0.takenAt > $1.takenAt } }
    public var liveChecklists: [Checklist] { checklists.filter { $0.deleted != true }.sorted { $0.createdAt < $1.createdAt } }
    public var liveLogs: [JobLog] { jobLogs.filter { $0.deleted != true }.sorted { ($0.date, $0.createdAt) > ($1.date, $1.createdAt) } }
    public var liveDocuments: [JobDocument] { documents.filter { $0.deleted != true }.sorted { $0.createdAt > $1.createdAt } }
    public var liveForms: [JobForm] { forms.filter { $0.deleted != true }.sorted { $0.updatedAt > $1.updatedAt } }
    public func comments(for photoId: String) -> [PhotoComment] {
        photoComments.filter { $0.photoId == photoId && $0.deleted != true }.sorted { $0.createdAt < $1.createdAt }
    }

    /// Live (not soft-deleted) items, sheets in floor order.
    public var liveSheets: [Sheet] { sheets.filter { $0.deleted != true }.sorted { $0.order < $1.order } }
    public var liveMarkers: [Marker] { markers.filter { $0.deleted != true } }
    public var liveRuns: [Run] { runs.filter { $0.deleted != true } }
    public var liveClosets: [Closet] { closets.filter { $0.deleted != true } }
}

// MARK: - helpers

private let idAlphabet = Array("0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ_-")
public func newId(_ length: Int = 12) -> String {
    var g = SystemRandomNumberGenerator()
    return String((0..<length).map { _ in idAlphabet[Int(g.next() % UInt64(idAlphabet.count))] })
}

public func isoNow() -> String {
    let f = ISO8601DateFormatter()
    f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return f.string(from: Date())
}

// MARK: - install progress (InstallProgress.swift)

/// Install status of a device or run. Unknown ids (from a newer app) read as `.planned`.
public enum InstallStatus: String, Codable, CaseIterable, Sendable, Identifiable {
    case planned, roughed, installed, tested, verified, issue
    public var id: String { rawValue }
    public init(from decoder: Decoder) throws {
        let raw = (try? decoder.singleValueContainer().decode(String.self)) ?? ""
        self = InstallStatus(rawValue: raw) ?? .planned
    }
}

/// Same JSON as the web app's InstallState. Decoding tolerates missing and unknown fields.
public struct InstallState: Codable, Hashable, Sendable {
    public struct Test: Codable, Hashable, Sendable {
        public var pass: Bool
        public var value: String?
        public var note: String?
        public init(pass: Bool, value: String? = nil, note: String? = nil) { self.pass = pass; self.value = value; self.note = note }
        private enum CodingKeys: String, CodingKey { case pass, value, note }
        public init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            pass = (try? c.decodeIfPresent(Bool.self, forKey: .pass)) ?? false
            value = try? c.decodeIfPresent(String.self, forKey: .value)
            note = try? c.decodeIfPresent(String.self, forKey: .note)
        }
    }
    public struct Entry: Codable, Hashable, Sendable {
        public var status: InstallStatus
        public var by: String?
        public var at: String
        public var note: String?
        public init(status: InstallStatus, by: String? = nil, at: String, note: String? = nil) { self.status = status; self.by = by; self.at = at; self.note = note }
        private enum CodingKeys: String, CodingKey { case status, by, at, note }
        public init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            status = (try? c.decodeIfPresent(InstallStatus.self, forKey: .status)) ?? .planned
            by = try? c.decodeIfPresent(String.self, forKey: .by)
            at = (try? c.decodeIfPresent(String.self, forKey: .at)) ?? ""
            note = try? c.decodeIfPresent(String.self, forKey: .note)
        }
    }

    public var status: InstallStatus
    public var by: String?
    public var at: String?
    public var photoIds: [String]?
    public var test: Test?
    public var history: [Entry]?

    public init(status: InstallStatus, by: String? = nil, at: String? = nil, photoIds: [String]? = nil, test: Test? = nil, history: [Entry]? = nil) {
        self.status = status; self.by = by; self.at = at; self.photoIds = photoIds; self.test = test; self.history = history
    }

    private enum CodingKeys: String, CodingKey { case status, by, at, photoIds, test, history }
    public init(from decoder: Decoder) throws {
        guard let c = try? decoder.container(keyedBy: CodingKeys.self) else {
            status = .planned
            return
        }
        status = (try? c.decodeIfPresent(InstallStatus.self, forKey: .status)) ?? .planned
        by = try? c.decodeIfPresent(String.self, forKey: .by)
        at = try? c.decodeIfPresent(String.self, forKey: .at)
        photoIds = try? c.decodeIfPresent([String].self, forKey: .photoIds)
        test = try? c.decodeIfPresent(Test.self, forKey: .test)
        history = try? c.decodeIfPresent([Entry].self, forKey: .history)
    }
}
