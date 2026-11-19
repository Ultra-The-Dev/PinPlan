import SwiftUI
import PinPlanCore

struct JobView: View {
    @Environment(AppModel.self) private var app
    let model: EditorModel
    @State private var share: SharedFile?
    @State private var error: String?

    var body: some View {
        let p = model.bundle.project
        SentenceForm {
            Section(sentence: "Job") {
                LabeledContent("Address") { CommitField(title: "Address", value: p.address) { v in model.editSilently { $0.project.address = v } }.multilineTextAlignment(.trailing) }
                Picker("Status", selection: Binding(get: { p.status }, set: { v in model.editSilently { $0.project.status = v } })) {
                    ForEach(ProjectStatus.allCases, id: \.self) { Text($0.rawValue.capitalized).tag($0) }
                }
            }
            Section {
                JobLabelsRow(model: model)
            } header: { Text("Labels").textCase(nil) } footer: {
                Text("Filter jobs by label on the jobs list (web and iPad).")
            }
            JobLocationSection(model: model)
            Section {
                NavigationLink { JobProductsView(model: model) } label: { Label("Products for this job", systemImage: "tag") }
            }
            Section(sentence: "Client") {
                LabeledContent("Name") { CommitField(title: "Name", value: p.clientName) { v in model.editSilently { $0.project.clientName = v } }.multilineTextAlignment(.trailing) }
                LabeledContent("Email") { CommitField(title: "Email", value: p.clientEmail ?? "", keyboard: .emailAddress) { v in model.editSilently { $0.project.clientEmail = v } }.multilineTextAlignment(.trailing) }
                LabeledContent("Phone") { CommitField(title: "Phone", value: p.clientPhone ?? "", keyboard: .phonePad) { v in model.editSilently { $0.project.clientPhone = v } }.multilineTextAlignment(.trailing) }
            }
            Section(sentence: "Notes") {
                CommitField(title: "Notes", value: p.notes ?? "", prompt: "Gate code, site contact…") { v in model.editSilently { $0.project.notes = v } }
            }
            Section {
                Button {
                    do { share = SharedFile(url: try app.store.backup(of: [model.bundle], catalog: app.catalog, products: app.products)) } catch { self.error = error.localizedDescription }
                } label: { Label("Share backup (.pinplan.json)", systemImage: "square.and.arrow.up") }
                if let error { Text(error).foregroundStyle(.red) }
            } header: { Text("Backup").textCase(nil) } footer: {
                Text("One file with every sheet, device, run, photo and estimate edit. It opens in this app or the PinPlan web app.")
            }
            if !p.billduDocs.isEmpty {
                Section(sentence: "Billdu") {
                    ForEach(p.billduDocs, id: \.id) { d in
                        LabeledContent("\(d.type.capitalized) \(d.serial ?? "#\(d.id)")", value: Money.format(d.amount, currency: model.pricing.currency))
                    }
                }
            }
        }
        .shareSheet($share)
    }
}

/// Job labels: tap to toggle a suggestion, or add your own.
struct JobLabelsRow: View {
    let model: EditorModel
    @State private var adding = false
    @State private var custom = ""
    var body: some View {
        let labels = model.bundle.project.labels ?? []
        let options = labels + FieldDocs.suggestedLabels.filter { !labels.contains($0) }
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                ForEach(options, id: \.self) { l in
                    let on = labels.contains(l)
                    Button { set(on ? labels.filter { $0 != l } : labels + [l]) } label: {
                        Text(l).font(.subheadline.weight(.medium)).padding(.horizontal, 10).padding(.vertical, 5)
                            .background(on ? Color.accentColor : Color(.secondarySystemFill), in: Capsule())
                            .foregroundStyle(on ? Color.white : Color.primary)
                    }
                    .buttonStyle(.plain)
                }
                Button { custom = ""; adding = true } label: { Image(systemName: "plus.circle") }.accessibilityLabel("New label")
            }
            .padding(.vertical, 2)
        }
        .alert("New label", isPresented: $adding) {
            TextField("Label", text: $custom)
            Button("Add") {
                let t = custom.trimmingCharacters(in: .whitespaces)
                if !t.isEmpty && !labels.contains(t) { set(labels + [t]) }
            }
            Button("Cancel", role: .cancel) {}
        }
    }
    private func set(_ l: [String]) { model.editSilently { $0.project.labels = l.isEmpty ? nil : l; $0.project.updatedAt = isoNow() } }
}

/// Where the job is — for the jobs map. Set from here, or automatically from the first photo with GPS.
struct JobLocationSection: View {
    let model: EditorModel
    @State private var locating = false
    var body: some View {
        let p = model.bundle.project
        Section {
            if let lat = p.lat, let lng = p.lng {
                LabeledContent("Location", value: String(format: "%.5f, %.5f", lat, lng))
                if let url = URL(string: "https://maps.apple.com/?ll=\(lat),\(lng)&q=\(p.address.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? "Job")") {
                    Link(destination: url) { Label("Open in Maps", systemImage: "map") }
                }
            }
            Button {
                locating = true
                Task {
                    let was = LocationOnce.enabled
                    LocationOnce.enabled = true
                    let loc = await LocationOnce.shared.current()
                    LocationOnce.enabled = was
                    locating = false
                    if let loc { set(loc.coordinate.latitude, loc.coordinate.longitude) } else { model.say("Couldn't get your location — check Location permission in Settings") }
                }
            } label: { Label(locating ? "Locating…" : "Use my current location", systemImage: "location") }
            .disabled(locating)
            if let gps = model.bundle.livePhotos.first(where: { $0.lat != nil && $0.lng != nil }) {
                Button { set(gps.lat!, gps.lng!) } label: { Label("Use a photo’s location", systemImage: "photo") }
            }
            if p.lat != nil {
                Button("Clear location", role: .destructive) { model.editSilently { $0.project.lat = nil; $0.project.lng = nil; $0.project.updatedAt = isoNow() } }
            }
        } header: { Text("Location").textCase(nil) } footer: {
            Text("Puts the job on the jobs map. The first photo with GPS sets it automatically.")
        }
    }
    private func set(_ lat: Double, _ lng: Double) { model.editSilently { $0.project.lat = lat; $0.project.lng = lng; $0.project.updatedAt = isoNow() } }
}
