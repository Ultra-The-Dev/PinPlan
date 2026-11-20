import Foundation
import UIKit
import PinPlanCore

/// App-wide settings stored on device.
struct AppSettings: Codable, Equatable {
    var business = BusinessSettings()
    var pricing = Catalog.defaultPricing
    var billduDocType = "estimate"
    /// Hosted Northpin server (the web app) used for sign-in setup, Billdu and the legal pages; secrets stay on that server.
    /// Starts as the address built into the app (`PinPlanServerURL`); Settings › More › Advanced can change it.
    var serverURL = AppSettings.builtInServerURL
    /// Only for a self-hosted server that uses an access code instead of sign-in (Settings › More › Advanced).
    var accessCode = ""
    /// Company checklist templates saved from jobs ("Save as template"). Optional so older settings.json files still decode.
    var checklistTemplates: [ChecklistTemplate]? = nil
    /// The company's trades, primary first (TradeId raw values). Nil = low voltage only, as before.
    var trades: [String]? = nil
    /// Company form templates (same JSON as the web app's settings `formTemplates`). Optional so older settings still decode.
    var formTemplates: [FormTemplate]? = nil

    /// The Northpin server this build ships with: the `PINPLAN_SERVER_URL` build setting, written into the Info.plist as
    /// `PinPlanServerURL`. Empty when the build didn't set one (a developer build without a server).
    static var builtInServerURL: String {
        let raw = (Bundle.main.object(forInfoDictionaryKey: "PinPlanServerURL") as? String ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        // An unexpanded "$(PINPLAN_SERVER_URL)" means the setting wasn't defined at all.
        return raw.hasPrefix("$(") ? "" : raw
    }

    /// True while the app talks to the server it was built with (nothing changed under Advanced).
    var usesBuiltInServer: Bool {
        serverURL.trimmingCharacters(in: .whitespaces) == Self.builtInServerURL && accessCode.isEmpty
    }
}

/// File-based, offline-first storage in the app's Application Support folder (not Documents, so nothing shows in the
/// Files app; older installs are moved over once):
///   projects/<id>.json   one ProjectBundle per project
///   images/<id>.jpg      plan sheets and device photos
///   catalog.json, settings.json
/// Every file is written with complete-unless-open data protection (unreadable while the device is locked, except
/// files already open). Ids come from sync and from backups, so every id is checked with `PinPlanCore.SafeId` before
/// it becomes a file name, and the resulting path must stay inside its folder.
final class Store: @unchecked Sendable {
    static let shared = Store()

    let root: URL
    private let projectsDir: URL
    private let imagesDir: URL
    private let pdfsDir: URL
    private let encoder: JSONEncoder = { let e = JSONEncoder(); e.outputFormatting = [.sortedKeys]; return e }()
    private let queue = DispatchQueue(label: "pinplan.store")
    private let imageCache = NSCache<NSString, UIImage>()

    /// Writes: atomic and unreadable while the device is locked (unless the file is already open).
    static let writeOptions: Data.WritingOptions = [.atomic, .completeFileProtectionUnlessOpen]
    private static let protection: [FileAttributeKey: Any] = [.protectionKey: FileProtectionType.completeUnlessOpen]

    init(root: URL? = nil) {
        let base = root ?? Store.defaultRoot()
        self.root = base
        projectsDir = base.appendingPathComponent("projects", isDirectory: true)
        imagesDir = base.appendingPathComponent("images", isDirectory: true)
        pdfsDir = base.appendingPathComponent("pdfs", isDirectory: true)
        createFolders()
        imageCache.totalCostLimit = 300 * 1024 * 1024
    }

    private func createFolders() {
        for d in [root, projectsDir, imagesDir, pdfsDir] {
            try? FileManager.default.createDirectory(at: d, withIntermediateDirectories: true, attributes: Self.protection)
        }
    }

    /// Application Support/Northpin. The first launch after an update moves Documents/Northpin here (once) and
    /// re-protects what it moved.
    static func defaultRoot() -> URL {
        let fm = FileManager.default
        let support = fm.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        let newRoot = support.appendingPathComponent("Northpin", isDirectory: true)
        let oldRoot = fm.urls(for: .documentDirectory, in: .userDomainMask)[0].appendingPathComponent("Northpin", isDirectory: true)
        guard fm.fileExists(atPath: oldRoot.path) else { return newRoot }
        try? fm.createDirectory(at: support, withIntermediateDirectories: true, attributes: protection)
        if !fm.fileExists(atPath: newRoot.path) {
            try? fm.moveItem(at: oldRoot, to: newRoot)
        } else {
            // Both exist (an interrupted move): bring over whatever isn't here yet, folder by folder.
            mergeMove(from: oldRoot, to: newRoot)
        }
        protectTree(newRoot)
        return newRoot
    }

    private static func mergeMove(from: URL, to: URL) {
        let fm = FileManager.default
        for name in (try? fm.contentsOfDirectory(atPath: from.path)) ?? [] {
            let src = from.appendingPathComponent(name), dst = to.appendingPathComponent(name)
            var isDir: ObjCBool = false
            if fm.fileExists(atPath: dst.path, isDirectory: &isDir) {
                if isDir.boolValue { mergeMove(from: src, to: dst) }
                continue
            }
            try? fm.moveItem(at: src, to: dst)
        }
        // What is left was already here (the newer copy wins); the old folder goes.
        try? fm.removeItem(at: from)
    }

    private static func protectTree(_ dir: URL) {
        let fm = FileManager.default
        try? fm.setAttributes(protection, ofItemAtPath: dir.path)
        guard let e = fm.enumerator(at: dir, includingPropertiesForKeys: nil) else { return }
        for case let url as URL in e { try? fm.setAttributes(protection, ofItemAtPath: url.path) }
    }

    /// Can this app read its files right now? False while the device is locked (complete-unless-open protection):
    /// a small check file is written if missing and read back.
    func isReadable() -> Bool {
        let url = root.appendingPathComponent(".readable")
        if !FileManager.default.fileExists(atPath: url.path) { try? Data("ok".utf8).write(to: url, options: Self.writeOptions) }
        return (try? Data(contentsOf: url)) != nil
    }

    // MARK: safe paths

    /// `dir/<id>.<ext>` for a safe id (PinPlanCore.SafeId: checked, and the path must stay inside `dir`); nil otherwise.
    private func path(_ id: String, _ ext: String, in dir: URL) -> URL? { PinPlanCore.SafeId.file(id, ext: ext, in: dir) }
    private func projectURL(_ id: String) -> URL? { path(id, "json", in: projectsDir) }
    private func imageURL(_ id: String) -> URL? { path(id, "jpg", in: imagesDir) }
    /// A path no id can produce (ids have no dots), for callers that need a URL for a bad id: nothing is ever there.
    private func nowhere(_ dir: URL, _ ext: String) -> URL { dir.appendingPathComponent(".invalid-id.\(ext)") }

    /// A job whose id or stored file ids are unsafe (a bad sync row or backup) is never written.
    private func isSafe(_ bundle: ProjectBundle) -> Bool { bundle.unsafeFileIds.isEmpty }

    // MARK: projects

    func loadAllProjects() -> [ProjectBundle] {
        let files = (try? FileManager.default.contentsOfDirectory(at: projectsDir, includingPropertiesForKeys: nil)) ?? []
        return files.filter { $0.pathExtension == "json" }.compactMap { url in
            guard let data = try? Data(contentsOf: url) else { return nil }
            return try? JSONDecoder().decode(ProjectBundle.self, from: data)
        }.filter { $0.project.deleted != true && isSafe($0) }
    }

    /// Writes the job. A job with an unsafe id (or unsafe stored file ids) is skipped.
    func save(_ bundle: ProjectBundle) {
        guard isSafe(bundle), let url = projectURL(bundle.project.id) else { return }
        guard let data = try? encoder.encode(bundle) else { return }
        queue.async { try? data.write(to: url, options: Self.writeOptions) }
    }

    func deleteProject(_ bundle: ProjectBundle) {
        // Only safe ids become paths: a bad id never deletes anything outside the job's folders.
        let url = projectURL(bundle.project.id)
        let imageURLs = bundle.storedImageIds.compactMap { imageURL($0) }
        let fileURLs = bundle.storedFileIds.compactMap { path($0, "file", in: imagesDir) }
        // Source PDFs are per import (never shared between jobs), so they go with the job too.
        let pdfURLs = bundle.storedPdfIds.compactMap { path($0, "pdf", in: pdfsDir) }
        queue.async {
            if let url { try? FileManager.default.removeItem(at: url) }
            for u in imageURLs + fileURLs + pdfURLs { try? FileManager.default.removeItem(at: u) }
        }
        for id in bundle.storedImageIds { imageCache.removeObject(forKey: id as NSString) }
    }

    // MARK: images

    @discardableResult
    func saveImage(_ image: UIImage, quality: CGFloat = 0.9) -> String? {
        guard let data = image.jpegData(compressionQuality: quality) else { return nil }
        return saveImageData(data, image: image)
    }

    @discardableResult
    func saveImageData(_ data: Data, id: String = newId(), image: UIImage? = nil) -> String? {
        guard let url = imageURL(id) else { return nil }
        do { try data.write(to: url, options: Self.writeOptions) } catch { return nil }
        if let image { imageCache.setObject(image, forKey: id as NSString, cost: data.count) } else { imageCache.removeObject(forKey: id as NSString) }
        return id
    }

    func image(_ id: String) -> UIImage? {
        guard let url = imageURL(id) else { return nil }
        if let img = imageCache.object(forKey: id as NSString) { return img }
        guard let img = UIImage(contentsOfFile: url.path) else { return nil }
        imageCache.setObject(img, forKey: id as NSString, cost: Int(img.size.width * img.size.height * 4))
        return img
    }

    func imageData(_ id: String) -> Data? { imageURL(id).flatMap { try? Data(contentsOf: $0) } }
    /// Whether the image is on this device (without reading it).
    func hasImage(_ id: String) -> Bool { imageURL(id).map { FileManager.default.fileExists(atPath: $0.path) } ?? false }

    // MARK: job documents (any file type), kept next to the images

    /// The document's path; for an unsafe id a path where nothing is ever stored.
    func fileURL(_ id: String) -> URL { path(id, "file", in: imagesDir) ?? nowhere(imagesDir, "file") }
    func fileData(_ id: String) -> Data? { try? Data(contentsOf: fileURL(id)) }
    /// Whether the document is on this device (without reading it — files can be 25 MB).
    func hasFile(_ id: String) -> Bool { FileManager.default.fileExists(atPath: fileURL(id).path) }
    func saveFile(_ data: Data, id: String = newId()) {
        guard let url = path(id, "file", in: imagesDir) else { return }
        try? data.write(to: url, options: Self.writeOptions)
    }

    // MARK: source PDFs (kept for crisp vector detail when zooming)

    func savePDF(from url: URL) -> String? {
        let access = url.startAccessingSecurityScopedResource()
        defer { if access { url.stopAccessingSecurityScopedResource() } }
        let id = newId()
        let dest = pdfURL(id)
        do { try FileManager.default.copyItem(at: url, to: dest) } catch { return nil }
        try? FileManager.default.setAttributes(Self.protection, ofItemAtPath: dest.path)
        return id
    }

    /// The source PDF's path; for an unsafe id a path where nothing is ever stored.
    func pdfURL(_ id: String) -> URL { path(id, "pdf", in: pdfsDir) ?? nowhere(pdfsDir, "pdf") }
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
        queue.async { try? data.write(to: url, options: Self.writeOptions) }
    }

    func loadProducts() -> [Product] {
        guard let data = try? Data(contentsOf: root.appendingPathComponent("products.json")),
              let p = try? JSONDecoder().decode([Product].self, from: data) else { return [] }
        return p
    }

    func saveProducts(_ p: [Product]) {
        guard let data = try? encoder.encode(p) else { return }
        let url = root.appendingPathComponent("products.json")
        queue.async { try? data.write(to: url, options: Self.writeOptions) }
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
        guard let data = try? Data(contentsOf: url), var s = try? JSONDecoder().decode(AppSettings.self, from: data) else { return AppSettings() }
        // No server address saved (older versions, or cleared under Advanced): use the one built into the app.
        if s.serverURL.trimmingCharacters(in: .whitespaces).isEmpty { s.serverURL = AppSettings.builtInServerURL }
        return s
    }

    /// Delete every file this app keeps (jobs, images, documents, PDFs, catalog, products, settings, sync ledgers)
    /// and start again with empty folders. Waits for queued writes first so nothing is written back afterwards.
    func wipeAll() {
        queue.sync {}
        imageCache.removeAllObjects()
        try? FileManager.default.removeItem(at: root)
        createFolders()
    }

    func saveSettings(_ s: AppSettings) {
        guard let data = try? encoder.encode(s) else { return }
        let url = root.appendingPathComponent("settings.json")
        queue.async { try? data.write(to: url, options: Self.writeOptions) }
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
        try file.encoded().write(to: url, options: Self.writeOptions)
        return url
    }

    /// Read a backup without changing anything. Throws when it isn't a Northpin backup or when any id in it is unsafe
    /// (PinPlanCore.SafeId): a bad file is refused as a whole.
    func readBackup(from url: URL) throws -> BackupFile {
        let access = url.startAccessingSecurityScopedResource()
        defer { if access { url.stopAccessingSecurityScopedResource() } }
        let file = try BackupFile.decode(Data(contentsOf: url))
        try file.validateIds()
        return file
    }

    /// Write the jobs of a backup the user confirmed. Jobs whose id is in `asCopies` come in as copies with new ids
    /// (their plan images and documents too, so the original's files are never overwritten); the others keep their
    /// ids. `keepIds` (catalog types, products) are never renamed. Products and catalog types are applied by the caller
    /// from the confirmed plan (PinPlanCore.BackupRestore). Returns the jobs written.
    func restoreJobs(from file: BackupFile, asCopies: Set<String>, keepIds: Set<String>) throws -> [ProjectBundle] {
        try file.validateIds()
        var out: [ProjectBundle] = []
        for entry in file.projects {
            let docs = entry.documentFileIds
            var b = entry.bundle
            var rename: [String: String] = [:]
            if asCopies.contains(b.project.id) {
                let copy = try PinPlanCore.BackupRestore.copyWithNewIds(b, keep: keepIds)
                b = copy.bundle
                rename = copy.fileIds
            }
            b.project.deleted = nil
            guard isSafe(b) else { continue }
            for img in entry.images {
                guard let data = Data(base64Encoded: img.data) else { continue }
                let id = rename[img.id] ?? img.id
                // Documents (PDFs, spreadsheets…) are stored as files, not as JPEG images.
                if docs.contains(img.id) { saveFile(data, id: id) } else { saveImageData(data, id: id) }
            }
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
