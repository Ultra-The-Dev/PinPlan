import Foundation
import UIKit
import PinPlanCore

/// App-wide settings stored on device.
struct AppSettings: Codable, Equatable {
    var business = BusinessSettings()
    var pricing = Catalog.defaultPricing
    var billduDocType = "estimate"
    /// Hosted PinPlan server (the web app) used for Billdu and AI scan; secrets stay on that server.
    var serverURL = ""
    var accessCode = ""
}

/// File-based, offline-first storage in the app's Documents folder:
///   projects/<id>.json   one ProjectBundle per project
///   images/<id>.jpg      plan sheets and device photos
///   catalog.json, settings.json
/// Documents is visible in the Files app (UIFileSharingEnabled) and included in iCloud/iTunes device backups.
final class Store: @unchecked Sendable {
    static let shared = Store()

    let root: URL
    private let projectsDir: URL
    private let imagesDir: URL
    private let pdfsDir: URL
    private let encoder: JSONEncoder = { let e = JSONEncoder(); e.outputFormatting = [.sortedKeys]; return e }()
    private let queue = DispatchQueue(label: "pinplan.store")
    private let imageCache = NSCache<NSString, UIImage>()

    init(root: URL? = nil) {
        let docs = root ?? FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0].appendingPathComponent("PinPlan", isDirectory: true)
        self.root = docs
        projectsDir = docs.appendingPathComponent("projects", isDirectory: true)
        imagesDir = docs.appendingPathComponent("images", isDirectory: true)
        pdfsDir = docs.appendingPathComponent("pdfs", isDirectory: true)
        for d in [docs, projectsDir, imagesDir, pdfsDir] { try? FileManager.default.createDirectory(at: d, withIntermediateDirectories: true) }
        imageCache.totalCostLimit = 300 * 1024 * 1024
    }

    // MARK: projects

    func loadAllProjects() -> [ProjectBundle] {
        let files = (try? FileManager.default.contentsOfDirectory(at: projectsDir, includingPropertiesForKeys: nil)) ?? []
        return files.filter { $0.pathExtension == "json" }.compactMap { url in
            guard let data = try? Data(contentsOf: url) else { return nil }
            return try? JSONDecoder().decode(ProjectBundle.self, from: data)
        }.filter { $0.project.deleted != true }
    }

    func save(_ bundle: ProjectBundle) {
        let url = projectsDir.appendingPathComponent("\(bundle.project.id).json")
        guard let data = try? encoder.encode(bundle) else { return }
        queue.async { try? data.write(to: url, options: .atomic) }
    }

    func deleteProject(_ bundle: ProjectBundle) {
        let url = projectsDir.appendingPathComponent("\(bundle.project.id).json")
        let imageIds = bundle.sheets.map(\.imageId) + bundle.markers.compactMap(\.photoId)
        queue.async {
            try? FileManager.default.removeItem(at: url)
            for id in imageIds { try? FileManager.default.removeItem(at: self.imagesDir.appendingPathComponent("\(id).jpg")) }
        }
    }

    // MARK: images

    @discardableResult
    func saveImage(_ image: UIImage, quality: CGFloat = 0.9) -> String? {
        guard let data = image.jpegData(compressionQuality: quality) else { return nil }
        return saveImageData(data, image: image)
    }

    @discardableResult
    func saveImageData(_ data: Data, id: String = newId(), image: UIImage? = nil) -> String? {
        let url = imagesDir.appendingPathComponent("\(id).jpg")
        do { try data.write(to: url, options: .atomic) } catch { return nil }
        if let image { imageCache.setObject(image, forKey: id as NSString, cost: data.count) }
        return id
    }

    func image(_ id: String) -> UIImage? {
        if let img = imageCache.object(forKey: id as NSString) { return img }
        let url = imagesDir.appendingPathComponent("\(id).jpg")
        guard let img = UIImage(contentsOfFile: url.path) else { return nil }
        imageCache.setObject(img, forKey: id as NSString, cost: Int(img.size.width * img.size.height * 4))
        return img
    }

    func imageData(_ id: String) -> Data? { try? Data(contentsOf: imagesDir.appendingPathComponent("\(id).jpg")) }

    // MARK: source PDFs (kept for crisp vector detail when zooming)

    func savePDF(from url: URL) -> String? {
        let access = url.startAccessingSecurityScopedResource()
        defer { if access { url.stopAccessingSecurityScopedResource() } }
        let id = newId()
        do { try FileManager.default.copyItem(at: url, to: pdfURL(id)) } catch { return nil }
        return id
    }

    func pdfURL(_ id: String) -> URL { pdfsDir.appendingPathComponent("\(id).pdf") }
    func hasPDF(_ id: String) -> Bool { FileManager.default.fileExists(atPath: pdfURL(id).path) }

    // MARK: catalog & settings

    func loadCatalog() -> [DeviceType] {
        if let data = try? Data(contentsOf: root.appendingPathComponent("catalog.json")),
           let c = try? JSONDecoder().decode([DeviceType].self, from: data), !c.isEmpty { return c }
        return Catalog.seed()
    }

    func saveCatalog(_ c: [DeviceType]) {
        guard let data = try? encoder.encode(c) else { return }
        let url = root.appendingPathComponent("catalog.json")
        queue.async { try? data.write(to: url, options: .atomic) }
    }

    func loadSettings() -> AppSettings {
        guard let data = try? Data(contentsOf: root.appendingPathComponent("settings.json")),
              let s = try? JSONDecoder().decode(AppSettings.self, from: data) else { return AppSettings() }
        return s
    }

    func saveSettings(_ s: AppSettings) {
        guard let data = try? encoder.encode(s) else { return }
        let url = root.appendingPathComponent("settings.json")
        queue.async { try? data.write(to: url, options: .atomic) }
    }

    // MARK: backup (same format as the web app)

    func backup(of bundles: [ProjectBundle], catalog: [DeviceType]) throws -> URL {
        let entries = bundles.map { b -> BackupFile.ProjectEntry in
            let ids = Set(b.sheets.map(\.imageId) + b.markers.compactMap(\.photoId))
            let images: [BackupFile.Image] = ids.compactMap { id in
                guard let data = imageData(id), let img = image(id) else { return nil }
                return .init(id: id, mime: "image/jpeg", width: Double(img.size.width * img.scale), height: Double(img.size.height * img.scale), data: data.base64EncodedString())
            }
            return .init(bundle: b, images: images)
        }
        let file = BackupFile(catalog: catalog, projects: entries)
        let name = (bundles.count == 1 ? slug(bundles[0].project.address) : "pinplan") + ".pinplan.json"
        let url = FileManager.default.temporaryDirectory.appendingPathComponent(name)
        try file.encoded().write(to: url, options: .atomic)
        return url
    }

    /// Restores projects (replacing ones with the same id) and adds unknown catalog types. Returns restored bundles.
    func restore(from url: URL, catalog: inout [DeviceType]) throws -> [ProjectBundle] {
        let access = url.startAccessingSecurityScopedResource()
        defer { if access { url.stopAccessingSecurityScopedResource() } }
        let file = try BackupFile.decode(Data(contentsOf: url))
        let known = Set(catalog.map(\.id))
        catalog += (file.catalog ?? []).filter { !known.contains($0.id) }
        var out: [ProjectBundle] = []
        for entry in file.projects {
            for img in entry.images { if let data = Data(base64Encoded: img.data) { saveImageData(data, id: img.id) } }
            var b = entry.bundle
            b.project.deleted = nil
            save(b)
            out.append(b)
        }
        return out
    }
}

func slug(_ s: String) -> String {
    let lowered = s.lowercased().map { $0.isLetter || $0.isNumber ? $0 : "-" }
    let collapsed = String(lowered).split(separator: "-").joined(separator: "-")
    return collapsed.isEmpty ? "project" : collapsed
}
