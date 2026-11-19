import SwiftUI
import PinPlanCore

private func shareCSV(_ text: String, name: String) -> SharedFile? {
    let url = FileManager.default.temporaryDirectory.appendingPathComponent(name)
    do { try text.write(to: url, atomically: true, encoding: .utf8); return SharedFile(url: url) } catch { return nil }
}

/// Every cable and the closet port it lands on; exports the port schedule and cable labels.
struct PortScheduleView: View {
    @Environment(AppModel.self) private var app
    let model: EditorModel
    @State private var share: SharedFile?

    var body: some View {
        let rows = Wiring.portSchedule(model.bundle, catalog: app.catalog, products: app.products)
        let closets = rows.map(\.closetName).reduce(into: [String]()) { if !$0.contains($1) { $0.append($1) } }
        let base = slug(model.bundle.project.address)
        SentenceList {
            Section {
                Button { share = shareCSV(Wiring.cableLabelsCSV(rows), name: "\(base)-cable-labels.csv") } label: {
                    Label("Cable labels (CSV)", systemImage: "tag")
                }
                Button { share = shareCSV(Wiring.portScheduleCSV(rows), name: "\(base)-port-schedule.csv") } label: {
                    Label("Port schedule (CSV)", systemImage: "tablecells")
                }
            } footer: {
                Text("Two labels per cable — device end and closet end — for Brady, Dymo or Brother P-touch. Cat6 lands on \(Wiring.panelPorts)-port patch panels (PP1-01…); other cables are numbered by type. Print labels once the plan is final: numbers follow floor and label order.")
            }
            if rows.isEmpty {
                Section { Text("No wired devices yet.").foregroundStyle(.secondary) }
            }
            ForEach(closets, id: \.self) { c in
                let list = rows.filter { $0.closetName == c }
                Section {
                    ForEach(list) { r in
                        HStack(spacing: 10) {
                            Text(r.port.isEmpty ? "—" : r.port).font(.system(.subheadline, design: .monospaced).weight(.semibold)).frame(width: 64, alignment: .leading)
                            Circle().fill(wireColor(r.cable)).frame(width: 8, height: 8)
                            VStack(alignment: .leading, spacing: 1) {
                                Text(r.label + (r.tentative ? " ?" : "")).font(.subheadline.weight(.medium))
                                Text([r.cable, r.room.isEmpty ? nil : r.room, r.floor].compactMap { $0 }.joined(separator: " · ")).font(.caption).foregroundStyle(.secondary)
                            }
                            Spacer()
                            if let l = r.lengthFt { Text("\(l.clean) ft").font(.caption).monospacedDigit().foregroundStyle(.secondary) }
                        }
                    }
                } header: {
                    Text("\(c) · \(list.count) cable\(list.count == 1 ? "" : "s")")
                } footer: {
                    if list.first?.closetId == nil { Text("Assign these devices a home-run closet to number their ports.") }
                }
            }
        }
        .navigationTitle("Ports & labels")
        .shareSheet($share)
    }
}

/// What to buy for the job, by supplier: products, cable by the box, HDMI by stock length, jacks and patch panels.
struct OrderListView: View {
    @Environment(AppModel.self) private var app
    let model: EditorModel
    @State private var share: SharedFile?
    @State private var withTentative = false

    var body: some View {
        let pricing = model.pricing
        let rows = Wiring.materialList(model.bundle, catalog: app.catalog, products: app.products, includeTentative: withTentative, wirePrices: pricing.wirePrices)
        let suppliers = rows.map(\.supplier).reduce(into: [String]()) { if !$0.contains($1) { $0.append($1) } }
        let total = rows.reduce(0) { $0 + $1.total }
        let showPrices = app.cloud.can(.prices)
        SentenceList {
            Section {
                Toggle("Include “?” items", isOn: $withTentative)
                Button { share = shareCSV(Wiring.materialCSV(rows), name: "\(slug(model.bundle.project.address))-order-list.csv") } label: {
                    Label("Share order list (CSV)", systemImage: "square.and.arrow.up")
                }
                .disabled(rows.isEmpty)
            } footer: {
                Text("Cable is rounded up to full boxes and HDMI to stock lengths. Costs are your prices, before markup.")
            }
            if rows.isEmpty { Section { Text("Place devices and draw home runs to build the order list.").foregroundStyle(.secondary) } }
            ForEach(suppliers, id: \.self) { s in
                Section(s) {
                    ForEach(rows.filter { $0.supplier == s }) { r in
                        HStack(alignment: .firstTextBaseline) {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(r.item).font(.subheadline.weight(.medium))
                                let sub = [r.sku.isEmpty ? nil : r.sku, r.note.isEmpty ? nil : r.note].compactMap { $0 }.joined(separator: " · ")
                                if !sub.isEmpty { Text(sub).font(.caption).foregroundStyle(.secondary) }
                            }
                            Spacer()
                            VStack(alignment: .trailing, spacing: 2) {
                                Text("\(r.qty.clean) \(r.unit)").font(.subheadline).monospacedDigit()
                                if r.total > 0 && showPrices { Text(Money.format(r.total, currency: pricing.currency)).font(.caption).foregroundStyle(.secondary).monospacedDigit() }
                            }
                        }
                    }
                }
            }
            if total > 0 && showPrices {
                Section { LabeledContent("Material cost", value: Money.format(total, currency: pricing.currency)).font(.headline) }
            }
        }
        .navigationTitle("Order list")
        .shareSheet($share)
    }
}
