import SwiftUI
import PinPlanCore

struct EstimateView: View {
    @Environment(\.horizontalSizeClass) private var hSize
    @Environment(AppModel.self) private var app
    let model: EditorModel
    @Environment(\.exportPlacement) private var exportPlacement
    @State private var share: SharedFile?
    @State private var editing: ComputedLine?
    @State private var docType = ""
    @State private var deposit = ""
    @State private var sending = false
    @State private var message: (ok: Bool, text: String)?
    @State private var confirmUpdate: BilldoTarget?

    struct BilldoTarget: Identifiable { let doc: BillduDocRef; var id: Int { doc.id } }

    private var pricing: PricingSettings { model.pricing }
    private var estimate: Estimate {
        EstimateBuilder.build(takeoff: model.takeoff, catalog: app.catalog, pricing: pricing, overrides: model.bundle.estimateLines)
    }

    var body: some View {
        let e = estimate
        let cur = pricing.currency
        let unpriced = e.lines.filter { $0.included && $0.unitPrice == 0 && $0.qty > 0 }
        SentenceList {
            Section {
                VStack(alignment: .leading, spacing: 14) {
                    HStack(alignment: .firstTextBaseline) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Estimate total").font(.subheadline).foregroundStyle(.secondary)
                            Text(Money.format(e.total, currency: cur)).font(.system(size: 38, weight: .bold)).monospacedDigit()
                                .contentTransition(.numericText())
                        }
                        Spacer()
                        StatusChip(status: model.bundle.project.status)
                    }
                    HStack(spacing: 18) {
                        miniStat("Subtotal", Money.format(e.subtotal, currency: cur))
                        miniStat("Tax", Money.format(e.tax, currency: cur))
                        miniStat("Lines", "\(e.lines.filter(\.included).count)")
                        if e.optionalTotal > 0 { miniStat("Optional", Money.format(e.optionalTotal, currency: cur)) }
                    }
                    // One row when it fits (iPad); on a phone, Send gets its own full-width row.
                    Group {
                        if hSize == .compact {
                            VStack(spacing: 10) {
                                sendButton(e)
                                HStack { csvButton(e); pdfButton(e) }
                            }
                        } else {
                            HStack { csvButton(e); pdfButton(e); sendButton(e) }
                        }
                    }
                    .controlSize(.large)
                }
                .padding(.vertical, 6)
            }
            if !unpriced.isEmpty {
                Section {
                    Label("\(unpriced.count) line\(unpriced.count == 1 ? " has" : "s have") no price yet. Set prices in the Catalog and wire prices in Settings, or tap a line to type one.", systemImage: "exclamationmark.triangle.fill")
                        .font(.callout).foregroundStyle(.orange)
                }
            }
            Section("Pricing (this project)") {
                LabeledContent("Markup %") { numberField(pricing.markupPct) { v in setPricing { $0.markupPct = v } } }
                LabeledContent("Tax %") { numberField(pricing.taxPct) { v in setPricing { $0.taxPct = v } } }
                Picker("Labor", selection: Binding(get: { pricing.laborMode }, set: { v in setPricing { $0.laborMode = v } })) {
                    Text("Combined (installed price)").tag(LaborMode.combined)
                    Text("Separate labor lines").tag(LaborMode.separate)
                }
                Toggle("Include “?” items by default", isOn: Binding(get: { pricing.includeTentative }, set: { v in setPricing { $0.includeTentative = v } }))
            }
            ForEach(LineGroup.allCases, id: \.self) { g in
                let lines = e.lines.filter { $0.group == g }
                if !lines.isEmpty {
                    Section(g.title) {
                        ForEach(lines) { l in
                            Button { editing = l } label: { LineRow(line: l, currency: cur) }
                                .buttonStyle(.plain)
                                .swipeActions {
                                    Button(role: .destructive) { model.editSilently { $0.upsertEstimateLine(key: l.key) { $0.removed = true } } } label: { Label("Remove", systemImage: "trash") }
                                    if l.overridden && !l.key.hasPrefix("custom:") {
                                        Button { model.editSilently { $0.resetEstimateLine(key: l.key) } } label: { Label("Reset", systemImage: "arrow.counterclockwise") }.tint(.gray)
                                    }
                                }
                        }
                    }
                }
            }
            Section {
                Button { model.editSilently { $0.upsertEstimateLine(key: "custom:\(newId(8))") { $0.description = "Custom item"; $0.qty = 1; $0.unit = "each"; $0.unitPrice = 0; $0.sort = Date().timeIntervalSince1970 } } } label: {
                    Label("Add custom line", systemImage: "plus")
                }
                let removed = model.bundle.estimateLines.filter { $0.removed == true && $0.deleted != true }
                if !removed.isEmpty {
                    Button("Restore \(removed.count) removed line\(removed.count == 1 ? "" : "s")") {
                        model.editSilently { b in for l in removed { if l.key.hasPrefix("custom:") { b.upsertEstimateLine(key: l.key) { $0.removed = false } } else { b.resetEstimateLine(key: l.key) } } }
                    }
                }
            }
            Section("Summary") {
                LabeledContent("Subtotal", value: Money.format(e.subtotal, currency: cur))
                LabeledContent("Tax (\(pricing.taxPct.clean)%)", value: Money.format(e.tax, currency: cur))
                LabeledContent { Text(Money.format(e.total, currency: cur)).font(.title3.bold()) } label: { Text("Total").bold() }
                if e.optionalTotal > 0 { LabeledContent("Optional (“?”) not included", value: Money.format(e.optionalTotal, currency: cur)).font(.caption) }
            }
            Section {
                Picker("Document", selection: Binding(get: { docType.isEmpty ? app.settings.billduDocType : docType }, set: { docType = $0 })) {
                    Text("Estimate").tag("estimate"); Text("Order").tag("order"); Text("Invoice").tag("invoice")
                }
                LabeledContent("Deposit %") { TextField("full", text: $deposit).keyboardType(.decimalPad).multilineTextAlignment(.trailing) }
                if let d = Double(deposit), d > 0, d < 100 {
                    Text("One line: \(d.clean)% of \(Money.format(e.subtotal, currency: cur)) = \(Money.format((e.subtotal * d).rounded() / 100, currency: cur)) before tax").font(.caption).foregroundStyle(.secondary)
                }
                Button { trySend(e) } label: { Label(sending ? "Sending…" : "Send to Billdu", systemImage: "paperplane.fill") }
                    .disabled(sending || e.subtotal <= 0)
                if let m = message { Text(m.text).foregroundStyle(m.ok ? .green : .red).font(.callout) }
                let billed = model.bundle.project.billduDocs.filter { $0.type == "invoice" }.reduce(0) { $0 + $1.amount }
                if e.subtotal > 0 {
                    ProgressView(value: min(1, billed / e.subtotal)) { Text("Invoiced \(Money.format(billed, currency: cur)) of \(Money.format(e.subtotal, currency: cur))").font(.caption) }
                }
                ForEach(model.bundle.project.billduDocs, id: \.id) { d in
                    LabeledContent("\(d.type.capitalized) \(d.serial ?? "#\(d.id)")\(d.label.map { " · \($0)" } ?? "")", value: Money.format(d.amount, currency: cur))
                }
            } header: { Text("Billdu") } footer: {
                Text(APIClient(settings: app.settings) == nil ? "Set your PinPlan server address in Settings to send to Billdu. You can always share the PDF or CSV instead." : "Sent through your PinPlan server; Billdu credentials never live on this device.")
            }
        }
        .sheet(item: $editing) { l in LineEditor(model: model, line: l) }
        .shareSheet($share)
        .confirmationDialog("Already sent to Billdu", isPresented: Binding(get: { confirmUpdate != nil }, set: { if !$0 { confirmUpdate = nil } }), titleVisibility: .visible) {
            if let t = confirmUpdate {
                Button("Update \(t.doc.serial ?? "#\(t.doc.id)")") { send(e, existing: t.doc.id) }
                Button("Create a new one") { send(e, existing: nil) }
            }
        } message: { Text("This project already has a Billdu \(confirmUpdate?.doc.type ?? "document"). Update it with the current lines, or create a new one?") }
    }

    private func miniStat(_ label: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 1) {
            Text(label).font(.caption).foregroundStyle(.secondary)
            Text(value).font(.subheadline.weight(.semibold)).monospacedDigit()
        }
    }

    private func numberField(_ v: Double, commit: @escaping (Double) -> Void) -> some View {
        CommitField(title: "", value: v.clean, keyboard: .decimalPad) { s in commit(Double(s.replacingOccurrences(of: ",", with: ".")) ?? 0) }
            .multilineTextAlignment(.trailing).frame(maxWidth: 100)
    }

    private func setPricing(_ change: (inout PricingOverrides) -> Void) {
        var p = model.bundle.project.pricing ?? PricingOverrides()
        change(&p)
        model.editSilently { $0.project.pricing = p }
    }

    private var type: String { docType.isEmpty ? app.settings.billduDocType : docType }

    private func trySend(_ e: Estimate) {
        let isDeposit = (Double(deposit) ?? 0) > 0
        if !isDeposit, let existing = model.bundle.project.billduDocs.first(where: { $0.type == type && $0.percent == nil }) {
            confirmUpdate = BilldoTarget(doc: existing)
        } else {
            send(e, existing: nil)
        }
    }

    private func send(_ e: Estimate, existing: Int?) {
        guard let client = APIClient(settings: app.settings) else { message = (false, "Set your PinPlan server address in Settings."); return }
        let dep = Double(deposit).flatMap { $0 > 0 && $0 < 100 ? $0 : nil }
        sending = true
        message = nil
        let project = model.bundle.project, pricing = pricing, t = type
        Task {
            do {
                let r = try await client.sendToBilldu(project: project, docType: t, estimate: e, pricing: pricing, depositPct: dep, existingDocId: existing)
                let ref = BillduDocRef(id: r.doc.id, type: t, serial: r.doc.serial, amount: r.doc.amount, percent: r.doc.percent, label: dep.map { "Deposit \($0.clean)%" }, createdAt: isoNow())
                model.editSilently { b in
                    b.project.billduClientId = r.clientId
                    if let existing, let i = b.project.billduDocs.firstIndex(where: { $0.id == existing }) { b.project.billduDocs[i] = ref } else { b.project.billduDocs.append(ref) }
                }
                message = (true, "\(existing == nil ? "Created" : "Updated") Billdu \(t) \(ref.serial ?? "#\(ref.id)")")
            } catch {
                message = (false, "\(error.localizedDescription) — you can still share the PDF or CSV.")
            }
            sending = false
        }
    }

    private func iconLabel(_ title: String, _ icon: String) -> some View {
        HStack(spacing: 6) { Image(systemName: icon); Text(title).lineLimit(1).minimumScaleFactor(0.8) }
            .frame(maxWidth: .infinity)
    }

    private func csvButton(_ e: Estimate) -> some View {
        Button { csv(e) } label: { iconLabel("CSV", "tablecells") }
            .buttonStyle(.bordered)
    }

    private func pdfButton(_ e: Estimate) -> some View {
        Button { pdf(e) } label: { iconLabel("Estimate PDF", "doc.richtext") }
            .buttonStyle(.bordered)
    }

    private func sendButton(_ e: Estimate) -> some View {
        Button { trySend(e) } label: { iconLabel(sending ? "Sending…" : "Send to Billdu", "paperplane.fill") }
            .buttonStyle(.borderedProminent)
            .disabled(sending || e.subtotal <= 0)
    }

    private func csv(_ e: Estimate) {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("\(slug(model.bundle.project.address))-estimate.csv")
        try? EstimateBuilder.csv(e).write(to: url, atomically: true, encoding: .utf8)
        share = SharedFile(url: url)
    }

    private func pdf(_ e: Estimate) {
        let data = PDFExporter.estimate(bundle: model.bundle, estimate: e, business: app.settings.business, pricing: pricing)
        share = SharedFile(url: PDFExporter.write(data, name: "\(slug(model.bundle.project.address))-estimate.pdf"))
    }
}

private struct LineRow: View {
    let line: ComputedLine
    let currency: String
    var body: some View {
        HStack(alignment: .firstTextBaseline) {
            VStack(alignment: .leading, spacing: 2) {
                Text(line.description).foregroundStyle(line.included ? .primary : .secondary)
                Text(caption)
                    .font(.caption).foregroundStyle(line.unitPrice == 0 && line.included ? .orange : .secondary)
            }
            Spacer()
            Text(Money.format(line.total, currency: currency)).monospacedDigit().foregroundStyle(line.included ? .primary : .secondary)
        }
        .contentShape(Rectangle())
    }

    private var caption: String {
        var s = "\(line.qty.clean) \(line.unit) × \(Money.format(line.unitPrice, currency: currency))"
        if line.unitPrice == 0 { s += " · no price yet" }
        if line.optional { s += " · optional" }
        if line.overridden && !line.key.hasPrefix("custom:") { s += " · changed here" }
        return s
    }
}

private struct LineEditor: View {
    @Environment(\.dismiss) private var dismiss
    let model: EditorModel
    let line: ComputedLine
    @State private var desc = ""
    @State private var qty = ""
    @State private var unit = ""
    @State private var price = ""
    @State private var include = true

    var body: some View {
        NavigationStack {
            SentenceForm {
                TextField("Description", text: $desc)
                LabeledContent("Quantity") { TextField("", text: $qty).keyboardType(.decimalPad).multilineTextAlignment(.trailing) }
                LabeledContent("Unit") { TextField("", text: $unit).multilineTextAlignment(.trailing) }
                LabeledContent("Unit price") { TextField("", text: $price).keyboardType(.decimalPad).multilineTextAlignment(.trailing) }
                if line.optional { Toggle("Include in total", isOn: $include) }
            }
            .navigationTitle("Edit line")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        let num = { (s: String) in Double(s.replacingOccurrences(of: "$", with: "").replacingOccurrences(of: ",", with: "")) }
                        model.editSilently { b in
                            b.upsertEstimateLine(key: line.key) { o in
                                if desc != line.description { o.description = desc }
                                if let q = num(qty), q != line.qty { o.qty = q }
                                if unit != line.unit { o.unit = unit }
                                if let p = num(price), p != line.unitPrice { o.unitPrice = p }
                                if line.optional { o.include = include }
                            }
                        }
                        dismiss()
                    }
                }
            }
            .onAppear {
                desc = line.description; qty = line.qty.clean; unit = line.unit
                price = String(format: "%.2f", line.unitPrice); include = line.included
            }
        }
        .presentationDetents([.medium])
    }
}
