import Foundation

// Domain models. Field names match the web app's JSON (camelCase) so backups are interchangeable.
// Positions (x, y, points) are relative to the sheet image (0…1).

public enum Category: String, Codable, CaseIterable, Sendable, Identifiable {
    case security, network, audio, video, smarthome, lighting, shades, infrastructure
    public var id: String { rawValue }
}

/// Trades the crew can show/hide.
public enum Layer: String, Codable, CaseIterable, Sendable, Identifiable {
    case security, network, audio, video, smarthome, lighting, shades, infrastructure, wiring
    public var id: String { rawValue }
}

public enum MeasureUnit: String, Codable, Sendable { case each, LF }
public enum Mount: String, Codable, CaseIterable, Sendable { case ceiling, wall, exterior, floor, cabinet, other }
public enum MarkerShape: String, Codable, CaseIterable, Sendable { case circle, square, triangle, diamond, hexagon, star }
public enum ProjectStatus: String, Codable, CaseIterable, Sendable { case estimate, approved, installed }
public enum RunKind: String, Codable, Sendable { case led, stair, wire }
public enum ClosetKind: String, Codable, CaseIterable, Sendable, Identifiable {
    case equipment, `switch`, rack
    public var id: String { rawValue }
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
    public var createdAt: String
    public var updatedAt: String
    public var deleted: Bool?

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
    public var tentative: Bool?
    public var notes: String?
    public var createdAt: String
    public var updatedAt: String
    public var deleted: Bool?

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

    public init(project: Project, sheets: [Sheet] = [], markers: [Marker] = [], runs: [Run] = [], closets: [Closet] = [], estimateLines: [EstimateLine] = []) {
        self.project = project; self.sheets = sheets; self.markers = markers; self.runs = runs; self.closets = closets; self.estimateLines = estimateLines
    }

    private enum CodingKeys: String, CodingKey {
        case project, sheets, markers, runs, closets, estimateLines, photos, photoComments, checklists, jobLogs, documents
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
    }

    public var livePhotos: [Photo] { photos.filter { $0.deleted != true }.sorted { $0.takenAt > $1.takenAt } }
    public var liveChecklists: [Checklist] { checklists.filter { $0.deleted != true }.sorted { $0.createdAt < $1.createdAt } }
    public var liveLogs: [JobLog] { jobLogs.filter { $0.deleted != true }.sorted { ($0.date, $0.createdAt) > ($1.date, $1.createdAt) } }
    public var liveDocuments: [JobDocument] { documents.filter { $0.deleted != true }.sorted { $0.createdAt > $1.createdAt } }
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
