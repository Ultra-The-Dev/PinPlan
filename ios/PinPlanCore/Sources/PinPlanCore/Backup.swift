import Foundation

/// The `.pinplan.json` backup format shared with the PinPlan web app.
public struct BackupFile: Codable, Sendable {
    public struct Image: Codable, Sendable {
        public var id: String
        public var mime: String
        public var width: Double
        public var height: Double
        /// Base64-encoded bytes.
        public var data: String
        public init(id: String, mime: String, width: Double, height: Double, data: String) {
            self.id = id; self.mime = mime; self.width = width; self.height = height; self.data = data
        }
    }
    public struct ProjectEntry: Codable, Sendable {
        public var project: Project
        public var sheets: [Sheet]
        public var markers: [Marker]
        public var runs: [Run]
        public var closets: [Closet]
        public var estimateLines: [EstimateLine]
        public var photos: [Photo]?
        public var photoComments: [PhotoComment]?
        public var checklists: [Checklist]?
        public var jobLogs: [JobLog]?
        public var documents: [JobDocument]?
        public var forms: [JobForm]?
        /// Tasks pinned on the plan (missing in older backups).
        public var tasks: [PlanTask]?
        /// Made on the web (plan markups, schedule, RFIs, measurements, plan links, quotes / invoices and payments).
        public var planMarkups: [PlanMarkup]?
        public var scheduleItems: [ScheduleItem]?
        public var rfis: [Rfi]?
        public var measurements: [Measurement]?
        public var sheetLinks: [SheetLink]?
        public var salesDocs: [SalesDoc]?
        public var salesPayments: [SalesPayment]?
        /// Lists this build doesn't know (e.g. the web's change orders), kept as raw JSON and written back on export.
        public var otherArrays: [String: JSONValue] = [:]
        public var images: [Image]
        /// Entries in `images` that are job documents (any file type; the web app keeps them with the images).
        public var documentFileIds: Set<String> { Set((documents ?? []).map(\.fileId)) }
        public var bundle: ProjectBundle {
            var b = ProjectBundle(project: project, sheets: sheets, markers: markers, runs: runs, closets: closets, estimateLines: estimateLines)
            b.photos = photos ?? []; b.photoComments = photoComments ?? []; b.checklists = checklists ?? []
            b.jobLogs = jobLogs ?? []; b.documents = documents ?? []
            b.forms = forms ?? []
            b.tasks = tasks ?? []
            b.planMarkups = planMarkups ?? []; b.scheduleItems = scheduleItems ?? []; b.rfis = rfis ?? []
            b.measurements = measurements ?? []; b.sheetLinks = sheetLinks ?? []
            b.salesDocs = salesDocs ?? []; b.salesPayments = salesPayments ?? []
            b.otherArrays = otherArrays
            return b
        }
        public init(bundle b: ProjectBundle, images: [Image]) {
            project = b.project; sheets = b.sheets; markers = b.markers; runs = b.runs; closets = b.closets; estimateLines = b.estimateLines; self.images = images
            photos = b.photos; photoComments = b.photoComments; checklists = b.checklists; jobLogs = b.jobLogs; documents = b.documents
            forms = b.forms
            tasks = b.tasks
            func some<T>(_ xs: [T]) -> [T]? { xs.isEmpty ? nil : xs }
            planMarkups = some(b.planMarkups); scheduleItems = some(b.scheduleItems); rfis = some(b.rfis)
            measurements = some(b.measurements); sheetLinks = some(b.sheetLinks)
            salesDocs = some(b.salesDocs); salesPayments = some(b.salesPayments)
            otherArrays = b.otherArrays
        }

        private enum CodingKeys: String, CodingKey, CaseIterable {
            case project, sheets, markers, runs, closets, estimateLines, photos, photoComments, checklists, jobLogs, documents, forms, tasks
            case planMarkups, scheduleItems, rfis, measurements, sheetLinks, salesDocs, salesPayments, images
        }
        static let knownKeys: Set<String> = Set(CodingKeys.allCases.map(\.rawValue))

        public init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            project = try c.decode(Project.self, forKey: .project)
            sheets = try c.decode([Sheet].self, forKey: .sheets)
            markers = try c.decode([Marker].self, forKey: .markers)
            runs = try c.decode([Run].self, forKey: .runs)
            closets = try c.decode([Closet].self, forKey: .closets)
            estimateLines = try c.decode([EstimateLine].self, forKey: .estimateLines)
            photos = try c.decodeIfPresent([Photo].self, forKey: .photos)
            photoComments = try c.decodeIfPresent([PhotoComment].self, forKey: .photoComments)
            checklists = try c.decodeIfPresent([Checklist].self, forKey: .checklists)
            jobLogs = try c.decodeIfPresent([JobLog].self, forKey: .jobLogs)
            documents = try c.decodeIfPresent([JobDocument].self, forKey: .documents)
            forms = try c.decodeIfPresent([JobForm].self, forKey: .forms)
            tasks = try c.decodeIfPresent([PlanTask].self, forKey: .tasks)
            // Web-made lists: one row this build can't read is left out, not the whole backup.
            func lenient<T: Decodable>(_ k: CodingKeys) -> [T]? {
                ((try? c.decodeIfPresent([Lenient<T>].self, forKey: k)) ?? nil)?.compactMap(\.value)
            }
            planMarkups = lenient(.planMarkups); scheduleItems = lenient(.scheduleItems); rfis = lenient(.rfis)
            measurements = lenient(.measurements); sheetLinks = lenient(.sheetLinks)
            salesDocs = lenient(.salesDocs); salesPayments = lenient(.salesPayments)
            images = try c.decode([Image].self, forKey: .images)
            otherArrays = ProjectBundle.otherArrays(decoder, known: Self.knownKeys)
        }

        public func encode(to encoder: Encoder) throws {
            var c = encoder.container(keyedBy: CodingKeys.self)
            try c.encode(project, forKey: .project)
            try c.encode(sheets, forKey: .sheets)
            try c.encode(markers, forKey: .markers)
            try c.encode(runs, forKey: .runs)
            try c.encode(closets, forKey: .closets)
            try c.encode(estimateLines, forKey: .estimateLines)
            try c.encodeIfPresent(photos, forKey: .photos)
            try c.encodeIfPresent(photoComments, forKey: .photoComments)
            try c.encodeIfPresent(checklists, forKey: .checklists)
            try c.encodeIfPresent(jobLogs, forKey: .jobLogs)
            try c.encodeIfPresent(documents, forKey: .documents)
            try c.encodeIfPresent(forms, forKey: .forms)
            try c.encodeIfPresent(tasks, forKey: .tasks)
            try c.encodeIfPresent(planMarkups, forKey: .planMarkups)
            try c.encodeIfPresent(scheduleItems, forKey: .scheduleItems)
            try c.encodeIfPresent(rfis, forKey: .rfis)
            try c.encodeIfPresent(measurements, forKey: .measurements)
            try c.encodeIfPresent(sheetLinks, forKey: .sheetLinks)
            try c.encodeIfPresent(salesDocs, forKey: .salesDocs)
            try c.encodeIfPresent(salesPayments, forKey: .salesPayments)
            try c.encode(images, forKey: .images)
            try ProjectBundle.encodeOtherArrays(otherArrays, to: encoder, known: Self.knownKeys)
        }
    }

    public static let formatName = "pinplan-backup"
    public var format: String
    public var version: Int
    public var exportedAt: String
    public var catalog: [DeviceType]?
    /// Brand/model product library (native app; the web app ignores it).
    public var products: [Product]?
    public var projects: [ProjectEntry]

    public init(catalog: [DeviceType], products: [Product]? = nil, projects: [ProjectEntry]) {
        format = Self.formatName; version = 1; exportedAt = isoNow(); self.catalog = catalog; self.products = products; self.projects = projects
    }

    public enum BackupError: Error, LocalizedError {
        case notABackup
        public var errorDescription: String? { "That file isn't a PinPlan backup." }
    }

    public static func decode(_ data: Data) throws -> BackupFile {
        let f: BackupFile
        do { f = try JSONDecoder().decode(BackupFile.self, from: data) } catch { throw BackupError.notABackup }
        guard f.format == formatName else { throw BackupError.notABackup }
        return f
    }

    public func encoded() throws -> Data { try JSONEncoder().encode(self) }
}

extension ProjectBundle {
    /// Every JPEG this job keeps: plan sheets (and their earlier revisions), device photos and job photos (deleted rows
    /// included, so undo still finds them).
    public var storedImageIds: [String] {
        var seen = Set<String>()
        let signatures: [String] = forms.flatMap { ($0.signatures ?? []).map(\.imageId) }
        let revisions: [String] = sheets.flatMap { ($0.revisions ?? []).map(\.imageId) }
        return (sheets.map(\.imageId) + revisions + markers.compactMap(\.photoId) + photos.map(\.imageId) + signatures).filter { !$0.isEmpty && seen.insert($0).inserted }
    }
    /// Job document files (any type).
    public var storedFileIds: [String] {
        var seen = Set<String>()
        return documents.map(\.fileId).filter { !$0.isEmpty && seen.insert($0).inserted }
    }
}
