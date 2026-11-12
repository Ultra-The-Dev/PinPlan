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
        public var images: [Image]
        public var bundle: ProjectBundle { ProjectBundle(project: project, sheets: sheets, markers: markers, runs: runs, closets: closets, estimateLines: estimateLines) }
        public init(bundle b: ProjectBundle, images: [Image]) {
            project = b.project; sheets = b.sheets; markers = b.markers; runs = b.runs; closets = b.closets; estimateLines = b.estimateLines; self.images = images
        }
    }

    public static let formatName = "pinplan-backup"
    public var format: String
    public var version: Int
    public var exportedAt: String
    public var catalog: [DeviceType]?
    public var projects: [ProjectEntry]

    public init(catalog: [DeviceType], projects: [ProjectEntry]) {
        format = Self.formatName; version = 1; exportedAt = isoNow(); self.catalog = catalog; self.projects = projects
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
