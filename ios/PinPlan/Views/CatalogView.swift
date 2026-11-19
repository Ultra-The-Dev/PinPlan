import SwiftUI
import PinPlanCore

struct CatalogView: View {
    @Environment(AppModel.self) private var app
    @Environment(\.dismiss) private var dismiss
    @State private var editing: DeviceType?
    @State private var showArchived = false
    @State private var query = ""

    var body: some View {
        // Technicians see the catalog (symbols, letters, wire) but not prices, and can't change it.
        let canEdit = app.cloud.can(.editCatalog)
        let showPrices = app.cloud.can(.prices)
        SentenceList {
            if showPrices {
                Section {
                    NavigationLink { ProductLibraryView() } label: {
                        LabeledContent {
                            Text("\(app.products.filter { $0.archived != true && $0.deleted != true }.count)")
                        } label: { Label("Products (brands and models)", systemImage: "tag") }
                    }
                }
            }
            if !canEdit {
                Section {
                    Label("Only the office can change the catalog.", systemImage: "lock").font(.callout).foregroundStyle(.secondary)
                }
            }
            ForEach(Trades.allCategories(for: app.trades), id: \.id) { cat in
                let types = app.catalog.filter { $0.category == cat.id && (showArchived || $0.archived != true) && (query.isEmpty || $0.name.localizedCaseInsensitiveContains(query)) }
                    .sorted { $0.sort < $1.sort }
                if !types.isEmpty {
                    Section {
                        ForEach(types) { t in
                            Button { editing = t } label: {
                                HStack(spacing: 12) {
                                    if t.kind == .led { Capsule().fill(Color(hex: t.color)).frame(width: 26, height: 5).frame(width: 30) } else { DeviceSymbol(type: t, size: 30) }
                                    VStack(alignment: .leading) {
                                        Text(t.name).foregroundStyle(t.archived == true ? .secondary : .primary)
                                        Text("\(t.abbrev)-1-01 · \(t.defaultWire)").font(.caption).foregroundStyle(.secondary)
                                    }
                                    Spacer()
                                    if showPrices {
                                        VStack(alignment: .trailing) {
                                            Text(Money.format(t.unitPrice, currency: app.pricing.currency) + (t.unit == .LF ? "/LF" : "")).foregroundStyle(t.unitPrice == 0 ? .orange : .primary)
                                            Text("+ \(Money.format(t.laborPrice, currency: app.pricing.currency)) labor").font(.caption).foregroundStyle(.secondary)
                                        }
                                        .monospacedDigit()
                                    }
                                }
                            }
                            .buttonStyle(.plain)
                            .allowsHitTesting(canEdit)
                        }
                    } header: {
                        HStack { Circle().fill(Color(hex: cat.color)).frame(width: 8, height: 8); Text(cat.name) }.textCase(nil)
                    }
                }
            }
        }
        .searchable(text: $query)
        .navigationTitle("Device catalog")
        .toolbar {
            ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } }
            ToolbarItemGroup(placement: .topBarLeading) {
                Toggle(isOn: $showArchived) { Label("Archived", systemImage: "archivebox") }
                if canEdit { Button { editing = newType() } label: { Label("Add", systemImage: "plus") } }
            }
        }
        .sheet(item: $editing) { t in DeviceTypeEditor(type: t) }
    }

    private func newType() -> DeviceType {
        DeviceType(id: newId(), name: "", category: .security, symbol: "X", abbrev: "DEV", shape: .circle, color: "#dc2626", unit: .each,
                   unitPrice: 0, laborPrice: 0, defaultWire: "Cat6", defaultMount: .ceiling, kind: .device, billduProductId: nil,
                   sort: (app.catalog.map(\.sort).max() ?? 0) + 1, archived: nil, updatedAt: isoNow())
    }
}

private struct DeviceTypeEditor: View {
    @Environment(AppModel.self) private var app
    @Environment(\.dismiss) private var dismiss
    @State var type: DeviceType

    /// Wire types for the company's trades (low voltage: the original list), "None" and the type's own.
    private var wireChoices: [String] {
        var list: [String] = app.trades.contains(.lowvoltage) ? Catalog.wireTypes : []
        for w in Trades.wireTypes(for: app.trades) + ["None", type.defaultWire] where !list.contains(w) { list.append(w) }
        return list
    }

    var body: some View {
        NavigationStack {
            SentenceForm {
                Section {
                    HStack {
                        Spacer()
                        if type.kind == .led { Capsule().fill(Color(hex: type.color)).frame(width: 60, height: 8) } else { DeviceSymbol(type: type, size: 56) }
                        Spacer()
                    }
                    TextField("Name", text: $type.name)
                    Picker("Category", selection: $type.category) { ForEach(Trades.allCategories(for: app.trades), id: \.id) { Text($0.name).tag($0.id) } }
                    Picker("Measured as", selection: Binding(get: { type.unit }, set: { type.unit = $0; type.kind = $0 == .LF ? .led : .device })) {
                        Text("Each (tap to place)").tag(MeasureUnit.each)
                        Text("Linear feet (draw a run)").tag(MeasureUnit.LF)
                    }
                }
                Section(sentence: "Price") {
                    LabeledContent(type.unit == .LF ? "Price per LF" : "Price each") { DoubleField(value: $type.unitPrice) }
                    LabeledContent(type.unit == .LF ? "Labor per LF" : "Labor each") { DoubleField(value: $type.laborPrice) }
                }
                if type.kind != .led {
                    Section(sentence: "Icon") {
                        LazyVGrid(columns: [GridItem(.adaptive(minimum: 40), spacing: 8)], spacing: 8) {
                            ForEach(DeviceIcons.all.map(\.key) + ["letters"], id: \.self) { key in
                                let on = (DeviceIcons.key(for: type) ?? "letters") == key
                                Button { type.icon = key } label: {
                                    Group {
                                        if key != "letters", let name = DeviceIconArt.symbolName(key) {
                                            Image(systemName: name).font(.system(size: 17, weight: .semibold))
                                        } else {
                                            Text(key == "letters" ? (type.symbol.isEmpty ? "Aa" : type.symbol) : "?").font(.system(size: 12, weight: .bold))
                                        }
                                    }
                                    .frame(width: 40, height: 40)
                                    .foregroundStyle(on ? .white : .primary)
                                    .background(on ? Color(hex: type.color) : Color(.secondarySystemFill), in: RoundedRectangle(cornerRadius: 9))
                                }
                                .buttonStyle(.plain)
                                .accessibilityLabel(key == "letters" ? "Letters" : DeviceIcons.all.first { $0.key == key }?.label ?? key)
                                .accessibilityAddTraits(on ? .isSelected : [])
                            }
                        }
                        .padding(.vertical, 4)
                    }
                }
                Section(sentence: "Symbol") {
                    TextField("Symbol (1–3 letters)", text: Binding(get: { type.symbol }, set: { type.symbol = String($0.uppercased().prefix(3)) }))
                    TextField("Label prefix", text: Binding(get: { type.abbrev }, set: { type.abbrev = String($0.uppercased().prefix(6)) }))
                    Picker("Shape", selection: $type.shape) { ForEach(MarkerShape.allCases, id: \.self) { Text($0.rawValue.capitalized).tag($0) } }
                    ColorPicker("Color", selection: Binding(get: { Color(hex: type.color) }, set: { type.color = $0.hexString }))
                }
                Section(sentence: "Defaults") {
                    Picker("Wire", selection: $type.defaultWire) { ForEach(wireChoices, id: \.self) { Text($0).tag($0) } }
                    Picker("Mount", selection: $type.defaultMount) { ForEach(Mount.allCases, id: \.self) { Text($0.rawValue.capitalized).tag($0) } }
                }
                Section {
                    Toggle("Archived (hidden from the device menu)", isOn: Binding(get: { type.archived == true }, set: { type.archived = $0 }))
                }
            }
            .navigationTitle(type.name.isEmpty ? "New device type" : type.name)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") { app.updateCatalog(type); dismiss() }.disabled(type.name.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
        }
    }
}

extension Color {
    /// "#rrggbb" for storage.
    var hexString: String {
        let c = UIColor(self)
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        c.getRed(&r, green: &g, blue: &b, alpha: &a)
        return String(format: "#%02x%02x%02x", Int(round(max(0, min(1, r)) * 255)), Int(round(max(0, min(1, g)) * 255)), Int(round(max(0, min(1, b)) * 255)))
    }
}
