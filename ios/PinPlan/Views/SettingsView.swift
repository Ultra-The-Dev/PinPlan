import SwiftUI
import PinPlanCore

/// Settings, grouped by what you're doing: connect the server, then business details, pricing and wire.
struct SettingsView: View {
    @Environment(AppModel.self) private var app
    @Environment(\.dismiss) private var dismiss
    // Screenshot/automation hook: `--server` opens the server page directly.
    @State private var openServer = ProcessInfo.processInfo.arguments.contains("--server")

    var body: some View {
        @Bindable var app = app
        Form {
            Section {
                NavigationLink { ServerSetupView() } label: {
                    LabeledContent {
                        Text(app.settings.serverURL.isEmpty ? "Not set up" : host(app.settings.serverURL))
                    } label: {
                        Label("PinPlan server", systemImage: "server.rack")
                    }
                }
            } footer: {
                Text("Needed only for sending to Billdu and the AI plan reader. Everything else works offline.")
            }
            Section {
                NavigationLink { BusinessSettingsView() } label: {
                    LabeledContent {
                        Text(app.settings.business.name.isEmpty ? "Add your details" : app.settings.business.name)
                    } label: { Label("Your business", systemImage: "building.2") }
                }
                NavigationLink { PricingSettingsView() } label: {
                    LabeledContent {
                        Text("\(app.settings.pricing.markupPct.clean)% markup · \(app.settings.pricing.taxPct.clean)% tax")
                    } label: { Label("Pricing", systemImage: "dollarsign.circle") }
                }
                NavigationLink { WireSettingsView() } label: {
                    LabeledContent {
                        Text("+\(app.settings.pricing.wireSlackPct.clean)% slack")
                    } label: { Label("Wire and home runs", systemImage: "cable.connector") }
                }
            }
        }
        .navigationTitle("Settings")
        .navigationDestination(isPresented: $openServer) { ServerSetupView() }
        .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { app.saveSettings(); dismiss() } } }
        .onDisappear { app.saveSettings() }
    }

    private func host(_ raw: String) -> String {
        URL(string: raw.hasPrefix("http") ? raw : "https://\(raw)")?.host() ?? raw
    }
}

struct BusinessSettingsView: View {
    @Environment(AppModel.self) private var app
    var body: some View {
        @Bindable var app = app
        Form {
            Section {
                TextField("Business name", text: $app.settings.business.name)
                TextField("Address", text: $app.settings.business.address)
                TextField("Phone", text: $app.settings.business.phone).keyboardType(.phonePad)
                TextField("Email", text: $app.settings.business.email).keyboardType(.emailAddress).textInputAutocapitalization(.never)
                TextField("Website", text: $app.settings.business.website).textInputAutocapitalization(.never)
            } footer: { Text("Shown at the top of every client estimate") }
            Section("Estimate terms") {
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
        Form {
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
            } footer: { Text("Each device's installed price lives in the catalog") }
        }
        .navigationTitle("Pricing")
        .onDisappear { app.saveSettings() }
    }
}

struct WireSettingsView: View {
    @Environment(AppModel.self) private var app
    var body: some View {
        @Bindable var app = app
        Form {
            Section {
                LabeledContent("Slack and service loop %") { DoubleField(value: $app.settings.pricing.wireSlackPct) }
                LabeledContent("Extra ft per home run") { DoubleField(value: $app.settings.pricing.wireDropFt) }
                LabeledContent("Floor-to-floor height ft") { DoubleField(value: $app.settings.pricing.floorHeightFt) }
            } footer: { Text("Home-run length is the path to the closet, plus floor heights, slack and the extra per run") }
            Section("Price per foot") {
                ForEach(Catalog.wireTypes.filter { $0 != "None" }, id: \.self) { w in
                    LabeledContent(w) {
                        DoubleField(value: Binding(get: { app.settings.pricing.wirePrices[w] ?? 0 }, set: { app.settings.pricing.wirePrices[w] = $0 }))
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
        Form {
            Section {
                TextField("pinplan.vercel.app", text: $app.settings.serverURL)
                    .keyboardType(.URL).textInputAutocapitalization(.never).autocorrectionDisabled()
                SecureField("Team access code", text: $app.settings.accessCode)
            } header: { Text("Server") } footer: {
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
                        StatusRow(title: "AI plan reader", ok: h.ai == true, detail: h.ai == true ? nil : "Add ANTHROPIC_API_KEY on the server")
                        StatusRow(title: "Billdu", ok: h.billdu == true, detail: h.billdu == true ? nil : "Add BILLDU_API_KEY and BILLDU_API_SECRET on the server")
                    }
                }
            }
            Section {
                Picker("First document", selection: $app.settings.billduDocType) {
                    Text("Estimate").tag("estimate"); Text("Order").tag("order"); Text("Invoice").tag("invoice")
                }
            } header: { Text("Billdu") } footer: { Text("What Send to Billdu creates the first time for a job") }
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
        TextField("0", value: $value, format: .number).keyboardType(.decimalPad).multilineTextAlignment(.trailing).frame(maxWidth: 120)
    }
}
