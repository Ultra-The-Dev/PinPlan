import SwiftUI
import Observation
import PinPlanCore

/// App-wide state: project list, device catalog and settings.
@MainActor
@Observable
final class AppModel {
    var projects: [ProjectBundle] = []
    var catalog: [DeviceType] = []
    var settings = AppSettings()
    let store: Store

    init(store: Store = .shared) {
        self.store = store
        projects = store.loadAllProjects().sorted { $0.project.updatedAt > $1.project.updatedAt }
        catalog = store.loadCatalog()
        settings = store.loadSettings()
    }

    var pricing: PricingSettings { settings.pricing }
    var liveCatalog: [DeviceType] { catalog.filter { $0.archived != true }.sorted { $0.sort < $1.sort } }
    func type(_ id: String) -> DeviceType? { catalog.first { $0.id == id } }

    func createProject(address: String, client: String, email: String, phone: String) -> ProjectBundle {
        let p = Project(clientName: client, address: address, clientEmail: email.isEmpty ? nil : email, clientPhone: phone.isEmpty ? nil : phone)
        let b = ProjectBundle(project: p)
        store.save(b)
        projects.insert(b, at: 0)
        return b
    }

    var creatingDemo = false

    /// Files opened in PinPlan from other apps, waiting for the user to pick a project.
    var incomingFiles: [URL] = []
    /// Files to import once the chosen project's Sheets screen appears.
    var pendingImport: (projectId: String, urls: [URL])?

    /// Copy an opened file into our temp folder right away (inbox / security-scoped URLs can disappear).
    func receive(_ url: URL) {
        let access = url.startAccessingSecurityScopedResource()
        defer { if access { url.stopAccessingSecurityScopedResource() } }
        let copy = FileManager.default.temporaryDirectory.appendingPathComponent("\(UUID().uuidString)-\(url.lastPathComponent)")
        if (try? FileManager.default.copyItem(at: url, to: copy)) != nil {
            if url.pathExtension.lowercased() == "json", let n = try? restore(from: copy), n > 0 { return }
            incomingFiles.append(copy)
        }
    }

    /// A ready-made demo job to explore every feature (plans are drawn off the main thread).
    func createDemo() async -> ProjectBundle {
        creatingDemo = true
        defer { creatingDemo = false }
        let store = store, catalog = catalog, pricing = pricing
        let b = await Task.detached(priority: .userInitiated) { DemoProject.make(store: store, catalog: catalog, pricing: pricing) }.value
        store.save(b)
        projects.insert(b, at: 0)
        return b
    }

    /// A sample sheet laid out like an architect's plan set (rotated page, notes, dimension strings).
    func createArchitectSample() async -> ProjectBundle {
        let store = store
        let b = await Task.detached(priority: .userInitiated) { ArchitectSample.make(store: store) }.value
        store.save(b)
        projects.insert(b, at: 0)
        return b
    }

    /// A project built from one plan file through the normal import paths (automation / real-plan tests).
    func createProject(fromFile url: URL) async -> ProjectBundle {
        let store = store
        let b = await Task.detached(priority: .userInitiated) { FileProject.make(url: url, store: store) }.value
        store.save(b)
        projects.insert(b, at: 0)
        return b
    }

    /// Called by the editor whenever a project changes.
    func didSave(_ b: ProjectBundle) {
        if let i = projects.firstIndex(where: { $0.project.id == b.project.id }) { projects[i] = b } else { projects.insert(b, at: 0) }
    }

    func delete(_ b: ProjectBundle) {
        store.deleteProject(b)
        projects.removeAll { $0.project.id == b.project.id }
    }

    func updateCatalog(_ t: DeviceType) {
        var t = t
        t.updatedAt = isoNow()
        if let i = catalog.firstIndex(where: { $0.id == t.id }) { catalog[i] = t } else { catalog.append(t) }
        store.saveCatalog(catalog)
    }

    func saveSettings() { store.saveSettings(settings) }

    func restore(from url: URL) throws -> Int {
        let restored = try store.restore(from: url, catalog: &catalog)
        store.saveCatalog(catalog)
        for b in restored { didSave(b) }
        projects.sort { $0.project.updatedAt > $1.project.updatedAt }
        return restored.count
    }
}
