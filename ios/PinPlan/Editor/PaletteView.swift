import SwiftUI
import TipKit
import PinPlanCore

/// Device menu grouped by category, with search and the "room for new devices" field.
struct PaletteView: View {
    @Environment(AppModel.self) private var app
    @Bindable var model: EditorModel
    var onPick: () -> Void = {}
    @State private var query = ""

    var body: some View {
        SentenceList {
            TipView(PlaceDeviceTip()).listRowInsets(EdgeInsets()).listRowBackground(Color.clear)
            Section {
                Label {
                    TextField("Room for new devices", text: $model.room)
                } icon: { Image(systemName: "door.left.hand.open") }
                Label {
                    TextField("Find a device type", text: $query)
                } icon: { Image(systemName: "magnifyingglass") }
            }
            // Sections, closets and run naming follow the company's trades (low voltage: as before).
            ForEach(sections, id: \.id) { cat in
                let types = app.liveCatalog.filter { $0.category == cat.id && Trades.typeVisible($0, for: app.trades) && (query.isEmpty || $0.name.localizedCaseInsensitiveContains(query)) }
                let closets = closetKinds(in: cat.id)
                if !types.isEmpty || !closets.isEmpty {
                    Section {
                        ForEach(types) { t in row(for: t) }
                        ForEach(closets, id: \.id) { c in
                            toolRow(.closet(c.id), title: c.name, subtitle: nil, count: 0) {
                                Text(c.abbrev).font(.system(size: 10, weight: .bold)).foregroundStyle(.white)
                                    .frame(width: 28, height: 28).background(Color(hex: c.color), in: RoundedRectangle(cornerRadius: 7))
                            }
                        }
                    } header: {
                        HStack(spacing: 6) { Circle().fill(Color(hex: cat.color)).frame(width: 8, height: 8); Text(cat.name) }.textCase(nil)
                    }
                }
            }
            if query.isEmpty || vocab.run.localizedCaseInsensitiveContains(query) {
                Section(sentence: vocab.run == "Wire run" ? String(localized: "Wiring") : vocab.runs) {
                    toolRow(.wire, title: vocab.run, subtitle: vocab.runHint, count: 0) {
                        Image(systemName: "point.topleft.down.to.point.bottomright.curvepath").foregroundStyle(.blue).frame(width: 28, height: 28)
                    }
                }
            }
        }
        .listStyle(.sidebar)
    }

    private var vocab: TradeVocab { Trades.vocab(for: app.trades) }

    /// The company's categories, plus an "Equipment" section for closet kinds whose category isn't one of them.
    private var sections: [CategoryInfo] {
        var list = Trades.categories(for: app.trades)
        if let orphan = Trades.closetKinds(for: app.trades).first(where: { k in !list.contains { $0.id == k.category } }) {
            list.append(CategoryInfo(id: orphan.category, name: String(localized: "Equipment"), color: orphan.color))
        }
        return list
    }

    private func closetKinds(in category: PinPlanCore.Category) -> [Catalog.ClosetInfo] {
        Trades.closetKinds(for: app.trades).filter { $0.category == category && (query.isEmpty || $0.name.localizedCaseInsensitiveContains(query)) }
    }

    @ViewBuilder
    private func row(for t: DeviceType) -> some View {
        let sheetId = model.activeSheet?.id
        if t.kind == .led {
            let runs = model.bundle.liveRuns.filter { $0.sheetId == sheetId && $0.deviceTypeId == t.id }.count
            if t.id == "led-stair" {
                toolRow(.stair, title: t.name, subtitle: String(localized: "steps × LF per step"), count: runs) { DeviceSymbol(type: t, size: 28) }
            } else {
                toolRow(.led(t.id), title: t.name.replacingOccurrences(of: "LED strip — ", with: "LED · "), subtitle: String(localized: "draw run · LF"), count: runs) {
                    Capsule().fill(Color(hex: t.color)).frame(width: 26, height: 5).frame(width: 28, height: 28)
                }
            }
        } else {
            let n = model.bundle.liveMarkers.filter { $0.sheetId == sheetId && $0.deviceTypeId == t.id }.count
            let chosen = app.product(model.bundle.project.productChoices?[t.id])?.title
            toolRow(.place(t.id), title: t.name, subtitle: chosen, count: n) { DeviceSymbol(type: t, size: 28) }
        }
    }

    private func toolRow<Icon: View>(_ tool: Tool, title: String, subtitle: String?, count: Int, @ViewBuilder icon: () -> Icon) -> some View {
        let active = model.tool == tool
        return Button {
            model.use(active ? .select : tool)
            if !active { onPick() }
        } label: {
            HStack(spacing: 10) {
                icon()
                VStack(alignment: .leading, spacing: 1) {
                    // Two lines: device names run long in some languages and the iPad palette is narrow.
                    Text(title).font(.subheadline.weight(.medium)).lineLimit(2)
                    if let subtitle { Text(subtitle).font(.caption2).foregroundStyle(.secondary) }
                }
                Spacer()
                if count > 0 { Text("\(count)").font(.caption.bold()).monospacedDigit().padding(.horizontal, 6).padding(.vertical, 2).background(Color(.tertiarySystemFill), in: RoundedRectangle(cornerRadius: 5, style: .continuous)) }
            }
            .frame(minHeight: 44)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(active ? .isSelected : [])
        .listRowBackground(active ? Color.brand.opacity(0.12) : nil)
    }
}
