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
    /// The settings as last written, so a save that changed nothing keeps its time (`AppSettings.updatedAt`).
    @ObservationIgnored private var savedSettings: AppSettings?

    /// True while the app was started with the device locked (iOS can pre-launch apps): Store files are written
    /// complete-unless-open, so they can't be read yet. Nothing is loaded, saved or synced until the device is
    /// unlocked (`loadIfWaiting`), so empty data read while locked never overwrites the real files.
    private(set) var waitingForUnlock = false

    init(store: Store = .shared) {
        self.store = store
        guard store.isReadable() else {
            waitingForUnlock = true
            NotificationCenter.default.addObserver(forName: UIApplication.protectedDataDidBecomeAvailableNotification, object: nil, queue: .main) { [weak self] _ in
                MainActor.assumeIsolated { self?.loadIfWaiting() }
            }
            return
        }
        load()
    }

    /// Load what a launch while locked skipped. `force` when the user is in the app (the device is unlocked).
    func loadIfWaiting(force: Bool = false) {
        guard waitingForUnlock, force || store.isReadable() else { return }
        waitingForUnlock = false
        load()
    }

    private func load() {
        projects = store.loadAllProjects().sorted { $0.project.updatedAt > $1.project.updatedAt }
        catalog = store.loadCatalog()
        products = store.loadProducts()
        settings = store.loadSettings()
        // Fill blank business fields: founder defaults only on devices that had settings before neutral defaults
        // existed; new installs start neutral (the founder's team still gets its own via `business`, from billing).
        settings.business = settings.business.withDefaults(founder: settings.business.brandDefaults != BusinessSettings.neutralMarker)
        savedSettings = settings
        cloud.attach(self)
    }

    /// Write rows that sync brought in (or removed) to disk and to the screens.
    func applySync(from before: SyncState, to after: SyncState) {
        for (id, b) in after.bundles where before.bundles[id] != b {
            // A row whose ids can't be file names never reaches the disk or the screens (PinPlanCore.SafeId).
            guard b.unsafeFileIds.isEmpty else { continue }
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

    /// The business details for client-facing output (estimates, proposals, reports, PDFs): what the user entered,
    /// blanks filled with founder defaults only for the founder's company (comped team, or a device set up before
    /// neutral defaults existed) and neutral defaults for everyone else.
    var business: BusinessSettings { settings.business.resolved(plan: cloud.team?.billing?.status) }

    /// Settings with `business` resolved (for helpers that take the whole settings, e.g. loading the logo).
    var brandedSettings: AppSettings {
        var s = settings
        s.business = business
        return s
    }

    /// Device preferences that survive `wipeLocalData()`: how this device shows things, nothing about the company,
    /// the account or a job.
    static let devicePreferenceKeys = ["viewer.minimap", "viewer.pencilDraws", "pinplan.field.todayOpen", "pinplan.photoLocation", "pinplan.officeOverlays"]

    /// Remove everything this app keeps on this device except device preferences: jobs, plans, photos, documents,
    /// catalog, products, settings, the sync ledger, cached team and plan tiles, waiting files and backups (after
    /// deleting the account, or on sign-out). The app starts fresh, as if new.
    func wipeLocalData() {
        cloud.wipeForAccountDeletion()
        openEditor = nil
        incomingFiles = []
        pendingImport = nil
        pendingRestore = nil
        restoreMessage = nil
        store.wipeAll()
        let defaults = UserDefaults.standard
        let keep = Self.devicePreferenceKeys.compactMap { k in defaults.object(forKey: k).map { (k, $0) } }
        if let id = Bundle.main.bundleIdentifier { defaults.removePersistentDomain(forName: id) }
        for (k, v) in keep { defaults.set(v, forKey: k) }
        let fm = FileManager.default
        var folders = [fm.temporaryDirectory, fm.urls(for: .cachesDirectory, in: .userDomainMask)[0]]
        // Files other apps opened in Northpin land in Documents/Inbox; older installs kept the store in Documents.
        folders.append(fm.urls(for: .documentDirectory, in: .userDomainMask)[0])
        for dir in folders {
            for url in (try? fm.contentsOfDirectory(at: dir, includingPropertiesForKeys: nil)) ?? [] { try? fm.removeItem(at: url) }
        }
        projects = []
        catalog = store.loadCatalog()
        products = []
        settings = store.loadSettings()
        settings.business = settings.business.withDefaults(founder: false)
        savedSettings = settings
    }

    var pricing: PricingSettings { settings.pricing }
    var liveCatalog: [DeviceType] { catalog.filter { $0.archived != true }.sorted { $0.sort < $1.sort } }
    func type(_ id: String) -> DeviceType? { catalog.first { $0.id == id } }

    // MARK: products

    func product(_ id: String?) -> Product? { id.flatMap { pid in products.first { $0.id == pid } } }
    func products(for typeId: String) -> [Product] {
        products.filter { $0.deviceTypeId == typeId && $0.archived != true && $0.deleted != true }.sorted { $0.title.localizedCaseInsensitiveCompare($1.title) == .orderedAscending }
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

    /// Files opened in Northpin from other apps, waiting for the user to pick a project.
    var incomingFiles: [URL] = []
    /// Files to import once the chosen project's Sheets screen appears.
    var pendingImport: (projectId: String, urls: [URL])?

    /// A backup waiting for the user to confirm what it brings in (never restored straight away).
    var pendingRestore: PendingRestore?
    /// The outcome of a restore (or why a file was refused), shown once.
    var restoreMessage: String?

    /// Copy an opened file into our temp folder right away (inbox / security-scoped URLs can disappear). A Northpin
    /// backup waits for confirmation (`pendingRestore`); other files wait for the user to pick a job.
    func receive(_ url: URL) {
        let access = url.startAccessingSecurityScopedResource()
        defer { if access { url.stopAccessingSecurityScopedResource() } }
        let fm = FileManager.default
        let copy = fm.temporaryDirectory.appendingPathComponent("\(UUID().uuidString)-\(url.lastPathComponent)")
        guard (try? fm.copyItem(at: url, to: copy)) != nil else { return }
        // iOS puts files opened from other apps in Documents/Inbox: we have our copy, so the original goes.
        let inbox = fm.urls(for: .documentDirectory, in: .userDomainMask)[0].appendingPathComponent("Inbox", isDirectory: true)
        if PinPlanCore.SafeId.isContained(url.resolvingSymlinksInPath(), in: inbox.resolvingSymlinksInPath()) { try? fm.removeItem(at: url) }
        if url.pathExtension.lowercased() == "json" {
            do {
                try prepareRestore(from: copy)
                try? fm.removeItem(at: copy)
                return
            } catch let e as PinPlanCore.UnsafeIdError {
                try? fm.removeItem(at: copy)
                restoreMessage = tr(e.localizedDescription)
                return
            } catch {
                // Not a backup: treat it like any other file.
            }
        }
        incomingFiles.append(copy)
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

    /// Write the settings. A save that changed something is dated now (the company's cloud copy and this one compare
    /// those times; screens save when they close, so an unchanged save keeps the old time).
    func saveSettings() {
        var unchanged: AppSettings = settings
        unchanged.updatedAt = savedSettings?.updatedAt
        let changed: Bool = savedSettings == nil || unchanged != savedSettings
        if changed { settings.updatedAt = isoNow() }
        savedSettings = settings
        store.saveSettings(settings)
        if changed { cloud.kick() }
    }

    /// The company's parts of the settings (business details, prices, templates…) were changed on a screen that hasn't
    /// saved them yet (settings screens edit `settings` directly and save when they close).
    var hasUnsavedCompanySettings: Bool {
        guard let saved = savedSettings else { return false }
        let photos: [InstallStatus] = InstallSettings.photoRequired
        return settings.companyPrefs(installPhotoRequired: photos) != saved.companyPrefs(installPhotoRequired: photos)
    }

    /// Write settings that came from the company's cloud copy (or were cleared for another account): keeps the time
    /// of this device's own last change.
    func replaceSettingsFromCloud(_ s: AppSettings) {
        settings = s
        savedSettings = s
        store.saveSettings(s)
    }

    /// Another account's company setup was left on this device: back to a fresh install's (device choices stay).
    func forgetCompanySetup() {
        var s: AppSettings = settings
        s.forgetCompanySetup()
        s.business = s.business.withDefaults(founder: false)
        replaceSettingsFromCloud(s)
        InstallSettings.reset()
    }

    // MARK: trades

    /// The company's trades, primary first (nothing set = low voltage).
    var trades: [TradeId] { Trades.normalize(settings.trades) }

    /// Set the trades. Newly enabled trades add their starting catalog and wire prices; nothing is replaced or deleted.
    /// Returns how many catalog items were added.
    @discardableResult
    func setTrades(_ list: [TradeId], addPacks: Bool = true) -> Int {
        let before = trades
        let next = Trades.normalize(list)
        var added = 0
        if addPacks {
            for t in next where !before.contains(t) {
                let add = Trades.packAdditions(t, catalog: catalog, wirePrices: settings.pricing.wirePrices, now: isoNow())
                for d in add.types + add.unarchive {
                    updateCatalog(d)
                    added += 1
                }
                for (w, p) in add.wirePrices where settings.pricing.wirePrices[w] == nil { settings.pricing.wirePrices[w] = p }
            }
        }
        settings.trades = next.map(\.rawValue)
        saveSettings()
        return added
    }

    /// The company's saved checklist templates (cleaned up).
    var checklistTemplates: [ChecklistTemplate] { FieldDocs.normalizeTemplates(settings.checklistTemplates) }

    /// The company's form templates (cleaned up); the built-ins come from PinPlanCore.
    var formTemplates: [FormTemplate] { Forms.normalizeTemplates(settings.formTemplates) }

    /// Change the saved checklist templates and write settings right away.
    func updateChecklistTemplates(_ f: ([ChecklistTemplate]) -> [ChecklistTemplate]) {
        settings.checklistTemplates = FieldDocs.normalizeTemplates(f(checklistTemplates))
        saveSettings()
    }

    /// May this user bring products and catalog types in from a backup? Office roles only (and people working alone).
    var mayImportLibrary: Bool { cloud.can(.editCatalog) }

    /// Read a backup and wait for the user to confirm (`pendingRestore`). Nothing is written yet. Throws when the
    /// file isn't a Northpin backup or contains an unsafe id.
    func prepareRestore(from url: URL) throws {
        let file = try store.readBackup(from: url)
        let plan = PinPlanCore.BackupRestore.plan(file, existingProjectIds: Set(projects.map(\.project.id)), catalog: catalog,
                                                  products: products, mayImportLibrary: mayImportLibrary)
        pendingRestore = PendingRestore(file: file, plan: plan)
    }

    /// Restore the confirmed backup. Jobs already on this device come in as copies with new ids unless
    /// `replaceExisting`. Returns how many jobs were restored.
    @discardableResult
    func confirmRestore(replaceExisting: Bool) throws -> Int {
        guard let pending = pendingRestore else { return 0 }
        pendingRestore = nil
        // The role may have changed while the sheet was open: plan again with what is true now.
        let plan = PinPlanCore.BackupRestore.plan(pending.file, existingProjectIds: Set(projects.map(\.project.id)), catalog: catalog,
                                                  products: products, mayImportLibrary: mayImportLibrary)
        let copies = replaceExisting ? Set<String>() : Set(plan.existingJobs.map(\.projectId))
        let keep = Set(catalog.map(\.id) + products.map(\.id) + (pending.file.catalog ?? []).map(\.id) + (pending.file.products ?? []).map(\.id))
        let restored = try store.restoreJobs(from: pending.file, asCopies: copies, keepIds: keep)
        if plan.includesLibrary {
            PinPlanCore.BackupRestore.applyLibrary(plan, catalog: &catalog, products: &products)
            store.saveCatalog(catalog)
            store.saveProducts(products)
        }
        for b in restored { didSave(b) }
        projects.sort { $0.project.updatedAt > $1.project.updatedAt }
        return restored.count
    }

    func cancelRestore() { pendingRestore = nil }
}

/// A backup read from a file, waiting for the user to confirm (AppModel.pendingRestore).
struct PendingRestore: Identifiable {
    let id = UUID()
    let file: PinPlanCore.BackupFile
    let plan: PinPlanCore.RestorePlan
}
