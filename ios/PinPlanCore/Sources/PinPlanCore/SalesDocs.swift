import Foundation

// Quotes, invoices and credit notes made in the web app (docs/documents.md), pulled read-only for the office on
// iPad / iPhone. Same JSON as SalesDoc / DocPayment in src/lib/types.ts; the rules below mirror src/lib/documents.ts.
// They sync only for people who may see prices (TeamLogic.can(role, .prices)).

public enum SalesDocKind: String, Codable, CaseIterable, Sendable {
    case quote, invoice
    case creditNote = "credit_note"
    /// Unknown kinds read as `.quote` (never counted as invoiced).
    public init(from decoder: Decoder) throws { self = SalesDocKind(rawValue: tolerantRaw(decoder)) ?? .quote }

    public var label: String {
        switch self {
        case .quote: return "Quote"
        case .invoice: return "Invoice"
        case .creditNote: return "Credit note"
        }
    }
}

/// Stored status. "ready", "overdue" and "expired" are never stored: see `SalesDocs.displayStatus`.
public enum SalesDocStatus: String, Codable, CaseIterable, Sendable {
    case draft, sent, viewed, accepted, declined
    case partiallyPaid = "partially_paid"
    case paid, void
    /// Unknown statuses read as `.draft` (never counted).
    public init(from decoder: Decoder) throws { self = SalesDocStatus(rawValue: tolerantRaw(decoder)) ?? .draft }
}

/// Who the document is for.
public struct SalesDocClient: Codable, Hashable, Sendable {
    public var name: String
    public var company: String?
    public var email: String?
    public var phone: String?
    public var billingAddress: String?
    public var siteAddress: String?
    public init(name: String = "") { self.name = name }
    private enum CodingKeys: String, CodingKey { case name, company, email, phone, billingAddress, siteAddress }
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        name = c.looseString(.name)
        company = c.loose(String.self, .company); email = c.loose(String.self, .email); phone = c.loose(String.self, .phone)
        billingAddress = c.loose(String.self, .billingAddress); siteAddress = c.loose(String.self, .siteAddress)
    }
}

/// A quote, invoice or credit note. The money fields are the web app's own totals (denormalised for lists).
/// Lines, taxes and layout options are kept as they came: this app shows documents, it doesn't edit them.
public struct SalesDoc: Codable, Hashable, Identifiable, Sendable {
    public var id: String
    public var projectId: String
    public var kind: SalesDocKind
    public var title: String?
    /// Given by the server when the document is issued; nil while it's a draft or waiting for sync.
    public var number: String?
    public var status: SalesDocStatus
    public var issueDate: String?
    public var dueDate: String?
    public var validUntil: String?
    public var termsDays: Int?
    public var client: SalesDocClient
    public var lines: [JSONValue]
    public var discount: JSONValue?
    public var taxes: [JSONValue]
    public var fees: [JSONValue]?
    public var deposit: JSONValue?
    public var deductions: [JSONValue]?
    public var currency: String
    public var notes: String?
    public var terms: String?
    public var footer: String?
    public var internalNotes: String?
    public var options: JSONValue?
    public var subtotal: Double
    public var discountTotal: Double
    public var taxTotal: Double
    public var total: Double
    public var amountPaid: Double
    public var balanceDue: Double
    public var source: String
    public var convertedFrom: String?
    /// standard, deposit, progress, final.
    public var invoiceType: String?
    public var billedPct: Double?
    public var shareToken: String?
    public var shareHash: String?
    public var sentAt: String?
    public var viewedAt: String?
    public var respondedAt: String?
    public var signerName: String?
    public var signature: String?
    public var clientNote: String?
    public var paidAt: String?
    public var voidedAt: String?
    public var createdAt: String
    public var updatedAt: String
    public var deleted: Bool?

    public init(id: String = newId(), projectId: String, kind: SalesDocKind, status: SalesDocStatus = .draft, total: Double = 0, currency: String = "USD") {
        self.id = id; self.projectId = projectId; self.kind = kind; self.status = status; self.client = SalesDocClient()
        lines = []; taxes = []; self.currency = currency
        subtotal = total; discountTotal = 0; taxTotal = 0; self.total = total; amountPaid = 0; balanceDue = kind == .invoice ? total : 0
        source = "manual"
        let now = isoNow(); createdAt = now; updatedAt = now
    }

    private enum CodingKeys: String, CodingKey {
        case id, projectId, kind, title, number, status, issueDate, dueDate, validUntil, termsDays, client, lines, discount, taxes, fees, deposit
        case deductions, currency, notes, terms, footer, internalNotes, options, subtotal, discountTotal, taxTotal, total, amountPaid, balanceDue
        case source, convertedFrom, invoiceType, billedPct, shareToken, shareHash, sentAt, viewedAt, respondedAt, signerName, signature
        case clientNote, paidAt, voidedAt, createdAt, updatedAt, deleted
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        projectId = c.looseString(.projectId)
        kind = c.loose(SalesDocKind.self, .kind) ?? .quote
        title = c.loose(String.self, .title)
        number = c.loose(String.self, .number)
        status = c.loose(SalesDocStatus.self, .status) ?? .draft
        issueDate = c.loose(String.self, .issueDate)
        dueDate = c.loose(String.self, .dueDate)
        validUntil = c.loose(String.self, .validUntil)
        termsDays = c.looseInt(.termsDays)
        client = c.loose(SalesDocClient.self, .client) ?? SalesDocClient()
        lines = c.loose([JSONValue].self, .lines) ?? []
        discount = c.loose(JSONValue.self, .discount)
        taxes = c.loose([JSONValue].self, .taxes) ?? []
        fees = c.loose([JSONValue].self, .fees)
        deposit = c.loose(JSONValue.self, .deposit)
        deductions = c.loose([JSONValue].self, .deductions)
        currency = c.looseString(.currency, "USD")
        notes = c.loose(String.self, .notes)
        terms = c.loose(String.self, .terms)
        footer = c.loose(String.self, .footer)
        internalNotes = c.loose(String.self, .internalNotes)
        options = c.loose(JSONValue.self, .options)
        subtotal = c.loose(Double.self, .subtotal) ?? 0
        discountTotal = c.loose(Double.self, .discountTotal) ?? 0
        taxTotal = c.loose(Double.self, .taxTotal) ?? 0
        total = c.loose(Double.self, .total) ?? 0
        amountPaid = c.loose(Double.self, .amountPaid) ?? 0
        balanceDue = c.loose(Double.self, .balanceDue) ?? 0
        source = c.looseString(.source, "manual")
        convertedFrom = c.loose(String.self, .convertedFrom)
        invoiceType = c.loose(String.self, .invoiceType)
        billedPct = c.loose(Double.self, .billedPct)
        shareToken = c.loose(String.self, .shareToken)
        shareHash = c.loose(String.self, .shareHash)
        sentAt = c.loose(String.self, .sentAt)
        viewedAt = c.loose(String.self, .viewedAt)
        respondedAt = c.loose(String.self, .respondedAt)
        signerName = c.loose(String.self, .signerName)
        signature = c.loose(String.self, .signature)
        clientNote = c.loose(String.self, .clientNote)
        paidAt = c.loose(String.self, .paidAt)
        voidedAt = c.loose(String.self, .voidedAt)
        createdAt = c.looseString(.createdAt)
        updatedAt = c.looseString(.updatedAt, createdAt)
        deleted = c.loose(Bool.self, .deleted)
    }

    /// Lines that are items (section headings left out).
    public var itemCount: Int { lines.filter { $0.objectValue?["kind"]?.stringValue != "section" }.count }
}

/// A payment (positive) or refund (negative) against an invoice.
public struct SalesPayment: Codable, Hashable, Identifiable, Sendable {
    public var id: String
    public var projectId: String
    public var documentId: String
    public var amount: Double
    /// YYYY-MM-DD.
    public var date: String
    /// cash, check, card, ach, zelle, other.
    public var method: String
    public var reference: String?
    public var note: String?
    /// Kept for the record but not counted.
    public var voided: Bool?
    public var createdAt: String
    public var updatedAt: String
    public var deleted: Bool?

    public init(id: String = newId(), projectId: String, documentId: String, amount: Double, date: String, method: String = "other") {
        self.id = id; self.projectId = projectId; self.documentId = documentId; self.amount = amount; self.date = date; self.method = method
        let now = isoNow(); createdAt = now; updatedAt = now
    }

    private enum CodingKeys: String, CodingKey { case id, projectId, documentId, amount, date, method, reference, note, voided, createdAt, updatedAt, deleted }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        projectId = c.looseString(.projectId)
        documentId = c.looseString(.documentId)
        amount = c.loose(Double.self, .amount) ?? 0
        date = c.looseString(.date)
        method = c.looseString(.method, "other")
        reference = c.loose(String.self, .reference)
        note = c.loose(String.self, .note)
        voided = c.loose(Bool.self, .voided)
        createdAt = c.looseString(.createdAt)
        updatedAt = c.looseString(.updatedAt, createdAt)
        deleted = c.loose(Bool.self, .deleted)
    }
}

/// What the list shows: the stored status, or "ready" (finalized, not sent yet) / "overdue" / "expired" worked out.
/// Labels are STATUS_LABEL in src/lib/documents.ts.
public enum SalesDocDisplayStatus: String, Sendable, Equatable {
    case draft, ready, sent, viewed, accepted, declined, partiallyPaid, paid, void, overdue, expired

    public var label: String {
        switch self {
        case .draft: return "Draft"
        case .ready: return "Ready to send"
        case .sent: return "Sent"
        case .viewed: return "Viewed"
        case .accepted: return "Approved"
        case .declined: return "Declined"
        case .partiallyPaid: return "Partly paid"
        case .paid: return "Paid"
        case .void: return "Void"
        case .overdue: return "Overdue"
        case .expired: return "Expired"
        }
    }
}

public enum SalesDocs {
    static func isDay(_ s: String?) -> Bool {
        guard let s, s.count == 10 else { return false }
        return s.range(of: #"^\d{4}-\d{2}-\d{2}$"#, options: .regularExpression) != nil
    }

    /// True once the client has it: a link was shared, it was emailed or marked sent, or the client opened or answered
    /// it. Finalizing alone sends nothing ("Ready to send"). Same as `wasSent` in src/lib/documents.ts.
    public static func wasSent(_ d: SalesDoc) -> Bool {
        if d.status == .viewed || d.status == .accepted || d.status == .declined { return true }
        return [d.sentAt, d.shareToken, d.viewedAt, d.respondedAt].contains { !($0 ?? "").isEmpty }
    }

    /// Same as `displayStatus` in src/lib/documents.ts. `day` is today, YYYY-MM-DD.
    /// Overdue and expired only start once the document was sent.
    public static func displayStatus(_ d: SalesDoc, day: String) -> SalesDocDisplayStatus {
        let st = d.status
        switch st {
        case .draft: return .draft
        case .void: return .void
        default: break
        }
        let sent = wasSent(d)
        if d.kind == .invoice {
            if st == .paid { return .paid }
            if sent, isDay(d.dueDate), let due = d.dueDate, due < day, d.balanceDue > 0 { return .overdue }
            return st == .sent && !sent ? .ready : plain(st)
        }
        if st == .sent && !sent { return .ready }
        if d.kind == .quote, st == .sent || st == .viewed, isDay(d.validUntil), let v = d.validUntil, v < day { return .expired }
        return plain(st)
    }

    /// What kind of invoice it is, as the web document editor says it: "Deposit invoice · 30% of the quote",
    /// "Progress invoice · 12.5% of the quote" (a custom amount is billed as progress), "Final invoice".
    /// Nil for quotes, credit notes and plain invoices.
    public static func invoiceTypeText(_ d: SalesDoc) -> String? {
        guard d.kind == .invoice, let t = d.invoiceType else { return nil }
        let name: String
        switch t {
        case "deposit": name = "Deposit"
        case "progress": name = "Progress"
        case "final": name = "Final"
        default: return nil
        }
        guard let pct = d.billedPct, pct > 0 else { return "\(name) invoice" }
        let n = (pct * 100).rounded() / 100
        let pctText = n == n.rounded() ? String(Int(n)) : String(n)
        return "\(name) invoice · \(pctText)% of the quote"
    }

    // MARK: numbering (mirrors formatDocNumber in src/lib/documents.ts and public.format_document_number)

    /// Default number formats (docs/documents.md, Numbering). Quotes are Q-{0000}; EST-{0000} is the old default.
    public static func defaultNumberFormat(_ kind: SalesDocKind) -> String {
        switch kind {
        case .quote: return "Q-{0000}"
        case .invoice: return "INV-{YYYY}-{0000}"
        case .creditNote: return "CN-{0000}"
        }
    }

    /// "INV-{YYYY}-{0000}" + 42 on 2026-03-05 → "INV-2026-0042". Tokens: {YYYY} {YY} {MM}; {0…0} pads the counter to
    /// that many digits (never cuts it); {#} is the bare counter. A format without a counter token gets {0000} at the end.
    /// The server gives the real numbers; this is for previews only.
    public static func formatNumber(_ format: String, seq: Int, day: String) -> String {
        var out = format.trimmingCharacters(in: .whitespacesAndNewlines)
        if out.isEmpty { out = "{0000}" }
        if out.range(of: #"\{(0+|#)\}"#, options: .regularExpression) == nil { out += "{0000}" }
        let d = Array(day)
        func part(_ a: Int, _ b: Int) -> String { d.count >= b ? String(d[a..<b]) : "" }
        out = out.replacingOccurrences(of: "{YYYY}", with: part(0, 4)).replacingOccurrences(of: "{YY}", with: part(2, 4))
            .replacingOccurrences(of: "{MM}", with: part(5, 7)).replacingOccurrences(of: "{#}", with: String(seq))
        while let r = out.range(of: #"\{0+\}"#, options: .regularExpression) {
            let width = out.distance(from: r.lowerBound, to: r.upperBound) - 2
            let n = String(seq)
            out.replaceSubrange(r, with: String(repeating: "0", count: max(0, width - n.count)) + n)
        }
        return out
    }

    static func plain(_ s: SalesDocStatus) -> SalesDocDisplayStatus {
        switch s {
        case .draft: return .draft
        case .sent: return .sent
        case .viewed: return .viewed
        case .accepted: return .accepted
        case .declined: return .declined
        case .partiallyPaid: return .partiallyPaid
        case .paid: return .paid
        case .void: return .void
        }
    }

    /// "INV-2026-0007", or "Draft invoice" / "Invoice (number pending)" (like docName on the web, default labels).
    public static func name(_ d: SalesDoc) -> String {
        if let n = d.number, !n.isEmpty { return n }
        return d.status == .draft ? "Draft \(d.kind.label.lowercased())" : "\(d.kind.label) (number pending)"
    }

    /// A job's documents to list: not deleted, newest first.
    public static func list(_ docs: [SalesDoc], projectId: String? = nil) -> [SalesDoc] {
        docs.filter { $0.deleted != true && (projectId == nil || $0.projectId == projectId) }
            .sorted { ($0.issueDate ?? $0.createdAt, $0.createdAt) > ($1.issueDate ?? $1.createdAt, $1.createdAt) }
    }

    /// Totals for a job, like the web's Documents tab: issued invoices, credit notes, balance still due.
    public struct Totals: Equatable, Sendable {
        public var quotedAccepted = 0.0
        public var invoiced = 0.0
        public var credited = 0.0
        public var balanceDue = 0.0
        public var paid: Double { invoiced - credited - balanceDue }
        /// Issued invoices less credit notes, before tax (what the estimate's "invoiced" bar compares with its subtotal).
        public var invoicedBeforeTax = 0.0
    }

    public static func totals(_ docs: [SalesDoc]) -> Totals {
        var t = Totals()
        for d in docs where d.deleted != true && d.status != .void {
            let issued = d.status != .draft
            switch d.kind {
            case .quote: if d.status == .accepted { t.quotedAccepted += d.total }
            case .invoice:
                if issued { t.invoiced += d.total; t.balanceDue += d.balanceDue; t.invoicedBeforeTax += d.subtotal - d.discountTotal }
            case .creditNote:
                if issued { t.credited += d.total; t.invoicedBeforeTax -= d.subtotal - d.discountTotal }
            }
        }
        return t
    }

    /// Money as the documents show it ("$1,234.50"), in the document's currency.
    public static func money(_ n: Double, currency: String) -> String {
        let f = NumberFormatter()
        f.numberStyle = .currency
        f.locale = Locale(identifier: "en_US")
        f.currencyCode = currency.isEmpty ? "USD" : currency
        return f.string(from: NSNumber(value: n)) ?? String(format: "%.2f %@", n, currency)
    }
}

extension ProjectBundle {
    /// The job's quotes, invoices and credit notes (not deleted), newest first.
    public var liveSalesDocs: [SalesDoc] { SalesDocs.list(salesDocs) }
    public var liveSalesPayments: [SalesPayment] { salesPayments.filter { $0.deleted != true && $0.voided != true } }
}
