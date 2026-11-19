import Foundation

// Typed forms and inspections — the same JSON and rules as the web app's src/lib/forms/forms.ts (keep them in step).
// Answers live in `JobForm.values`, keyed by field id:
//   text / longtext / date / time / select → string · number → number · yesno → "yes" | "no" | "na"
//   checkbox → bool · multiselect → [string] · photo → photo ids · table → rows (objects keyed by column id, plus "_id")
//   signature → nothing here (see `JobForm.signatures`) · heading / calc → nothing. "_history" holds reopen notes.

/// Any JSON value (form answers are typed by their field, so they are stored loosely).
public enum JSONValue: Codable, Hashable, Sendable {
    case null
    case bool(Bool)
    case number(Double)
    case string(String)
    case array([JSONValue])
    case object([String: JSONValue])

    public init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        if c.decodeNil() { self = .null }
        else if let b = try? c.decode(Bool.self) { self = .bool(b) }
        else if let n = try? c.decode(Double.self) { self = .number(n) }
        else if let s = try? c.decode(String.self) { self = .string(s) }
        else if let a = try? c.decode([JSONValue].self) { self = .array(a) }
        else if let o = try? c.decode([String: JSONValue].self) { self = .object(o) }
        else { self = .null }
    }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.singleValueContainer()
        switch self {
        case .null: try c.encodeNil()
        case .bool(let b): try c.encode(b)
        case .number(let n): try c.encode(n)
        case .string(let s): try c.encode(s)
        case .array(let a): try c.encode(a)
        case .object(let o): try c.encode(o)
        }
    }

    public var stringValue: String? { if case .string(let s) = self { return s } else { return nil } }
    public var arrayValue: [JSONValue]? { if case .array(let a) = self { return a } else { return nil } }
    public var objectValue: [String: JSONValue]? { if case .object(let o) = self { return o } else { return nil } }
    public var boolValue: Bool? { if case .bool(let b) = self { return b } else { return nil } }
    public var numberValue: Double? { if case .number(let n) = self { return n } else { return nil } }
    /// Strings of an array answer (multiselect choices, photo ids).
    public var strings: [String] { (arrayValue ?? []).compactMap(\.stringValue) }
}

public enum FormFieldType: String, Codable, CaseIterable, Sendable {
    case heading, text, longtext, number, date, time, yesno, checkbox, select, multiselect, photo, signature, table, calc
}

public enum FormCalcOp: String, Codable, CaseIterable, Sendable {
    case sum, avg, min, max
    case countNo = "count_no"
}

public struct FormCalc: Codable, Hashable, Sendable {
    public var op: String
    public var of: String
    public init(op: String, of: String) { self.op = op; self.of = of }
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        op = (try? c.decodeIfPresent(String.self, forKey: .op)) ?? "sum"
        of = (try? c.decodeIfPresent(String.self, forKey: .of)) ?? ""
    }
    public var calcOp: FormCalcOp? { FormCalcOp(rawValue: op) }
}

public struct FormField: Codable, Hashable, Identifiable, Sendable {
    public var id: String
    /// Raw type, kept as sent so a type this version doesn't know survives a save.
    public var type: String
    public var label: String
    public var required: Bool?
    public var options: [String]?
    public var unit: String?
    public var min: Double?
    public var max: Double?
    public var help: String?
    public var columns: [FormField]?
    public var calc: FormCalc?

    public init(id: String, type: FormFieldType, label: String, required: Bool? = nil, options: [String]? = nil, unit: String? = nil,
                min: Double? = nil, max: Double? = nil, help: String? = nil, columns: [FormField]? = nil, calc: FormCalc? = nil) {
        self.id = id; self.type = type.rawValue; self.label = label; self.required = required; self.options = options; self.unit = unit
        self.min = min; self.max = max; self.help = help; self.columns = columns; self.calc = calc
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = (try? c.decodeIfPresent(String.self, forKey: .id)) ?? ""
        type = (try? c.decodeIfPresent(String.self, forKey: .type)) ?? "text"
        label = (try? c.decodeIfPresent(String.self, forKey: .label)) ?? ""
        required = (try? c.decodeIfPresent(Bool.self, forKey: .required)) ?? nil
        options = (try? c.decodeIfPresent([String].self, forKey: .options)) ?? nil
        unit = (try? c.decodeIfPresent(String.self, forKey: .unit)) ?? nil
        min = (try? c.decodeIfPresent(Double.self, forKey: .min)) ?? nil
        max = (try? c.decodeIfPresent(Double.self, forKey: .max)) ?? nil
        help = (try? c.decodeIfPresent(String.self, forKey: .help)) ?? nil
        columns = (try? c.decodeIfPresent([FormField].self, forKey: .columns)) ?? nil
        calc = (try? c.decodeIfPresent(FormCalc.self, forKey: .calc)) ?? nil
    }

    /// Nil for a type this version of the app doesn't know (shown as plain text).
    public var kind: FormFieldType? { FormFieldType(rawValue: type) }
    public var isRequired: Bool { required == true }
    /// Takes an answer (not a heading or a calc).
    public var isInput: Bool { kind != .heading && kind != .calc }
}

public struct FormTemplate: Codable, Hashable, Identifiable, Sendable {
    public var id: String
    public var name: String
    public var trade: String?
    /// inspection | test | tm | safety | other
    public var category: String
    public var fields: [FormField]
    public var version: Int
    public var builtin: Bool?
    public var createdAt: String?
    public var updatedAt: String?

    public init(id: String, name: String, trade: String? = nil, category: String, fields: [FormField], version: Int = 1, builtin: Bool? = nil) {
        self.id = id; self.name = name; self.trade = trade; self.category = category; self.fields = fields; self.version = version; self.builtin = builtin
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = (try? c.decodeIfPresent(String.self, forKey: .id)) ?? ""
        name = (try? c.decodeIfPresent(String.self, forKey: .name)) ?? ""
        trade = (try? c.decodeIfPresent(String.self, forKey: .trade)) ?? nil
        category = (try? c.decodeIfPresent(String.self, forKey: .category)) ?? "other"
        fields = (try? c.decodeIfPresent([FormField].self, forKey: .fields)) ?? []
        let v = (try? c.decodeIfPresent(Double.self, forKey: .version)) ?? nil
        version = Swift.max(1, Int(v ?? 1))
        builtin = (try? c.decodeIfPresent(Bool.self, forKey: .builtin)) ?? nil
        createdAt = (try? c.decodeIfPresent(String.self, forKey: .createdAt)) ?? nil
        updatedAt = (try? c.decodeIfPresent(String.self, forKey: .updatedAt)) ?? nil
    }
}

public struct FormSignature: Codable, Hashable, Sendable {
    public var fieldId: String
    public var name: String
    public var role: String?
    public var imageId: String
    public var signedAt: String
    public var signedBy: String?
    public init(fieldId: String, name: String, role: String? = nil, imageId: String, signedAt: String = isoNow(), signedBy: String? = nil) {
        self.fieldId = fieldId; self.name = name; self.role = role; self.imageId = imageId; self.signedAt = signedAt; self.signedBy = signedBy
    }
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        fieldId = (try? c.decodeIfPresent(String.self, forKey: .fieldId)) ?? ""
        name = (try? c.decodeIfPresent(String.self, forKey: .name)) ?? ""
        role = (try? c.decodeIfPresent(String.self, forKey: .role)) ?? nil
        imageId = (try? c.decodeIfPresent(String.self, forKey: .imageId)) ?? ""
        signedAt = (try? c.decodeIfPresent(String.self, forKey: .signedAt)) ?? ""
        signedBy = (try? c.decodeIfPresent(String.self, forKey: .signedBy)) ?? nil
    }
}

/// A filled form on a job (synced as `job_forms`). `template` is a snapshot taken when it was started.
public struct JobForm: Codable, Hashable, Identifiable, Sendable {
    public var id: String
    public var projectId: String
    public var templateId: String
    public var name: String
    public var template: FormTemplate
    /// "draft" or "submitted"
    public var status: String
    public var values: [String: JSONValue]
    public var signatures: [FormSignature]?
    public var sheetId: String?
    public var x: Double?
    public var y: Double?
    public var markerId: String?
    public var photoIds: [String]?
    public var submittedBy: String?
    public var submittedAt: String?
    public var createdBy: String?
    public var createdAt: String
    public var updatedAt: String
    public var deleted: Bool?

    public init(id: String = newId(), projectId: String, template: FormTemplate, values: [String: JSONValue] = [:], createdBy: String? = nil, now: String = isoNow()) {
        self.id = id; self.projectId = projectId; self.templateId = template.id; self.name = template.name; self.template = template
        status = "draft"; self.values = values; signatures = []; photoIds = []; self.createdBy = createdBy; createdAt = now; updatedAt = now
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = (try? c.decodeIfPresent(String.self, forKey: .id)) ?? ""
        projectId = (try? c.decodeIfPresent(String.self, forKey: .projectId)) ?? ""
        templateId = (try? c.decodeIfPresent(String.self, forKey: .templateId)) ?? ""
        name = (try? c.decodeIfPresent(String.self, forKey: .name)) ?? ""
        template = (try? c.decodeIfPresent(FormTemplate.self, forKey: .template)) ?? FormTemplate(id: templateId, name: name, category: "other", fields: [])
        status = (try? c.decodeIfPresent(String.self, forKey: .status)) ?? "draft"
        values = (try? c.decodeIfPresent([String: JSONValue].self, forKey: .values)) ?? [:]
        signatures = (try? c.decodeIfPresent([FormSignature].self, forKey: .signatures)) ?? nil
        sheetId = (try? c.decodeIfPresent(String.self, forKey: .sheetId)) ?? nil
        x = (try? c.decodeIfPresent(Double.self, forKey: .x)) ?? nil
        y = (try? c.decodeIfPresent(Double.self, forKey: .y)) ?? nil
        markerId = (try? c.decodeIfPresent(String.self, forKey: .markerId)) ?? nil
        photoIds = (try? c.decodeIfPresent([String].self, forKey: .photoIds)) ?? nil
        submittedBy = (try? c.decodeIfPresent(String.self, forKey: .submittedBy)) ?? nil
        submittedAt = (try? c.decodeIfPresent(String.self, forKey: .submittedAt)) ?? nil
        createdBy = (try? c.decodeIfPresent(String.self, forKey: .createdBy)) ?? nil
        createdAt = (try? c.decodeIfPresent(String.self, forKey: .createdAt)) ?? ""
        updatedAt = (try? c.decodeIfPresent(String.self, forKey: .updatedAt)) ?? ""
        deleted = (try? c.decodeIfPresent(Bool.self, forKey: .deleted)) ?? nil
    }

    public var isSubmitted: Bool { status == "submitted" }
    public func signature(_ fieldId: String) -> FormSignature? { (signatures ?? []).first { $0.fieldId == fieldId } }
}

extension JobForm: FieldRow {}

public enum Forms {
    public static let historyKey = "_history"
    public static let maxTableColumns = 8
    public static let tableColumnTypes: [FormFieldType] = [.text, .number, .select, .yesno, .date]
    public static let categories: [(id: String, name: String)] = [("inspection", "Inspection"), ("test", "Test record"), ("tm", "T&M tag"), ("safety", "Safety"), ("other", "Other")]

    public static func categoryName(_ id: String) -> String { categories.first { $0.id == id }?.name ?? "Form" }

    // MARK: numbers

    /// "12.5", "12,5" (decimal comma) or "1,234.5" (thousands); nil when it isn't a number.
    public static func parseNumber(_ text: String) -> Double? {
        var s = text.trimmingCharacters(in: .whitespacesAndNewlines).replacingOccurrences(of: " ", with: "")
        if s.isEmpty { return nil }
        let commas = s.filter { $0 == "," }.count
        if commas > 0 && s.contains(".") { s = s.replacingOccurrences(of: ",", with: "") }
        else if commas == 1 { s = s.replacingOccurrences(of: ",", with: ".") }
        else if commas > 1 { s = s.replacingOccurrences(of: ",", with: "") }
        guard s.range(of: #"^[-+]?(\d+\.?\d*|\.\d+)$"#, options: .regularExpression) != nil, let n = Double(s), n.isFinite else { return nil }
        return n
    }

    public static func number(_ v: JSONValue?) -> Double? {
        switch v {
        case .number(let n)?: return n.isFinite ? n : nil
        case .string(let s)?: return parseNumber(s)
        default: return nil
        }
    }

    /// 12 → "12", 1.5 → "1.5".
    public static func formatNumber(_ n: Double?) -> String {
        guard let n, n.isFinite else { return "" }
        let r = (n * 1000).rounded() / 1000
        if r == r.rounded() && Swift.abs(r) < 1e15 { return String(Int64(r)) }
        return String(r)
    }

    private static func round6(_ n: Double) -> Double { (n * 1_000_000).rounded() / 1_000_000 }

    // MARK: answers

    static func rowHasData(_ r: [String: JSONValue]) -> Bool {
        r.contains { k, v in
            guard k != "_id" else { return false }
            switch v {
            case .null: return false
            case .string(let s): return !s.isEmpty
            case .array(let a): return !a.isEmpty
            default: return true
            }
        }
    }

    public static func tableRows(_ v: JSONValue?) -> [[String: JSONValue]] { (v?.arrayValue ?? []).compactMap(\.objectValue) }

    public static func hasAnswer(_ f: FormField, _ v: JSONValue?) -> Bool {
        switch f.kind {
        case .number?: return number(v) != nil
        case .checkbox?: return v?.boolValue == true
        case .yesno?: return ["yes", "no", "na"].contains(v?.stringValue ?? "")
        case .multiselect?, .photo?: return !(v?.arrayValue ?? []).isEmpty
        case .table?: return tableRows(v).contains(where: rowHasData)
        case .heading?, .calc?, .signature?: return false
        default:
            if let s = v?.stringValue { return !s.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
            return false
        }
    }

    /// Starting answers for a new form; `today` (YYYY-MM-DD) pre-fills date fields.
    public static func emptyValues(_ t: FormTemplate, today: String? = nil) -> [String: JSONValue] {
        var out: [String: JSONValue] = [:]
        for f in t.fields {
            switch f.kind {
            case .table?, .multiselect?, .photo?: out[f.id] = .array([])
            case .checkbox?: out[f.id] = .bool(false)
            case .date?: if let today { out[f.id] = .string(today) }
            default: break
            }
        }
        return out
    }

    /// A new form on a job from a template (a snapshot: later template edits never touch it).
    public static func newForm(_ t: FormTemplate, projectId: String, by: String?, today: String? = nil, now: String = isoNow()) -> JobForm {
        JobForm(projectId: projectId, template: t, values: emptyValues(t, today: today), createdBy: by, now: now)
    }

    // MARK: calculations

    public static func calcTarget(_ t: FormTemplate, _ of: String) -> FormField? {
        let parts = of.split(separator: ".", omittingEmptySubsequences: false).map(String.init)
        guard !of.isEmpty, parts.count <= 2, let f = t.fields.first(where: { $0.id == parts[0] }) else { return nil }
        if parts.count == 1 { return f.kind == .table ? nil : f }
        return f.kind == .table ? f.columns?.first { $0.id == parts[1] } : nil
    }

    public static func computeCalc(_ t: FormTemplate, _ values: [String: JSONValue], _ calc: FormCalc) -> Double? {
        let parts = calc.of.split(separator: ".", omittingEmptySubsequences: false).map(String.init)
        var raw: [JSONValue?] = []
        if let f = t.fields.first(where: { $0.id == parts[0] }) {
            if parts.count == 1 { if f.kind != .table { raw = [values[f.id]] } }
            else if f.kind == .table { raw = tableRows(values[f.id]).map { $0[parts[1]] } }
        }
        if calc.calcOp == .countNo { return Double(raw.filter { $0?.stringValue == "no" }.count) }
        let nums = raw.compactMap { number($0) }
        switch calc.calcOp {
        case .sum?: return round6(nums.reduce(0, +))
        case .avg?: return nums.isEmpty ? nil : round6(nums.reduce(0, +) / Double(nums.count))
        case .min?: return nums.min()
        case .max?: return nums.max()
        default: return nil
        }
    }

    public static func computeCalcs(_ t: FormTemplate, _ values: [String: JSONValue]) -> [String: Double?] {
        var out: [String: Double?] = [:]
        for f in t.fields where f.kind == .calc {
            if let c = f.calc { out[f.id] = computeCalc(t, values, c) }
        }
        return out
    }

    /// Totals of a table's number columns.
    public static func columnTotals(_ table: FormField, _ rows: [[String: JSONValue]]) -> [String: Double] {
        var out: [String: Double] = [:]
        for c in table.columns ?? [] where c.kind == .number {
            out[c.id] = round6(rows.reduce(0) { $0 + (number($1[c.id]) ?? 0) })
        }
        return out
    }

    // MARK: validation

    public struct Issue: Equatable, Sendable {
        public var fieldId: String
        public var message: String
        public var row: Int?
        public var columnId: String?
        public init(fieldId: String, message: String, row: Int? = nil, columnId: String? = nil) {
            self.fieldId = fieldId; self.message = message; self.row = row; self.columnId = columnId
        }
    }

    static func check(_ f: FormField, _ v: JSONValue?) -> String? {
        if f.kind == .number, let s = v?.stringValue, !s.trimmingCharacters(in: .whitespaces).isEmpty, parseNumber(s) == nil { return "Enter a number" }
        if !hasAnswer(f, v) { return f.isRequired ? (f.kind == .checkbox ? "Must be ticked" : "Required") : nil }
        if f.kind == .number, let n = number(v) {
            if let lo = f.min, n < lo { return "Must be at least \(formatNumber(lo))" }
            if let hi = f.max, n > hi { return "Must be \(formatNumber(hi)) or less" }
        }
        let opts = f.options ?? []
        if f.kind == .select, !opts.isEmpty, !opts.contains(v?.stringValue ?? "") { return "Pick one of the options" }
        if f.kind == .multiselect, !opts.isEmpty, (v?.arrayValue ?? []).contains(where: { !opts.contains($0.stringValue ?? "") }) { return "Pick from the options" }
        return nil
    }

    /// What stops the form being submitted (same rules and messages as the web app).
    public static func validate(_ form: JobForm) -> [Issue] {
        var out: [Issue] = []
        for f in form.template.fields {
            switch f.kind {
            case .heading?, .calc?: continue
            case .signature?:
                if f.isRequired && form.signature(f.id) == nil { out.append(Issue(fieldId: f.id, message: "Signature required")) }
            case .table?:
                let rows = tableRows(form.values[f.id])
                let filled = rows.enumerated().filter { rowHasData($0.element) }
                if f.isRequired && filled.isEmpty { out.append(Issue(fieldId: f.id, message: "Add at least one row")) }
                for (i, r) in filled {
                    for c in f.columns ?? [] {
                        if let m = check(c, r[c.id]) { out.append(Issue(fieldId: f.id, message: "Row \(i + 1): \(c.label) — \(m.lowercased())", row: i, columnId: c.id)) }
                    }
                }
            default:
                if let m = check(f, form.values[f.id]) { out.append(Issue(fieldId: f.id, message: m)) }
            }
        }
        return out
    }

    public struct Progress: Equatable, Sendable {
        public var answered: Int
        public var total: Int
        public var required: Int
        public var requiredDone: Int
        public var pct: Int
    }

    public static func progress(_ form: JobForm) -> Progress {
        var p = Progress(answered: 0, total: 0, required: 0, requiredDone: 0, pct: 0)
        for f in form.template.fields where f.isInput {
            p.total += 1
            let done = f.kind == .signature ? form.signature(f.id) != nil : hasAnswer(f, form.values[f.id])
            if done { p.answered += 1 }
            if f.isRequired {
                p.required += 1
                if done { p.requiredDone += 1 }
            }
        }
        p.pct = p.total == 0 ? 0 : Int((Double(p.answered) / Double(p.total) * 100).rounded())
        return p
    }

    public struct FailedItem: Equatable, Sendable {
        public var fieldId: String
        public var row: Int?
        public var text: String
    }

    /// "No" answers (fields and table cells), for "Make punch items".
    public static func failedItems(_ form: JobForm) -> [FailedItem] {
        var out: [FailedItem] = []
        for f in form.template.fields {
            let v = form.values[f.id]
            if f.kind == .yesno && v?.stringValue == "no" { out.append(FailedItem(fieldId: f.id, row: nil, text: "\(f.label) — No")) }
            if f.kind == .table {
                let cols = f.columns ?? []
                let nameCol = cols.first { $0.kind == .text }
                for (i, r) in tableRows(v).enumerated() {
                    for c in cols where c.kind == .yesno && r[c.id]?.stringValue == "no" {
                        let named = nameCol.flatMap { r[$0.id]?.stringValue }?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
                        out.append(FailedItem(fieldId: f.id, row: i, text: "\(f.label): \(named.isEmpty ? "Row \(i + 1)" : named) — \(c.label): No"))
                    }
                }
            }
        }
        return out
    }

    /// Add the form's "No" answers to the job's punch list (started when there is none); items already added are skipped.
    public static func punchItems(from form: JobForm, checklists: [Checklist]) -> (checklist: Checklist, added: [ChecklistItem], created: Bool) {
        let existing = FieldDocs.punchList(checklists, projectId: form.projectId)
        let tpl = FieldDocs.templates.first { $0.id == FieldDocs.punchTemplateId } ?? FieldDocs.Template(id: FieldDocs.punchTemplateId, name: "Punch list", items: [])
        var c = existing ?? FieldDocs.checklist(from: tpl, projectId: form.projectId)
        let note = "From form “\(form.name)”"
        var have = Set(c.items.filter { $0.note == note }.map(\.text))
        var added: [ChecklistItem] = []
        for f in failedItems(form) where !have.contains(f.text) {
            have.insert(f.text)
            var item = ChecklistItem(text: f.text)
            item.note = note
            added.append(item)
        }
        c.items += added
        return (c, added, existing == nil && !added.isEmpty)
    }

    // MARK: permissions and status

    /// Drafts: anyone. Submitted forms are locked for everyone (the office can reopen them).
    public static func canEdit(_ role: TeamRole?, _ form: JobForm) -> Bool { !form.isSubmitted }
    public static func canReopen(_ role: TeamRole?, _ form: JobForm) -> Bool { form.isSubmitted && role != .tech }
    public static func canDelete(_ role: TeamRole?, _ form: JobForm) -> Bool { !form.isSubmitted || role != .tech }
    public static func canEditTemplates(_ role: TeamRole?) -> Bool { role != .tech }

    public struct HistoryNote: Equatable, Sendable {
        public var at: String
        public var by: String?
        public var text: String
    }

    public static func history(_ form: JobForm) -> [HistoryNote] {
        (form.values[historyKey]?.arrayValue ?? []).compactMap { v in
            guard let o = v.objectValue, let at = o["at"]?.stringValue else { return nil }
            return HistoryNote(at: at, by: o["by"]?.stringValue, text: o["text"]?.stringValue ?? "")
        }
    }

    public static func submit(_ form: JobForm, by: String?, now: String = isoNow()) -> JobForm {
        var f = form
        f.status = "submitted"; f.submittedBy = by; f.submittedAt = now
        return f
    }

    /// Back to draft, with a note saying who reopened it and why.
    public static func reopen(_ form: JobForm, by: String?, now: String = isoNow(), reason: String = "") -> JobForm {
        var f = form
        var text = "Reopened"
        if let at = form.submittedAt { text += " (submitted \(at.prefix(10))\(form.submittedBy.map { " by \($0)" } ?? ""))" }
        let why = reason.trimmingCharacters(in: .whitespacesAndNewlines)
        if !why.isEmpty { text += ": \(why)" }
        var note: [String: JSONValue] = ["at": .string(now), "text": .string(text)]
        note["by"] = by.map { JSONValue.string($0) } ?? .null
        let old = form.values[historyKey]?.arrayValue ?? []
        f.values[historyKey] = .array(old + [.object(note)])
        f.status = "draft"; f.submittedAt = nil; f.submittedBy = nil
        return f
    }

    // MARK: templates

    /// Problems that make a template unusable (same checks as the web app's validateTemplate).
    public static func validateTemplate(_ t: FormTemplate) -> [String] {
        var out: [String] = []
        if t.name.trimmingCharacters(in: .whitespaces).isEmpty { out.append("Give the form a name") }
        if !categories.contains(where: { $0.id == t.category }) { out.append("Unknown category “\(t.category)”") }
        if t.fields.isEmpty { return out + ["Add at least one field"] }
        var ids = Set<String>()
        for f in t.fields {
            let name = f.label.trimmingCharacters(in: .whitespaces).isEmpty ? f.id : f.label.trimmingCharacters(in: .whitespaces)
            if f.id.isEmpty { out.append("A field has no id (“\(name)”)") }
            else if f.id.hasPrefix("_") || f.id.contains(".") { out.append("Field id “\(f.id)” can't start with “_” or contain “.”") }
            else if ids.contains(f.id) { out.append("Two fields share the id “\(f.id)”") }
            ids.insert(f.id)
            if f.kind == nil { out.append("“\(name)” has an unknown type “\(f.type)”") }
            if f.label.trimmingCharacters(in: .whitespaces).isEmpty { out.append("A \(f.type) field has no label") }
            if (f.kind == .select || f.kind == .multiselect) && !(f.options ?? []).contains(where: { !$0.trimmingCharacters(in: .whitespaces).isEmpty }) {
                out.append("“\(name)” needs at least one option")
            }
            if let lo = f.min, let hi = f.max, lo > hi { out.append("“\(name)”: the minimum is above the maximum") }
            if f.kind == .table {
                let cols = f.columns ?? []
                if cols.isEmpty { out.append("Table “\(name)” has no columns") }
                if cols.count > maxTableColumns { out.append("Table “\(name)” has more than \(maxTableColumns) columns") }
                var cids = Set<String>()
                for c in cols {
                    if c.id.isEmpty || c.id.hasPrefix("_") || c.id.contains(".") { out.append("Table “\(name)” has a column with a bad id") }
                    else if cids.contains(c.id) { out.append("Table “\(name)” has two columns with the id “\(c.id)”") }
                    cids.insert(c.id)
                    if !tableColumnTypes.contains(where: { $0.rawValue == c.type }) { out.append("Table “\(name)”: a column can't be a \(c.type) field") }
                    if c.label.trimmingCharacters(in: .whitespaces).isEmpty { out.append("Table “\(name)” has a column with no label") }
                    if c.kind == .select && !(c.options ?? []).contains(where: { !$0.trimmingCharacters(in: .whitespaces).isEmpty }) { out.append("Table “\(name)”: column “\(c.label)” needs options") }
                }
            }
        }
        for f in t.fields where f.kind == .calc {
            let name = f.label.trimmingCharacters(in: .whitespaces).isEmpty ? f.id : f.label.trimmingCharacters(in: .whitespaces)
            guard let calc = f.calc, let op = calc.calcOp else {
                out.append("Calculation “\(name)” needs an operation")
                continue
            }
            guard let target = calcTarget(t, calc.of) else {
                out.append("Calculation “\(name)” refers to “\(calc.of)”, which isn't on the form")
                continue
            }
            let want: FormFieldType = op == .countNo ? .yesno : .number
            if target.kind != want { out.append("Calculation “\(name)” can't use “\(target.label)” (\(op == .countNo ? "needs a yes/no" : "needs a number"))") }
        }
        return out
    }

    /// Company templates read from settings: unusable or duplicate entries dropped, never marked built in.
    public static func normalizeTemplates(_ raw: [FormTemplate]?) -> [FormTemplate] {
        var seen = Set<String>()
        var out: [FormTemplate] = []
        for var t in raw ?? [] where !t.id.isEmpty && validateTemplate(t).isEmpty && !seen.contains(t.id) {
            seen.insert(t.id)
            t.builtin = nil
            out.append(t)
        }
        return out
    }

    /// The company's own (A→Z) and its trades' built-ins first, then the rest.
    public static func templatesForTrades(_ all: [FormTemplate], trades: [String]) -> (suggested: [FormTemplate], others: [FormTemplate]) {
        var s: [FormTemplate] = []
        var o: [FormTemplate] = []
        for t in all {
            if t.builtin != true || t.trade == nil || trades.contains(t.trade ?? "") { s.append(t) } else { o.append(t) }
        }
        return (s, o)
    }

    public static func allTemplates(custom: [FormTemplate]) -> [FormTemplate] {
        normalizeTemplates(custom).sorted { $0.name.localizedCompare($1.name) == .orderedAscending } + builtins
    }

    /// Text of an answer for lists and the PDF.
    public static func answerText(_ f: FormField, _ v: JSONValue?) -> String {
        switch f.kind {
        case .yesno?:
            switch v?.stringValue { case "yes": return "Yes"; case "no": return "No"; case "na": return "N/A"; default: return "" }
        case .checkbox?: return v?.boolValue == true ? "Yes" : "No"
        case .number?:
            guard let n = number(v) else { return "" }
            return formatNumber(n) + (f.unit.map { " \($0)" } ?? "")
        case .multiselect?: return v?.strings.joined(separator: ", ") ?? ""
        default: return v?.stringValue ?? ""
        }
    }

    /// True when someone else signed on this device (an inspector or the customer).
    public static func signedOnBehalf(_ s: FormSignature) -> Bool {
        guard let by = s.signedBy?.trimmingCharacters(in: .whitespaces), !by.isEmpty else { return false }
        return by.lowercased() != s.name.trimmingCharacters(in: .whitespaces).lowercased()
    }

    // MARK: built-ins (generated from the web app: tests/fixtures/formBuiltins.json)

    public static let builtins: [FormTemplate] = {
        (try? JSONDecoder().decode([FormTemplate].self, from: Data(formBuiltinsJSON.utf8))) ?? []
    }()
}
