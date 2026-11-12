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
                billduProductId: Int?, sort: Int, archived: Bool?, updatedAt: String) {
        self.id = id; self.name = name; self.category = category; self.symbol = symbol; self.abbrev = abbrev; self.shape = shape
        self.color = color; self.unit = unit; self.unitPrice = unitPrice; self.laborPrice = laborPrice; self.defaultWire = defaultWire
        self.defaultMount = defaultMount; self.kind = kind; self.billduProductId = billduProductId; self.sort = sort
        self.archived = archived; self.updatedAt = updatedAt
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
    public init() {}
}

/// Everything belonging to one project (the unit the app saves, undoes and backs up).
public struct ProjectBundle: Codable, Hashable, Sendable {
    public var project: Project
    public var sheets: [Sheet]
    public var markers: [Marker]
    public var runs: [Run]
    public var closets: [Closet]
    public var estimateLines: [EstimateLine]

    public init(project: Project, sheets: [Sheet] = [], markers: [Marker] = [], runs: [Run] = [], closets: [Closet] = [], estimateLines: [EstimateLine] = []) {
        self.project = project; self.sheets = sheets; self.markers = markers; self.runs = runs; self.closets = closets; self.estimateLines = estimateLines
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
