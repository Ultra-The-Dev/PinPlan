import Foundation

/// Ids that become file names on the device (jobs, plan images, documents, source PDFs) come from cloud sync and from
/// backup files, so they are checked before they touch a path: letters, digits, "_" and "-" only, 1 to 64 long
/// (`^[A-Za-z0-9_-]{1,64}$`, the alphabet `newId()` and the web app's nanoid use). Nothing like "../" or "/" gets through.
public enum SafeId {
    public static let maxLength = 64

    public static func isSafe(_ id: String) -> Bool {
        let scalars = id.unicodeScalars
        guard !scalars.isEmpty, scalars.count <= maxLength else { return false }
        return scalars.allSatisfy { s in
            ("a"..."z").contains(s) || ("A"..."Z").contains(s) || ("0"..."9").contains(s) || s == "_" || s == "-"
        }
    }

    /// Second layer: is `url` (after resolving "." and "..") inside `dir`? Symlinks are not followed.
    public static func isContained(_ url: URL, in dir: URL) -> Bool {
        let base = dir.standardizedFileURL.path
        let path = url.standardizedFileURL.path
        let prefix = base.hasSuffix("/") ? base : base + "/"
        return path.hasPrefix(prefix) && path.count > prefix.count
    }

    /// `dir/<id>.<ext>` when the id is safe and the result stays inside `dir`; nil otherwise.
    public static func file(_ id: String, ext: String, in dir: URL) -> URL? {
        guard isSafe(id) else { return nil }
        let url = dir.appendingPathComponent("\(id).\(ext)")
        return isContained(url, in: dir) ? url : nil
    }
}

public enum UnsafeIdError: Error, LocalizedError, Equatable {
    case unsafeId(String)
    public var errorDescription: String? { "That file isn't a PinPlan backup." }
}

extension ProjectBundle {
    /// Source PDFs this job keeps (one per import).
    public var storedPdfIds: [String] {
        var seen = Set<String>()
        return sheets.compactMap(\.sourcePdfId).filter { !$0.isEmpty && seen.insert($0).inserted }
    }

    /// Ids of this job that would become file names and fail `SafeId.isSafe` (empty when all is well).
    public var unsafeFileIds: [String] {
        ([project.id] + storedImageIds + storedFileIds + storedPdfIds).filter { !SafeId.isSafe($0) }
    }
}

extension BackupFile {
    /// Every id in the backup that would become a file name or a library key and fails `SafeId.isSafe`: jobs, plan
    /// images, documents, source PDFs, the attached image entries, catalog types and products. A restore refuses the
    /// whole backup when this isn't empty.
    public var unsafeIds: [String] {
        var bad: [String] = []
        for e in projects {
            bad += e.bundle.unsafeFileIds
            bad += e.images.map(\.id).filter { !SafeId.isSafe($0) }
        }
        bad += (catalog ?? []).map(\.id).filter { !SafeId.isSafe($0) }
        bad += (products ?? []).map(\.id).filter { !SafeId.isSafe($0) }
        return bad
    }

    /// Throws when any id is unsafe (see `unsafeIds`).
    public func validateIds() throws {
        if let first = unsafeIds.first { throw UnsafeIdError.unsafeId(first) }
    }
}

// MARK: - restore planning

/// What restoring a backup would do on this device, worked out before anything is written so the user can confirm.
public struct RestorePlan: Sendable {
    public struct Job: Sendable, Identifiable {
        public var id: String { projectId }
        public var projectId: String
        public var address: String
        /// A job with this id is already on the device.
        public var exists: Bool
    }
    public var jobs: [Job]
    /// Products the backup adds (unknown here).
    public var newProducts: [Product]
    /// Products the backup would replace: known here, older here than in the backup, and not dated in the future.
    public var newerProducts: [Product]
    /// Catalog types the backup adds (unknown here). Known types are never replaced.
    public var newCatalogTypes: [DeviceType]
    /// Whether products and catalog types come in at all (office roles only).
    public var includesLibrary: Bool

    public var existingJobs: [Job] { jobs.filter(\.exists) }
    public var newJobs: [Job] { jobs.filter { !$0.exists } }
}

public enum BackupRestore {
    /// Plan a restore. `mayImportLibrary` is false for technicians: their restores bring in jobs only.
    public static func plan(_ file: BackupFile, existingProjectIds: Set<String>, catalog: [DeviceType], products: [Product],
                            mayImportLibrary: Bool, now: String = isoNow()) -> RestorePlan {
        let jobs = file.projects.map { RestorePlan.Job(projectId: $0.project.id, address: $0.project.address, exists: existingProjectIds.contains($0.project.id)) }
        guard mayImportLibrary else { return RestorePlan(jobs: jobs, newProducts: [], newerProducts: [], newCatalogTypes: [], includesLibrary: false) }
        let knownTypes = Set(catalog.map(\.id))
        var seenTypes = Set<String>()
        let types = (file.catalog ?? []).filter { !knownTypes.contains($0.id) && seenTypes.insert($0.id).inserted }
        var added: [Product] = [], newer: [Product] = []
        var seen = Set<String>()
        for p in file.products ?? [] where p.deleted != true && seen.insert(p.id).inserted {
            if let local = products.first(where: { $0.id == p.id }) {
                // A backup's date is only a claim: never newer than now, and only when it beats the local copy.
                if p.updatedAt > local.updatedAt && p.updatedAt <= now { newer.append(p) }
            } else {
                added.append(p)
            }
        }
        return RestorePlan(jobs: jobs, newProducts: added, newerProducts: newer, newCatalogTypes: types, includesLibrary: true)
    }

    /// Apply the library part of a plan: append new products and types, replace the newer products. Replaced and
    /// added products are stamped `now` (a change made on this device), so sync treats them as a local edit.
    public static func applyLibrary(_ plan: RestorePlan, catalog: inout [DeviceType], products: inout [Product], now: String = isoNow()) {
        guard plan.includesLibrary else { return }
        catalog += plan.newCatalogTypes
        for var p in plan.newProducts + plan.newerProducts {
            p.updatedAt = now
            if let i = products.firstIndex(where: { $0.id == p.id }) { products[i] = p } else { products.append(p) }
        }
    }

    /// A copy of a job with new ids: the job, every row in it, and every plan image, document and source PDF it
    /// stores, so it never overwrites or shares files with the original. Catalog type and product ids are kept.
    /// Quotes, invoices and payments stay with the original (their numbers are given by the database).
    /// Returns the copy and the old → new map for the stored files.
    public static func copyWithNewIds(_ bundle: ProjectBundle, keep: Set<String> = [], newId make: () -> String = { newId() }) throws -> (bundle: ProjectBundle, fileIds: [String: String]) {
        var b = bundle
        b.salesDocs = []
        b.salesPayments = []
        let data = try JSONEncoder().encode(b)
        guard var root = try JSONSerialization.jsonObject(with: data) as? [String: Any] else { throw UnsafeIdError.unsafeId(bundle.project.id) }

        var ids: [String] = [b.project.id]
        for (_, value) in root {
            for row in (value as? [Any]) ?? [] {
                if let id = (row as? [String: Any])?["id"] as? String { ids.append(id) }
            }
        }
        let fileIds = b.storedImageIds + b.storedFileIds + b.storedPdfIds
        ids += fileIds
        var map: [String: String] = [:]
        for id in ids where !id.isEmpty && !keep.contains(id) && map[id] == nil { map[id] = make() }

        func isIdKey(_ k: String) -> Bool { k == "id" || k.hasSuffix("Id") || k.hasSuffix("Ids") || k.hasSuffix("_id") }
        // Long random ids are replaced wherever they appear; short ones only under id-like keys.
        func swap(_ s: String, idKey: Bool) -> String {
            guard let n = map[s] else { return s }
            return (idKey || s.count >= 8) ? n : s
        }
        func walk(_ v: Any, idKey: Bool) -> Any {
            if let s = v as? String { return swap(s, idKey: idKey) }
            if let a = v as? [Any] { return a.map { walk($0, idKey: idKey) } }
            if let d = v as? [String: Any] {
                var out: [String: Any] = [:]
                for (k, x) in d { out[swap(k, idKey: false)] = walk(x, idKey: isIdKey(k)) }
                return out
            }
            return v
        }
        root = walk(root, idKey: false) as? [String: Any] ?? root
        let out = try JSONSerialization.data(withJSONObject: root)
        var copy = try JSONDecoder().decode(ProjectBundle.self, from: out)
        copy.project.deleted = nil
        var files: [String: String] = [:]
        for id in fileIds { if let n = map[id] { files[id] = n } }
        return (copy, files)
    }
}
