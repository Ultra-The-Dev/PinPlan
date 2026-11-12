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
