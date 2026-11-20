import SwiftUI
import PinPlanCore

/// Field → Forms: the job's inspections, test records, T&M tags, safety forms and sign-offs (same as the web app).
struct FormsListView: View {
    @Environment(AppModel.self) private var app
    let model: EditorModel
    @State private var picking = false
    @State private var status = "all"
    @State private var open: String?

    var body: some View {
        let all = model.bundle.liveForms
        let shown = all.filter { status == "all" || $0.status == status }
        List {
            if all.isEmpty {
                ContentUnavailableView("No forms yet", systemImage: "list.clipboard",
                                       description: Text("Inspections, test records and signed T&M tags — filled on site, signed on the spot and shared as a PDF."))
                    .listRowBackground(Color.clear)
            } else {
                Picker("Status", selection: $status) {
                    Text("All").tag("all")
                    Text("Drafts").tag("draft")
                    Text("Submitted").tag("submitted")
                }
                .pickerStyle(.segmented)
                .listRowBackground(Color.clear)
            }
            ForEach(shown) { f in
                Button { open = f.id } label: { FormRow(form: f) }
                    .buttonStyle(.plain)
            }
        }
        .navigationDestination(item: $open) { id in FormFillView(model: model, id: id) }
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button { picking = true } label: { Label("New form", systemImage: "plus") }
            }
        }
        .sheet(isPresented: $picking) {
            FormTemplatePicker(templates: Forms.allTemplates(custom: app.formTemplates), trades: app.trades.map(\.rawValue)) { t in
                picking = false
                let f = Forms.newForm(t, projectId: model.bundle.project.id, by: FieldAuthor.name(app), today: FieldDocs.localDay(isoNow()))
                model.saveRow(f, in: \.forms)
                open = f.id
            }
        }
    }
}

private struct FormRow: View {
    let form: JobForm
    var body: some View {
        let p = Forms.progress(form)
        HStack(spacing: 12) {
            Image(systemName: FormIcons.symbol(form.template.category))
                .font(.title3)
                .foregroundStyle(form.isSubmitted ? Color.green : Color.orange)
                .frame(width: 36)
            VStack(alignment: .leading, spacing: 4) {
                Text(form.name).font(.headline)
                Text(subtitle).font(.caption).foregroundStyle(.secondary)
                if !form.isSubmitted {
                    ProgressView(value: Double(p.answered), total: Double(max(1, p.total)))
                }
            }
            Spacer()
            if form.isSubmitted {
                Label("Submitted", systemImage: "lock.fill").font(.caption).foregroundStyle(.green)
            } else {
                Text("Draft").font(.caption.weight(.semibold)).foregroundStyle(.orange)
            }
        }
        .padding(.vertical, 4)
        .contentShape(Rectangle())
    }
    private var subtitle: String {
        if form.isSubmitted, let at = form.submittedAt {
            return form.submittedBy.map { String(localized: "Submitted \(FormDates.short(at)) by \($0)") } ?? String(localized: "Submitted \(FormDates.short(at))")
        }
        return String(localized: "Updated \(FormDates.short(form.updatedAt))")
    }
}

enum FormIcons {
    static func symbol(_ category: String) -> String {
        switch category {
        case "inspection": return "checklist"
        case "test": return "gauge.with.dots.needle.33percent"
        case "tm": return "clock.badge.checkmark"
        case "safety": return "exclamationmark.shield"
        default: return "signature"
        }
    }
}

enum FormDates {
    static func date(_ iso: String) -> Date? { FieldDocs.date(iso) }
    static func short(_ iso: String) -> String { date(iso)?.formatted(date: .abbreviated, time: .omitted) ?? String(iso.prefix(10)) }
    static func full(_ iso: String) -> String { date(iso)?.formatted(date: .abbreviated, time: .shortened) ?? iso }
}

/// Pick a template: the company's own and the ones for its trades first, then the rest. Searchable.
struct FormTemplatePicker: View {
    @Environment(\.dismiss) private var dismiss
    let templates: [FormTemplate]
    let trades: [String]
    let onPick: (FormTemplate) -> Void
    @State private var search = ""

    var body: some View {
        let q = search.trimmingCharacters(in: .whitespaces).lowercased()
        let matching = templates.filter { t in
            q.isEmpty || "\(t.name) \(Forms.categoryName(t.category)) \(t.fields.map(\.label).joined(separator: " "))".lowercased().contains(q)
        }
        let groups = Forms.templatesForTrades(matching, trades: trades)
        NavigationStack {
            List {
                if !groups.suggested.isEmpty {
                    Section(q.isEmpty ? "For your work" : "Matches") { ForEach(groups.suggested) { t in row(t) } }
                }
                if !groups.others.isEmpty {
                    Section("Other trades") { ForEach(groups.others) { t in row(t) } }
                }
            }
            .searchable(text: $search, prompt: "Search forms")
            .navigationTitle("New form")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } } }
        }
    }

    private func row(_ t: FormTemplate) -> some View {
        Button { onPick(t) } label: {
            HStack(spacing: 12) {
                Image(systemName: FormIcons.symbol(t.category)).frame(width: 28).foregroundStyle(Color.accentColor)
                VStack(alignment: .leading, spacing: 2) {
                    Text(t.name).foregroundStyle(.primary)
                    Text(t.builtin == true ? "\(Forms.categoryName(t.category)) · \(t.fields.filter { $0.kind != .heading }.count) fields" : "\(Forms.categoryName(t.category)) · \(t.fields.filter { $0.kind != .heading }.count) fields · your company")
                        .font(.caption).foregroundStyle(.secondary)
                }
            }
        }
    }
}
