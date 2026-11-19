import SwiftUI
import UniformTypeIdentifiers
import PinPlanCore

// MARK: - Library

/// Every brand/model you install, grouped by device type. Jobs pick from these.
struct ProductLibraryView: View {
    @Environment(AppModel.self) private var app
    @State private var query = ""
    @State private var editing: ProductDraft?
    @State private var importing = false

    var body: some View {
        if app.cloud.can(.prices) { library } else { OfficeOnlyView(what: "Products and their prices") }
    }

    private var library: some View {
        SentenceList {
            if app.products.allSatisfy({ $0.archived == true || $0.deleted == true }) && query.isEmpty {
                Section {
                    Text("Add the brands and models you install, with your price. Then each job picks which one it uses for cameras, Wi-Fi, speakers and the rest.")
                        .font(.callout).foregroundStyle(.secondary)
                    Button { editing = ProductDraft(product: Product(deviceTypeId: app.liveCatalog.first?.id ?? "", brand: "", model: ""), isNew: true) } label: {
                        Label("Add a product", systemImage: "plus")
                    }
                    Button { importing = true } label: { Label("Import a price list", systemImage: "square.and.arrow.down") }
                }
            }
            ForEach(app.liveCatalog) { t in
                let items = app.products(for: t.id).filter { query.isEmpty || $0.title.localizedCaseInsensitiveContains(query) || ($0.sku ?? "").localizedCaseInsensitiveContains(query) }
                if !items.isEmpty {
                    Section {
                        ForEach(items) { p in
                            Button { editing = ProductDraft(product: p, isNew: false) } label: { ProductRow(product: p, unit: t.unit) }
                                .buttonStyle(.plain)
                                .swipeActions { Button(role: .destructive) { app.archiveProduct(p.id) } label: { Label("Archive", systemImage: "archivebox") } }
                        }
                    } header: {
                        HStack(spacing: 8) { DeviceSymbol(type: t, size: 18); Text(t.name).textCase(nil) }
                    }
                }
            }
            ForEach(Catalog.wireTypes.filter { $0 != "None" }, id: \.self) { w in
                let items = app.products(for: Cables.productKey(w)).filter { query.isEmpty || $0.title.localizedCaseInsensitiveContains(query) || ($0.sku ?? "").localizedCaseInsensitiveContains(query) }
                if !items.isEmpty {
                    Section {
                        ForEach(items) { p in
                            Button { editing = ProductDraft(product: p, isNew: false) } label: { ProductRow(product: p, unit: .LF, perFoot: true) }
                                .buttonStyle(.plain)
                                .swipeActions { Button(role: .destructive) { app.archiveProduct(p.id) } label: { Label("Archive", systemImage: "archivebox") } }
                        }
                    } header: {
                        HStack(spacing: 8) { Circle().fill(wireColor(w)).frame(width: 10, height: 10); Text("\(w) cable").textCase(nil) }
                    }
                }
            }
        }
        .searchable(text: $query, prompt: "Brand, model or SKU")
        .navigationTitle("Products")
        .toolbar {
            ToolbarItemGroup(placement: .primaryAction) {
                Button { importing = true } label: { Label("Import price list", systemImage: "square.and.arrow.down") }
                Button { editing = ProductDraft(product: Product(deviceTypeId: app.liveCatalog.first?.id ?? "", brand: "", model: ""), isNew: true) } label: {
                    Label("Add product", systemImage: "plus")
                }
            }
        }
        .sheet(item: $editing) { d in NavigationStack { ProductEditor(product: d.product, isNew: d.isNew) } }
        .sheet(isPresented: $importing) { NavigationStack { ProductImportView() } }
    }
}

struct ProductDraft: Identifiable {
    var product: Product
    var isNew: Bool
    var id: String { product.id }
}

private struct ProductRow: View {
    @Environment(AppModel.self) private var app
    let product: Product
    let unit: MeasureUnit
    var perFoot = false
    var body: some View {
        HStack(alignment: .firstTextBaseline) {
            VStack(alignment: .leading, spacing: 2) {
                Text(product.title)
                Text([product.sku, product.notes].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · "))
                    .font(.caption).foregroundStyle(.secondary).lineLimit(1)
            }
            Spacer()
            VStack(alignment: .trailing, spacing: 2) {
                Text(Money.format(product.unitPrice, currency: app.pricing.currency) + (perFoot ? "/ft" : unit == .LF ? "/LF" : ""))
                    .foregroundStyle(product.unitPrice == 0 ? .orange : .primary)
                if product.laborPrice > 0 {
                    Text("+ \(Money.format(product.laborPrice, currency: app.pricing.currency)) labor").font(.caption).foregroundStyle(.secondary)
                }
            }
            .monospacedDigit()
        }
        .contentShape(Rectangle())
    }
}

// MARK: - Editor

struct ProductEditor: View {
    @Environment(AppModel.self) private var app
    @Environment(\.dismiss) private var dismiss
    @State var product: Product
    let isNew: Bool
    /// Called after saving (e.g. to use the new product on the current job).
    var onSaved: ((Product) -> Void)? = nil

    var body: some View {
        SentenceForm {
            Section {
                Picker("For", selection: $product.deviceTypeId) {
                    Section("Devices") { ForEach(app.liveCatalog) { Text($0.name).tag($0.id) } }
                    Section("Cables") {
                        ForEach(Catalog.wireTypes.filter { $0 != "None" }, id: \.self) { Text("\($0) cable").tag(Cables.productKey($0)) }
                    }
                }
                TextField("Brand", text: $product.brand).textInputAutocapitalization(.words)
                TextField("Model", text: $product.model)
                TextField("SKU / part number", text: Binding(get: { product.sku ?? "" }, set: { product.sku = $0.isEmpty ? nil : $0 }))
                    .textInputAutocapitalization(.characters).autocorrectionDisabled()
            }
            Section {
                LabeledContent(isCable ? "Price per ft" : isLF ? "Price per LF" : "Price each") { DoubleField(value: $product.unitPrice) }
                LabeledContent(isCable ? "Pulling labor per ft" : isLF ? "Labor per LF" : "Labor each") { DoubleField(value: $product.laborPrice) }
            } footer: { Text("Your price before markup. Labor is added per unit when labor is included in the device price") }
            Section(sentence: "Notes") {
                TextField("Specs, finish, where to buy…", text: Binding(get: { product.notes ?? "" }, set: { product.notes = $0.isEmpty ? nil : $0 }), axis: .vertical)
                    .lineLimit(2...5)
            }
            if !isNew {
                Section {
                    Button("Archive product", role: .destructive) { app.archiveProduct(product.id); dismiss() }
                } footer: { Text("Jobs that already use it keep it; it just stops appearing in pickers") }
            }
        }
        .navigationTitle(isNew ? "New product" : product.title)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
            ToolbarItem(placement: .confirmationAction) {
                Button("Save") { app.saveProduct(product); onSaved?(product); dismiss() }
                    .disabled(product.brand.trimmingCharacters(in: .whitespaces).isEmpty && product.model.trimmingCharacters(in: .whitespaces).isEmpty)
            }
        }
    }

    private var isLF: Bool { app.type(product.deviceTypeId)?.unit == .LF }
    private var isCable: Bool { Cables.cableType(fromKey: product.deviceTypeId) != nil }
}

// MARK: - Import

/// Paste rows from a spreadsheet (or pick a CSV file): Device type, Brand, Model, SKU, Price, Labor, Notes — any order, header row first.
struct ProductImportView: View {
    @Environment(AppModel.self) private var app
    @Environment(\.dismiss) private var dismiss
    @State private var text = ""
    @State private var picking = false
    @State private var copied = false

    var body: some View {
        let result = ProductCSV.parse(text, catalog: app.catalog)
        SentenceForm {
            Section {
                TextField("Paste rows here, header row first", text: $text, axis: .vertical)
                    .lineLimit(6...14).font(.callout.monospaced()).autocorrectionDisabled().textInputAutocapitalization(.never)
                Button { picking = true } label: { Label("Choose a CSV file", systemImage: "doc") }
                Button {
                    UIPasteboard.general.string = ProductCSV.template(catalog: app.catalog)
                    copied = true
                } label: { Label(copied ? "Template copied" : "Copy a template for Numbers or Excel", systemImage: "doc.on.doc") }
            } footer: {
                Text("Columns: Type, Brand, Model, SKU, Price, Labor, Notes, in any order. Type is a device (“Indoor camera”, “camera”) or a cable (“Cat6”, “HDMI”); cable prices are per foot")
            }
            if !text.isEmpty {
                Section(sentence: "Will add \(result.products.count)") {
                    ForEach(result.products.prefix(30)) { p in
                        LabeledContent(p.title, value: "\(app.type(p.deviceTypeId)?.name ?? Cables.cableType(fromKey: p.deviceTypeId).map { "\($0) cable" } ?? "") · \(Money.format(p.unitPrice, currency: app.pricing.currency))")
                    }
                    if result.products.count > 30 { Text("…and \(result.products.count - 30) more").foregroundStyle(.secondary) }
                }
                if !result.skipped.isEmpty {
                    Section(sentence: "Skipped \(result.skipped.count)") {
                        ForEach(result.skipped, id: \.self) { Text($0).font(.footnote).foregroundStyle(.orange) }
                    }
                }
            }
        }
        .navigationTitle("Import price list")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
            ToolbarItem(placement: .confirmationAction) {
                Button("Add \(result.products.count)") { app.importProducts(result.products); dismiss() }.disabled(result.products.isEmpty)
            }
        }
        .fileImporter(isPresented: $picking, allowedContentTypes: [.commaSeparatedText, .tabSeparatedText, .plainText]) { r in
            guard let url = try? r.get() else { return }
            let access = url.startAccessingSecurityScopedResource()
            defer { if access { url.stopAccessingSecurityScopedResource() } }
            text = (try? String(contentsOf: url, encoding: .utf8)) ?? text
        }
    }
}

// MARK: - Per job

/// Which brand/model this job uses for each device type it has. Changing one reprices every device of that type.
struct JobProductsView: View {
    @Environment(AppModel.self) private var app
    let model: EditorModel
    @State private var creating: ProductDraft?

    var body: some View {
        let used = usedTypes
        SentenceForm {
            Section {
                Text("Pick the brand and model for each device on this job. Prices on the estimate follow. A single device can use another model from its edit panel.")
                    .font(.callout).foregroundStyle(.secondary)
            }
            if used.isEmpty {
                Section { Text("Place devices on the plan first").foregroundStyle(.secondary) }
            }
            if !usedCables.isEmpty {
                Section {
                    ForEach(usedCables, id: \.type) { c in
                        Picker(selection: Binding(get: { model.bundle.project.productChoices?[Cables.productKey(c.type)] ?? "" },
                                                  set: { v in model.edit { $0.setProductChoice(typeId: Cables.productKey(c.type), productId: v.isEmpty ? nil : v) } })) {
                            Text("Default · \(Money.format(app.pricing.wirePrices[c.type] ?? 0, currency: app.pricing.currency))/ft").tag("")
                            ForEach(app.products(for: Cables.productKey(c.type))) { p in
                                Text("\(p.title) · \(Money.format(p.unitPrice, currency: app.pricing.currency))/ft").tag(p.id)
                            }
                        } label: {
                            HStack(spacing: 10) {
                                Circle().fill(wireColor(c.type)).frame(width: 12, height: 12).frame(width: 26)
                                VStack(alignment: .leading, spacing: 1) {
                                    Text("\(c.type) cable")
                                    Text(c.qty).font(.caption).foregroundStyle(.secondary)
                                }
                            }
                        }
                        .pickerStyle(.navigationLink)
                    }
                    Button {
                        creating = ProductDraft(product: Product(deviceTypeId: Cables.productKey(usedCables[0].type), brand: "", model: ""), isNew: true)
                    } label: { Label("New cable product", systemImage: "plus") }
                        .font(.subheadline)
                } header: { Text("Cables").textCase(nil) } footer: { Text("Brand and price per foot for each cable on this job") }
            }
            ForEach(used, id: \.type.id) { item in
                Section {
                    Picker(selection: Binding(get: { model.bundle.project.productChoices?[item.type.id] ?? "" },
                                              set: { v in model.edit { $0.setProductChoice(typeId: item.type.id, productId: v.isEmpty ? nil : v) } })) {
                        Text("No specific product · \(Money.format(item.type.unitPrice, currency: app.pricing.currency))").tag("")
                        ForEach(app.products(for: item.type.id)) { p in
                            Text("\(p.title) · \(Money.format(p.unitPrice, currency: app.pricing.currency))").tag(p.id)
                        }
                    } label: {
                        HStack(spacing: 10) {
                            DeviceSymbol(type: item.type, size: 26)
                            VStack(alignment: .leading, spacing: 1) {
                                Text(item.type.name)
                                Text(item.qty).font(.caption).foregroundStyle(.secondary)
                            }
                        }
                    }
                    .pickerStyle(.navigationLink)
                    Button {
                        creating = ProductDraft(product: Product(deviceTypeId: item.type.id, brand: "", model: ""), isNew: true)
                    } label: { Label("New \(item.type.name.lowercased()) product", systemImage: "plus") }
                        .font(.subheadline)
                }
            }
        }
        .navigationTitle("Products for this job")
        .sheet(item: $creating) { d in
            NavigationStack {
                ProductEditor(product: d.product, isNew: true) { p in
                    model.edit { $0.setProductChoice(typeId: p.deviceTypeId, productId: p.id) }
                }
            }
        }
    }

    private var usedCables: [(type: String, qty: String)] {
        let t = model.takeoff.total
        return t.wireFt.keys.sorted().compactMap { w in
            guard let ft = t.wireFt[w], ft > 0, w != "Unspecified" else { return nil }
            return (w, "\(ft.clean) ft · \(t.wireRuns[w] ?? 0) run\((t.wireRuns[w] ?? 0) == 1 ? "" : "s")")
        }
    }

    private var usedTypes: [(type: DeviceType, qty: String)] {
        let t = model.takeoff.total
        return app.liveCatalog.compactMap { d in
            if d.kind == .led {
                let ft = (t.ledFt[d.id] ?? 0) + (t.ledTentativeFt[d.id] ?? 0)
                return ft > 0 ? (d, "\(ft.clean) LF on this job") : nil
            }
            let n = t.counts[d.id] ?? 0
            return n > 0 ? (d, "\(n) on this job") : nil
        }
    }
}

/// Inspector row: this device's product (or the job's choice).
struct MarkerProductPicker: View {
    @Environment(AppModel.self) private var app
    let model: EditorModel
    let marker: Marker

    var body: some View {
        let jobChoice = app.product(model.bundle.project.productChoices?[marker.deviceTypeId])
        let options = app.products(for: marker.deviceTypeId)
        VStack(alignment: .leading, spacing: 2) {
            Text("Product").font(.caption).foregroundStyle(.secondary)
            if options.isEmpty && jobChoice == nil {
                Text("No products for this device type yet").font(.subheadline).foregroundStyle(.secondary)
            } else {
                Picker("Product", selection: Binding(get: { marker.productId ?? "" }, set: { v in
                    let pricing = model.pricing
                    model.edit { $0.updateMarker(marker.id, pricing: pricing) { $0.productId = v.isEmpty ? nil : v } }
                })) {
                    Text(jobChoice.map { "\($0.title) (job's choice)" } ?? "Job's choice (none)").tag("")
                    ForEach(options) { Text($0.title).tag($0.id) }
                }
                .labelsHidden()
            }
        }
    }
}
