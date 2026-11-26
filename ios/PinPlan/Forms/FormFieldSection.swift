import SwiftUI
import PinPlanCore

/// One field of a form as a list section: label, help, the control for its type and any problem.
struct FormFieldSection: View {
    let model: EditorModel
    let form: JobForm
    let field: FormField
    let editable: Bool
    let issues: [Forms.Issue]
    let onChange: (JSONValue?) -> Void
    let onSign: () -> Void
    let onClearSignature: () -> Void
    let onPhotos: ([Photo]) -> Void
    let onOpenPhoto: ([String], String) -> Void

    var body: some View {
        if field.kind == .heading {
            Section { EmptyView() } header: { Text(field.label).font(.headline) }
        } else {
            Section {
                control
                ForEach(Array(issues.filter { $0.row == nil }.enumerated()), id: \.offset) { _, i in
                    Label(i.message, systemImage: "exclamationmark.circle.fill").font(.footnote).foregroundStyle(.red)
                }
                if issues.contains(where: { $0.row != nil }) {
                    Label("\(issues.filter { $0.row != nil }.count) cell(s) to fix", systemImage: "exclamationmark.circle.fill").font(.footnote).foregroundStyle(.red)
                }
            } header: {
                Text(field.label + (field.isRequired ? " *" : ""))
            } footer: {
                if let h = field.help, !h.isEmpty { Text(h) }
            }
        }
    }

    private var value: JSONValue? { form.values[field.id] }

    @ViewBuilder private var control: some View {
        switch field.kind {
        case .yesno?:
            YesNoControl(value: value?.stringValue, editable: editable) { onChange($0.map { JSONValue.string($0) }) }
        case .number?:
            NumberControl(field: field, value: value, editable: editable, onChange: onChange)
        case .checkbox?:
            Toggle(isOn: Binding(get: { value?.boolValue == true }, set: { onChange(.bool($0)) })) { Text("Done") }
                .disabled(!editable)
        case .select?:
            Picker("Choose", selection: Binding(get: { value?.stringValue ?? "" }, set: { onChange($0.isEmpty ? nil : .string($0)) })) {
                Text("Choose…").tag("")
                ForEach(field.options ?? [], id: \.self) { o in Text(o).tag(o) }
            }
            .disabled(!editable)
        case .multiselect?:
            MultiSelectControl(options: field.options ?? [], picked: value?.strings ?? [], editable: editable) { onChange(.array($0.map { JSONValue.string($0) })) }
        case .date?:
            DateControl(value: value?.stringValue, editable: editable, time: false) { onChange($0.map { JSONValue.string($0) }) }
        case .time?:
            DateControl(value: value?.stringValue, editable: editable, time: true) { onChange($0.map { JSONValue.string($0) }) }
        case .longtext?:
            LongTextControl(value: value?.stringValue ?? "", editable: editable) { onChange(.string($0)) }
        case .calc?:
            CalcView(field: field, form: form)
        case .table?:
            TableControl(field: field, rows: Forms.tableRows(value), editable: editable, issues: issues) { rows in onChange(.array(rows.map { JSONValue.object($0) })) }
        case .photo?:
            PhotoFieldControl(model: model, form: form, field: field, editable: editable, onPhotos: onPhotos, onRemove: { id in
                onChange(.array((value?.strings ?? []).filter { $0 != id }.map { JSONValue.string($0) }))
            }, onOpen: onOpenPhoto)
        case .signature?:
            SignatureControl(signature: form.signature(field.id), editable: editable, onSign: onSign, onClear: onClearSignature)
        default:
            if editable {
                CommitField(title: field.label, value: value?.stringValue ?? "") { onChange(.string($0)) }
            } else {
                Text(value?.stringValue ?? "—")
            }
        }
    }
}

/// Yes / No / N.A. — big segmented buttons; tapping the chosen one again clears it.
struct YesNoControl: View {
    let value: String?
    let editable: Bool
    var compact = false
    let onChange: (String?) -> Void
    private let keys: [String] = ["yes", "no", "na"]
    private let names: [String] = [String(localized: "Yes"), String(localized: "No"), String(localized: "N/A")]

    var body: some View {
        let font: Font = compact ? Font.subheadline.weight(.semibold) : Font.body.weight(.semibold)
        HStack(spacing: 8) {
            ForEach(0..<3, id: \.self) { k in
                let key: String = keys[k]
                let on = value == key
                Button { onChange(on ? nil : key) } label: {
                    Text(names[k]).font(font)
                        .frame(maxWidth: .infinity, minHeight: compact ? 32 : 44)
                }
                .buttonStyle(.bordered)
                .tint(tint(key, on: on))
                .disabled(!editable)
                .accessibilityAddTraits(on ? .isSelected : [])
            }
        }
    }
    private func tint(_ v: String, on: Bool) -> Color {
        guard on else { return Color.secondary }
        switch v {
        case "yes": return Color.green
        case "no": return Color.red
        default: return Color.gray
        }
    }
}

/// Number with a decimal pad (a decimal comma is fine) and − / + steppers.
struct NumberControl: View {
    let field: FormField
    let value: JSONValue?
    let editable: Bool
    var compact = false
    let onChange: (JSONValue?) -> Void

    var body: some View {
        let n: Double? = Forms.number(value)
        HStack(spacing: 8) {
            if editable && !compact {
                Button { step(-1, n) } label: { Image(systemName: "minus").frame(width: 32, height: 32) }.buttonStyle(.bordered).accessibilityLabel("One less")
            }
            CommitField(title: field.label, value: displayed, keyboard: .decimalPad) { text in
                let t = text.trimmingCharacters(in: .whitespaces)
                if t.isEmpty { onChange(nil) } else if let x = Forms.parseNumber(t) { onChange(.number(x)) } else { onChange(.string(t)) }
            }
            .disabled(!editable)
            .multilineTextAlignment(.center)
            .font(compact ? Font.body : Font.title3.monospacedDigit())
            if let u = field.unit, !u.isEmpty { Text(u).foregroundStyle(.secondary) }
            if editable && !compact {
                Button { step(1, n) } label: { Image(systemName: "plus").frame(width: 32, height: 32) }.buttonStyle(.bordered).accessibilityLabel("One more")
            }
        }
    }

    private var displayed: String {
        if let s = value?.stringValue { return s }
        return Forms.formatNumber(Forms.number(value))
    }

    private func step(_ by: Double, _ n: Double?) {
        var next: Double = (n ?? 0) + by
        if let lo = field.min { next = Swift.max(lo, next) }
        onChange(.number(next))
    }
}

struct MultiSelectControl: View {
    let options: [String]
    let picked: [String]
    let editable: Bool
    let onChange: ([String]) -> Void
    var body: some View {
        ForEach(options, id: \.self) { o in
            let on = picked.contains(o)
            Button { onChange(on ? picked.filter { $0 != o } : picked + [o]) } label: {
                HStack {
                    Image(systemName: on ? "checkmark.circle.fill" : "circle").foregroundStyle(on ? Color.accentColor : Color.secondary)
                    Text(o).foregroundStyle(.primary)
                }
            }
            .disabled(!editable)
        }
    }
}

/// A date (YYYY-MM-DD) or time (HH:mm) stored as text, like the web app.
struct DateControl: View {
    let value: String?
    let editable: Bool
    let time: Bool
    let onChange: (String?) -> Void

    private var formatter: DateFormatter {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = time ? "HH:mm" : "yyyy-MM-dd"
        return f
    }

    var body: some View {
        let comps: DatePickerComponents = time ? .hourAndMinute : .date
        if let v = value, let d = formatter.date(from: v) {
            HStack {
                DatePicker(time ? "Time" : "Date", selection: Binding(get: { d }, set: { onChange(formatter.string(from: $0)) }),
                           displayedComponents: comps)
                    .disabled(!editable)
                if editable { Button("Clear") { onChange(nil) }.font(.caption) }
            }
        } else if editable {
            Button(time ? "Set time" : "Set date") { onChange(formatter.string(from: Date())) }
        } else {
            Text("—").foregroundStyle(.secondary)
        }
    }
}

struct LongTextControl: View {
    let value: String
    let editable: Bool
    let onCommit: (String) -> Void
    @State private var text = ""
    @FocusState private var focused: Bool
    var body: some View {
        TextField("Type here", text: $text, axis: .vertical)
            .lineLimit(3...12)
            .focused($focused)
            .disabled(!editable)
            .onAppear { text = value }
            .onChange(of: value) { _, v in if !focused { text = v } }
            .onChange(of: focused) { _, f in if !f && text != value { onCommit(text) } }
    }
}

struct CalcView: View {
    let field: FormField
    let form: JobForm
    var body: some View {
        let c: Double? = field.calc.flatMap { Forms.computeCalc(form.template, form.values, $0) }
        HStack(alignment: .firstTextBaseline) {
            Text(c == nil ? "—" : Forms.formatNumber(c)).font(.title2.weight(.semibold).monospacedDigit())
            if let u = field.unit, c != nil { Text(u).foregroundStyle(.secondary) }
            Spacer()
            Image(systemName: "function").foregroundStyle(.secondary)
        }
    }
}

struct SignatureControl: View {
    @Environment(AppModel.self) private var app
    let signature: FormSignature?
    let editable: Bool
    let onSign: () -> Void
    let onClear: () -> Void
    var body: some View {
        if let s = signature {
            HStack(spacing: 12) {
                if let img = app.store.image(s.imageId) {
                    Image(uiImage: img).resizable().scaledToFit().frame(width: 140, height: 56)
                        .background(Color.white, in: RoundedRectangle(cornerRadius: 6))
                } else {
                    Text("Signature not on this device yet").font(.caption).foregroundStyle(.secondary)
                }
                VStack(alignment: .leading, spacing: 2) {
                    Text(s.name + (s.role.map { " (\($0))" } ?? "")).font(.subheadline.weight(.medium))
                    Text("Signed \(FormDates.full(s.signedAt))").font(.caption).foregroundStyle(.secondary)
                    if Forms.signedOnBehalf(s) {
                        Text("Signed on behalf · collected by \(s.signedBy ?? "")").font(.caption).foregroundStyle(.secondary)
                    }
                }
                Spacer()
                if editable { Button("Clear", role: .destructive, action: onClear).font(.caption) }
            }
        } else if editable {
            Button(action: onSign) {
                Label("Tap to sign", systemImage: "signature").frame(maxWidth: .infinity, minHeight: 56)
            }
            .buttonStyle(.bordered)
        } else {
            Text("Not signed").foregroundStyle(.secondary)
        }
    }
}

struct PhotoFieldControl: View {
    let model: EditorModel
    let form: JobForm
    let field: FormField
    let editable: Bool
    let onPhotos: ([Photo]) -> Void
    let onRemove: (String) -> Void
    let onOpen: ([String], String) -> Void

    var body: some View {
        let ids: [String] = form.values[field.id]?.strings ?? []
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(ids, id: \.self) { pid in
                    if let p = model.photo(pid) {
                        Button { onOpen(ids.filter { model.photo($0) != nil }, pid) } label: { PhotoThumb(photo: p, size: 72) }
                            .buttonStyle(.plain)
                            .contextMenu { if editable { Button("Remove from this field", role: .destructive) { onRemove(pid) } } }
                    } else {
                        RoundedRectangle(cornerRadius: 8).fill(Color(.secondarySystemFill)).frame(width: 72, height: 72)
                            .overlay { Text("Missing").font(.caption2).foregroundStyle(.secondary) }
                    }
                }
                if editable {
                    PhotoAddMenu(model: model, extra: { p in
                        p.tags = ["Form"]
                        p.caption = "\(form.name): \(field.label)"
                        p.sheetId = form.sheetId
                        p.markerId = form.markerId
                    }, onAdded: onPhotos) {
                        VStack(spacing: 4) {
                            Image(systemName: "camera.fill")
                            Text("Add").font(.caption)
                        }
                        .frame(width: 72, height: 72)
                        .background(Color(.secondarySystemFill), in: RoundedRectangle(cornerRadius: 8))
                    }
                }
            }
        }
    }
}

/// Table rows as cards: one row per entry, add / remove rows, column totals.
struct TableControl: View {
    let field: FormField
    let rows: [[String: JSONValue]]
    let editable: Bool
    let issues: [Forms.Issue]
    let onChange: ([[String: JSONValue]]) -> Void

    var body: some View {
        let cols: [FormField] = field.columns ?? []
        ForEach(Array(rows.enumerated()), id: \.offset) { i, r in
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    Text("\(field.label) \(i + 1)").font(.caption.weight(.semibold)).foregroundStyle(.secondary)
                    Spacer()
                    if editable {
                        Button(role: .destructive) {
                            var next = rows
                            next.remove(at: i)
                            onChange(next)
                        } label: { Image(systemName: "trash") }
                            .buttonStyle(.borderless)
                            .accessibilityLabel("Delete")
                    }
                }
                ForEach(cols) { c in
                    TableCell(column: c, value: r[c.id], editable: editable, bad: issues.contains { $0.row == i && $0.columnId == c.id }) { v in
                        var next = rows
                        if let v { next[i][c.id] = v } else { next[i].removeValue(forKey: c.id) }
                        onChange(next)
                    }
                }
            }
            .padding(.vertical, 4)
        }
        let totals: [String: Double] = Forms.columnTotals(field, rows)
        if !rows.isEmpty && !totals.isEmpty {
            HStack {
                ForEach(cols.filter { totals[$0.id] != nil }) { c in
                    Text("\(c.label) total: \(Forms.formatNumber(totals[c.id]))\(c.unit.map { " \($0)" } ?? "")").font(.caption.weight(.semibold))
                }
            }
        }
        if editable {
            Button {
                onChange(rows + [["_id": JSONValue.string(newId(8))]])
            } label: { Label("Add row", systemImage: "plus.circle.fill") }
        }
    }
}

struct TableCell: View {
    let column: FormField
    let value: JSONValue?
    let editable: Bool
    let bad: Bool
    let onChange: (JSONValue?) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(column.label + (column.isRequired ? " *" : "")).font(.caption).foregroundStyle(bad ? Color.red : Color.secondary)
            cell
        }
    }

    @ViewBuilder private var cell: some View {
        switch column.kind {
        case .yesno?:
            YesNoControl(value: value?.stringValue, editable: editable, compact: true) { onChange($0.map { JSONValue.string($0) }) }
        case .number?:
            NumberControl(field: column, value: value, editable: editable, compact: true, onChange: onChange)
        case .select?:
            Picker(column.label, selection: Binding(get: { value?.stringValue ?? "" }, set: { onChange($0.isEmpty ? nil : .string($0)) })) {
                Text("Choose…").tag("")
                ForEach(column.options ?? [], id: \.self) { o in Text(o).tag(o) }
            }
            .labelsHidden()
            .disabled(!editable)
        case .date?:
            DateControl(value: value?.stringValue, editable: editable, time: false) { onChange($0.map { JSONValue.string($0) }) }
        default:
            CommitField(title: column.label, value: value?.stringValue ?? "") { onChange(.string($0)) }
                .disabled(!editable)
        }
    }
}
