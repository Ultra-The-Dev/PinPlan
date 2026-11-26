import SwiftUI
import UIKit
import TipKit
import PinPlanCore

@main
struct PinPlanApp: App {
    @State private var app = AppModel()
    @Environment(\.scenePhase) private var scenePhase
    /// "Restored 2 jobs", shown once the confirmation sheet has gone (an alert can't open while it closes).
    @State private var restoredMessage: String?

    init() {
        TipsSetup.configure()
        MainActor.assumeIsolated {
            ProgressOverlays.register()
            TaskOverlays.register()
            FindSimilarOverlays.register()
        }
    }

    var body: some Scene {
        WindowGroup {
            Group {
                // Launched while the device was locked: nothing is loaded until it is unlocked (AppModel.waitingForUnlock).
                if app.waitingForUnlock { PrivacyCoverView().onAppear { app.loadIfWaiting() } } else { ProjectsView() }
            }
                .environment(app)
                .onOpenURL { url in app.receive(url) }
                // A newer TestFlight build? (AppUpdate.swift; again each time the app comes back, at most every 6 h.)
                .task { await AppUpdate.shared.check(serverURL: app.settings.serverURL) }
                .tint(.brand)
                .textCase(nil)   // section headers in sentence case, not ALL CAPS
                .sheet(item: $app.pendingRestore, onDismiss: {
                    if let m = restoredMessage { restoredMessage = nil; app.restoreMessage = m }
                }) { pending in
                    RestoreConfirmSheet(pending: pending) { restoredMessage = $0 }.environment(app)
                }
                .alert(app.restoreMessage ?? "", isPresented: Binding(get: { app.restoreMessage != nil }, set: { if !$0 { app.restoreMessage = nil } })) {
                    Button("OK") {}
                }
                // Covers the screen in the app switcher (and while a system prompt is over the app), so job details,
                // client names and prices never show in the snapshot.
                .overlay { if scenePhase != .active { PrivacyCoverView() } }
                .onChange(of: scenePhase) { _, phase in
                    if phase == .active {
                        PrivacyCover.hide()
                        app.loadIfWaiting(force: true)
                        // Back from the background: catch up with the team now (the sync loop may be most of a minute
                        // away), and send an edit made just before the app was put away (its sync was suspended).
                        app.cloud.kick()
                        let server = app.settings.serverURL
                        Task { await AppUpdate.shared.check(serverURL: server) }
                    } else {
                        PrivacyCover.show()
                    }
                }
        }
    }
}

// MARK: - privacy cover

/// The brand screen shown while the app is inactive or in the background. A window above everything (sheets and
/// full-screen covers included), plus an overlay on the root view as a fallback.
@MainActor
enum PrivacyCover {
    private static var windows: [UIWindow] = []

    static func show() {
        guard windows.isEmpty else { return }
        for case let scene as UIWindowScene in UIApplication.shared.connectedScenes {
            let w = UIWindow(windowScene: scene)
            w.windowLevel = .alert + 1
            let host = UIHostingController(rootView: PrivacyCoverView())
            host.view.backgroundColor = .clear
            w.rootViewController = host
            w.isHidden = false
            windows.append(w)
        }
    }

    static func hide() {
        for w in windows { w.isHidden = true }
        windows = []
    }
}

struct PrivacyCoverView: View {
    var body: some View {
        ZStack {
            Color.paper.ignoresSafeArea()
            Text(verbatim: "Northpin")
                .font(.system(size: 40, weight: .bold, design: .rounded))
                .foregroundStyle(Color.brand)
        }
        .accessibilityHidden(true)
    }
}

// MARK: - restore confirmation

/// What a backup brings in, before anything is written: the jobs (already on this device or new), and for office roles
/// the products and catalog items it adds or replaces. Jobs already here come in as copies unless the user chooses to
/// replace them.
struct RestoreConfirmSheet: View {
    @Environment(AppModel.self) private var app
    @Environment(\.dismiss) private var dismiss
    let pending: PendingRestore
    var onRestored: (String) -> Void = { _ in }
    @State private var replaceExisting = false
    @State private var error: String?

    private var plan: PinPlanCore.RestorePlan { pending.plan }
    private var leavesOutLibrary: Bool {
        !plan.includesLibrary && (!(pending.file.products ?? []).isEmpty || !(pending.file.catalog ?? []).isEmpty)
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    ForEach(plan.jobs) { job in
                        LabeledContent(job.address.isEmpty ? String(localized: "Job") : job.address) {
                            Text(tr(job.exists ? (replaceExisting ? "Replaces" : "Copy") : "New", context: "Restore")).foregroundStyle(.secondary)
                        }
                    }
                } header: {
                    Text(String(localized: "\(plan.jobs.count) jobs"))
                } footer: {
                    if !plan.existingJobs.isEmpty {
                        Text(replaceExisting ? String(localized: "Jobs already on this device are replaced by the backup's copy.")
                                             : String(localized: "Jobs already on this device come in as copies; the originals stay as they are."))
                    }
                }
                if !plan.existingJobs.isEmpty {
                    Section { Toggle("Replace jobs on this device", isOn: $replaceExisting) }
                }
                if plan.includesLibrary && !(plan.newProducts.isEmpty && plan.newerProducts.isEmpty) {
                    Section("Products") {
                        ForEach(plan.newProducts) { p in LabeledContent(p.title) { Text(tr("New", context: "Restore")).foregroundStyle(.secondary) } }
                        ForEach(plan.newerProducts) { p in LabeledContent(p.title) { Text(tr("Replaces", context: "Restore")).foregroundStyle(.secondary) } }
                    }
                }
                if plan.includesLibrary && !plan.newCatalogTypes.isEmpty {
                    Section("Catalog") {
                        ForEach(plan.newCatalogTypes) { t in LabeledContent(t.name) { Text(tr("New", context: "Restore")).foregroundStyle(.secondary) } }
                    }
                }
                if leavesOutLibrary {
                    Section { Text("Products and catalog items are left out: only the office brings them in.").foregroundStyle(.secondary) }
                }
            }
            .navigationTitle("Restore backup")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { app.cancelRestore(); dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Restore") {
                        do {
                            let n = try app.confirmRestore(replaceExisting: replaceExisting)
                            onRestored(String(localized: "Restored \(n) jobs"))
                            dismiss()
                        } catch { self.error = error.localizedDescription }
                    }
                    .disabled(plan.jobs.isEmpty && !plan.includesLibrary)
                }
            }
            .alert(error ?? "", isPresented: Binding(get: { error != nil }, set: { if !$0 { error = nil } })) { Button("OK") {} }
        }
    }
}
