import SwiftUI
import PinPlanCore

/// Settings, grouped by what you're doing: connect the server, then business details, pricing and wire.
struct SettingsView: View {
    @Environment(AppModel.self) private var app
    @Environment(\.dismiss) private var dismiss
    // Screenshot/automation hook: `--server` opens the server page directly.
    @State private var openServer = ProcessInfo.processInfo.arguments.contains("--server")
    // Screenshot hook: `--delete-account` opens the Delete account screen.
    @State private var openDelete = ProcessInfo.processInfo.arguments.contains("--delete-account")

    var body: some View {
        @Bindable var app = app
        SentenceForm {
            Section {
                NavigationLink { ServerSetupView() } label: {
                    LabeledContent {
                        Text(app.settings.serverURL.isEmpty ? "Not set up" : host(app.settings.serverURL))
                    } label: {
                        Label("PinPlan server", systemImage: "server.rack")
                    }
                }
            } footer: {
                Text("Needed for sending to Billdu, account tools and the legal pages. Everything else works offline.")
            }
            Section {
                NavigationLink { CloudSyncView() } label: {
                    LabeledContent {
                        Text(app.cloud.signedIn ? (app.cloud.session?.email ?? "On") : "Off")
                    } label: { Label("Account and cloud sync", systemImage: "arrow.triangle.2.circlepath.icloud") }
                }
            } footer: {
                Text("Sign in to keep jobs in step between iPhone, iPad and the web app. Password reset and account deletion are here too.")
            }
            Section {
                NavigationLink { TeamView() } label: {
                    LabeledContent {
                        Text(teamSummary)
                    } label: { Label("Team", systemImage: "person.2") }
                }
            } footer: {
                Text(app.cloud.role == .tech
                     ? "You're a technician on this team: field work on every job. Prices, estimates and proposals stay with the office."
                     : "Give your office staff and technicians their own sign-in. Technicians don't see prices.")
            }
            Section {
                NavigationLink { TradeSettingsView() } label: {
                    LabeledContent {
                        Text(app.trades.map { Trades.pack($0).short }.joined(separator: " + "))
                    } label: { Label("Trades", systemImage: "wrench.and.screwdriver") }
                }
                NavigationLink { BusinessSettingsView() } label: {
                    LabeledContent {
                        Text(app.settings.business.name.isEmpty ? "Add your details" : app.settings.business.name)
                    } label: { Label("Your business", systemImage: "building.2") }
                }
                if app.cloud.can(.prices) {
                    NavigationLink { PricingSettingsView() } label: {
                        LabeledContent {
                            Text("\(app.settings.pricing.markupPct.clean)% markup · \(app.settings.pricing.taxPct.clean)% tax")
                        } label: { Label("Pricing", systemImage: "dollarsign.circle") }
                    }
                }
                NavigationLink { WireSettingsView() } label: {
                    LabeledContent {
                        Text("+\(app.settings.pricing.wireSlackPct.clean)% slack")
                    } label: { Label("Wire and home runs", systemImage: "cable.connector") }
                }
                NavigationLink { ChecklistTemplatesView() } label: {
                    LabeledContent {
                        Text(app.checklistTemplates.isEmpty ? "Built-in only" : "\(app.checklistTemplates.count) saved")
                    } label: { Label("Checklist templates", systemImage: "checklist") }
                }
            }
            AboutSection()
        }
        .navigationTitle("Settings")
        .navigationDestination(isPresented: $openServer) { ServerSetupView() }
        .navigationDestination(isPresented: $openDelete) { DeleteAccountView() }
        .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { app.saveSettings(); dismiss() } } }
        .onDisappear { app.saveSettings() }
    }

    private var teamSummary: String {
        if let t = app.cloud.team?.team, let r = app.cloud.role { return "\(t.name.isEmpty ? "Team" : t.name) · \(r.short)" }
        return app.cloud.signedIn ? "Working alone" : "Off"
    }

    private func host(_ raw: String) -> String {
        URL(string: raw.hasPrefix("http") ? raw : "https://\(raw)")?.host() ?? raw
    }
}

/// The company's saved checklist templates: rename or delete. New ones come from a job's checklist ("Save as template").
struct ChecklistTemplatesView: View {
    @Environment(AppModel.self) private var app
    @State private var renaming: ChecklistTemplate?
    @State private var newName = ""

    var body: some View {
        let mine: [ChecklistTemplate] = app.checklistTemplates.sorted { $0.name.localizedCompare($1.name) == .orderedAscending }
        SentenceList {
            Section {
                if mine.isEmpty {
                    Text("No saved templates yet. Open a job’s checklist, set it up the way your crew works, then tap the bookmark to save it as a template.")
                        .font(.subheadline).foregroundStyle(.secondary)
                }
                ForEach(mine) { t in
                    NavigationLink {
                        ChecklistTemplatePreview(template: t)
                    } label: {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(t.name)
                            Text(summary(t)).font(.caption).foregroundStyle(.secondary)
                        }
                    }
                    .swipeActions {
                        Button("Delete", role: .destructive) { delete(t) }
                        Button("Rename") { newName = t.name; renaming = t }
                    }
                    .contextMenu {
                        Button { newName = t.name; renaming = t } label: { Label("Rename…", systemImage: "pencil") }
                        Button(role: .destructive) { delete(t) } label: { Label("Delete", systemImage: "trash") }
                    }
                }
            } header: {
                SentenceHeader(title: "Your templates")
            } footer: {
                Text("They show first under New checklist on every job. Checklists already started from a template stay as they are.")
            }
            Section(sentence: "Built in") {
                ForEach(FieldDocs.templates) { t in
                    LabeledContent(t.name) { Text("\(t.items.count) items") }
                }
            }
        }
        .navigationTitle("Checklist templates")
        .alert("Rename template", isPresented: Binding(get: { renaming != nil }, set: { if !$0 { renaming = nil } })) {
            TextField("Name", text: $newName)
            Button("Save") {
                if let t = renaming { app.updateChecklistTemplates { FieldDocs.renameTemplate($0, id: t.id, name: newName) } }
                renaming = nil
            }
            Button("Cancel", role: .cancel) { renaming = nil }
        }
    }

    private func summary(_ t: ChecklistTemplate) -> String {
        let photos = t.items.filter { $0.requiresPhoto == true }.count
        let items = "\(t.items.count) item\(t.items.count == 1 ? "" : "s")"
        return photos > 0 ? "\(items) · \(photos) need\(photos == 1 ? "s" : "") a photo" : items
    }

    private func delete(_ t: ChecklistTemplate) {
        app.updateChecklistTemplates { FieldDocs.removeTemplate($0, id: t.id) }
    }
}

/// Read-only list of a saved template's items.
struct ChecklistTemplatePreview: View {
    let template: ChecklistTemplate
    var body: some View {
        List {
            ForEach(Array(template.items.enumerated()), id: \.offset) { _, item in
                HStack {
                    Text(item.text)
                    Spacer()
                    if item.requiresPhoto == true { Image(systemName: "camera.badge.ellipsis").foregroundStyle(Color.accentColor).accessibilityLabel("Photo required") }
                }
            }
        }
        .navigationTitle(template.name)
    }
}

struct BusinessSettingsView: View {
    @Environment(AppModel.self) private var app
    var body: some View {
        @Bindable var app = app
        SentenceForm {
            Section {
                TextField("Business name", text: $app.settings.business.name)
                TextField("Address", text: $app.settings.business.address)
                TextField("Phone", text: $app.settings.business.phone).keyboardType(.phonePad)
                TextField("Email", text: $app.settings.business.email).keyboardType(.emailAddress).textInputAutocapitalization(.never)
                TextField("Website", text: $app.settings.business.website).textInputAutocapitalization(.never)
                TextField("Tagline", text: Binding(get: { app.settings.business.tagline ?? "" }, set: { app.settings.business.tagline = $0 }))
                TextField("Service area", text: Binding(get: { app.settings.business.serviceArea ?? "" }, set: { app.settings.business.serviceArea = $0 }))
            } footer: { Text("Shown at the top of every client estimate") }
            Section(sentence: "Estimate terms") {
                TextField("Terms", text: $app.settings.business.estimateTerms, axis: .vertical).lineLimit(3...8)
            }
        }
        .navigationTitle("Your business")
        .onDisappear { app.saveSettings() }
    }
}

struct PricingSettingsView: View {
    @Environment(AppModel.self) private var app
    var body: some View {
        @Bindable var app = app
        SentenceForm {
            Section {
                LabeledContent("Markup on materials %") { DoubleField(value: $app.settings.pricing.markupPct) }
                LabeledContent("Sales tax %") { DoubleField(value: $app.settings.pricing.taxPct) }
                LabeledContent("Currency") { TextField("USD", text: $app.settings.pricing.currency).multilineTextAlignment(.trailing).textInputAutocapitalization(.characters) }
            } footer: { Text("New jobs start with these; each job can change them on its Estimate tab") }
            Section {
                Picker("Labor", selection: $app.settings.pricing.laborMode) {
                    Text("Included in device price").tag(LaborMode.combined)
                    Text("Separate labor lines").tag(LaborMode.separate)
                }
                Toggle("Count “?” items in totals", isOn: $app.settings.pricing.includeTentative)
            }
            Section {
                NavigationLink("Device prices") { CatalogView() }
                NavigationLink("Products (brands and models)") { ProductLibraryView() }
            } footer: { Text("Device types carry a default price; products carry the price of a specific brand and model") }
        }
        .navigationTitle("Pricing")
        .onDisappear { app.saveSettings() }
    }
}

struct WireSettingsView: View {
    @Environment(AppModel.self) private var app
    var body: some View {
        @Bindable var app = app
        SentenceForm {
            Section {
                LabeledContent("Slack and service loop %") { DoubleField(value: $app.settings.pricing.wireSlackPct) }
                LabeledContent("Extra ft per home run") { DoubleField(value: $app.settings.pricing.wireDropFt) }
                LabeledContent("Floor-to-floor height ft") { DoubleField(value: $app.settings.pricing.floorHeightFt) }
            } footer: { Text("Home-run length is the path to the closet, plus floor heights, slack and the extra per run") }
            if app.cloud.can(.prices) {
                Section(sentence: "Price per foot") {
                    ForEach(Trades.wireTypes(for: app.trades), id: \.self) { w in
                        LabeledContent(w) {
                            DoubleField(value: Binding(get: { app.settings.pricing.wirePrices[w] ?? 0 }, set: { app.settings.pricing.wirePrices[w] = $0 }))
                        }
                    }
                }
            }
        }
        .navigationTitle("Wire and home runs")
        .onDisappear { app.saveSettings() }
    }
}

/// Connect to the hosted PinPlan server and see, item by item, what is ready.
struct ServerSetupView: View {
    @Environment(AppModel.self) private var app
    @State private var checking = false
    @State private var health: APIClient.Health?
    @State private var problem: String?

    var body: some View {
        @Bindable var app = app
        SentenceForm {
            Section {
                TextField("pinplan.vercel.app", text: $app.settings.serverURL)
                    .keyboardType(.URL).textInputAutocapitalization(.never).autocorrectionDisabled()
                SecureField("Team access code", text: $app.settings.accessCode)
            } header: { Text("Server").textCase(nil) } footer: {
                Text("The web address of your PinPlan deployment and the access code you set on it")
            }
            Section {
                Button {
                    Task { await check() }
                } label: {
                    HStack {
                        Text(checking ? "Checking…" : "Check connection")
                        Spacer()
                        if checking { ProgressView() }
                    }
                }
                .disabled(checking || app.settings.serverURL.trimmingCharacters(in: .whitespaces).isEmpty)
                if let problem { Text(problem).font(.callout).foregroundStyle(.red) }
                if let h = health {
                    StatusRow(title: "Server found", ok: true, detail: nil)
                    StatusRow(title: "Access code accepted", ok: h.authorized,
                              detail: h.authorized ? nil : "Type the PINPLAN_ACCESS_CODE value exactly")
                    if h.authorized {
                        if Features.ai {
                            StatusRow(title: "AI plan reader", ok: h.ai == true, detail: h.ai == true ? nil : "Add ANTHROPIC_API_KEY on the server")
                        }
                        StatusRow(title: "Billdu", ok: h.billdu == true, detail: h.billdu == true ? nil : "Add BILLDU_API_KEY and BILLDU_API_SECRET on the server")
                    }
                }
            }
            if app.cloud.can(.prices) {
                Section {
                    Picker("First document", selection: $app.settings.billduDocType) {
                        Text("Estimate").tag("estimate"); Text("Order").tag("order"); Text("Invoice").tag("invoice")
                    }
                } header: { Text("Billdu").textCase(nil) } footer: { Text("What Send to Billdu creates the first time for a job") }
            }
            Section {
                Text("Keys stay on the server. This device only stores the address and access code.")
                    .font(.callout).foregroundStyle(.secondary)
            }
        }
        .navigationTitle("PinPlan server")
        .onDisappear { app.saveSettings() }
        .animation(.easeOut(duration: 0.2), value: health?.authorized)
    }

    private func check() async {
        app.saveSettings()
        problem = nil
        health = nil
        guard let api = APIClient(settings: app.settings) else { problem = "Enter the server address first"; return }
        checking = true
        defer { checking = false }
        do { health = try await api.health() } catch {
            problem = (error as? APIClient.APIError)?.message ?? "Couldn't reach the server. Check the address and your connection."
        }
    }
}

private struct StatusRow: View {
    let title: String
    let ok: Bool
    let detail: String?
    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 12) {
            Image(systemName: ok ? "checkmark.circle.fill" : "exclamationmark.circle.fill")
                .foregroundStyle(ok ? .green : .orange)
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                if let detail { Text(detail).font(.footnote).foregroundStyle(.secondary) }
            }
        }
    }
}

struct DoubleField: View {
    @Binding var value: Double
    var body: some View {
        // Saves as you type (the number pad has no Return key).
        CommitField(title: "", value: value.clean, prompt: "0", keyboard: .decimalPad) { s in value = Double(s.replacingOccurrences(of: ",", with: ".")) ?? 0 }
            .multilineTextAlignment(.trailing).frame(maxWidth: 120)
    }
}

/// Shown where a feature needs the server: says why, and opens the setup page right there.
struct ServerSetupPrompt: View {
    let feature: String
    @State private var open = false
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("\(feature) needs your PinPlan server").font(.subheadline.weight(.medium))
            Button("Set up server") { open = true }.buttonStyle(.bordered)
        }
        .padding(.vertical, 4)
        .sheet(isPresented: $open) {
            NavigationStack {
                ServerSetupView()
                    .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { open = false } } }
            }
        }
    }
}
