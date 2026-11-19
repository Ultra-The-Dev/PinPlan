import SwiftUI
import PinPlanCore

/// One device's (or run's) install record: big status buttons, proof photos from the camera, a test result
/// (pass/fail plus a reading such as dB loss or ohms), "Report issue" and the history.
struct DeviceInstallSheet: View {
    @Environment(AppModel.self) private var app
    @Environment(\.dismiss) private var dismiss
    let model: EditorModel
    let ref: InstallRef

    /// What a photo from the camera is for: proof for a status, or just another photo.
    struct CameraIntent: Identifiable {
        let id = UUID()
        let status: InstallStatus?
        /// A test result saved together with the proof photo (the status it sets needs one).
        var test: InstallState.Test? = nil
        var note: String? = nil
    }

    @State private var camera: CameraIntent?
    @State private var pass: Bool?
    @State private var reading = ""
    @State private var issueNote = ""
    @State private var reportingIssue = false
    @State private var viewer: PhotoViewerItem?

    private var status: InstallStatus { model.installStatus(ref) }
    private var workflow: InstallProgress.Workflow { model.installWorkflow(ref) }
    private var state: InstallState? { model.installState(ref) }

    var body: some View {
        NavigationStack {
            List {
                summarySection
                statusSection
                photosSection
                testSection
                issueSection
                historySection
                resetSection
            }
            .navigationTitle(model.installLabel(ref))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }
        }
        .presentationDetents([.medium, .large])
        .fullScreenCover(item: $camera) { intent in
            CameraPicker { img in
                Task { @MainActor in took(img, intent: intent) }
            }
            .ignoresSafeArea()
        }
        .fullScreenCover(item: $viewer) { v in PhotoViewer(model: model, ids: v.ids, current: v.start) }
        .onAppear {
            pass = state?.test?.pass
            reading = state?.test?.value ?? ""
        }
    }

    private func took(_ img: UIImage, intent: CameraIntent) {
        guard let p = model.makeInstallPhoto(img, for: ref) else { return }
        if let s = intent.status { model.setInstall(ref, to: s, photo: p, note: intent.note, test: intent.test) } else { model.attachInstallPhoto(ref, photo: p) }
    }

    private func choose(_ s: InstallStatus) {
        if s != status && InstallProgress.requiresPhoto(InstallSettings.photoRequired, s) && CameraPicker.isAvailable {
            camera = CameraIntent(status: s)
            return
        }
        if model.setInstall(ref, to: s) { UIImpactFeedbackGenerator(style: .light).impactOccurred() }
    }

    private var summarySection: some View {
        Section {
            HStack(spacing: 10) {
                Circle().fill(Color(hex: InstallProgress.color(status))).frame(width: 14, height: 14)
                Text(status == .planned ? "Not started" : workflow.label(status)).font(.headline)
                Spacer()
                if let at = state?.at {
                    Text([state?.by, String(at.prefix(10))].compactMap { $0 }.joined(separator: " · ")).font(.caption).foregroundStyle(.secondary)
                }
            }
        }
    }

    private var statusSection: some View {
        let role = app.cloud.role
        let steps = workflow.steps + (InstallProgress.canSet(role, .verified) ? [InstallStatus.verified] : [])
        return Section("Status") {
            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 10) {
                ForEach(steps, id: \.self) { s in
                    StatusButton(title: workflow.label(s), status: s, on: s == status,
                                 needsPhoto: s != status && InstallProgress.requiresPhoto(InstallSettings.photoRequired, s),
                                 enabled: InstallProgress.canSet(role, s, from: status)) { choose(s) }
                }
            }
            .padding(.vertical, 4)
        }
    }

    private var photosSection: some View {
        let photos = model.installPhotos(ref)
        return Section("Proof photos (\(photos.count))") {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    if CameraPicker.isAvailable {
                        Button { camera = CameraIntent(status: nil) } label: {
                            VStack(spacing: 4) {
                                Image(systemName: "camera.fill").font(.title3)
                                Text("Add").font(.caption)
                            }
                            .frame(width: 72, height: 72)
                            .background(Color(.tertiarySystemFill), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                        }
                        .buttonStyle(.plain)
                    }
                    ForEach(photos) { p in
                        Button { viewer = PhotoViewerItem(ids: photos.map(\.id), start: p.id) } label: { PhotoThumb(photo: p, size: 72) }
                            .buttonStyle(.plain)
                    }
                }
                .padding(.vertical, 4)
            }
        }
    }

    private var testSection: some View {
        let role = app.cloud.role
        return Section {
            HStack(spacing: 10) {
                BigToggle(title: "Pass", on: pass == true, color: Color.green) { pass = true }
                BigToggle(title: "Fail", on: pass == false, color: Color.red) { pass = false }
            }
            TextField(placeholder, text: $reading)
            Button("Save test result") {
                guard let pass else { return }
                let test = InstallState.Test(pass: pass, value: reading.trimmingCharacters(in: .whitespaces).isEmpty ? nil : reading)
                let to: InstallStatus = !pass ? .issue : (status == .verified ? .verified : .tested)
                let note: String? = pass ? nil : "Test failed"
                // Same photo rule as the status buttons: a status that needs proof takes the photo first.
                if to != status && InstallProgress.requiresPhoto(InstallSettings.photoRequired, to) && CameraPicker.isAvailable {
                    camera = CameraIntent(status: to, test: test, note: note)
                    return
                }
                model.setInstall(ref, to: to, note: note, test: test)
            }
            .disabled(pass == nil || !InstallProgress.canSet(role, pass == false ? .issue : .tested, from: status))
        } header: {
            Text("Test result")
        } footer: {
            if let t = state?.test { Text("Last: \(InstallProgress.testText(t))") }
        }
    }

    private var placeholder: String {
        switch workflow.id {
        case "cable": return "Reading, e.g. 0.4 dB loss"
        case "circuit", "electrical": return "Reading, e.g. 0.3 Ω, 120 V"
        case "pipe", "plumbing", "hvac": return "Reading, e.g. 150 psi held"
        default: return "Reading (optional)"
        }
    }

    private var issueSection: some View {
        Section {
            if reportingIssue {
                TextField("What's wrong?", text: $issueNote, axis: .vertical).lineLimit(2...5)
                Button("Flag issue", role: .destructive) {
                    if model.setInstall(ref, to: .issue, note: issueNote) { reportingIssue = false; issueNote = "" }
                }
            } else {
                Button(role: .destructive) { reportingIssue = true } label: { Label("Report issue", systemImage: "exclamationmark.triangle") }
                    .disabled(!InstallProgress.canSet(app.cloud.role, .issue, from: status))
            }
        }
    }

    @ViewBuilder private var historySection: some View {
        let entries = Array((state?.history ?? []).reversed())
        if !entries.isEmpty {
            Section("History") {
                ForEach(entries.indices, id: \.self) { i in
                    let e = entries[i]
                    HStack(alignment: .top, spacing: 8) {
                        Circle().fill(Color(hex: InstallProgress.color(e.status))).frame(width: 9, height: 9).padding(.top, 5)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(e.status == .planned ? "Reset" : workflow.label(e.status)).font(.subheadline.weight(.semibold))
                            if let n = e.note, !n.isEmpty { Text(n).font(.subheadline) }
                            Text([e.by, String(e.at.prefix(16)).replacingOccurrences(of: "T", with: " ")].compactMap { $0 }.joined(separator: " · "))
                                .font(.caption).foregroundStyle(.secondary)
                        }
                    }
                }
            }
        }
    }

    @ViewBuilder private var resetSection: some View {
        if InstallProgress.canReset(app.cloud.role) && state != nil {
            Section {
                Button("Reset progress", role: .destructive) { model.resetInstall(ref) }
            }
        }
    }
}

private struct StatusButton: View {
    let title: String
    let status: InstallStatus
    let on: Bool
    let needsPhoto: Bool
    let enabled: Bool
    let action: () -> Void

    var body: some View {
        let color = Color(hex: InstallProgress.color(status))
        Button(action: action) {
            VStack(spacing: 2) {
                HStack(spacing: 6) {
                    Image(systemName: on ? "checkmark" : "circle.fill").font(.system(size: on ? 15 : 9, weight: .bold))
                        .foregroundStyle(on ? Color.white : color)
                    Text(title).font(.headline)
                }
                if needsPhoto { Text("photo").font(.caption2).opacity(0.7) }
            }
            .frame(maxWidth: .infinity, minHeight: 56)
            .foregroundStyle(on ? Color.white : Color.primary)
            .background(on ? color : Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        }
        .buttonStyle(.plain)
        .disabled(!enabled)
        .opacity(enabled ? 1 : 0.4)
    }
}

private struct BigToggle: View {
    let title: String
    let on: Bool
    let color: Color
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(title).font(.headline)
                .frame(maxWidth: .infinity, minHeight: 50)
                .foregroundStyle(on ? Color.white : Color.primary)
                .background(on ? color : Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        }
        .buttonStyle(.plain)
    }
}
