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
        public var images: [Image]
        /// Entries in `images` that are job documents (any file type; the web app keeps them with the images).
        public var documentFileIds: Set<String> { Set((documents ?? []).map(\.fileId)) }
        public var bundle: ProjectBundle {
            var b = ProjectBundle(project: project, sheets: sheets, markers: markers, runs: runs, closets: closets, estimateLines: estimateLines)
            b.photos = photos ?? []; b.photoComments = photoComments ?? []; b.checklists = checklists ?? []
            b.jobLogs = jobLogs ?? []; b.documents = documents ?? []
            return b
        }
        public init(bundle b: ProjectBundle, images: [Image]) {
            project = b.project; sheets = b.sheets; markers = b.markers; runs = b.runs; closets = b.closets; estimateLines = b.estimateLines; self.images = images
            photos = b.photos; photoComments = b.photoComments; checklists = b.checklists; jobLogs = b.jobLogs; documents = b.documents
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
    /// Every JPEG this job keeps: plan sheets, device photos and job photos (deleted rows included, so undo still finds them).
    public var storedImageIds: [String] {
        var seen = Set<String>()
        return (sheets.map(\.imageId) + markers.compactMap(\.photoId) + photos.map(\.imageId)).filter { !$0.isEmpty && seen.insert($0).inserted }
    }
    /// Job document files (any type).
    public var storedFileIds: [String] {
        var seen = Set<String>()
        return documents.map(\.fileId).filter { !$0.isEmpty && seen.insert($0).inserted }
    }
}
