import SwiftUI
import PinPlanCore

struct SettingsView: View {
    @Environment(AppModel.self) private var app
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        @Bindable var app = app
        Form {
            Section("Your business (on estimates)") {
                TextField("Business name", text: $app.settings.business.name)
                TextField("Address", text: $app.settings.business.address)
                TextField("Phone", text: $app.settings.business.phone).keyboardType(.phonePad)
                TextField("Email", text: $app.settings.business.email).keyboardType(.emailAddress).textInputAutocapitalization(.never)
                TextField("Website", text: $app.settings.business.website).textInputAutocapitalization(.never)
                TextField("Estimate terms", text: $app.settings.business.estimateTerms, axis: .vertical).lineLimit(3...8)
            }
            Section("Pricing defaults") {
                LabeledContent("Markup on materials %") { DoubleField(value: $app.settings.pricing.markupPct) }
                LabeledContent("Sales tax %") { DoubleField(value: $app.settings.pricing.taxPct) }
                LabeledContent("Currency") { TextField("USD", text: $app.settings.pricing.currency).multilineTextAlignment(.trailing).textInputAutocapitalization(.characters) }
                Picker("Labor", selection: $app.settings.pricing.laborMode) {
                    Text("Combined (installed price)").tag(LaborMode.combined)
                    Text("Separate labor lines").tag(LaborMode.separate)
                }
                Toggle("Include tentative (?) items by default", isOn: $app.settings.pricing.includeTentative)
            }
            Section {
                LabeledContent("Slack / service loop %") { DoubleField(value: $app.settings.pricing.wireSlackPct) }
                LabeledContent("Extra ft per home run") { DoubleField(value: $app.settings.pricing.wireDropFt) }
                LabeledContent("Floor-to-floor height ft") { DoubleField(value: $app.settings.pricing.floorHeightFt) }
                ForEach(Catalog.wireTypes.filter { $0 != "None" }, id: \.self) { w in
                    LabeledContent("\(w) $/ft") {
                        DoubleField(value: Binding(get: { app.settings.pricing.wirePrices[w] ?? 0 }, set: { app.settings.pricing.wirePrices[w] = $0 }))
                    }
                }
            } header: { Text("Wire") } footer: { Text("Home-run length = path to the closet + floor heights, plus slack and the per-run extra.") }
            Section {
                TextField("https://pinplan.example.com", text: $app.settings.serverURL).keyboardType(.URL).textInputAutocapitalization(.never).autocorrectionDisabled()
                SecureField("Team access code (if the server uses one)", text: $app.settings.accessCode)
                Picker("First Billdu document", selection: $app.settings.billduDocType) {
                    Text("Estimate").tag("estimate"); Text("Order").tag("order"); Text("Invoice").tag("invoice")
                }
            } header: { Text("PinPlan server (Billdu & AI scan)") } footer: {
                Text("Billdu credentials and the AI key stay on your PinPlan server (the web app deployment). Everything else works offline on this device.")
            }
        }
        .navigationTitle("Settings")
        .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { app.saveSettings(); dismiss() } } }
        .onDisappear { app.saveSettings() }
    }
}

struct DoubleField: View {
    @Binding var value: Double
    var body: some View {
        TextField("0", value: $value, format: .number).keyboardType(.decimalPad).multilineTextAlignment(.trailing).frame(maxWidth: 120)
    }
}
