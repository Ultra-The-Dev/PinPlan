import SwiftUI
import PinPlanCore

struct PlanEditorView: View {
    @Environment(AppModel.self) private var app
    @Environment(\.horizontalSizeClass) private var hSize
    @Bindable var model: EditorModel
    @State private var showPalette = true
    @State private var showCounts = false
    @State private var showScan = false
    @State private var scaleInput = false

    private var regular: Bool { hSize == .regular }

    var body: some View {
        HStack(spacing: 0) {
            if regular && showPalette {
                PaletteView(model: model).frame(width: 290)
                Divider()
            }
            ZStack {
                if let sheet = model.activeSheet {
                    PlanCanvasView(model: model, sheet: sheet).id(sheet.id)
                }
                VStack(spacing: 8) {
                    if let hint { HintCapsule(text: hint) }
                    if model.tool.isDrawing && model.tool != .measure { drawingBar }
                    Spacer()
                    if model.sheets.count > 1 { floorSwitcher }
                }
                .padding(.top, 10).padding(.bottom, 12)
                if let toast = model.toast {
                    VStack {
                        Spacer()
                        Text(toast).font(.subheadline.weight(.medium)).foregroundStyle(.white)
                            .padding(.horizontal, 14).padding(.vertical, 9).background(Color.ink.opacity(0.92), in: Capsule())
                            .padding(.bottom, 70)
                    }
                    .transition(.opacity)
                }
            }
            if regular, let sel = model.selection {
                Divider()
                VStack(spacing: 0) {
                    HStack {
                        Text("Edit").font(.headline)
                        Spacer()
                        Button { model.selection = nil } label: { Image(systemName: "xmark.circle.fill").font(.title3).foregroundStyle(.secondary) }
                    }
                    .padding(.horizontal).padding(.vertical, 10)
                    InspectorView(model: model, selection: sel)
                }
                .frame(width: 340)
                .background(Color(.systemGroupedBackground))
            } else if regular && showCounts {
                Divider()
                CountsPanel(model: model) { showCounts = false }.frame(width: 320)
            }
        }
        .animation(.snappy(duration: 0.2), value: model.selection)
        .toolbar { toolbar }
        .sheet(isPresented: Binding(get: { !regular && model.selection != nil }, set: { if !$0 { model.selection = nil } })) {
            if let sel = model.selection {
                NavigationStack { InspectorView(model: model, selection: sel).navigationTitle("Edit").navigationBarTitleDisplayMode(.inline)
                    .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { model.selection = nil } } } }
                .presentationDetents([.medium, .large])
            }
        }
        .sheet(isPresented: Binding(get: { !regular && showPalette }, set: { showPalette = $0 })) {
            NavigationStack { PaletteView(model: model) { showPalette = false }.navigationTitle("Devices").navigationBarTitleDisplayMode(.inline) }
                .presentationDetents([.medium, .large])
        }
        .sheet(isPresented: Binding(get: { !regular && showCounts }, set: { showCounts = $0 })) {
            CountsPanel(model: model) { showCounts = false }.presentationDetents([.medium, .large])
        }
        .sheet(item: $model.pending) { p in PendingInputSheet(model: model, pending: p) }
        .sheet(isPresented: $scaleInput) { if let s = model.activeSheet { ScaleSheet(model: model, sheet: s) } }
        .sheet(isPresented: $showScan) { if let s = model.activeSheet { ScanSheet(model: model, sheet: s) } }
        .onAppear { if !regular { showPalette = false } }
    }

    private var hint: String? {
        switch model.tool {
        case .select: return nil
        case .place(let id): return "Tap to place \(app.type(id)?.name ?? "device")\(model.room.isEmpty ? "" : " · \(model.room)")"
        case .closet(let k): return "Tap to place the \(Catalog.closetInfo(k).name.lowercased())"
        case .led: return "Tap along the LED run, then Finish"
        case .wire: return "Tap a device, the path, then a closet"
        case .stair: return "Tap the bottom and top of the stair"
        case .calibrate: return "Tap both ends of a known dimension"
        case .measure:
            if model.draft.count == 4, let s = model.activeSheet, let ft = Geometry.polylineFt(model.draft, sheet: s) {
                return "\(Geometry.formatFeetInches(ft)) (\(ft.clean) ft) · tap to measure again"
            }
            return model.activeSheet?.pxPerFt == nil ? "Set the scale first to measure" : "Tap two points to measure"
        }
    }

    private var drawingBar: some View {
        HStack(spacing: 8) {
            Button { if model.draft.count >= 2 { model.draft.removeLast(2) } } label: { Label("Point", systemImage: "arrow.uturn.backward") }
                .disabled(model.draft.isEmpty)
            if case .led = model.tool { Button("Finish") { model.finishDraft() }.buttonStyle(.borderedProminent).disabled(model.draft.count < 4) }
            if model.tool == .wire { Button("Finish") { model.finishDraft() }.buttonStyle(.borderedProminent).disabled(model.draft.count < 4) }
            Button(role: .cancel) { if model.draft.isEmpty { model.use(.select) } else { model.draft = [] } } label: { Label("Cancel", systemImage: "xmark") }
        }
        .buttonStyle(.bordered)
        .controlSize(.small)
        .padding(6)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 14))
    }

    private var floorSwitcher: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 4) {
                ForEach(model.sheets) { s in
                    Button { model.setActiveSheet(s.id) } label: {
                        Text(s.name).font(.subheadline.weight(.semibold)).padding(.horizontal, 14).padding(.vertical, 8)
                            .foregroundStyle(s.id == model.activeSheet?.id ? .white : .primary)
                            .background(s.id == model.activeSheet?.id ? Color.ink : .clear, in: RoundedRectangle(cornerRadius: 10))
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(4)
        }
        .fixedSize(horizontal: true, vertical: false)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 14))
        .shadow(color: .black.opacity(0.12), radius: 8, y: 2)
    }

    @ToolbarContentBuilder
    private var toolbar: some ToolbarContent {
        ToolbarItemGroup(placement: .topBarLeading) {
            Button { showPalette.toggle() } label: { Label("Devices", systemImage: regular ? "sidebar.left" : "plus.circle.fill") }
        }
        ToolbarItemGroup(placement: .topBarTrailing) {
            Button { model.undo() } label: { Label("Undo", systemImage: "arrow.uturn.backward") }.disabled(!model.canUndo)
            Button { model.redo() } label: { Label("Redo", systemImage: "arrow.uturn.forward") }.disabled(!model.canRedo)
            Menu {
                Button { scaleInput = true } label: { Label(model.activeSheet?.pxPerFt == nil ? "Set scale…" : "Change scale…", systemImage: "ruler") }
                Button { model.use(.calibrate) } label: { Label("Draw a scale line", systemImage: "line.diagonal") }
                Button { model.use(.measure) } label: { Label("Measure distance", systemImage: "ruler.fill") }
                Divider()
                Button { model.autoHomeRuns(sheetOnly: true) } label: { Label("Draw home runs (this floor)", systemImage: "cable.connector") }
                Button { model.showLabels.toggle() } label: { Label(model.showLabels ? "Hide labels" : "Show labels", systemImage: "tag") }
                Button { model.fitRequest += 1 } label: { Label("Fit sheet", systemImage: "arrow.up.left.and.arrow.down.right") }
                Divider()
                Menu {
                    ForEach(Layer.allCases) { l in
                        Toggle(Catalog.layerNames[l] ?? l.rawValue, isOn: Binding(get: { !model.hiddenLayers.contains(l) }, set: { on in
                            if on { model.hiddenLayers.remove(l) } else { model.hiddenLayers.insert(l) }
                        }))
                    }
                    Button("Show all") { model.hiddenLayers = [] }
                } label: { Label("Layers", systemImage: "square.3.layers.3d") }
            } label: { Label("Tools", systemImage: "ellipsis.circle") }
            Button { showCounts.toggle(); model.selection = nil } label: { Label("Counts", systemImage: "list.number") }
            Button { showScan = true } label: { Label("AI scan", systemImage: "sparkles") }
        }
    }
}

private struct HintCapsule: View {
    let text: String
    var body: some View {
        HStack(spacing: 8) {
            Circle().fill(.orange).frame(width: 6, height: 6)
            Text(text).font(.subheadline).lineLimit(1)
        }
        .foregroundStyle(.white)
        .padding(.horizontal, 14).padding(.vertical, 8)
        .background(Color.ink.opacity(0.88), in: Capsule())
        .padding(.horizontal)
    }
}

/// Per-floor counts with a device finder (tap a label to jump to it).
struct CountsPanel: View {
    @Environment(AppModel.self) private var app
    let model: EditorModel
    let onClose: () -> Void
    @State private var find = ""

    var body: some View {
        let sheet = model.activeSheet
        let floor = model.takeoff.floors.first { $0.sheetId == sheet?.id }?.bucket ?? TakeoffBucket()
        NavigationStack {
            List {
                Section {
                    TextField("Find device (label or room)", text: $find)
                    if !find.isEmpty {
                        ForEach(model.bundle.liveMarkers.filter { $0.label.localizedCaseInsensitiveContains(find) || $0.room.localizedCaseInsensitiveContains(find) }.prefix(40)) { m in
                            Button { model.focusOn(.marker(m.id)) } label: {
                                HStack {
                                    DeviceSymbol(type: app.type(m.deviceTypeId), size: 22)
                                    Text(m.label).bold()
                                    Text(m.room).foregroundStyle(.secondary)
                                    Spacer()
                                    Text(model.sheets.first { $0.id == m.sheetId }?.name ?? "").font(.caption).foregroundStyle(.secondary)
                                }
                            }
                        }
                    }
                }
                Section {
                    HStack {
                        StatTile(label: "Devices", value: "\(floor.counts.values.reduce(0, +))")
                        StatTile(label: "LED", value: "\(floor.ledTotalFt.clean) LF", sub: "\(floor.ledZones) zones")
                    }
                    .listRowInsets(EdgeInsets()).listRowBackground(Color.clear)
                }
                Section(sheet?.name ?? "") {
                    ForEach(app.liveCatalog.filter { (floor.counts[$0.id] ?? 0) > 0 }) { t in
                        DisclosureGroup {
                            let ms = model.bundle.liveMarkers.filter { $0.sheetId == sheet?.id && $0.deviceTypeId == t.id }.sorted { $0.label < $1.label }
                            ForEach(ms) { m in
                                Button { model.focusOn(.marker(m.id)) } label: { Text(m.label + (m.tentative ? " ?" : "") + (m.room.isEmpty ? "" : " · \(m.room)")) }
                            }
                        } label: {
                            HStack {
                                DeviceSymbol(type: t, size: 22)
                                Text(t.name)
                                Spacer()
                                if let tn = floor.tentative[t.id], tn > 0 { Chip(text: "\(tn)?", tint: .orange) }
                                Text("\(floor.counts[t.id] ?? 0)").bold().monospacedDigit()
                            }
                        }
                    }
                    ForEach(floor.wireFt.sorted(by: { $0.key < $1.key }), id: \.key) { w, ft in
                        LabeledContent("\(w) cable", value: "\(ft.clean) ft")
                    }
                    if floor.unmeasuredRuns > 0 { Text("\(floor.unmeasuredRuns) run(s) have no length yet — set the scale or type LF.").font(.caption).foregroundStyle(.orange) }
                }
            }
            .navigationTitle("Floor count")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button { onClose() } label: { Image(systemName: "xmark") } } }
        }
    }
}

struct StatTile: View {
    let label: String
    let value: String
    var sub: String? = nil
    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label).font(.caption).foregroundStyle(.secondary)
            Text(value).font(.title3.bold()).monospacedDigit()
            if let sub { Text(sub).font(.caption2).foregroundStyle(.secondary) }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 12))
    }
}
