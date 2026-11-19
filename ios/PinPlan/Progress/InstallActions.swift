import SwiftUI
import PinPlanCore

/// A device or run whose install progress is being shown or changed.
enum InstallRef: Hashable, Identifiable {
    case marker(String), run(String)
    var id: String {
        switch self {
        case .marker(let i): return "m:" + i
        case .run(let i): return "r:" + i
        }
    }
}

/// What a walk-mode tap does: the next step, a chosen status, or open the device's sheet.
enum WalkTarget: Hashable {
    case next, details
    case status(InstallStatus)
}

/// Progress view state on the plan (this device only): the Progress rings, walk mode, the open sheet, the undo
/// snackbar and a pending "photo required" capture.
@MainActor
@Observable
final class ProgressUI {
    static let shared = ProgressUI()
    var on = false
    var walk = false
    var target: WalkTarget = .next
    var sheet: InstallRef?
    var snack: Snack?
    var pendingPhoto: PendingPhoto?

    struct Snack: Equatable {
        let n: Int
        let ref: InstallRef
        let text: String
    }
    struct PendingPhoto: Identifiable {
        let id = UUID()
        let ref: InstallRef
        let to: InstallStatus
    }

    private var seq = 0
    func show(_ ref: InstallRef, _ text: String) {
        seq += 1
        let n = seq
        snack = Snack(n: n, ref: ref, text: text)
        Task { @MainActor in
            try? await Task.sleep(for: .seconds(4))
            if self.snack?.n == n { self.snack = nil }
        }
    }
}

/// Company setting: statuses that need a proof photo (this device; default "installed", like the web app).
enum InstallSettings {
    static let key = "pinplan.installPhotoRequired"
    static var photoRequired: [InstallStatus] {
        get {
            guard let raw = UserDefaults.standard.array(forKey: key) as? [String] else { return InstallProgress.defaultPhotoRequired }
            return raw.compactMap { InstallStatus(rawValue: $0) }
        }
        set { UserDefaults.standard.set(newValue.map(\.rawValue), forKey: key) }
    }
}

/// Install status changes go through `edit`, so undo, saving and sync work like every other plan edit.
extension EditorModel {
    func installState(_ ref: InstallRef) -> InstallState? {
        switch ref {
        case .marker(let id): return bundle.markers.first { $0.id == id }?.install
        case .run(let id): return bundle.runs.first { $0.id == id }?.install
        }
    }

    func installStatus(_ ref: InstallRef) -> InstallStatus { InstallProgress.status(installState(ref)) }

    func installWorkflow(_ ref: InstallRef) -> InstallProgress.Workflow {
        switch ref {
        case .marker(let id):
            let t = bundle.markers.first { $0.id == id }.flatMap { app.type($0.deviceTypeId) }
            return InstallProgress.workflow(category: t?.category, kind: t?.kind, trades: app.trades)
        case .run(let id):
            return InstallProgress.workflow(run: bundle.runs.first { $0.id == id }?.kind ?? .wire, trades: app.trades)
        }
    }

    func installLabel(_ ref: InstallRef) -> String {
        switch ref {
        case .marker(let id): return bundle.markers.first { $0.id == id }?.label ?? "Device"
        case .run(let id):
            guard let r = bundle.runs.first(where: { $0.id == id }) else { return "Run" }
            if let m = bundle.liveMarkers.first(where: { $0.id == r.markerId }) { return "\(m.label) cable" }
            return r.switchLabel ?? r.zone.map { "Zone \($0)" } ?? r.wireType ?? "Run"
        }
    }

    /// Why `to` can't be set right now (nil = it can).
    func installBlocked(_ ref: InstallRef, to: InstallStatus) -> String? {
        var tentative = false
        var deleted = true
        switch ref {
        case .marker(let id):
            if let m = bundle.markers.first(where: { $0.id == id }) { tentative = m.tentative; deleted = m.deleted == true }
        case .run(let id):
            if let r = bundle.runs.first(where: { $0.id == id }) { tentative = r.tentative == true; deleted = r.deleted == true }
        }
        if deleted { return "That device is gone" }
        if tentative { return "Optional (?) devices aren't tracked — confirm it first" }
        if !InstallProgress.canSet(app.cloud.role, to, from: installStatus(ref)) {
            return to == .verified ? "Only the office can verify" : "Verified — only the office can change it"
        }
        return nil
    }

    private func writeInstall(_ ref: InstallRef, _ state: InstallState?, photo: Photo? = nil) {
        let pr = pricing
        edit { b in
            if let photo { b.save(photo, in: \.photos) }
            switch ref {
            case .marker(let id): b.updateMarker(id, pricing: pr) { $0.install = state }
            case .run(let id): b.updateRun(id) { $0.install = state }
            }
        }
    }

    /// Set a status (with an optional proof photo, note or test) as one undo step. False (and a message) when not allowed.
    @discardableResult
    func setInstall(_ ref: InstallRef, to: InstallStatus, photo: Photo? = nil, note: String? = nil, test: InstallState.Test? = nil) -> Bool {
        if let why = installBlocked(ref, to: to) {
            say(why)
            return false
        }
        let next = InstallProgress.apply(installState(ref), to: to, by: FieldAuthor.name(app), at: isoNow(), photoId: photo?.id, note: note, test: test)
        writeInstall(ref, next, photo: photo)
        return true
    }

    /// Add a proof photo without changing the status.
    func attachInstallPhoto(_ ref: InstallRef, photo: Photo) {
        var s = installState(ref) ?? InstallState(status: .planned, photoIds: [], history: [])
        if !(s.photoIds ?? []).contains(photo.id) { s.photoIds = (s.photoIds ?? []) + [photo.id] }
        writeInstall(ref, s, photo: photo)
    }

    /// Office: clear the device's progress and history.
    func resetInstall(_ ref: InstallRef) {
        guard InstallProgress.canReset(app.cloud.role) else { say("Only the office can reset progress"); return }
        writeInstall(ref, nil)
    }

    /// Office: mark these devices verified, one undo step.
    func verifyAll(_ ids: [String]) -> Int {
        guard InstallProgress.canSet(app.cloud.role, .verified) else { say("Only the office can verify"); return 0 }
        let by = FieldAuthor.name(app)
        let now = isoNow()
        let pr = pricing
        var n = 0
        edit { b in
            for id in ids {
                guard let m = b.markers.first(where: { $0.id == id }), InstallProgress.markable(tentative: m.tentative, deleted: m.deleted),
                      InstallProgress.status(m) != .verified else { continue }
                b.updateMarker(id, pricing: pr) { $0.install = InstallProgress.apply($0.install, to: .verified, by: by, at: now) }
                n += 1
            }
        }
        return n
    }

    /// The photos that prove this item's progress (its install photos plus the device's site photos).
    func installPhotos(_ ref: InstallRef) -> [Photo] {
        let ids = Set(installState(ref)?.photoIds ?? [])
        var markerId: String?
        switch ref {
        case .marker(let id): markerId = id
        case .run(let id): markerId = bundle.runs.first { $0.id == id }?.markerId
        }
        return bundle.livePhotos.filter { ids.contains($0.id) || (markerId != nil && $0.markerId == markerId) }
    }

    /// A new job photo for this item, from the camera (linked to its device).
    func makeInstallPhoto(_ image: UIImage, for ref: InstallRef) -> Photo? {
        guard var p = PhotoImport.make(image: image, projectId: bundle.project.id, author: FieldAuthor.name(app), location: nil, store: app.store) else { return nil }
        switch ref {
        case .marker(let id):
            p.markerId = id
            if let m = bundle.markers.first(where: { $0.id == id }) {
                p.sheetId = m.sheetId
                p.room = m.room.isEmpty ? nil : m.room
            }
        case .run(let id):
            if let r = bundle.runs.first(where: { $0.id == id }) { p.markerId = r.markerId; p.sheetId = r.sheetId }
        }
        p.tags = (p.tags ?? []) + ["install"]
        return p
    }
}
