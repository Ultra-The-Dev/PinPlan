import SwiftUI
import PinPlanCore

struct EstimateView: View {
    @Environment(\.horizontalSizeClass) private var hSize
    @Environment(AppModel.self) private var app
    let model: EditorModel
    @Environment(\.exportPlacement) private var exportPlacement
    @State private var share: SharedFile?
    // Screenshot/automation hook: `--job-products` opens the job's product choices.
    @State private var openJobProducts = ProcessInfo.processInfo.arguments.contains("--job-products")
    @State private var editing: ComputedLine?
    @State private var docType = ""
    @State private var deposit = ""
    @State private var sending = false
    @State private var message: (ok: Bool, text: String)?
    @State private var makingPlans = false
    /// What the server last said about Billdu ("configured", "connect", "noServer"; "" = not known yet). Kept on the
    /// device so the card doesn't flicker on every visit.
    @AppStorage("pinplan.billdu.status") private var billduState = ""
    private var billduOn: Bool { billduState == "configured" }
    private var sendTitle: String { existingDoc.map { String(localized: "Update \($0.type) \($0.serial ?? "#\($0.id)") in Billdu") } ?? String(localized: "Send to Billdu") }


    private var pricing: PricingSettings { model.pricing }
    private var estimate: Estimate {
        model.bundle.estimate(catalog: app.catalog, products: app.products, pricing: pricing)
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
                            Text(pricing.taxPct > 0 ? "Total with \(pricing.taxPct.clean)% tax" : "Total").font(.subheadline).foregroundStyle(.secondary)
                            Text(Money.format(e.total, currency: cur)).font(.system(size: 38, weight: .bold)).monospacedDigit()
                                .contentTransition(.numericText())
                        }
                        Spacer()
                        StatusChip(status: model.bundle.project.status)
                    }
                    HStack(spacing: 18) {
                        miniStat(String(localized: "Subtotal"), Money.format(e.subtotal, currency: cur))
                        miniStat(String(localized: "Tax"), Money.format(e.tax, currency: cur))
                        miniStat(String(localized: "Lines"), "\(e.lines.filter(\.included).count)")
                        if e.optionalTotal > 0 { miniStat(String(localized: "Optional"), Money.format(e.optionalTotal, currency: cur)) }
                    }
                    // One row when it fits (iPad); on a phone, Send gets its own full-width row.
                    Group {
                        if hSize == .compact {
                            VStack(spacing: 10) {
                                if billduOn { sendButton(e) }
                                HStack { csvButton(e); pdfButton(e) }
                            }
                        } else {
                            HStack { csvButton(e); pdfButton(e); if billduOn { sendButton(e) } }
                        }
                    }
                    .controlSize(.large)
                }
                .padding(.vertical, 6)
            }
            if !unpriced.isEmpty {
                Section {
                    Label("\(unpriced.count) lines have no price yet. Set prices in the Price list and wire prices in Settings, or tap a line to type one.", systemImage: "exclamationmark.triangle.fill")
                        .font(.callout).foregroundStyle(.orange)
                }
            }
            Section {
                NavigationLink { JobProductsView(model: model) } label: {
                    LabeledContent {
                        Text(chosenProducts == 0 ? "Choose brands" : "\(chosenProducts) chosen")
                    } label: { Label("Products for this job", systemImage: "tag") }
                }
            }
            Section(sentence: String(localized: "Adjust pricing (this job)")) {
                LabeledContent("Markup %") { numberField(pricing.markupPct) { v in setPricing { $0.markupPct = v } } }
                LabeledContent("Tax %") { numberField(pricing.taxPct) { v in setPricing { $0.taxPct = v } } }
                Picker("Labor", selection: Binding(get: { pricing.laborMode }, set: { v in setPricing { $0.laborMode = v } })) {
                    Text("Combined (installed price)").tag(LaborMode.combined)
                    Text("Separate labor lines").tag(LaborMode.separate)
                }
                Toggle("Include “?” items by default", isOn: Binding(get: { pricing.includeTentative }, set: { v in setPricing { $0.includeTentative = v } }))
                Text("Markup is added to catalog, product and cable prices. A price you type on a line is used as is.")
                    .font(.footnote).foregroundStyle(.secondary)
            }
            ForEach(LineGroup.allCases, id: \.self) { g in
                let lines = e.lines.filter { $0.group == g }
                if !lines.isEmpty {
                    Section(sentence: tr(g.title)) {
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
                Menu {
                    let tot = model.takeoff.total
                    ForEach(QuickCharges.defaults) { c in
                        Button { addCharge(c) } label: {
                            if let f = c.countFrom {
                                Text("\(c.name) × \(QuickCharges.count(tot, f))")
                            } else {
                                Text(c.name)
                            }
                        }
                    }
                    Divider()
                    Button("Custom line") { addCharge(QuickCharge(id: "custom", name: "Custom item", unit: "each", price: 0)) }
                } label: {
                    Label("Add charge — labor, prewire…", systemImage: "plus.circle.fill")
                }
                let removed = model.bundle.estimateLines.filter { $0.removed == true && $0.deleted != true }
                if !removed.isEmpty {
                    Button("Restore \(removed.count) removed lines") {
                        model.editSilently { b in for l in removed { if l.key.hasPrefix("custom:") { b.upsertEstimateLine(key: l.key) { $0.removed = false } } else { b.resetEstimateLine(key: l.key) } } }
                    }
                }
            }
            Section {
                NavigationLink { ClientProposalView(model: model) } label: { Label("Get client link", systemImage: "signature") }
            } footer: { Text("The client reviews the plans and price, picks options and signs online.") }
            Section(sentence: String(localized: "Summary")) {
                LabeledContent("Subtotal", value: Money.format(e.subtotal, currency: cur))
                LabeledContent("Tax (\(pricing.taxPct.clean)%)", value: Money.format(e.tax, currency: cur))
                LabeledContent { Text(Money.format(e.total, currency: cur)).font(.title3.bold()) } label: { Text("Total").bold() }
                if e.optionalTotal > 0 { LabeledContent("Optional (“?”) not included", value: Money.format(e.optionalTotal, currency: cur)).font(.caption) }
            }
            invoicedSection(e)
            if !model.sheets.isEmpty {
                Section {
                    Button { plansPDF() } label: { Label(makingPlans ? "Making the plans PDF…" : "Plans PDF (for the client)", systemImage: "doc.richtext") }
                        .disabled(makingPlans)
                }
            }
            billduSection(e)
        }
        .task { await checkBilldu() }
        .navigationDestination(isPresented: $openJobProducts) { JobProductsView(model: model) }
        .sheet(item: $editing) { l in LineEditor(model: model, line: l) }
        .shareSheet($share)
    }

    private var chosenProducts: Int { model.bundle.project.productChoices?.count ?? 0 }

    /// How much of the estimate has been invoiced (before tax): Billdu invoices plus the job's own issued invoices
    /// (less credit notes) made on the web.
    @ViewBuilder private func invoicedSection(_ e: Estimate) -> some View {
        let cur = pricing.currency
        let billdu = model.bundle.project.billduDocs.filter { $0.type == "invoice" }.reduce(0) { $0 + $1.amount }
        let native = app.cloud.can(.prices) ? SalesDocs.totals(model.bundle.salesDocs).invoicedBeforeTax : 0
        let billed = max(0, billdu + native)
        if e.subtotal > 0 && billed > 0 {
            Section {
                ProgressView(value: min(1, billed / e.subtotal)) {
                    Text("Invoiced \(Money.format(billed, currency: cur)) of \(Money.format(e.subtotal, currency: cur))").font(.caption)
                }
                Text("Remaining \(Money.format(max(0, e.subtotal - billed), currency: cur)) before tax").font(.caption).foregroundStyle(.secondary)
                if !model.bundle.liveSalesDocs.isEmpty {
                    NavigationLink { QuotesInvoicesView(model: model) } label: { Label("Quotes & invoices", systemImage: "doc.text") }
                }
            } header: { Text("Invoiced so far").textCase(nil) }
        }
    }

    /// Billdu: only when the PinPlan server says it is connected for this company; otherwise where to connect it.
    @ViewBuilder private func billduSection(_ e: Estimate) -> some View {
        let cur = pricing.currency
        if billduOn {
            Section {
                Picker("Document", selection: Binding(get: { docType.isEmpty ? app.settings.billduDocType : docType }, set: { docType = $0 })) {
                    Text("Estimate").tag("estimate"); Text("Order").tag("order"); Text("Invoice").tag("invoice")
                }
                LabeledContent("Deposit %") { TextField("full", text: $deposit).keyboardType(.decimalPad).multilineTextAlignment(.trailing) }
                if let d = Double(deposit), d > 0, d < 100 {
                    Text("One line: \(d.clean)% of \(Money.format(e.subtotal, currency: cur)) = \(Money.format(Money.deposit(subtotal: e.subtotal, pct: d), currency: cur)) before tax").font(.caption).foregroundStyle(.secondary)
                }
                Button { trySend(e) } label: { Label(sending ? String(localized: "Sending…") : sendTitle, systemImage: "paperplane.fill") }
                    .disabled(sending || e.subtotal <= 0)
                if existingDoc != nil {
                    Button("Create a new document instead") { send(e, existing: nil) }.font(.callout).disabled(sending || e.subtotal <= 0)
                }
                if let m = message { Text(m.text).foregroundStyle(m.ok ? .green : .red).font(.callout) }
                ForEach(model.bundle.project.billduDocs, id: \.id) { d in
                    LabeledContent("\(d.type.capitalized) \(d.serial ?? "#\(d.id)")\(d.label.map { " · \($0)" } ?? "")", value: Money.format(d.amount, currency: cur))
                }
            } header: { Text("Billdu").textCase(nil) } footer: {
                Text("Sent through your PinPlan server; Billdu keys never live on this device")
            }
        } else if billduState == "connect" {
            Section {
                Label(BilldStatus.connectText, systemImage: "link").font(.callout).foregroundStyle(.secondary)
            } header: { Text("Billdu").textCase(nil) }
        }
    }

    /// Ask the server whether Billdu is connected (the card shows only then).
    private func checkBilldu() async {
        guard let api = APIClient(settings: app.settings) else { billduState = "noServer"; return }
        var token: String?
        if app.cloud.signedIn { token = try? await app.cloud.accessToken() }
        switch await api.billduStatus(token: token) {
        case .configured: billduState = "configured"
        case .connectOnWeb: billduState = "connect"
        case .noServer: billduState = "noServer"
        case .unknown: break   // offline: keep what was known
        }
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

    /// The client's marked-up plans (devices + lighting, no crew wiring) to share or attach in Billdu.
    private func plansPDF() {
        makingPlans = true
        let bundle = model.bundle, catalog = app.catalog, store = app.store
        let layers = Set(Layer.allCases).subtracting([.wiring])
        Task {
            let data = await Task.detached(priority: .userInitiated) {
                PDFExporter.planSheets(bundle: bundle, catalog: catalog, crew: false, layers: layers) { store.image($0) }
            }.value
            share = SharedFile(url: PDFExporter.write(data, name: "\(slug(bundle.project.address))-plans.pdf"))
            makingPlans = false
        }
    }

    /// Add a quick charge. Per-device ones count themselves from the plan; unpriced ones open for a price right away.
    private func addCharge(_ c: QuickCharge) {
        let key = QuickCharges.key(for: c)
        model.editSilently {
            $0.upsertEstimateLine(key: key) { l in
                l.description = c.name; l.unit = c.unit; l.unitPrice = c.price; l.sort = (Date().timeIntervalSince1970 * 1000).rounded()
                if c.countFrom == nil { l.qty = 1 }
            }
        }
        if c.price == 0 { editing = estimate.lines.first { $0.key == key } }
    }

    /// The document already sent for this job (same type, not a deposit): sending again updates it.
    private var existingDoc: BillduDocRef? {
        guard (Double(deposit) ?? 0) <= 0 else { return nil }
        return model.bundle.project.billduDocs.first { $0.type == type && $0.percent == nil }
    }

    private func trySend(_ e: Estimate) { send(e, existing: existingDoc?.id) }

    private func send(_ e: Estimate, existing: Int?) {
        guard let client = APIClient(settings: app.settings) else { message = (false, String(localized: "Set your PinPlan server address in Settings.")); return }
        let dep = Double(deposit).flatMap { $0 > 0 && $0 < 100 ? $0 : nil }
        sending = true
        message = nil
        let project = model.bundle.project, pricing = pricing, t = type, products = app.products
        Task {
            do {
                let r = try await client.sendToBilldu(project: project, docType: t, estimate: e, pricing: pricing, depositPct: dep, existingDocId: existing, products: products)
                let old = existing.flatMap { id in project.billduDocs.first { $0.id == id } }
                let updated = r.doc.updated ?? (existing != nil)
                let ref = BillduDocRef(id: r.doc.id, type: t, serial: r.doc.serial ?? (updated ? old?.serial : nil), amount: r.doc.amount, percent: r.doc.percent,
                                       label: dep.map { "Deposit \($0.clean)%" }, createdAt: updated ? (old?.createdAt ?? isoNow()) : isoNow())
                model.editSilently { b in
                    b.project.billduClientId = r.clientId
                    if let existing, let i = b.project.billduDocs.firstIndex(where: { $0.id == existing }) { b.project.billduDocs[i] = ref } else { b.project.billduDocs.append(ref) }
                }
                let serial = ref.serial ?? "#\(ref.id)"
                message = (true, updated ? String(localized: "Updated Billdu \(t) \(serial)") : String(localized: "Created Billdu \(t) \(serial)"))
            } catch {
                message = (false, String(localized: "\(error.localizedDescription) — you can still share the PDF or CSV."))
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
        Button { pdf(e) } label: { iconLabel(String(localized: "Client PDF"), "doc.richtext") }
            .buttonStyle(.bordered)
    }

    private func sendButton(_ e: Estimate) -> some View {
        Button { trySend(e) } label: { iconLabel(sending ? String(localized: "Sending…") : (existingDoc != nil ? String(localized: "Update in Billdu") : String(localized: "Send to Billdu")), "paperplane.fill") }
            .buttonStyle(.borderedProminent)
            .disabled(sending || e.subtotal <= 0)
    }

    private func csv(_ e: Estimate) {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("\(slug(model.bundle.project.address))-estimate.csv")
        try? EstimateBuilder.csv(e).write(to: url, atomically: true, encoding: .utf8)
        share = SharedFile(url: url)
    }

    private func pdf(_ e: Estimate) {
        let data = PDFExporter.estimate(bundle: model.bundle, estimate: e, business: app.business, pricing: pricing)
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
        if line.unitPrice == 0 { s += String(localized: " · no price yet") }
        if line.optional { s += String(localized: " · optional") }
        if line.overridden && !line.key.hasPrefix("custom:") { s += String(localized: " · changed here") }
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
