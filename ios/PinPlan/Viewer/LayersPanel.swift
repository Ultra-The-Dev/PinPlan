import SwiftUI
import PinPlanCore

/// Layers (the company's trades, wiring, closets, labels) and filters (type, tentative, room), with counts for
/// this sheet. Remembered per job. Hiding things never changes the takeoff: it always counts everything.
struct LayersPanel: View {
    @Environment(AppModel.self) private var app
    let model: EditorModel
    let sheet: Sheet
    let onClose: () -> Void

    var body: some View {
        let types = model.typesById
        let markers = model.bundle.liveMarkers.filter { $0.sheetId == sheet.id }
        let runs = model.bundle.liveRuns.filter { $0.sheetId == sheet.id }
        let closets = model.bundle.liveClosets.filter { $0.sheetId == sheet.id }
        let counts = model.filter.counts(markers: markers, runs: runs, closets: closets) { types[$0]?.category }
        PanelContainer(title: "Layers", inSheet: true, onClose: onClose) {
            SentenceList {
                LayersSummarySection(model: model, counts: counts)
                Section(sentence: "Trades") {
                    ForEach(Trades.layers(for: app.trades)) { info in
                        Toggle(isOn: layerBinding(info.id)) {
                            HStack {
                                Text(info.name)
                                Spacer()
                                Text("\(counts.byLayer[info.id] ?? 0)").monospacedDigit().foregroundStyle(.secondary)
                            }
                        }
                    }
                }
                Section(sentence: "On the plan") {
                    Toggle(isOn: binding(\.showClosets)) {
                        HStack { Text("Closets and panels"); Spacer(); Text("\(counts.closets)").monospacedDigit().foregroundStyle(.secondary) }
                    }
                    Toggle("Labels", isOn: binding(\.showLabels))
                }
                Section(sentence: "Tentative devices") {
                    Picker("Tentative", selection: binding(\.tentative)) {
                        ForEach(TentativeFilter.allCases, id: \.self) { t in Text(t.title).tag(t) }
                    }
                    .pickerStyle(.segmented)
                    .accessibilityLabel("Show tentative devices")
                }
                RoomsSection(model: model, rooms: PlanFilter.rooms(in: markers), counts: counts)
                TypesSection(model: model, types: types, counts: counts)
                OfficeDrawingsSection(model: model, sheet: sheet)
            }
        }
    }

    private func binding<T>(_ kp: WritableKeyPath<PlanFilter, T>) -> Binding<T> {
        Binding(get: { model.filter[keyPath: kp] }, set: { v in
            model.filter[keyPath: kp] = v
            model.saveFilter()
        })
    }

    private func layerBinding(_ l: Layer) -> Binding<Bool> {
        Binding(get: { model.filter.isLayerVisible(l) }, set: { on in
            model.filter.setLayer(l, visible: on)
            model.saveFilter()
            Haptics.select()
        })
    }
}

private struct LayersSummarySection: View {
    let model: EditorModel
    let counts: PlanFilter.Counts

    var body: some View {
        Section {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text(counts.shown == counts.total ? "All \(counts.total) devices showing" : "Showing \(counts.shown) of \(counts.total) devices")
                        .font(.subheadline.weight(.semibold))
                    Text("Counts and the takeoff always include everything.").font(.caption).foregroundStyle(.secondary)
                }
                Spacer()
                if model.filter.isFiltering {
                    Button("Show all") {
                        model.filter.reset()
                        model.saveFilter()
                        Haptics.select()
                    }
                    .buttonStyle(.bordered)
                }
            }
        }
    }
}

private struct RoomsSection: View {
    let model: EditorModel
    let rooms: [String]
    let counts: PlanFilter.Counts

    var body: some View {
        if !rooms.isEmpty {
            Section(sentence: "Rooms") {
                Button {
                    model.filter.rooms = []
                    model.saveFilter()
                } label: {
                    row("Every room", count: nil, on: model.filter.rooms.isEmpty)
                }
                ForEach(rooms, id: \.self) { r in
                    Button {
                        model.filter.toggleRoom(r)
                        model.saveFilter()
                    } label: {
                        row(r, count: counts.byRoom[r], on: model.filter.rooms.contains(r))
                    }
                }
            }
        }
    }

    private func row(_ title: String, count: Int?, on: Bool) -> some View {
        HStack {
            Image(systemName: on ? "checkmark.circle.fill" : "circle").foregroundStyle(on ? Color.brand : Color.secondary)
            Text(title).foregroundStyle(Color.primary)
            Spacer()
            if let count { Text("\(count)").monospacedDigit().foregroundStyle(.secondary) }
        }
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isButton)
        .accessibilityValue(on ? "Selected" : "")
    }
}

private struct TypesSection: View {
    let model: EditorModel
    let types: [String: DeviceType]
    let counts: PlanFilter.Counts

    var body: some View {
        let present = counts.byType.keys.compactMap { types[$0] }.sorted { $0.name.localizedStandardCompare($1.name) == .orderedAscending }
        if !present.isEmpty {
            Section(sentence: "Device types on this sheet") {
                ForEach(present) { t in
                    Toggle(isOn: Binding(get: { !model.filter.hiddenTypes.contains(t.id) }, set: { on in
                        model.filter.setType(t.id, visible: on)
                        model.saveFilter()
                    })) {
                        HStack(spacing: 10) {
                            DeviceSymbol(type: t, size: 22)
                            Text(t.name).lineLimit(1)
                            Spacer()
                            Text("\(counts.byType[t.id] ?? 0)").monospacedDigit().foregroundStyle(.secondary)
                        }
                    }
                }
            }
        }
    }
}
