import Foundation

// Job data the web app makes that this app pulls with cloud sync: plan markups, schedule items, RFIs, saved
// measurements and plan links. Same JSON as src/lib/types.ts. Decoding is lenient everywhere (missing or unknown
// values fall back), so a row from a newer web app never breaks a job. These rows never count in the takeoff.

extension KeyedDecodingContainer {
    /// An optional value that may be missing, null or of the wrong type (then nil).
    func loose<T: Decodable>(_ type: T.Type, _ key: Key) -> T? { (try? decodeIfPresent(type, forKey: key)) ?? nil }
    /// A number that may arrive as an integer or a decimal.
    func looseInt(_ key: Key) -> Int? { loose(Int.self, key) ?? loose(Double.self, key).map { Int($0) } }
    func looseString(_ key: Key, _ fallback: String = "") -> String { loose(String.self, key) ?? fallback }
}

// MARK: - plan markups

public enum MarkupKind: String, Codable, CaseIterable, Sendable {
    case pen, highlight, line, arrow, cloud, rect, ellipse, text
    /// Unknown kinds (a newer web app) read as `.pen`: a freehand line through the points.
    public init(from decoder: Decoder) throws { self = MarkupKind(rawValue: tolerantRaw(decoder)) ?? .pen }
}

/// A redline or note drawn on a sheet (docs/plan-markups.md). Never counted.
public struct PlanMarkup: Codable, Hashable, Identifiable, Sendable {
    public var id: String
    public var projectId: String
    public var sheetId: String
    public var kind: MarkupKind
    /// Relative (0–1) x,y pairs.
    public var points: [Double]
    public var text: String?
    public var color: String
    /// Stroke width as a fraction of the sheet width.
    public var width: Double
    public var fontSize: Double?
    /// Named layer ("Redlines", "As-built", "Notes").
    public var layer: String
    /// Only its author sees it.
    public var `private`: Bool?
    public var author: String?
    public var authorId: String?
    public var createdAt: String
    public var updatedAt: String
    public var deleted: Bool?

    public init(id: String = newId(), projectId: String, sheetId: String, kind: MarkupKind, points: [Double], color: String = "#dc2626", width: Double = 0.002, layer: String = "Redlines") {
        self.id = id; self.projectId = projectId; self.sheetId = sheetId; self.kind = kind; self.points = points
        self.color = color; self.width = width; self.layer = layer
        let now = isoNow(); createdAt = now; updatedAt = now
    }

    private enum CodingKeys: String, CodingKey {
        case id, projectId, sheetId, kind, points, text, color, width, fontSize, layer, `private`, author, authorId, createdAt, updatedAt, deleted
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        projectId = c.looseString(.projectId)
        sheetId = c.looseString(.sheetId)
        kind = c.loose(MarkupKind.self, .kind) ?? .pen
        points = c.loose([Double].self, .points) ?? []
        text = c.loose(String.self, .text)
        color = c.looseString(.color, "#dc2626")
        width = c.loose(Double.self, .width) ?? 0.002
        fontSize = c.loose(Double.self, .fontSize)
        layer = c.looseString(.layer, "Redlines")
        `private` = c.loose(Bool.self, .private)
        author = c.loose(String.self, .author)
        authorId = c.loose(String.self, .authorId)
        createdAt = c.looseString(.createdAt)
        updatedAt = c.looseString(.updatedAt, createdAt)
        deleted = c.loose(Bool.self, .deleted)
    }
}

// MARK: - schedule

/// This item starts after `id` ends (finish-to-start), plus `lagDays`.
public struct ScheduleDep: Codable, Hashable, Sendable {
    public var id: String
    public var lagDays: Double?
    public init(id: String, lagDays: Double? = nil) { self.id = id; self.lagDays = lagDays }
    private enum CodingKeys: String, CodingKey { case id, lagDays }
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        lagDays = c.loose(Double.self, .lagDays)
    }
}

/// A phase on a job's schedule (docs/schedule-lookahead.md). Days are YYYY-MM-DD; `end` is inclusive.
public struct ScheduleItem: Codable, Hashable, Identifiable, Sendable {
    public var id: String
    public var projectId: String
    public var name: String
    public var phase: String?
    public var start: String
    public var end: String
    public var crew: [String]?
    public var hoursPlanned: Double?
    /// 0–100.
    public var progress: Double?
    public var color: String?
    public var dependsOn: [ScheduleDep]?
    public var sheetIds: [String]?
    public var notes: String?
    public var sort: Double?
    /// Skip weekends when counting days (default true).
    public var workdaysOnly: Bool?
    public var createdAt: String
    public var updatedAt: String
    public var deleted: Bool?

    public init(id: String = newId(), projectId: String, name: String, start: String, end: String) {
        self.id = id; self.projectId = projectId; self.name = name; self.start = start; self.end = end
        let now = isoNow(); createdAt = now; updatedAt = now
    }

    private enum CodingKeys: String, CodingKey {
        case id, projectId, name, phase, start, end, crew, hoursPlanned, progress, color, dependsOn, sheetIds, notes, sort, workdaysOnly
        case createdAt, updatedAt, deleted
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        projectId = c.looseString(.projectId)
        name = c.looseString(.name)
        phase = c.loose(String.self, .phase)
        start = c.looseString(.start)
        end = c.looseString(.end, start)
        crew = c.loose([String].self, .crew)
        hoursPlanned = c.loose(Double.self, .hoursPlanned)
        progress = c.loose(Double.self, .progress)
        color = c.loose(String.self, .color)
        dependsOn = c.loose([Lenient<ScheduleDep>].self, .dependsOn)?.compactMap(\.value)
        sheetIds = c.loose([String].self, .sheetIds)
        notes = c.loose(String.self, .notes)
        sort = c.loose(Double.self, .sort)
        workdaysOnly = c.loose(Bool.self, .workdaysOnly)
        createdAt = c.looseString(.createdAt)
        updatedAt = c.looseString(.updatedAt, createdAt)
        deleted = c.loose(Bool.self, .deleted)
    }
}

// MARK: - RFIs

public enum RfiStatus: String, Codable, CaseIterable, Sendable {
    case draft, open, answered, closed, void
    /// Unknown statuses read as `.open`.
    public init(from decoder: Decoder) throws { self = RfiStatus(rawValue: tolerantRaw(decoder)) ?? .open }
}

/// Who the RFI comes from, frozen when it is sent (for the no-login answer page). No prices.
public struct RfiSender: Codable, Hashable, Sendable {
    public var company: String?
    public var contact: String?
    public var phone: String?
    public var email: String?
    public var website: String?
    public var logo: String?
    public var brandColor: String?
    public init() {}
    private enum CodingKeys: String, CodingKey { case company, contact, phone, email, website, logo, brandColor }
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        company = c.loose(String.self, .company); contact = c.loose(String.self, .contact); phone = c.loose(String.self, .phone)
        email = c.loose(String.self, .email); website = c.loose(String.self, .website); logo = c.loose(String.self, .logo)
        brandColor = c.loose(String.self, .brandColor)
    }
}

/// A request for information to the GC / architect / owner (docs/rfis.md).
public struct Rfi: Codable, Hashable, Identifiable, Sendable {
    public var id: String
    public var projectId: String
    /// Per-job number, shown as RFI-007.
    public var number: Int
    public var subject: String
    public var question: String
    public var suggestion: String?
    public var status: RfiStatus
    /// "us" or "them".
    public var ballInCourt: String
    /// "low", "normal", "high".
    public var priority: String?
    /// "yes", "no", "tbd".
    public var costImpact: String?
    public var scheduleImpact: String?
    public var toName: String?
    public var toEmail: String?
    public var toCompany: String?
    public var cc: [String]?
    /// Answer needed by (YYYY-MM-DD).
    public var due: String?
    public var sheetId: String?
    public var x: Double?
    public var y: Double?
    public var markerId: String?
    public var taskId: String?
    public var photoIds: [String]?
    public var documentIds: [String]?
    public var answer: String?
    public var answeredBy: String?
    public var answeredAt: String?
    public var shareToken: String?
    public var sentAt: String?
    public var closedAt: String?
    public var createdBy: String?
    public var sender: RfiSender?
    public var createdAt: String
    public var updatedAt: String
    public var deleted: Bool?

    public init(id: String = newId(), projectId: String, number: Int, subject: String, question: String = "", createdBy: String? = nil) {
        self.id = id; self.projectId = projectId; self.number = number; self.subject = subject; self.question = question
        status = .draft; ballInCourt = "us"; self.createdBy = createdBy
        let now = isoNow(); createdAt = now; updatedAt = now
    }

    /// "RFI-007".
    public var label: String { "RFI-" + String(repeating: "0", count: max(0, 3 - String(number).count)) + String(number) }

    private enum CodingKeys: String, CodingKey {
        case id, projectId, number, subject, question, suggestion, status, ballInCourt, priority, costImpact, scheduleImpact, toName, toEmail
        case toCompany, cc, due, sheetId, x, y, markerId, taskId, photoIds, documentIds, answer, answeredBy, answeredAt, shareToken, sentAt
        case closedAt, createdBy, sender, createdAt, updatedAt, deleted
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        projectId = c.looseString(.projectId)
        number = c.looseInt(.number) ?? 0
        subject = c.looseString(.subject)
        question = c.looseString(.question)
        suggestion = c.loose(String.self, .suggestion)
        status = c.loose(RfiStatus.self, .status) ?? .open
        ballInCourt = c.looseString(.ballInCourt, "us")
        priority = c.loose(String.self, .priority)
        costImpact = c.loose(String.self, .costImpact)
        scheduleImpact = c.loose(String.self, .scheduleImpact)
        toName = c.loose(String.self, .toName)
        toEmail = c.loose(String.self, .toEmail)
        toCompany = c.loose(String.self, .toCompany)
        cc = c.loose([String].self, .cc)
        due = c.loose(String.self, .due)
        sheetId = c.loose(String.self, .sheetId)
        x = c.loose(Double.self, .x)
        y = c.loose(Double.self, .y)
        markerId = c.loose(String.self, .markerId)
        taskId = c.loose(String.self, .taskId)
        photoIds = c.loose([String].self, .photoIds)
        documentIds = c.loose([String].self, .documentIds)
        answer = c.loose(String.self, .answer)
        answeredBy = c.loose(String.self, .answeredBy)
        answeredAt = c.loose(String.self, .answeredAt)
        shareToken = c.loose(String.self, .shareToken)
        sentAt = c.loose(String.self, .sentAt)
        closedAt = c.loose(String.self, .closedAt)
        createdBy = c.loose(String.self, .createdBy)
        sender = c.loose(RfiSender.self, .sender)
        createdAt = c.looseString(.createdAt)
        updatedAt = c.looseString(.updatedAt, createdAt)
        deleted = c.loose(Bool.self, .deleted)
    }
}

// MARK: - saved measurements

public enum MeasurementKind: String, Codable, CaseIterable, Sendable {
    case length, polyline, area
    /// Unknown kinds read as `.polyline` (a run through the points).
    public init(from decoder: Decoder) throws { self = MeasurementKind(rawValue: tolerantRaw(decoder)) ?? .polyline }
}

/// A saved measurement on a sheet (docs/saved-measurements.md). Only geometry is stored; lengths and areas are worked
/// out from `points` and the sheet's scale.
public struct Measurement: Codable, Hashable, Identifiable, Sendable {
    public var id: String
    public var projectId: String
    public var sheetId: String
    public var kind: MeasurementKind
    /// Relative (0–1) x,y pairs.
    public var points: [Double]
    public var label: String?
    public var color: String?
    public var extraFt: Double?
    public var wastePct: Double?
    public var notes: String?
    public var author: String?
    public var createdAt: String
    public var updatedAt: String
    public var deleted: Bool?

    public init(id: String = newId(), projectId: String, sheetId: String, kind: MeasurementKind, points: [Double]) {
        self.id = id; self.projectId = projectId; self.sheetId = sheetId; self.kind = kind; self.points = points
        let now = isoNow(); createdAt = now; updatedAt = now
    }

    private enum CodingKeys: String, CodingKey {
        case id, projectId, sheetId, kind, points, label, color, extraFt, wastePct, notes, author, createdAt, updatedAt, deleted
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        projectId = c.looseString(.projectId)
        sheetId = c.looseString(.sheetId)
        kind = c.loose(MeasurementKind.self, .kind) ?? .polyline
        points = c.loose([Double].self, .points) ?? []
        label = c.loose(String.self, .label)
        color = c.loose(String.self, .color)
        extraFt = c.loose(Double.self, .extraFt)
        wastePct = c.loose(Double.self, .wastePct)
        notes = c.loose(String.self, .notes)
        author = c.loose(String.self, .author)
        createdAt = c.looseString(.createdAt)
        updatedAt = c.looseString(.updatedAt, createdAt)
        deleted = c.loose(Bool.self, .deleted)
    }
}

// MARK: - plan links

/// Where a plan link goes: another sheet (optionally a spot on it), a job document, a photo or a web page.
/// A kind this build doesn't know is kept as it came (`isKnown` is false) and is ignored on the plan.
public struct SheetLinkTarget: Codable, Hashable, Sendable {
    public static let knownKinds: Set<String> = ["sheet", "document", "photo", "url"]
    public var kind: String
    public var sheetId: String?
    public var x: Double?
    public var y: Double?
    public var documentId: String?
    public var photoId: String?
    public var url: String?

    public init(kind: String, sheetId: String? = nil, x: Double? = nil, y: Double? = nil, documentId: String? = nil, photoId: String? = nil, url: String? = nil) {
        self.kind = kind; self.sheetId = sheetId; self.x = x; self.y = y; self.documentId = documentId; self.photoId = photoId; self.url = url
    }

    /// A kind this build can open, with the id (or address) it needs.
    public var isKnown: Bool {
        switch kind {
        case "sheet": return !(sheetId ?? "").isEmpty
        case "document": return !(documentId ?? "").isEmpty
        case "photo": return !(photoId ?? "").isEmpty
        case "url": return !(url ?? "").isEmpty
        default: return false
        }
    }

    private enum CodingKeys: String, CodingKey { case kind, sheetId, x, y, documentId, photoId, url }
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        kind = c.looseString(.kind)
        sheetId = c.loose(String.self, .sheetId); x = c.loose(Double.self, .x); y = c.loose(Double.self, .y)
        documentId = c.loose(String.self, .documentId); photoId = c.loose(String.self, .photoId); url = c.loose(String.self, .url)
    }
}

/// A tappable area on a sheet (relative 0–1 rect) that opens another sheet, a document, a photo or a web page.
public struct SheetLink: Codable, Hashable, Identifiable, Sendable {
    public var id: String
    public var projectId: String
    public var sheetId: String
    public var x: Double
    public var y: Double
    public var w: Double
    public var h: Double
    public var target: SheetLinkTarget
    public var label: String?
    /// Found from callout text, not drawn by hand.
    public var auto: Bool?
    public var createdAt: String
    public var updatedAt: String
    public var deleted: Bool?

    public init(id: String = newId(), projectId: String, sheetId: String, x: Double, y: Double, w: Double, h: Double, target: SheetLinkTarget) {
        self.id = id; self.projectId = projectId; self.sheetId = sheetId; self.x = x; self.y = y; self.w = w; self.h = h; self.target = target
        let now = isoNow(); createdAt = now; updatedAt = now
    }

    private enum CodingKeys: String, CodingKey { case id, projectId, sheetId, x, y, w, h, target, label, auto, createdAt, updatedAt, deleted }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        projectId = c.looseString(.projectId)
        sheetId = c.looseString(.sheetId)
        x = c.loose(Double.self, .x) ?? 0
        y = c.loose(Double.self, .y) ?? 0
        w = c.loose(Double.self, .w) ?? 0
        h = c.loose(Double.self, .h) ?? 0
        target = c.loose(SheetLinkTarget.self, .target) ?? SheetLinkTarget(kind: "")
        label = c.loose(String.self, .label)
        auto = c.loose(Bool.self, .auto)
        createdAt = c.looseString(.createdAt)
        updatedAt = c.looseString(.updatedAt, createdAt)
        deleted = c.loose(Bool.self, .deleted)
    }
}

extension ProjectBundle {
    public var livePlanMarkups: [PlanMarkup] { planMarkups.filter { $0.deleted != true } }
    public var liveScheduleItems: [ScheduleItem] {
        scheduleItems.filter { $0.deleted != true }.sorted { ($0.sort ?? 0, $0.start, $0.name) < ($1.sort ?? 0, $1.start, $1.name) }
    }
    /// Live RFIs by number.
    public var liveRfis: [Rfi] { rfis.filter { $0.deleted != true }.sorted { ($0.number, $0.createdAt) < ($1.number, $1.createdAt) } }
    public var liveMeasurements: [Measurement] { measurements.filter { $0.deleted != true } }
    /// Live plan links this build can open (unknown target kinds are left out).
    public var liveSheetLinks: [SheetLink] { sheetLinks.filter { $0.deleted != true && $0.target.isKnown } }
}
