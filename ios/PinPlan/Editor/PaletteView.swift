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
            ForEach(Catalog.categories, id: \.id) { cat in
                let types = app.liveCatalog.filter { $0.category == cat.id && (query.isEmpty || $0.name.localizedCaseInsensitiveContains(query)) }
                let closets = cat.id == .infrastructure ? Catalog.closetKinds.filter { query.isEmpty || $0.name.localizedCaseInsensitiveContains(query) } : []
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
                        HStack(spacing: 6) { Circle().fill(Color(hex: cat.color)).frame(width: 8, height: 8); Text(cat.name) }
                    }
                }
            }
            if query.isEmpty || "wire run".localizedCaseInsensitiveContains(query) {
                Section("Wiring") {
                    toolRow(.wire, title: "Wire run", subtitle: "device → closet", count: 0) {
                        Image(systemName: "point.topleft.down.to.point.bottomright.curvepath").foregroundStyle(.blue).frame(width: 28, height: 28)
                    }
                }
            }
        }
        .listStyle(.sidebar)
    }

    @ViewBuilder
    private func row(for t: DeviceType) -> some View {
        let sheetId = model.activeSheet?.id
        if t.kind == .led {
            let runs = model.bundle.liveRuns.filter { $0.sheetId == sheetId && $0.deviceTypeId == t.id }.count
            if t.id == "led-stair" {
                toolRow(.stair, title: t.name, subtitle: "steps × LF per step", count: runs) { DeviceSymbol(type: t, size: 28) }
            } else {
                toolRow(.led(t.id), title: t.name.replacingOccurrences(of: "LED strip — ", with: "LED · "), subtitle: "draw run · LF", count: runs) {
                    Capsule().fill(Color(hex: t.color)).frame(width: 26, height: 5).frame(width: 28, height: 28)
                }
            }
        } else {
            let n = model.bundle.liveMarkers.filter { $0.sheetId == sheetId && $0.deviceTypeId == t.id }.count
            toolRow(.place(t.id), title: t.name, subtitle: nil, count: n) { DeviceSymbol(type: t, size: 28) }
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
                    Text(title).font(.subheadline.weight(.medium)).lineLimit(1)
                    if let subtitle { Text(subtitle).font(.caption2).foregroundStyle(.secondary) }
                }
                Spacer()
                if count > 0 { Text("\(count)").font(.caption.bold()).monospacedDigit().padding(.horizontal, 6).padding(.vertical, 2).background(Color(.tertiarySystemFill), in: RoundedRectangle(cornerRadius: 5, style: .continuous)) }
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .listRowBackground(active ? Color.brand.opacity(0.12) : nil)
    }
}
