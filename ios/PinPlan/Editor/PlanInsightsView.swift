import SwiftUI
import PinPlanCore

/// Reads the current sheet for the installer: everything printed on it (offline), plus an AI explanation and Q&A.
struct PlanInsightsView: View {
    @Environment(AppModel.self) private var app
    @Environment(\.horizontalSizeClass) private var hSize
    let model: EditorModel
    let sheet: Sheet
    var inSheet = false
    let onClose: () -> Void

    enum Mode: String, CaseIterable { case plan = "On the plan", ai = "AI reader" }
    @State private var mode: Mode = .plan
    @State private var loading = false
    @State private var query = ""
    @State private var aiBusy = false
    @State private var aiError: String?
    @State private var question = ""

    private var details: [PlanDetail] { model.planDetails[sheet.id] ?? [] }

    var body: some View {
        PanelContainer(title: "Read \(sheet.name)", inSheet: inSheet, onClose: onClose) {
            List {
                Section {
                    Picker("Mode", selection: $mode) { ForEach(Mode.allCases, id: \.self) { Text($0.rawValue).tag($0) } }
                        .pickerStyle(.segmented)
                        .listRowBackground(Color.clear)
                        .listRowInsets(EdgeInsets())
                }
                if mode == .plan { planSections } else { aiSections }
            }
            .task(id: sheet.id) { await loadDetails() }
        }
    }

    // MARK: on the plan (offline)

    @ViewBuilder
    private var planSections: some View {
        Section {
            if loading {
                HStack { ProgressView(); Text("Reading the sheet…").foregroundStyle(.secondary) }
            } else {
                Text(sheet.sourcePdfId != nil ? "Read from the PDF's text — exact, works offline. Tap any item to find it on the plan." :
                        "Read with on-device text recognition. Tap any item to find it on the plan.")
                    .font(.caption).foregroundStyle(.secondary)
                TextField("Search the plan text", text: $query)
            }
            scaleCheck
        }
        ForEach([PlanDetailKind.room, .dimension, .callout, .note, .scale], id: \.self) { kind in
            let items = details.filter { $0.kind == kind && (query.isEmpty || $0.text.localizedCaseInsensitiveContains(query)) }
            if !items.isEmpty {
                Section("\(kind.title) (\(items.count))") {
                    ForEach(items) { d in detailRow(d) }
                }
            }
        }
        if !loading && details.isEmpty {
            Section { Text("No text found on this sheet. Try the AI reader.").foregroundStyle(.secondary) }
        }
    }

    @ViewBuilder
    private func detailRow(_ d: PlanDetail) -> some View {
        Button { go(d.x, d.y) } label: {
            HStack {
                Image(systemName: icon(d.kind)).foregroundStyle(tint(d.kind)).frame(width: 22)
                VStack(alignment: .leading, spacing: 2) {
                    Text(d.text).foregroundStyle(.primary).lineLimit(3)
                    if let ft = d.feet { Text("\(ft.clean) ft").font(.caption).foregroundStyle(.secondary) }
                }
                Spacer()
                Image(systemName: "scope").foregroundStyle(.tertiary)
            }
        }
        .swipeActions {
            if d.kind == .dimension {
                Button { model.calibrate(from: d.text); onClose() } label: { Label("Set scale", systemImage: "ruler") }.tint(.brand)
            }
        }
        .contextMenu {
            Button { go(d.x, d.y) } label: { Label("Show on plan", systemImage: "scope") }
            if d.kind == .dimension {
                Button { model.calibrate(from: d.text); onClose() } label: { Label("Set scale from this dimension", systemImage: "ruler") }
            }
            Button { UIPasteboard.general.string = d.text } label: { Label("Copy", systemImage: "doc.on.doc") }
        }
    }

    /// Compare the sheet's scale with what's printed on it.
    @ViewBuilder
    private var scaleCheck: some View {
        let printed = details.first { $0.kind == .scale }?.text
        if let printed {
            if sheet.pxPerFt != nil {
                Label("Printed scale \(printed) · sheet scale \(sheet.scaleLabel ?? "set")", systemImage: "checkmark.seal.fill").foregroundStyle(.green).font(.callout)
            } else {
                Label("Printed scale \(printed) — this sheet has no scale yet. Swipe a dimension → Set scale, or set it from the Tools menu.", systemImage: "exclamationmark.triangle.fill")
                    .foregroundStyle(.orange).font(.callout)
            }
        } else if sheet.pxPerFt == nil, details.contains(where: { $0.kind == .dimension }) {
            Label("No printed scale found. Swipe a dimension → Set scale to calibrate from it.", systemImage: "ruler").font(.callout).foregroundStyle(.secondary)
        }
    }

    // MARK: AI

    @ViewBuilder
    private var aiSections: some View {
        if APIClient(settings: app.settings) == nil {
            Section { Label("Set your PinPlan server in Settings to use the AI reader.", systemImage: "server.rack").foregroundStyle(.orange) }
        }
        if let e = model.planExplanations[sheet.id] {
            Section {
                VStack(alignment: .leading, spacing: 6) {
                    Text(e.sheetTitle.isEmpty ? sheet.name : e.sheetTitle).font(.headline)
                    Text([e.sheetType, e.scale.map { "Scale \($0)" }].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · ")).font(.caption).foregroundStyle(.secondary)
                    Text(e.summary).font(.callout).padding(.top, 4)
                }
                .padding(.vertical, 4)
            } header: { Text("Summary") }
            if !e.verify.isEmpty {
                Section("Check on site") {
                    ForEach(e.verify, id: \.self) { v in Label(v, systemImage: "checklist").font(.callout) }
                }
            }
            if !e.rooms.isEmpty {
                Section("Rooms (\(e.rooms.count))") {
                    ForEach(e.rooms, id: \.self) { r in
                        Button { go(r.x, r.y) } label: { LabeledContent(r.name, value: r.size ?? "") }.foregroundStyle(.primary)
                    }
                }
            }
            if !e.notes.isEmpty {
                Section("Notes for your trade (\(e.notes.count))") {
                    ForEach(e.notes, id: \.self) { n in
                        Button { go(n.x, n.y) } label: {
                            HStack(alignment: .top) {
                                Chip(text: n.category, tint: noteTint(n.category))
                                Text(n.text).font(.callout).foregroundStyle(.primary)
                            }
                        }
                    }
                }
            }
            if !e.dimensions.isEmpty {
                Section("Dimensions (\(e.dimensions.count))") {
                    ForEach(e.dimensions, id: \.self) { d in
                        Button { go(d.x, d.y) } label: {
                            LabeledContent(d.describes ?? d.text, value: d.describes == nil ? (d.feet.map { "\($0.clean) ft" } ?? "") : d.text)
                        }
                        .foregroundStyle(.primary)
                        .swipeActions { Button { model.calibrate(from: d.text); onClose() } label: { Label("Set scale", systemImage: "ruler") }.tint(.brand) }
                    }
                }
            }
        }
        Section {
            Button { explain() } label: {
                Label(aiBusy ? "Reading the sheet…" : (model.planExplanations[sheet.id] == nil ? "Explain this sheet" : "Read again"), systemImage: "sparkles")
            }
            .disabled(aiBusy)
            if let aiError { Text(aiError).foregroundStyle(.red).font(.callout) }
        } footer: { Text("Claude reads the sheet image and explains it for low-voltage work. Always confirm critical dimensions on the drawings.") }

        Section("Ask about this plan") {
            ForEach(model.planQA[sheet.id] ?? []) { qa in
                VStack(alignment: .leading, spacing: 6) {
                    Text(qa.question).font(.callout.weight(.semibold))
                    if let a = qa.answer {
                        Text(a.answer).font(.callout)
                        if !a.points.isEmpty {
                            ScrollView(.horizontal, showsIndicators: false) {
                                HStack {
                                    ForEach(a.points, id: \.self) { p in
                                        Button { go(p.x, p.y) } label: { Label(p.label, systemImage: "scope").font(.caption) }.buttonStyle(.bordered).controlSize(.mini)
                                    }
                                }
                            }
                        }
                    } else if let err = qa.error {
                        Text(err).font(.callout).foregroundStyle(.red)
                    } else {
                        ProgressView()
                    }
                }
                .padding(.vertical, 2)
            }
            HStack {
                TextField("e.g. How long is the kitchen LED run?", text: $question, axis: .vertical).lineLimit(1...4).onSubmit(ask)
                Button(action: ask) { Image(systemName: "arrow.up.circle.fill").font(.title2) }
                    .disabled(question.trimmingCharacters(in: .whitespaces).isEmpty)
            }
            if (model.planQA[sheet.id] ?? []).isEmpty {
                ForEach(["Where should the equipment closet home runs go?", "What LED zones are on this floor and how long are they?", "Which dimensions should I verify before pulling wire?"], id: \.self) { s in
                    Button(s) { question = s; ask() }.font(.callout)
                }
            }
        }
    }

    // MARK: actions

    private func go(_ x: Double, _ y: Double) {
        model.focusOnPoint(sheetId: sheet.id, x: x, y: y)
        if hSize == .compact { /* keep the sheet at half height so the plan stays visible */ }
    }

    private func loadDetails() async {
        guard model.planDetails[sheet.id] == nil else { return }
        loading = true
        let s = sheet, store = app.store
        let found = await Task.detached(priority: .userInitiated) { PlanReader.classify(PlanTextExtractor.items(for: s, store: store)) }.value
        model.planDetails[sheet.id] = found
        loading = false
    }

    private func explain() {
        guard let client = APIClient(settings: app.settings) else { aiError = "Set your PinPlan server in Settings."; return }
        guard let image = app.store.image(sheet.imageId) else { return }
        aiBusy = true
        aiError = nil
        let s = sheet
        Task {
            do { model.planExplanations[s.id] = try await client.explain(image: image, sheet: s) } catch { aiError = error.localizedDescription }
            aiBusy = false
        }
    }

    private func ask() {
        let q = question.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !q.isEmpty else { return }
        question = ""
        let s = sheet
        var list = model.planQA[s.id] ?? []
        let item = EditorModel.QAItem(question: q)
        list.append(item)
        model.planQA[s.id] = list
        guard let client = APIClient(settings: app.settings), let image = app.store.image(s.imageId) else {
            update(item.id, sheetId: s.id) { $0.error = "Set your PinPlan server in Settings." }
            return
        }
        Task {
            do {
                let a = try await client.ask(q, image: image, sheet: s)
                update(item.id, sheetId: s.id) { $0.answer = a }
            } catch {
                update(item.id, sheetId: s.id) { $0.error = error.localizedDescription }
            }
        }
    }

    private func update(_ id: UUID, sheetId: String, _ change: (inout EditorModel.QAItem) -> Void) {
        guard var list = model.planQA[sheetId], let i = list.firstIndex(where: { $0.id == id }) else { return }
        change(&list[i])
        model.planQA[sheetId] = list
    }

    // MARK: styling

    private func icon(_ k: PlanDetailKind) -> String {
        switch k {
        case .dimension: return "ruler"
        case .room: return "square.split.2x2"
        case .callout: return "lightbulb"
        case .note: return "text.alignleft"
        case .scale: return "scalemass"
        }
    }

    private func tint(_ k: PlanDetailKind) -> Color {
        switch k {
        case .dimension: return .blue
        case .room: return .green
        case .callout: return .orange
        case .note: return .secondary
        case .scale: return .purple
        }
    }

    private func noteTint(_ c: String) -> Color {
        switch c {
        case "lighting": return .orange
        case "security": return .red
        case "av": return .purple
        case "network", "lowVoltage": return .blue
        case "shades": return .pink
        case "electrical": return .yellow
        default: return .secondary
        }
    }
}
