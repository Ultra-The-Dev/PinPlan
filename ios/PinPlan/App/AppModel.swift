import SwiftUI
import Observation
import PinPlanCore

/// App-wide state: project list, device catalog and settings.
@MainActor
@Observable
final class AppModel {
    var projects: [ProjectBundle] = []
    var catalog: [DeviceType] = []
    /// Brand/model product library.
    var products: [Product] = []
    var settings = AppSettings()
    let store: Store
    /// Cloud sync with the web app (when an account is connected in Settings).
    let cloud = CloudSync()
    /// The project open in the editor, so synced changes show up there.
    @ObservationIgnored weak var openEditor: EditorModel?

    init(store: Store = .shared) {
        self.store = store
        projects = store.loadAllProjects().sorted { $0.project.updatedAt > $1.project.updatedAt }
        catalog = store.loadCatalog()
        products = store.loadProducts()
        settings = store.loadSettings()
        cloud.attach(self)
    }

    /// Write rows that sync brought in (or removed) to disk and to the screens.
    func applySync(from before: SyncState, to after: SyncState) {
        for (id, b) in after.bundles where before.bundles[id] != b {
            store.save(b)
            if let i = projects.firstIndex(where: { $0.project.id == id }) { projects[i] = b } else { projects.append(b) }
            if openEditor?.bundle.project.id == id { openEditor?.replaceFromSync(b) }
        }
        for (id, b) in before.bundles where after.bundles[id] == nil {
            store.deleteProject(b)
            projects.removeAll { $0.project.id == id }
        }
        projects.sort { $0.project.updatedAt > $1.project.updatedAt }
        if after.catalog != before.catalog { catalog = after.catalog; store.saveCatalog(catalog) }
        if after.products != before.products { products = after.products; store.saveProducts(products) }
    }

    var pricing: PricingSettings { settings.pricing }
    var liveCatalog: [DeviceType] { catalog.filter { $0.archived != true }.sorted { $0.sort < $1.sort } }
    func type(_ id: String) -> DeviceType? { catalog.first { $0.id == id } }

    // MARK: products

    func product(_ id: String?) -> Product? { id.flatMap { pid in products.first { $0.id == pid } } }
    func products(for typeId: String) -> [Product] {
        products.filter { $0.deviceTypeId == typeId && $0.archived != true }.sorted { $0.title.localizedCaseInsensitiveCompare($1.title) == .orderedAscending }
    }
    func saveProduct(_ p: Product) {
        var p = p
        p.updatedAt = isoNow()
        if let i = products.firstIndex(where: { $0.id == p.id }) { products[i] = p } else { products.append(p) }
        store.saveProducts(products)
        cloud.kick()
    }
    /// Archived, not deleted: jobs that used it keep their prices.
    func archiveProduct(_ id: String) {
        guard let i = products.firstIndex(where: { $0.id == id }) else { return }
        products[i].archived = true
        products[i].updatedAt = isoNow()
        store.saveProducts(products)
    }
    func importProducts(_ new: [Product]) {
        products += new
        store.saveProducts(products)
    }

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
        var b = await Task.detached(priority: .userInitiated) { DemoProject.make(store: store, catalog: catalog, pricing: pricing) }.value
        // Show how products work: a few samples (only into an empty library), used by the demo job.
        if products.isEmpty {
            let note = "Sample product. Archive it anytime"
            let samples = [
                Product(deviceTypeId: "cam-indoor", brand: "Ubiquiti", model: "G5 Turret Ultra", sku: "UVC-G5-Turret-Ultra", unitPrice: 129, laborPrice: 85, notes: note),
                Product(deviceTypeId: "cam-indoor", brand: "Axis", model: "M3086-V", sku: "02373-001", unitPrice: 349, laborPrice: 95, notes: note),
                Product(deviceTypeId: "wap", brand: "Ubiquiti", model: "U7 Pro", sku: "U7-Pro", unitPrice: 189, laborPrice: 95, notes: note),
                Product(deviceTypeId: "speaker", brand: "Sonance", model: "VP62R", sku: "93002", unitPrice: 215, laborPrice: 70, notes: note),
            ]
            importProducts(samples)
            b.setProductChoice(typeId: "cam-indoor", productId: samples[0].id)
            b.setProductChoice(typeId: "wap", productId: samples[2].id)
        }
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
        cloud.kick()
    }

    func delete(_ b: ProjectBundle) {
        store.deleteProject(b)
        projects.removeAll { $0.project.id == b.project.id }
        cloud.kick()
    }

    func updateCatalog(_ t: DeviceType) {
        var t = t
        t.updatedAt = isoNow()
        if let i = catalog.firstIndex(where: { $0.id == t.id }) { catalog[i] = t } else { catalog.append(t) }
        store.saveCatalog(catalog)
        cloud.kick()
    }

    func saveSettings() { store.saveSettings(settings) }

    func restore(from url: URL) throws -> Int {
        let restored = try store.restore(from: url, catalog: &catalog, products: &products)
        store.saveCatalog(catalog)
        store.saveProducts(products)
        for b in restored { didSave(b) }
        projects.sort { $0.project.updatedAt > $1.project.updatedAt }
        return restored.count
    }
}
