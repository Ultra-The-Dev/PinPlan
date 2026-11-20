import SwiftUI
import PinPlanCore

struct JobView: View {
    @Environment(AppModel.self) private var app
    let model: EditorModel
    /// Opens a section of the job by tab id (for the "Next step" shortcut; see ProjectTab.resolve).
    let go: (String) -> Void

    var body: some View {
        let p = model.bundle.project
        SentenceForm {
            JobHealthSection(model: model, go: go)
            Section(sentence: String(localized: "Job")) {
                LabeledContent("Address") { CommitField(title: String(localized: "Address"), value: p.address) { v in model.editSilently { $0.project.address = v } }.multilineTextAlignment(.trailing) }
                Picker("Status", selection: Binding(get: { p.status }, set: { v in model.editSilently { $0.project.status = v } })) {
                    ForEach(ProjectStatus.allCases, id: \.self) { Text(tr($0.rawValue.capitalized, context: "Job status")).tag($0) }
                }
            }
            Section {
                JobLabelsRow(model: model)
            } header: { Text("Labels").textCase(nil) } footer: {
                Text("Filter jobs by label on the jobs list (web and iPad).")
            }
            JobLocationSection(model: model)
            if app.cloud.can(.prices) {
                Section {
                    NavigationLink { JobProductsView(model: model) } label: { Label("Products for this job", systemImage: "tag") }
                    NavigationLink { QuotesInvoicesView(model: model) } label: { Label("Quotes & invoices", systemImage: "doc.text") }
                    ForEach(ProjectStatus.allCases, id: \.self) { Text($0.title).tag($0) }
                }
            }
            Section(sentence: String(localized: "Client")) {
                LabeledContent("Name") { CommitField(title: String(localized: "Name"), value: p.clientName) { v in model.editSilently { $0.project.clientName = v } }.multilineTextAlignment(.trailing) }
                LabeledContent("Email") { CommitField(title: String(localized: "Email"), value: p.clientEmail ?? "", keyboard: .emailAddress) { v in model.editSilently { $0.project.clientEmail = v } }.multilineTextAlignment(.trailing) }
                LabeledContent("Phone") { CommitField(title: String(localized: "Phone"), value: p.clientPhone ?? "", keyboard: .phonePad) { v in model.editSilently { $0.project.clientPhone = v } }.multilineTextAlignment(.trailing) }
            }
            Section(sentence: String(localized: "Notes")) {
                CommitField(title: String(localized: "Notes"), value: p.notes ?? "", prompt: String(localized: "Gate code, site contact…")) { v in model.editSilently { $0.project.notes = v } }
            }
            // Simple by default: labels, location, brands and models, backup and connected apps sit behind More.
            Section {
                NavigationLink { JobMoreView(model: model) } label: {
                    LabeledContent { Text(moreSummary(p)).lineLimit(1) } label: { Label("More", systemImage: "ellipsis.circle") }
                }
            }
        }
    }

    private func moreSummary(_ p: Project) -> String {
        var parts: [String] = []
        if let l = p.labels, !l.isEmpty { parts.append(String(localized: "\(l.count) labels")) }
        if p.lat != nil { parts.append(String(localized: "Located")) }
        return parts.isEmpty ? String(localized: "Labels, location, backup") : parts.joined(separator: " · ")
    }
}

/// The job's less-used details: labels, location, brands and models, backup, connected apps.
struct JobMoreView: View {
    @Environment(AppModel.self) private var app
    let model: EditorModel
    @State private var share: SharedFile?
    @State private var error: String?

    var body: some View {
        let p = model.bundle.project
        SentenceForm {
            Section {
                JobLabelsRow(model: model)
            } header: { Text("Labels").textCase(nil) } footer: {
                Text("Filter jobs by label on the jobs list (web and iPad).")
            }
            JobLocationSection(model: model)
            if app.cloud.can(.prices) {
                Section {
                    NavigationLink { JobProductsView(model: model) } label: { Label("Brands and models for this job", systemImage: "tag") }
                }
            }
            Section {
                Button {
                    do { share = SharedFile(url: try app.store.backup(of: [model.bundle], catalog: app.catalog, products: app.products)) } catch { self.error = error.localizedDescription }
                } label: { Label("Share backup (.pinplan.json)", systemImage: "square.and.arrow.up") }
                if let error { Text(error).foregroundStyle(.red) }
            } header: { Text("Backup").textCase(nil) } footer: {
                Text("One file with every plan, device, wire run, photo and price edit. It opens in this app or the Northpin web app.")
            }
            if !p.billduDocs.isEmpty && app.cloud.can(.prices) {
                Section(sentence: String(localized: "Billdu")) {
                    ForEach(p.billduDocs, id: \.id) { d in
                        LabeledContent("\(tr(d.type.capitalized)) \(d.serial ?? "#\(d.id)")", value: Money.format(d.amount, currency: model.pricing.currency))
                    }
                }
            }
        }
        .navigationTitle("More")
        .navigationBarTitleDisplayMode(.inline)
        .shareSheet($share)
    }
}

extension ProjectStatus {
    /// The status in the app's words (docs/ux-audit.md glossary): Quoting, Approved, Installed.
    var title: String {
        switch self {
        case .estimate: return String(localized: "Quoting")
        case .approved: return String(localized: "Approved")
        case .installed: return String(localized: "Installed")
        }
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
                            .background(on ? Color.ink : Color(.secondarySystemFill), in: Capsule())
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
                    if let loc { set(loc.coordinate.latitude, loc.coordinate.longitude) } else { model.say(String(localized: "Couldn't get your location — check Location permission in Settings")) }
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

/// Job health at a glance and the one thing to do next. Local data only (no cloud calls).
struct JobHealthSection: View {
    @Environment(AppModel.self) private var app
    let model: EditorModel
    let go: (String) -> Void

    var body: some View {
        let today = FieldDocs.localDay(isoNow())
        let e = model.bundle.estimate(catalog: app.catalog, products: app.products, pricing: model.pricing)
        let unpriced = e.lines.filter { $0.included && $0.unitPrice == 0 && $0.qty > 0 }.count
        let showPrices = app.cloud.can(.prices)
        // Technicians (no prices) get field-work next steps, like the web job summary.
        let s = JobSummary.make(model.bundle, estimate: (total: e.total, unpriced: unpriced), today: today, prices: showPrices)
        let urgent = s.next.kind == .overdueTasks || s.next.kind == .reviseProposal
        // Technicians don't have the Money tab or plan review: any step still pointing there is the office's.
        let officeStep = !showPrices && (s.next.tab == "estimate" || s.next.kind == .sendReview)
        Section {
            if s.next.kind == .done {
                nextRow(s.next, urgent: false, chevron: false)
            } else if officeStep {
                nextRow(forOffice(s.next), urgent: false, chevron: false)
            } else {
                Button { act(s.next) } label: { nextRow(s.next, urgent: urgent, chevron: true) }
                    .buttonStyle(.plain)
            }
            LabeledContent("Devices", value: devicesText(s))
            LabeledContent("Checklists", value: s.itemsTotal > 0 ? "\(s.checklistPct)% · \(s.itemsDone) of \(s.itemsTotal) done" : "None started")
            LabeledContent("Open tasks") {
                Text(tasksText(s)).foregroundStyle(s.overdueTasks > 0 ? Color.red : Color.secondary)
            }
            LabeledContent("Photos", value: photosText(s, today: today))
            LabeledContent("Last daily log", value: s.lastLogDate.map { ago($0, today: today) } ?? String(localized: "None yet"))
            if showPrices {
                LabeledContent("Pricing") {
                    Text(Money.format(e.total, currency: model.pricing.currency) + (unpriced > 0 ? String(localized: " · \(unpriced) unpriced") : ""))
                        .foregroundStyle(unpriced > 0 ? Color.red : Color.secondary)
                }
            }
        } header: { Text("Job health").textCase(nil) }
    }

    private func nextRow(_ n: JobSummary.NextStep, urgent: Bool, chevron: Bool) -> some View {
        HStack(spacing: 12) {
            Image(systemName: n.kind == .done ? "checkmark.seal.fill" : urgent ? "exclamationmark.triangle.fill" : "arrow.right.circle.fill")
                .font(.title2)
                .foregroundStyle(n.kind == .done ? Color.approved : urgent ? Color.red : Color.brand)
            VStack(alignment: .leading, spacing: 2) {
                Text("Next step").font(.caption).foregroundStyle(Color.secondary)
                Text(n.text).font(.body.weight(.semibold)).foregroundStyle(Color.primary)
            }
            Spacer(minLength: 0)
            if chevron { Image(systemName: "chevron.right").font(.caption.weight(.semibold)).foregroundStyle(Color.secondary) }
        }
        .padding(.vertical, 4)
        .contentShape(Rectangle())
    }

    /// The same step, labelled as the office's to do (shown to technicians, not tappable).
    private func forOffice(_ n: JobSummary.NextStep) -> JobSummary.NextStep {
        var x = n
        x.text = "Office: " + n.text
        return x
    }

    private func act(_ n: JobSummary.NextStep) {
        switch n.kind {
        case .markApproved: setStatus(.approved)
        case .markInstalled: setStatus(.installed)
        default: go(n.tab)
        }
    }

    private func setStatus(_ st: ProjectStatus) {
        model.editSilently { $0.project.status = st; $0.project.updatedAt = isoNow() }
    }

    private func devicesText(_ s: JobSummary) -> String {
        var parts: [String] = ["\(s.devices)"]
        if s.tentative > 0 { parts.append("\(s.tentative) optional") }
        if s.ledRuns > 0 { parts.append(String(localized: "\(s.ledRuns) LED runs")) }
        return parts.joined(separator: " · ")
    }

    private func tasksText(_ s: JobSummary) -> String {
        if s.overdueTasks > 0 { return String(localized: "\(s.openTasks) · \(s.overdueTasks) overdue") }
        if s.dueToday > 0 { return String(localized: "\(s.openTasks) · \(s.dueToday) due today") }
        return s.openTasks > 0 ? "\(s.openTasks)" : String(localized: "All clear")
    }

    private func photosText(_ s: JobSummary, today: String) -> String {
        if s.photos == 0 { return String(localized: "None yet") }
        guard let last = s.lastPhotoAt else { return "\(s.photos)" }
        return String(localized: "\(s.photos) · last \(ago(FieldDocs.localDay(last), today: today))")
    }

    /// "today", "yesterday", "3 days ago" or a short date, for a YYYY-MM-DD day.
    private func ago(_ day: String, today: String) -> String {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy-MM-dd"
        // An unreadable day would otherwise count as 0 days away and read "today".
        guard let date = f.date(from: day) else { return day }
        let d: Int = FieldDocs.daysUntil(today, today: day)
        if d == 0 { return String(localized: "today") }
        if d == 1 { return String(localized: "yesterday") }
        if d > 1 && d < 14 { return String(localized: "\(d) days ago") }
        return date.formatted(.dateTime.month(.abbreviated).day())
    }
}
