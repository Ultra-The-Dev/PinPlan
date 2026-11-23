import SwiftUI
import PhotosUI
import PinPlanCore

/// Edit the selected device, run or closet.
struct InspectorView: View {
    @Environment(AppModel.self) private var app
    let model: EditorModel
    let selection: Selection

    var body: some View {
        SentenceForm {
            switch selection {
            case .marker(let id): if let m = model.bundle.liveMarkers.first(where: { $0.id == id }) { MarkerForm(model: model, marker: m) }
            case .run(let id): if let r = model.bundle.liveRuns.first(where: { $0.id == id }) { RunForm(model: model, run: r) }
            case .closet(let id): if let c = model.bundle.liveClosets.first(where: { $0.id == id }) { ClosetForm(model: model, closet: c) }
            }
        }
    }
}

/// The device card's Count: turn any pin into a count pin ("×12") or change the number; 1 is a normal pin.
private struct MarkerCountSection: View {
    let quantity: Int
    let onChange: (Int) -> Void
    @State private var value: Int = 1

    var body: some View {
        Section {
            CountStepperField(value: $value, live: false)
                .accessibilityIdentifier("marker-count")
        } header: {
            Text("Count").textCase(nil)
        } footer: {
            if quantity > 1 {
                Text("This pin counts as \(quantity) in the takeoff, estimate and exports.")
            } else {
                Text("Several of these here? Set how many: one pin counts as all of them.")
            }
        }
        .onAppear { value = quantity }
        .onChange(of: quantity) { _, q in if q != value { value = q } }
        .onChange(of: value) { _, v in if v != quantity { onChange(v) } }
    }
}

private struct MarkerForm: View {
    @Environment(AppModel.self) private var app
    let model: EditorModel
    let marker: Marker
    @State private var photo: PhotosPickerItem?

    private func update(_ change: @escaping (inout Marker) -> Void) {
        model.edit { $0.updateMarker(marker.id, pricing: model.pricing, change) }
    }

    var body: some View {
        let type = app.type(marker.deviceTypeId)
        Section {
            HStack(spacing: 12) {
                DeviceSymbol(type: type, size: 40, tentative: marker.tentative)
                VStack(alignment: .leading) {
                    Text(marker.pinLabel).font(.headline)
                    Text([type?.name, marker.room.isEmpty ? nil : marker.room].compactMap { $0 }.joined(separator: " · ")).font(.caption).foregroundStyle(.secondary)
                }
            }
            // "N photos" / "N tasks": one tap to the Photos or Tasks section (only when the device has any).
            if model.bundle.livePhotos.contains(where: { $0.markerId == marker.id }) || model.bundle.liveTasks.contains(where: { $0.markerId == marker.id }) {
                HStack(spacing: 8) { DeviceLinkChips(model: model, markerId: marker.id) }
            }
            // Label above, so long device names get the full row width (the iPad side panel is narrow).
            VStack(alignment: .leading, spacing: 2) {
                Text("Device").font(.caption).foregroundStyle(.secondary)
                Picker("Device", selection: Binding(get: { marker.deviceTypeId }, set: { v in update { $0.deviceTypeId = v } })) {
                    ForEach(app.liveCatalog.filter { $0.kind == .device }) { Text($0.name).tag($0.id) }
                }
                .labelsHidden()
            }
            MarkerProductPicker(model: model, marker: marker)
            Toggle(isOn: Binding(get: { marker.tentative }, set: { v in update { $0.tentative = v } })) {
                VStack(alignment: .leading) { Text("Optional (?)"); Text("Listed separately; an add-on on the quote").font(.caption).foregroundStyle(.secondary) }
            }
            .tint(.orange)
        }
        MarkerCountSection(quantity: marker.quantity) { n in update { $0.count = Marker.normalizeCount(n) } }
        Section {
            LabeledContent("Label") { CommitField(title: String(localized: "Label"), value: marker.label) { v in update { $0.label = v } }.multilineTextAlignment(.trailing) }
            LabeledContent("Room") { CommitField(title: String(localized: "Room"), value: marker.room, prompt: String(localized: "e.g. Kitchen")) { v in update { $0.room = v } }.multilineTextAlignment(.trailing) }
            Picker("Mount", selection: Binding(get: { marker.mount }, set: { v in update { $0.mount = v } })) {
                ForEach(Mount.allCases, id: \.self) { Text(tr($0.rawValue.capitalized, context: "Catalog")).tag($0) }
            }
        }
        Section {
            ForEach(Cables.counts(marker.cables)) { c in
                Stepper(value: Binding(get: { c.count }, set: { n in update { $0.setCables(Cables.setting(c.type, count: n, in: $0.cables)) } }), in: 0...12) {
                    HStack(spacing: 8) {
                        Circle().fill(wireColor(c.type)).frame(width: 10, height: 10)
                        Text(c.type)
                        Spacer()
                        Text("× \(c.count)").monospacedDigit().foregroundStyle(.secondary)
                    }
                }
            }
            Menu {
                ForEach(Trades.wireTypes(for: app.trades).filter { !marker.cables.contains($0) }, id: \.self) { w in
                    Button(w) { update { $0.setCables($0.cables + [w]) } }
                }
            } label: { Label("Add cable", systemImage: "plus") }
        } header: { Text("Cables").textCase(nil) } footer: {
            Text(marker.cables.isEmpty ? "No cable to this device" : "\(Cables.summary(marker.cables)) share one home run; each is counted on the takeoff")
        }
        Section(sentence: String(localized: "Home run")) {
            VStack(alignment: .leading, spacing: 2) {
                Text("Closet").font(.caption).foregroundStyle(.secondary)
                Picker("Closet", selection: Binding(get: { marker.closetId ?? "" }, set: { v in update { $0.closetId = v.isEmpty ? nil : v } })) {
                    Text("None").tag("")
                    ForEach(model.bundle.liveClosets) { c in Text("\(c.name) (\(model.sheets.first { $0.id == c.sheetId }?.name ?? ""))").tag(c.id) }
                }
                .labelsHidden()
            }
            if marker.closetId != nil {
                let run = model.bundle.liveRuns.first { $0.kind == .wire && $0.markerId == marker.id }
                LabeledContent("Cable", value: run.flatMap(Geometry.runLengthFt).map { "\($0.clean) ft" } ?? String(localized: "not drawn"))
                Button(run == nil ? "Draw home run" : "Redraw home run") {
                    let cat = app.catalog
                    model.edit { $0.autoHomeRuns(catalog: cat, pricing: model.pricing, markerId: marker.id) }
                }
            }
        }
        Section(sentence: String(localized: "Notes")) {
            CommitField(title: String(localized: "Notes"), value: marker.notes, prompt: String(localized: "Notes for the crew")) { v in update { $0.notes = v } }
        }
        Section(sentence: String(localized: "Photo")) {
            if let id = marker.photoId, let img = app.store.image(id) {
                Image(uiImage: img).resizable().scaledToFit().frame(maxHeight: 180).clipShape(RoundedRectangle(cornerRadius: 10))
            }
            PhotosPicker(selection: $photo, matching: .images) { Label(marker.photoId == nil ? "Add photo" : "Replace photo", systemImage: "camera") }
        }
        .onChange(of: photo) { _, item in
            guard let item else { return }
            Task {
                if let data = try? await item.loadTransferable(type: Data.self), let img = UIImage(data: data) {
                    let small = PlanImporter.normalized(img)
                    if let id = app.store.saveImage(small, quality: 0.8) { update { $0.photoId = id } }
                }
                photo = nil
            }
        }
        MarkerJobPhotos(model: model, marker: marker)
        SelectMoreSection(model: model, marker: marker)
        Section {
            Button {
                let m = marker
                var newId = ""
                if let t = app.type(m.deviceTypeId) {
                    let added = model.edit { b in
                        newId = b.addMarker(type: t, sheetId: m.sheetId, x: m.x + 0.015, y: m.y + 0.015, room: m.room, tentative: m.tentative).id
                        b.updateMarker(newId, pricing: model.pricing) { $0.mount = m.mount; $0.wireType = m.wireType; $0.wires = m.wires; $0.closetId = m.closetId }
                    }
                    // Refused on a read-only job: keep the original selected.
                    if added { model.selection = .marker(newId) }
                }
            } label: { Label("Duplicate", systemImage: "plus.square.on.square") }
            Button(role: .destructive) { model.deleteSelection() } label: { Label("Delete device", systemImage: "trash") }
        }
    }
}

private struct RunForm: View {
    @Environment(AppModel.self) private var app
    let model: EditorModel
    let run: Run

    private func update(_ change: @escaping (inout Run) -> Void) { model.edit { $0.updateRun(run.id, change) } }

    /// The company's wire types, plus the run's own if it's from another trade.
    private var runWireChoices: [String] {
        var list = Trades.wireTypes(for: app.trades)
        let w = run.wireType ?? "Cat6"
        if !list.contains(w) { list.append(w) }
        return list
    }

    var body: some View {
        let len = Geometry.runLengthFt(run)
        Section {
            LabeledContent(run.kind == .wire ? "Wire run" : run.kind == .stair ? "Stair LED" : "LED run", value: len.map { "\($0.clean) \(run.kind == .wire ? "ft" : "LF")" } ?? String(localized: "no length"))
            if run.kind != .wire {
                Picker("LED type", selection: Binding(get: { run.deviceTypeId ?? "" }, set: { v in update { $0.deviceTypeId = v } })) {
                    ForEach(app.liveCatalog.filter { $0.kind == .led }) { Text($0.name).tag($0.id) }
                }
                LabeledContent("Zone #") { CommitField(title: String(localized: "Zone"), value: run.zone ?? "", keyboard: .numberPad) { v in update { $0.zone = v } }.multilineTextAlignment(.trailing) }
                LabeledContent("Switch") { CommitField(title: String(localized: "Switch"), value: run.switchLabel ?? "", prompt: "S21") { v in update { $0.switchLabel = v } }.multilineTextAlignment(.trailing) }
            }
            if run.kind == .stair {
                LabeledContent("Steps") { CommitField(title: String(localized: "Steps"), value: run.steps.map(String.init) ?? "", keyboard: .numberPad) { v in update { $0.steps = Int(v) } }.multilineTextAlignment(.trailing) }
                LabeledContent("LF per step") { CommitField(title: String(localized: "LF per step"), value: run.lfPerStep.map { $0.clean } ?? "", keyboard: .decimalPad) { v in update { $0.lfPerStep = Geometry.parseFeet(v) } }.multilineTextAlignment(.trailing) }
            } else {
                LabeledContent(run.kind == .wire ? "Length override (ft)" : "Typed LF") {
                    CommitField(title: String(localized: "Length"), value: run.typedFt.map { $0.clean } ?? "", prompt: run.measuredFt.map { "measured \($0.clean)" } ?? String(localized: "type LF"), keyboard: .decimalPad) { v in
                        update { $0.typedFt = v.isEmpty ? nil : Geometry.parseFeet(v) }
                    }.multilineTextAlignment(.trailing)
                }
                if let m = run.measuredFt { Text(run.typedFt != nil ? (run.kind == .wire ? "Estimated \(m.clean) ft — typed value wins" : "Measured \(m.clean) ft — typed value wins") : (run.kind == .wire ? "Estimated \(m.clean) ft" : "Measured \(m.clean) ft")).font(.caption).foregroundStyle(.secondary) }
            }
            if run.kind == .wire && run.cables.count > 1 {
                LabeledContent("Cables", value: Cables.summary(run.cables))
            } else if run.kind == .wire {
                Picker("Wire", selection: Binding(get: { run.wireType ?? "Cat6" }, set: { v in update { $0.wireType = v } })) {
                    ForEach(runWireChoices, id: \.self) { Text($0).tag($0) }
                }
            }
            Toggle("Optional (?)", isOn: Binding(get: { run.tentative == true }, set: { v in update { $0.tentative = v } })).tint(.orange)
        } footer: { Text("Drag the white handles on the plan to reshape the run.") }
        Section {
            Button(role: .destructive) { model.deleteSelection() } label: { Label("Delete run", systemImage: "trash") }
        }
    }
}

private struct ClosetForm: View {
    @Environment(AppModel.self) private var app
    let model: EditorModel
    let closet: Closet

    /// The company's closet kinds, plus this closet's own kind if it's from another trade.
    private var kindChoices: [Catalog.ClosetInfo] {
        var list = Trades.closetKinds(for: app.trades)
        if !list.contains(where: { $0.id == closet.kind }) { list.append(Catalog.closetInfo(closet.kind)) }
        return list
    }

    var body: some View {
        Section {
            LabeledContent("Name") {
                CommitField(title: String(localized: "Name"), value: closet.name) { v in model.edit { $0.updateCloset(closet.id, pricing: model.pricing) { $0.name = v } } }.multilineTextAlignment(.trailing)
            }
            Picker("Kind", selection: Binding(get: { closet.kind }, set: { v in model.edit { $0.updateCloset(closet.id, pricing: model.pricing) { $0.kind = v } } })) {
                ForEach(kindChoices, id: \.id) { Text($0.name).tag($0.id) }
            }
            LabeledContent("Devices home-run here", value: "\(model.bundle.liveMarkers.filter { $0.closetId == closet.id }.quantitySum)")
        }
        Section {
            Button(role: .destructive) { model.deleteSelection() } label: { Label("Delete closet", systemImage: "trash") }
        }
    }
}

/// Site photos linked to this device (from the Photos tab or taken here), CompanyCam-style.
private struct MarkerJobPhotos: View {
    let model: EditorModel
    let marker: Marker
    @State private var viewer: PhotoViewerItem?
    var body: some View {
        let photos = model.bundle.livePhotos.filter { $0.markerId == marker.id }
        Section {
            if !photos.isEmpty {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 6) {
                        ForEach(photos) { p in
                            Button { viewer = PhotoViewerItem(ids: photos.map(\.id), start: p.id) } label: { PhotoThumb(photo: p, size: 64) }.buttonStyle(.plain)
                        }
                    }
                }
            }
            PhotoAddMenu(model: model, extra: { p in
                p.markerId = marker.id
                p.sheetId = marker.sheetId
                if !marker.room.isEmpty { p.room = marker.room }
            }) { Label("Add site photo", systemImage: "camera") }
        } header: { Text("Site photos (\(photos.count))").textCase(nil) }
        .fullScreenCover(item: $viewer) { v in PhotoViewer(model: model, ids: v.ids, current: v.start) }
    }
}
