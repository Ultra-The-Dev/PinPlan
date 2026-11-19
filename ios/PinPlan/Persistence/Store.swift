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
    /// Company checklist templates saved from jobs ("Save as template"). Optional so older settings.json files still decode.
    var checklistTemplates: [ChecklistTemplate]? = nil
    /// The company's trades, primary first (TradeId raw values). Nil = low voltage only, as before.
    var trades: [String]? = nil
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
        let imageIds = bundle.storedImageIds
        let fileIds = bundle.storedFileIds
        // Source PDFs are per import (never shared between jobs), so they go with the job too.
        let pdfIds = Set(bundle.sheets.compactMap(\.sourcePdfId))
        queue.async {
            try? FileManager.default.removeItem(at: url)
            for id in imageIds { try? FileManager.default.removeItem(at: self.imagesDir.appendingPathComponent("\(id).jpg")) }
            for id in fileIds { try? FileManager.default.removeItem(at: self.fileURL(id)) }
            for id in pdfIds { try? FileManager.default.removeItem(at: self.pdfURL(id)) }
        }
        for id in imageIds { imageCache.removeObject(forKey: id as NSString) }
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
        if let image { imageCache.setObject(image, forKey: id as NSString, cost: data.count) } else { imageCache.removeObject(forKey: id as NSString) }
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
    /// Whether the image is on this device (without reading it).
    func hasImage(_ id: String) -> Bool { FileManager.default.fileExists(atPath: imagesDir.appendingPathComponent("\(id).jpg").path) }

    // MARK: job documents (any file type), kept next to the images

    func fileURL(_ id: String) -> URL { imagesDir.appendingPathComponent("\(id).file") }
    func fileData(_ id: String) -> Data? { try? Data(contentsOf: fileURL(id)) }
    /// Whether the document is on this device (without reading it — files can be 25 MB).
    func hasFile(_ id: String) -> Bool { FileManager.default.fileExists(atPath: fileURL(id).path) }
    func saveFile(_ data: Data, id: String = newId()) {
        try? data.write(to: fileURL(id), options: .atomic)
    }

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

    func loadProducts() -> [Product] {
        guard let data = try? Data(contentsOf: root.appendingPathComponent("products.json")),
              let p = try? JSONDecoder().decode([Product].self, from: data) else { return [] }
        return p
    }

    func saveProducts(_ p: [Product]) {
        guard let data = try? encoder.encode(p) else { return }
        let url = root.appendingPathComponent("products.json")
        queue.async { try? data.write(to: url, options: .atomic) }
    }

    func loadSettings() -> AppSettings {
        let url = root.appendingPathComponent("settings.json")
        guard FileManager.default.fileExists(atPath: url.path) else {
            var fresh = AppSettings()
            // A device with no settings and no jobs is a new install: neutral business defaults (never another
            // company's details). Devices that already had data keep the defaults they had (no marker).
            let jobs = (try? FileManager.default.contentsOfDirectory(atPath: projectsDir.path)) ?? []
            if jobs.isEmpty { fresh.business.brandDefaults = BusinessSettings.neutralMarker }
            return fresh
        }
        guard let data = try? Data(contentsOf: url), let s = try? JSONDecoder().decode(AppSettings.self, from: data) else { return AppSettings() }
        return s
    }

    /// Delete every file this app keeps (jobs, images, documents, PDFs, catalog, products, settings, sync ledgers)
    /// and start again with empty folders. Waits for queued writes first so nothing is written back afterwards.
    func wipeAll() {
        queue.sync {}
        imageCache.removeAllObjects()
        try? FileManager.default.removeItem(at: root)
        for d in [root, projectsDir, imagesDir, pdfsDir] { try? FileManager.default.createDirectory(at: d, withIntermediateDirectories: true) }
    }

    func saveSettings(_ s: AppSettings) {
        guard let data = try? encoder.encode(s) else { return }
        let url = root.appendingPathComponent("settings.json")
        queue.async { try? data.write(to: url, options: .atomic) }
    }

    // MARK: backup (same format as the web app)

    func backup(of bundles: [ProjectBundle], catalog: [DeviceType], products: [Product] = []) throws -> URL {
        let entries = bundles.map { b -> BackupFile.ProjectEntry in
            var images: [BackupFile.Image] = b.storedImageIds.compactMap { id in
                guard let data = imageData(id), let img = image(id) else { return nil }
                return .init(id: id, mime: "image/jpeg", width: Double(img.size.width * img.scale), height: Double(img.size.height * img.scale), data: data.base64EncodedString())
            }
            // Job documents travel with the images, like the web app's backups.
            for d in b.documents where d.deleted != true {
                guard let data = fileData(d.fileId), !images.contains(where: { $0.id == d.fileId }) else { continue }
                images.append(.init(id: d.fileId, mime: d.mime, width: 0, height: 0, data: data.base64EncodedString()))
            }
            return .init(bundle: b, images: images)
        }
        // Deleted products (from cloud sync) stay out of the backup, as on the web.
        let live = products.filter { $0.deleted != true }
        let file = BackupFile(catalog: catalog, products: live.isEmpty ? nil : live, projects: entries)
        let name = (bundles.count == 1 ? slug(bundles[0].project.address) : "pinplan") + ".pinplan.json"
        let url = FileManager.default.temporaryDirectory.appendingPathComponent(name)
        try file.encoded().write(to: url, options: .atomic)
        return url
    }

    /// Restores projects (replacing ones with the same id) and adds unknown catalog types. Returns restored bundles.
    func restore(from url: URL, catalog: inout [DeviceType], products: inout [Product]) throws -> [ProjectBundle] {
        let access = url.startAccessingSecurityScopedResource()
        defer { if access { url.stopAccessingSecurityScopedResource() } }
        let file = try BackupFile.decode(Data(contentsOf: url))
        let known = Set(catalog.map(\.id))
        catalog += (file.catalog ?? []).filter { !known.contains($0.id) }
        // Products: add new ones, take the newer copy of ones we already have.
        for p in file.products ?? [] {
            if let i = products.firstIndex(where: { $0.id == p.id }) { if p.updatedAt > products[i].updatedAt { products[i] = p } } else { products.append(p) }
        }
        var out: [ProjectBundle] = []
        for entry in file.projects {
            let docs = entry.documentFileIds
            for img in entry.images {
                guard let data = Data(base64Encoded: img.data) else { continue }
                // Documents (PDFs, spreadsheets…) are stored as files, not as JPEG images.
                if docs.contains(img.id) { saveFile(data, id: img.id) } else { saveImageData(data, id: img.id) }
            }
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
