import SwiftUI
import PinPlanCore

struct JobView: View {
    @Environment(AppModel.self) private var app
    let model: EditorModel
    @State private var share: SharedFile?
    @State private var error: String?

    var body: some View {
        let p = model.bundle.project
        Form {
            Section("Job") {
                LabeledContent("Address") { CommitField(title: "Address", value: p.address) { v in model.editSilently { $0.project.address = v } }.multilineTextAlignment(.trailing) }
                Picker("Status", selection: Binding(get: { p.status }, set: { v in model.editSilently { $0.project.status = v } })) {
                    ForEach(ProjectStatus.allCases, id: \.self) { Text($0.rawValue.capitalized).tag($0) }
                }
            }
            Section("Client") {
                LabeledContent("Name") { CommitField(title: "Name", value: p.clientName) { v in model.editSilently { $0.project.clientName = v } }.multilineTextAlignment(.trailing) }
                LabeledContent("Email") { CommitField(title: "Email", value: p.clientEmail ?? "", keyboard: .emailAddress) { v in model.editSilently { $0.project.clientEmail = v } }.multilineTextAlignment(.trailing) }
                LabeledContent("Phone") { CommitField(title: "Phone", value: p.clientPhone ?? "", keyboard: .phonePad) { v in model.editSilently { $0.project.clientPhone = v } }.multilineTextAlignment(.trailing) }
            }
            Section("Notes") {
                CommitField(title: "Notes", value: p.notes ?? "", prompt: "Gate code, site contact…") { v in model.editSilently { $0.project.notes = v } }
            }
            Section {
                Button {
                    do { share = SharedFile(url: try app.store.backup(of: [model.bundle], catalog: app.catalog)) } catch { self.error = error.localizedDescription }
                } label: { Label("Share backup (.pinplan.json)", systemImage: "square.and.arrow.up") }
                if let error { Text(error).foregroundStyle(.red) }
            } header: { Text("Backup") } footer: {
                Text("One file with every sheet, device, run, photo and estimate edit. It opens in this app or the PinPlan web app.")
            }
            if !p.billduDocs.isEmpty {
                Section("Billdu") {
                    ForEach(p.billduDocs, id: \.id) { d in
                        LabeledContent("\(d.type.capitalized) \(d.serial ?? "#\(d.id)")", value: Money.format(d.amount, currency: model.pricing.currency))
                    }
                }
            }
        }
        .shareSheet($share)
    }
}
