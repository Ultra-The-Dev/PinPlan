import SwiftUI
import PinPlanCore

/// Fill one form: Yes / No / N.A. switches, number pads, table rows, photos, signatures (also for someone else).
/// Submit checks it and jumps to the first problem; a submitted form is locked and only the office can reopen it.
struct FormFillView: View {
    @Environment(AppModel.self) private var app
    let model: EditorModel
    let id: String
    @State private var showErrors = false
    @State private var signing: FormField?
    @State private var share: SharedFile?
    @State private var busy: String?
    @State private var confirmSubmit = false
    @State private var reopening = false
    @State private var reason = ""
    @State private var viewer: PhotoViewerItem?
    @State private var confirmDelete = false
    @Environment(\.dismiss) private var dismiss

    private var role: TeamRole? { app.cloud.role }

    var body: some View {
        if let form = model.bundle.liveForms.first(where: { $0.id == id }) {
            ScrollViewReader { proxy in
                List {
                    FormHeader(form: form)
                    ForEach(form.template.fields) { f in
                        FormFieldSection(model: model, form: form, field: f, editable: Forms.canEdit(role, form),
                                         issues: showErrors ? Forms.validate(form).filter { $0.fieldId == f.id } : [],
                                         onChange: { v in setValue(f.id, v) },
                                         onSign: { signing = f },
                                         onClearSignature: { change { $0.signatures = ($0.signatures ?? []).filter { $0.fieldId != f.id } } },
                                         onPhotos: { added in addPhotos(f.id, added) },
                                         onOpenPhoto: { ids, start in viewer = PhotoViewerItem(ids: ids, start: start) })
                            .id(f.id)
                    }
                    let notes = Forms.history(form)
                    if !notes.isEmpty {
                        Section("History") {
                            ForEach(Array(notes.enumerated()), id: \.offset) { _, h in
                                Text("\(FormDates.full(h.at)) — \(h.text)\(h.by.map { " (\($0))" } ?? "")").font(.caption).foregroundStyle(.secondary)
                            }
                        }
                    }
                }
                .safeAreaInset(edge: .bottom) {
                    if Forms.canEdit(role, form) {
                        submitBar(form) {
                            showErrors = true
                            if let first = Forms.validate(form).first {
                                withAnimation { proxy.scrollTo(first.fieldId, anchor: .center) }
                            } else {
                                confirmSubmit = true
                            }
                        }
                    }
                }
            }
            .navigationTitle(form.name)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { toolbar(form) }
            .sheet(item: $signing) { f in
                FormSignatureSheet(title: f.label, me: FieldAuthor.name(app)) { image, name, role in
                    sign(f, image: image, name: name, role: role)
                    signing = nil
                }
            }
            .fullScreenCover(item: $viewer) { v in PhotoViewer(model: model, ids: v.ids, current: v.start) }
            .confirmationDialog("Submit this form?", isPresented: $confirmSubmit, titleVisibility: .visible) {
                Button("Submit and lock") { change { $0 = Forms.submit($0, by: FieldAuthor.name(app)) }; showErrors = false }
            } message: { Text("It will be locked. The office can reopen it if something needs changing.") }
            .alert("Reopen this form?", isPresented: $reopening) {
                TextField("Reason (optional)", text: $reason)
                Button("Reopen") { change { $0 = Forms.reopen($0, by: FieldAuthor.name(app), reason: reason) }; reason = "" }
                Button("Cancel", role: .cancel) {}
            }
            .confirmationDialog("Delete “\(form.name)”?", isPresented: $confirmDelete, titleVisibility: .visible) {
                Button("Delete", role: .destructive) { model.removeRows([form.id], in: \.forms); dismiss() }
            }
            .shareSheet($share)
        } else {
            ContentUnavailableView("Form not found", systemImage: "doc.questionmark")
        }
    }

    @ToolbarContentBuilder
    private func toolbar(_ form: JobForm) -> some ToolbarContent {
        ToolbarItem(placement: .topBarTrailing) {
            Menu {
                Button { Task { await pdf(form) } } label: { Label(busy ?? "Share PDF", systemImage: "doc.richtext") }
                    .disabled(busy != nil)
                let failed = Forms.failedItems(form)
                if !failed.isEmpty {
                    Button { makePunch(form) } label: { Label("Make punch items (\(failed.count))", systemImage: "list.bullet.clipboard") }
                }
                if Forms.canReopen(role, form) {
                    Button { reopening = true } label: { Label("Reopen", systemImage: "lock.open") }
                }
                if Forms.canDelete(role, form) {
                    Button(role: .destructive) { confirmDelete = true } label: { Label("Delete", systemImage: "trash") }
                }
            } label: { Label("More", systemImage: "ellipsis.circle") }
        }
    }

    private func submitBar(_ form: JobForm, submit: @escaping () -> Void) -> some View {
        let p = Forms.progress(form)
        let count = Forms.validate(form).count
        return HStack {
            Text(count == 0 ? "Ready to submit" : "\(p.requiredDone) of \(p.required) required done")
                .font(.subheadline).foregroundStyle(.secondary)
            Spacer()
            Button(action: submit) { Label("Submit", systemImage: "paperplane.fill").frame(minHeight: 32) }
                .buttonStyle(.borderedProminent)
                .controlSize(.large)
        }
        .padding(.horizontal)
        .padding(.vertical, 10)
        .background(.bar)
    }

    // MARK: changes

    private func change(_ f: (inout JobForm) -> Void) {
        guard var x = model.bundle.forms.first(where: { $0.id == id }) else { return }
        f(&x)
        model.saveRow(x, in: \.forms)
    }

    private func setValue(_ fieldId: String, _ v: JSONValue?) {
        change { form in
            guard Forms.canEdit(role, form) else { return }
            if let v { form.values[fieldId] = v } else { form.values.removeValue(forKey: fieldId) }
        }
    }

    private func addPhotos(_ fieldId: String, _ photos: [Photo]) {
        let ids = photos.map(\.id)
        change { form in
            let have = form.values[fieldId]?.strings ?? []
            form.values[fieldId] = .array((have + ids).map { JSONValue.string($0) })
            var all = form.photoIds ?? []
            for i in ids where !all.contains(i) { all.append(i) }
            form.photoIds = all
        }
    }

    private func sign(_ f: FormField, image: UIImage, name: String, role: String) {
        // A JPEG on white, like the other job images (the web app reads either).
        let r = UIGraphicsImageRenderer(size: image.size)
        let flat = r.image { ctx in
            UIColor.white.setFill()
            ctx.fill(CGRect(origin: .zero, size: image.size))
            image.draw(at: .zero)
        }
        guard let data = flat.jpegData(compressionQuality: 0.9), let imageId = app.store.saveImageData(data, image: flat) else { return }
        let sig = FormSignature(fieldId: f.id, name: name, role: role.isEmpty ? nil : role, imageId: imageId, signedBy: FieldAuthor.name(app))
        change { form in
            var list = (form.signatures ?? []).filter { $0.fieldId != f.id }
            list.append(sig)
            form.signatures = list
        }
    }

    private func makePunch(_ form: JobForm) {
        let r = Forms.punchItems(from: form, checklists: model.bundle.checklists)
        guard !r.added.isEmpty else { model.say("Those items are already on the punch list"); return }
        model.saveRow(r.checklist, in: \.checklists)
        model.say("\(r.added.count) punch item\(r.added.count == 1 ? "" : "s") added")
    }

    private func pdf(_ form: JobForm) async {
        defer { busy = nil }
        var photos: [String: [FormPDFBuilder.PhotoItem]] = [:]
        for f in form.template.fields where f.kind == .photo {
            var items: [FormPDFBuilder.PhotoItem] = []
            for pid in form.values[f.id]?.strings ?? [] {
                busy = "Preparing photos…"
                guard let p = model.photo(pid), let img = app.store.image(p.imageId) else {
                    items.append(FormPDFBuilder.PhotoItem(image: nil, caption: nil))
                    continue
                }
                let shapes = p.annotations
                let out = await Task.detached(priority: .userInitiated) { PhotoMarkup.render(img, shapes: shapes, maxSide: 1400) }.value
                items.append(FormPDFBuilder.PhotoItem(image: out, caption: p.caption))
            }
            photos[f.id] = items
        }
        var sigs: [String: UIImage] = [:]
        for s in form.signatures ?? [] { if let img = app.store.image(s.imageId) { sigs[s.imageId] = img } }
        busy = "Building the PDF…"
        let logo = await PhotoReportBuilder.logo(app.brandedSettings)
        let place: String? = form.sheetId.flatMap { sid in model.bundle.liveSheets.first { $0.id == sid }?.name }
        let data = FormPDFBuilder.pdf(form: form, project: model.bundle.project, business: app.business, logo: logo, photos: photos, signatures: sigs, place: place)
        let job = model.bundle.project.address.isEmpty ? model.bundle.project.clientName : model.bundle.project.address
        let day = String((form.submittedAt ?? form.updatedAt).prefix(10))
        share = SharedFile(url: PDFExporter.write(data, name: "\(slug(job.isEmpty ? "job" : job))-\(slug(form.name))-\(day).pdf"))
    }
}

private struct FormHeader: View {
    let form: JobForm
    var body: some View {
        let p = Forms.progress(form)
        Section {
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    Text("\(form.template.name) · v\(form.template.version)").font(.caption).foregroundStyle(.secondary)
                    Spacer()
                    if form.isSubmitted {
                        Label("Submitted", systemImage: "lock.fill").font(.caption.weight(.semibold)).foregroundStyle(.green)
                    } else {
                        Text("Draft").font(.caption.weight(.semibold)).foregroundStyle(.orange)
                    }
                }
                ProgressView(value: Double(p.answered), total: Double(max(1, p.total))) {
                    Text("\(p.answered) of \(p.total) answered · \(p.requiredDone)/\(p.required) required").font(.caption)
                }
                .tint(p.requiredDone == p.required ? Color.green : Color.accentColor)
                if form.isSubmitted {
                    let who: String = form.submittedBy.map { " by \($0)" } ?? ""
                    let when: String = form.submittedAt.map { " · \(FormDates.full($0))" } ?? ""
                    Text("Submitted\(who)\(when). Locked — no more changes.").font(.subheadline).foregroundStyle(.green)
                }
            }
            .padding(.vertical, 4)
        }
    }
}
