import Foundation

/// Rows synced with Supabase — the same tables and columns as the web app (src/lib/syncMap.ts).
public enum SyncTable: String, CaseIterable, Codable, Sendable {
    case projects, deviceTypes, products, sheets, closets, markers, runs, estimateLines
    case photos, photoComments, checklists, jobLogs, documents
    case forms
    case tasks
    /// Made on the web, pulled here (FieldSync.swift / SalesDocs.swift). See `SyncMap.pullOnly`.
    case salesDocs, salesPayments, rfis, scheduleItems, measurements, sheetLinks, planMarkups
    /// Office-only price tables (20261125000100_price_split_stale_writes.sql). Not rows of their own here: each holds the
    /// prices of a catalog type, a product or a job, and is merged into that row. Technicians never pull or push them.
    case deviceTypePrices, productPrices, projectFinance
}

public struct TableSpec: Sendable {
    public let remote: String
    public let conflict: String
    /// Local (JSON) key → remote column. Only these are sent and read.
    public let columns: [(local: String, remote: String)]
    /// The remote column holding the row's key ("id", or the parent's id on a price table).
    public var idColumn: String { columns.first { $0.local == "id" }?.remote ?? "id" }
}

public enum SyncMap {
    private static let common: [(String, String)] = [("id", "id"), ("createdAt", "created_at"), ("updatedAt", "updated_at"), ("deleted", "deleted")]
    private static let child = common + [("projectId", "project_id")]

    public static let specs: [SyncTable: TableSpec] = [
        .projects: TableSpec(remote: "projects", conflict: "id", columns: common + [
            ("clientName", "client_name"), ("clientEmail", "client_email"), ("clientPhone", "client_phone"), ("address", "address"),
            ("status", "status"), ("notes", "notes"),
            // pricing, billdu_docs and billdu_client_id live in project_finance (office only): never sent or read here.
            ("productChoices", "product_choices"), ("labels", "labels"), ("lat", "lat"), ("lng", "lng"),
        ]),
        .sheets: TableSpec(remote: "sheets", conflict: "id", columns: child + [
            ("name", "name"), ("pageNumber", "page_number"), ("order", "sort_order"), ("imageId", "image_id"), ("width", "width"),
            ("height", "height"), ("pxPerFt", "px_per_ft"), ("pxPerInch", "px_per_inch"), ("scaleLabel", "scale_label"),
            // Sheet index and revisions (20261123100500_sheet_links.sql, docs/sheet-revisions.md).
            ("number", "sheet_number"), ("title", "sheet_title"), ("discipline", "discipline"), ("tags", "tags"),
            ("revisionLabel", "revision_label"), ("revisions", "revisions"),
        ]),
        .deviceTypes: TableSpec(remote: "device_types", conflict: "owner_id,id", columns: [
            ("id", "id"), ("updatedAt", "updated_at"), ("deleted", "deleted"), ("name", "name"), ("category", "category"), ("symbol", "symbol"),
            ("icon", "icon"), ("abbrev", "abbrev"), ("shape", "shape"), ("color", "color"), ("unit", "unit"),
            // unit_price, labor_price and billdu_product_id live in device_type_prices (office only).
            ("defaultWire", "default_wire"), ("defaultMount", "default_mount"), ("kind", "kind"),
            ("sort", "sort_order"), ("archived", "archived"),
        ]),
        .products: TableSpec(remote: "products", conflict: "owner_id,id", columns: [
            ("id", "id"), ("updatedAt", "updated_at"), ("deleted", "deleted"), ("deviceTypeId", "device_type_id"), ("brand", "brand"),
            ("model", "model"), ("sku", "sku"), ("notes", "notes"), ("archived", "archived"),
            // unit_price and labor_price live in product_prices (office only).
        ]),
        // Prices, office only (CONTRACT at the top of 20261125000100_price_split_stale_writes.sql). "id" is the parent row's id.
        .deviceTypePrices: TableSpec(remote: "device_type_prices", conflict: "owner_id,device_type_id", columns: [
            ("id", "device_type_id"), ("unitPrice", "unit_price"), ("laborPrice", "labor_price"), ("billduProductId", "billdu_product_id"),
            ("updatedAt", "updated_at"),
        ]),
        .productPrices: TableSpec(remote: "product_prices", conflict: "owner_id,product_id", columns: [
            ("id", "product_id"), ("unitPrice", "unit_price"), ("laborPrice", "labor_price"), ("updatedAt", "updated_at"),
        ]),
        .projectFinance: TableSpec(remote: "project_finance", conflict: "project_id", columns: [
            ("id", "project_id"), ("pricing", "pricing"), ("billduDocs", "billdu_docs"), ("billduClientId", "billdu_client_id"),
            ("updatedAt", "updated_at"),
        ]),
        .markers: TableSpec(remote: "markers", conflict: "id", columns: child + [
            ("sheetId", "sheet_id"), ("deviceTypeId", "device_type_id"), ("x", "x"), ("y", "y"), ("label", "label"), ("room", "room"),
            ("mount", "mount"), ("wireType", "wire_type"), ("wires", "wires"), ("productId", "product_id"), ("closetId", "closet_id"),
            ("circuit", "circuit"), ("tentative", "tentative"), ("notes", "notes"), ("photoId", "photo_id"),
            ("install", "install"), ("count", "count"),
        ]),
        .runs: TableSpec(remote: "runs", conflict: "id", columns: child + [
            ("sheetId", "sheet_id"), ("kind", "kind"), ("deviceTypeId", "device_type_id"), ("points", "points"), ("measuredFt", "measured_ft"),
            ("typedFt", "typed_ft"), ("zone", "zone"), ("switchLabel", "switch_label"), ("steps", "steps"), ("lfPerStep", "lf_per_step"),
            ("wireType", "wire_type"), ("wireTypes", "wire_types"), ("markerId", "marker_id"), ("closetId", "closet_id"),
            ("circuit", "circuit"), ("tentative", "tentative"), ("notes", "notes"),
            ("install", "install"),
        ]),
        .closets: TableSpec(remote: "closets", conflict: "id", columns: child + [
            ("sheetId", "sheet_id"), ("kind", "kind"), ("x", "x"), ("y", "y"), ("name", "name"), ("notes", "notes"),
        ]),
        .estimateLines: TableSpec(remote: "estimate_lines", conflict: "id", columns: [
            ("id", "id"), ("projectId", "project_id"), ("updatedAt", "updated_at"), ("deleted", "deleted"), ("key", "key"),
            ("description", "description"), ("qty", "qty"), ("unit", "unit"), ("unitPrice", "unit_price"), ("removed", "removed"),
            ("include", "include"), ("sort", "sort_order"),
        ]),
        .photos: TableSpec(remote: "photos", conflict: "id", columns: child + [
            ("imageId", "image_id"), ("width", "width"), ("height", "height"), ("takenAt", "taken_at"), ("takenBy", "taken_by"),
            ("lat", "lat"), ("lng", "lng"), ("caption", "caption"), ("tags", "tags"), ("annotations", "annotations"),
            ("markerId", "marker_id"), ("sheetId", "sheet_id"), ("room", "room"), ("beforeId", "before_id"),
            ("checklistId", "checklist_id"), ("checklistItemId", "checklist_item_id"),
        ]),
        .photoComments: TableSpec(remote: "photo_comments", conflict: "id", columns: child + [("photoId", "photo_id"), ("author", "author"), ("text", "text")]),
        .checklists: TableSpec(remote: "checklists", conflict: "id", columns: child + [("name", "name"), ("items", "items")]),
        .jobLogs: TableSpec(remote: "job_logs", conflict: "id", columns: child + [
            ("date", "log_date"), ("title", "title"), ("body", "body"), ("author", "author"), ("photoIds", "photo_ids"),
            ("report", "report"),
        ]),
        .documents: TableSpec(remote: "job_documents", conflict: "id", columns: child + [("name", "name"), ("mime", "mime"), ("size", "size"), ("fileId", "file_id")]),
        .forms: TableSpec(remote: "job_forms", conflict: "id", columns: child + [
            ("templateId", "template_id"), ("name", "name"), ("template", "template"), ("status", "status"), ("values", "values"),
            ("signatures", "signatures"), ("sheetId", "sheet_id"), ("x", "x"), ("y", "y"), ("markerId", "marker_id"), ("photoIds", "photo_ids"),
            ("submittedBy", "submitted_by"), ("submittedAt", "submitted_at"), ("createdBy", "created_by"),
        ]),
        .tasks: TableSpec(remote: "tasks", conflict: "id", columns: child + [
            ("number", "number"), ("title", "title"), ("description", "description"), ("status", "status"), ("priority", "priority"),
            ("category", "category"), ("assignee", "assignee"), ("watchers", "watchers"), ("due", "due"), ("startDate", "start_date"),
            ("sheetId", "sheet_id"), ("x", "x"), ("y", "y"), ("markerId", "marker_id"), ("room", "room"), ("tags", "tags"),
            ("checklist", "checklist"), ("photoIds", "photo_ids"), ("activity", "activity"), ("createdBy", "created_by"),
            ("closedAt", "closed_at"), ("verifiedBy", "verified_by"), ("verifiedAt", "verified_at"),
        ]),
        // Quotes / invoices / credit notes and payments (docs/documents.md). Office only, pulled read-only.
        .salesDocs: TableSpec(remote: "sales_documents", conflict: "id", columns: child + [
            ("kind", "kind"), ("title", "title"), ("number", "number"), ("status", "status"), ("issueDate", "issue_date"), ("dueDate", "due_date"),
            ("validUntil", "valid_until"), ("termsDays", "terms_days"), ("client", "client"), ("lines", "lines"), ("discount", "discount"),
            ("taxes", "taxes"), ("fees", "fees"), ("deposit", "deposit"), ("deductions", "deductions"), ("currency", "currency"), ("notes", "notes"),
            ("terms", "terms"), ("footer", "footer"), ("internalNotes", "internal_notes"), ("options", "options"), ("subtotal", "subtotal"),
            ("discountTotal", "discount_total"), ("taxTotal", "tax_total"), ("total", "total"), ("amountPaid", "amount_paid"),
            ("balanceDue", "balance_due"), ("source", "source"), ("convertedFrom", "converted_from"), ("invoiceType", "invoice_type"),
            ("billedPct", "billed_pct"), ("shareToken", "share_token"), ("shareHash", "share_hash"), ("sentAt", "sent_at"), ("viewedAt", "viewed_at"),
            ("respondedAt", "responded_at"), ("signerName", "signer_name"), ("signature", "signature"), ("clientNote", "client_note"),
            ("paidAt", "paid_at"), ("voidedAt", "voided_at"),
        ]),
        .salesPayments: TableSpec(remote: "sales_document_payments", conflict: "id", columns: child + [
            ("documentId", "document_id"), ("amount", "amount"), ("date", "paid_on"), ("method", "method"), ("reference", "reference"),
            ("note", "note"), ("voided", "voided"),
        ]),
        // RFIs (docs/rfis.md). Drafts made on this device go up; the rest is the office's (web).
        .rfis: TableSpec(remote: "rfis", conflict: "id", columns: child + [
            ("number", "number"), ("subject", "subject"), ("question", "question"), ("suggestion", "suggestion"), ("status", "status"),
            ("ballInCourt", "ball_in_court"), ("priority", "priority"), ("costImpact", "cost_impact"), ("scheduleImpact", "schedule_impact"),
            ("toName", "to_name"), ("toEmail", "to_email"), ("toCompany", "to_company"), ("cc", "cc"), ("due", "due"), ("sheetId", "sheet_id"),
            ("x", "x"), ("y", "y"), ("markerId", "marker_id"), ("taskId", "task_id"), ("photoIds", "photo_ids"), ("documentIds", "document_ids"),
            ("answer", "answer"), ("answeredBy", "answered_by"), ("answeredAt", "answered_at"), ("shareToken", "share_token"), ("sentAt", "sent_at"),
            ("closedAt", "closed_at"), ("createdBy", "created_by"), ("sender", "sender"),
        ]),
        // Job schedule (docs/schedule-lookahead.md). `start`/`end` are reserved words in SQL, hence start_date/end_date.
        .scheduleItems: TableSpec(remote: "schedule_items", conflict: "id", columns: child + [
            ("name", "name"), ("phase", "phase"), ("start", "start_date"), ("end", "end_date"), ("crew", "crew"), ("hoursPlanned", "hours_planned"),
            ("progress", "progress"), ("color", "color"), ("dependsOn", "depends_on"), ("sheetIds", "sheet_ids"), ("notes", "notes"),
            ("sort", "sort_order"), ("workdaysOnly", "workdays_only"),
        ]),
        // Saved measurements (docs/saved-measurements.md).
        .measurements: TableSpec(remote: "measurements", conflict: "id", columns: child + [
            ("sheetId", "sheet_id"), ("kind", "kind"), ("points", "points"), ("label", "label"), ("color", "color"), ("extraFt", "extra_ft"),
            ("wastePct", "waste_pct"), ("notes", "notes"), ("author", "author"),
        ]),
        // Plan links (docs/sheet-index-links.md).
        .sheetLinks: TableSpec(remote: "sheet_links", conflict: "id", columns: child + [
            ("sheetId", "sheet_id"), ("x", "x"), ("y", "y"), ("w", "w"), ("h", "h"), ("target", "target"), ("label", "label"), ("auto", "auto"),
        ]),
        // Plan markups (docs/plan-markups.md): redlines; never counted.
        .planMarkups: TableSpec(remote: "plan_markups", conflict: "id", columns: child + [
            ("sheetId", "sheet_id"), ("kind", "kind"), ("points", "points"), ("text", "text"), ("color", "color"), ("width", "width"),
            ("fontSize", "font_size"), ("layer", "layer"), ("private", "private"), ("author", "author"), ("authorId", "author_id"),
        ]),
    ]

    /// Parents before children so foreign keys and row security pass (the web app's order). Pulls run in this order too.
    public static let pushOrder: [SyncTable] = [.projects, .projectFinance, .deviceTypes, .deviceTypePrices, .products, .productPrices, .sheets, .closets, .markers, .runs, .estimateLines,
                                                 .photos, .photoComments, .checklists, .jobLogs, .documents, .salesDocs, .salesPayments,
                                                 .rfis, .scheduleItems, .forms, .measurements, .sheetLinks, .tasks, .planMarkups]
    /// Tables this app only reads: made and changed on the web. Rows here are never sent.
    public static let pullOnly: Set<SyncTable> = [.salesDocs, .salesPayments, .scheduleItems, .measurements, .sheetLinks, .planMarkups]
    /// Tables only people who may see prices pull (the database hides them from technicians anyway).
    public static let pricesOnly: Set<SyncTable> = [.estimateLines, .salesDocs, .salesPayments, .deviceTypePrices, .productPrices, .projectFinance]
    /// The price table of a row whose prices are kept apart (office only).
    public static let priceTable: [SyncTable: SyncTable] = [.projects: .projectFinance, .deviceTypes: .deviceTypePrices, .products: .productPrices]
    /// Columns read on pull besides the spec's own (never sent).
    public static let readOnlyColumns: [SyncTable: [String]] = [.sheets: ["image_path"]]

    /// The columns a pull asks for: never '*' (the server may hold columns this device must not read, like the old price
    /// columns), and never a column in `missing` (one the cloud database doesn't have yet).
    public static func selectColumns(_ t: SyncTable, missing: Set<String> = []) -> String {
        var seen = Set<String>()
        let all = specs[t]!.columns.map(\.remote) + (readOnlyColumns[t] ?? []) + ["synced_at"]
        return all.filter { !missing.contains($0) && seen.insert($0).inserted }.joined(separator: ",")
    }

    /// PostgREST query for one page of a table: named columns, ordered by (synced_at, the row's key).
    public static func pullQuery(_ t: SyncTable, _ cur: SyncPaging.Cursor, missing: Set<String> = [], pageSize: Int = SyncPaging.pageSize) -> String {
        let since = cur.since.addingPercentEncoding(withAllowedCharacters: .alphanumerics) ?? cur.since
        return "select=\(selectColumns(t, missing: missing))&synced_at=gte.\(since)&order=synced_at.asc,\(specs[t]!.idColumn).asc&offset=\(cur.skip)&limit=\(pageSize)"
    }

    /// PostgREST query for rows by id (rows to fetch again), with named columns.
    public static func byIdQuery(_ t: SyncTable, _ ids: [String], missing: Set<String> = []) -> String {
        let star = SyncPaging.byIdQuery(ids)
        let list = star.dropFirst("select=*&id=".count)
        return "select=\(selectColumns(t, missing: missing))&\(specs[t]!.idColumn)=\(list)"
    }

    /// Ids this app writes: letters, digits, - and _ (1 to 64). A pulled row whose id (or job id) is anything else is
    /// refused: ids become file names and storage paths on this device.
    public static func isSafeId(_ id: String) -> Bool {
        guard (1...64).contains(id.utf8.count) else { return false }
        return id.utf8.allSatisfy { c in (c >= 48 && c <= 57) || (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c == 45 || c == 95 }
    }

    /// Whether a pulled row may be merged: its id (and its job's id, when it has one) are safe.
    public static func isSafeRow(_ t: SyncTable, _ remote: [String: Any]) -> Bool {
        guard let id = remote[specs[t]!.idColumn] as? String, isSafeId(id) else { return false }
        if let pid = remote["project_id"], !(pid is NSNull) {
            guard let p = pid as? String, isSafeId(p) else { return false }
        }
        return true
    }

    /// Whether a row of `t` made or changed on this device goes up. RFIs: only drafts (sending one is done on the web).
    public static func pushes(_ t: SyncTable, _ json: [String: Any]) -> Bool {
        if pullOnly.contains(t) { return false }
        if t == .rfis { return (json["status"] as? String ?? "draft") == "draft" }
        return true
    }

    private static let timestampLike: Set<String> = ["takenAt", "submittedAt", "closedAt", "verifiedAt", "sentAt", "viewedAt", "respondedAt",
                                                     "voidedAt", "answeredAt"]

    private static let boolDefaults: Set<String> = ["deleted", "tentative", "removed", "archived", "voided", "auto", "private"]
    private static let timestampKeys: Set<String> = ["createdAt", "updatedAt"]

    /// Local JSON row → remote row. Unknown keys are dropped; missing values become null (booleans false).
    public static func toRemote(_ t: SyncTable, _ row: [String: Any]) -> [String: Any] {
        var out: [String: Any] = [:]
        for (local, remote) in specs[t]!.columns {
            if let v = row[local], !(v is NSNull) { out[remote] = v } else { out[remote] = boolDefaults.contains(local) ? false : NSNull() }
        }
        if t == .projectFinance, !(out["billdu_docs"] is [Any]) { out["billdu_docs"] = [Any]() }
        // markers.count: null (a normal pin) or 2…9999, which the database checks; a cleared count clears there too.
        if t == .markers {
            let n: Int? = (out["count"] as? NSNumber)?.intValue
            if let c = Marker.normalizeCount(n) { out["count"] = c } else { out["count"] = NSNull() }
        }
        if t == .deviceTypePrices || t == .productPrices {
            for k in ["unit_price", "labor_price"] where out[k] is NSNull { out[k] = 0 }
        }
        if t == .runs, !(out["points"] is [Any]) { out["points"] = [Any]() }
        if t == .forms {
            if out["status"] is NSNull { out["status"] = "draft" }
            if out["values"] is NSNull { out["values"] = [String: Any]() }
        }
        if t == .tasks {
            if out["status"] is NSNull { out["status"] = "open" }
            if out["title"] is NSNull { out["title"] = "" }
            if out["number"] is NSNull { out["number"] = 0 }
        }
        if t == .rfis {
            // NOT NULL columns.
            let defaults: [String: Any] = ["number": 0, "subject": "", "question": "", "status": "draft", "ball_in_court": "us"]
            for (k, v) in defaults where out[k] is NSNull { out[k] = v }
        }
        if (t == .measurements || t == .planMarkups), !(out["points"] is [Any]) { out["points"] = [Any]() }
        return out
    }

    /// Remote row laid over the local JSON row (keeps local-only keys; a remote null clears the field).
    public static func toLocal(_ t: SyncTable, _ remote: [String: Any], over existing: [String: Any]? = nil) -> [String: Any] {
        var out = existing ?? [:]
        for (local, col) in specs[t]!.columns {
            guard let v = remote[col] else { continue }
            if v is NSNull { out.removeValue(forKey: local); continue }
            // deleted=false is the same as no flag; keep rows identical to what this device writes.
            if local == "deleted", (v as? Bool) == false { out.removeValue(forKey: local); continue }
            out[local] = (timestampKeys.contains(local) || timestampLike.contains(local)) ? normalizeTimestamp(v as? String ?? "") : v
        }
        if t == .projects, out["billduDocs"] == nil { out["billduDocs"] = [Any]() }
        // Prices come from their own tables (office only): a catalog type or product new to this device starts at 0.
        if t == .deviceTypes || t == .products {
            for k in ["unitPrice", "laborPrice"] where out[k] == nil { out[k] = 0 }
        }
        if t == .runs, out["points"] == nil { out["points"] = [Any]() }
        if t == .markers {
            if out["notes"] == nil { out["notes"] = "" }
            if out["room"] == nil { out["room"] = "" }
        }
        if (t == .measurements || t == .planMarkups), out["points"] == nil { out["points"] = [Any]() }
        return out
    }

    /// Postgres "2026-11-15 16:59:33.12+00" / "…+00:00" → "2026-11-15T16:59:33.120Z".
    public static func normalizeTimestamp(_ s: String) -> String {
        let iso = ISO8601DateFormatter()
        iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let plain = ISO8601DateFormatter()
        plain.formatOptions = [.withInternetDateTime]
        let t = s.replacingOccurrences(of: " ", with: "T")
        if let d = iso.date(from: t) ?? plain.date(from: t) { return iso.string(from: d) }
        return s
    }

    public static func date(_ s: String?) -> Date {
        guard let s else { return .distantPast }
        let iso = ISO8601DateFormatter()
        iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let plain = ISO8601DateFormatter()
        plain.formatOptions = [.withInternetDateTime]
        return iso.date(from: s) ?? plain.date(from: s) ?? .distantPast
    }
}

/// Where this device may connect, and which servers get the sign-in. The Northpin server address and the cloud project
/// address must be https (plain http only in debug builds, for a server on the developer's own machine), and the
/// person's session token only goes to the server built into the app or one the person confirmed by hand.
public enum CloudEndpoint {
    /// The address as a URL, or nil when it can't be used: not https (http only with `allowHTTP`), no host, or a
    /// user name / password in it. A bare host ("pinplan.example.com") is taken as https.
    public static func url(_ raw: String, allowHTTP: Bool = false) -> URL? {
        let s = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !s.isEmpty else { return nil }
        let withScheme = s.range(of: "^[A-Za-z][A-Za-z0-9+.-]*://", options: .regularExpression) != nil ? s : "https://" + s
        guard let u = URL(string: withScheme), let scheme = u.scheme?.lowercased(), let host = u.host, !host.isEmpty else { return nil }
        guard scheme == "https" || (scheme == "http" && allowHTTP) else { return nil }
        guard u.user == nil, u.password == nil else { return nil }
        return u
    }

    /// The host part of an address, lower case ("" when there isn't one).
    public static func host(_ raw: String) -> String {
        url(raw, allowHTTP: true)?.host?.lowercased() ?? ""
    }

    /// Whether a request to `host` may carry the person's session: only the built-in server's host, or a host the
    /// person confirmed (Settings › More › Advanced).
    public static func mayCarrySession(host: String?, builtIn: String, confirmed: Set<String>) -> Bool {
        guard let h = host?.lowercased(), !h.isEmpty else { return false }
        if h == Self.host(builtIn) { return true }
        return confirmed.contains(h)
    }
}

/// What this device last exchanged with the server: a fingerprint per row, pull watermarks and uploaded images.
public struct SyncLedger: Codable, Sendable, Equatable {
    public var hashes: [String: String] = [:]
    public var watermarks: [String: String] = [:]
    public var uploadedImages: Set<String> = []
    /// The account this ledger belongs to. A ledger of another account is never used (its rows would look unsynced and
    /// be pushed into this account).
    public var userId: String?
    /// The team this device last synced as (nil: working alone or not known yet).
    public var teamId: String?
    /// Rows a pull fetched but couldn't apply yet (table → ids): fetched again by id on the next pull, so moving the
    /// watermark past them never loses them.
    public var retry: [String: [String]] = [:]
    /// When this device first saw each unsynced row change (row key → ISO time). Edits don't always stamp the row's
    /// own `updatedAt`, so this is the edit time sent with the row (never the time of the push): the server keeps the
    /// newer edit, and a row edited offline long ago doesn't beat a later edit made elsewhere.
    public var dirtyAt: [String: String] = [:]
    /// At most this many ids wait per table (the oldest go first).
    public static let retryLimit = 500

    public init(userId: String? = nil) { self.userId = userId }
    public static func key(_ t: SyncTable, _ id: String) -> String { "\(t.rawValue):\(id)" }

    /// How rows are fingerprinted. 2: a job's, catalog type's and product's fingerprint leaves out their prices (they
    /// went into price tables). A ledger saved before that sees those rows as changed once without an edit.
    public static let currentHashVersion = 2
    public var hashVersion = SyncLedger.currentHashVersion

    /// Note when the changed rows (all of them: `SyncState.changes(since:)`) were first seen changed (`now`). Rows already
    /// noted keep their time; rows no longer changed are forgotten. A row that only looks changed because it was never
    /// synced, or because the fingerprints changed in an update, isn't an edit made now: it keeps its own `updatedAt`
    /// (so it can't beat a newer edit made elsewhere).
    public mutating func noteDirty(_ rows: [SyncState.Row], now: String) {
        let rehashed: Set<SyncTable> = hashVersion < Self.currentHashVersion ? [.projects, .deviceTypes, .products] : []
        var next: [String: String] = [:]
        for r in rows {
            let k = Self.key(r.table, r.id)
            if let seen = dirtyAt[k] { next[k] = seen; continue }
            if hashes[k] == nil || rehashed.contains(r.table) {
                next[k] = (r.json["updatedAt"] as? String).flatMap { $0.isEmpty ? nil : $0 } ?? now
            } else {
                next[k] = now
            }
        }
        dirtyAt = next
        hashVersion = Self.currentHashVersion
    }

    /// The edit time of a row: the later of its own `updatedAt` and when this device saw it change. `fallback` only when
    /// the row has neither (it then goes up as changed now).
    public func editTime(_ r: SyncState.Row, fallback: String) -> String {
        let own = (r.json["updatedAt"] as? String).flatMap { $0.isEmpty ? nil : $0 }
        let seen = dirtyAt[Self.key(r.table, r.id)]
        switch (own, seen) {
        case let (o?, s?): return SyncMap.date(s) > SyncMap.date(o) ? s : o
        case let (o?, nil): return o
        case let (nil, s?): return s
        default: return fallback
        }
    }

    private enum CodingKeys: String, CodingKey { case hashes, watermarks, uploadedImages, userId, teamId, retry, dirtyAt, hashVersion }
    /// Ledgers saved by older versions (without the newer fields) still load.
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        hashes = (try? c.decodeIfPresent([String: String].self, forKey: .hashes)) ?? [:]
        watermarks = (try? c.decodeIfPresent([String: String].self, forKey: .watermarks)) ?? [:]
        uploadedImages = (try? c.decodeIfPresent(Set<String>.self, forKey: .uploadedImages)) ?? []
        userId = (try? c.decodeIfPresent(String.self, forKey: .userId)) ?? nil
        teamId = (try? c.decodeIfPresent(String.self, forKey: .teamId)) ?? nil
        retry = (try? c.decodeIfPresent([String: [String]].self, forKey: .retry)) ?? [:]
        dirtyAt = (try? c.decodeIfPresent([String: String].self, forKey: .dirtyAt)) ?? [:]
        // Saved before fingerprints left prices out: version 1.
        hashVersion = (try? c.decodeIfPresent(Int.self, forKey: .hashVersion)) ?? 1
    }

    /// The ledger saved for `userId`, or a fresh one when the saved ledger belongs to someone else.
    public static func load(_ data: Data?, for userId: String?) -> SyncLedger {
        guard let data, let l = try? JSONDecoder().decode(SyncLedger.self, from: data) else { return SyncLedger(userId: userId) }
        if let owner = l.userId, owner != userId { return SyncLedger(userId: userId) }
        var out = l
        out.userId = userId
        return out
    }

    /// Note the team this account is on now. Joining a team (or moving to another one) brings jobs that changed before
    /// this device's pull watermarks, so the watermarks are cleared and everything is pulled again once. Leaving a team
    /// clears nothing. Returns true when the watermarks were cleared. Mirrors noteTeamForSync in src/lib/team.ts.
    @discardableResult
    public mutating func noteTeam(_ teamId: String?) -> Bool {
        guard teamId != self.teamId else { return false }
        self.teamId = teamId
        guard teamId != nil else { return false }
        watermarks = [:]
        return true
    }

    /// Remember rows to fetch again by id on the next pull.
    public mutating func addRetry(_ t: SyncTable, _ ids: [String]) {
        guard !ids.isEmpty else { return }
        var list = retry[t.rawValue] ?? []
        for id in ids where !list.contains(id) { list.append(id) }
        if list.count > Self.retryLimit { list.removeFirst(list.count - Self.retryLimit) }
        retry[t.rawValue] = list
    }

    /// Rows that applied (or are gone from the server) no longer wait.
    public mutating func clearRetry(_ t: SyncTable, _ ids: Set<String>) {
        guard var list = retry[t.rawValue] else { return }
        list.removeAll { ids.contains($0) }
        retry[t.rawValue] = list.isEmpty ? nil : list
    }

    /// Photo / document files of a job that this device holds but hasn't uploaded yet.
    /// `hasLocal` says whether the file exists on this device (files pulled from elsewhere but not downloaded don't count).
    public func uploadBacklog(_ bundle: ProjectBundle, hasLocal: (_ fileId: String, _ isDocument: Bool) -> Bool) -> UploadBacklog {
        var seen = Set<String>()
        var out = UploadBacklog()
        for p in bundle.livePhotos where !uploadedImages.contains(p.imageId) && seen.insert(p.imageId).inserted && hasLocal(p.imageId, false) { out.photos += 1 }
        for d in bundle.liveDocuments where !uploadedImages.contains(d.fileId) && seen.insert(d.fileId).inserted && hasLocal(d.fileId, true) { out.documents += 1 }
        return out
    }
}

/// How many of a job's photos and documents are still waiting to upload from this device.
public struct UploadBacklog: Equatable, Sendable {
    public var photos = 0
    public var documents = 0
    public init(photos: Int = 0, documents: Int = 0) { self.photos = photos; self.documents = documents }
    public var total: Int { photos + documents }
    /// "3 photos and 1 file waiting to upload"; empty when nothing is waiting.
    public var summary: String {
        var parts: [String] = []
        if photos > 0 { parts.append("\(photos) photo\(photos == 1 ? "" : "s")") }
        if documents > 0 { parts.append("\(documents) file\(documents == 1 ? "" : "s")") }
        return parts.isEmpty ? "" : parts.joined(separator: " and ") + " waiting to upload"
    }
}

/// Everything this device holds locally that syncs.
public struct SyncState: Sendable {
    public var bundles: [String: ProjectBundle]
    public var catalog: [DeviceType]
    public var products: [Product]
    public init(bundles: [ProjectBundle], catalog: [DeviceType], products: [Product]) {
        self.bundles = Dictionary(bundles.map { ($0.project.id, $0) }, uniquingKeysWith: { a, _ in a })
        self.catalog = catalog
        self.products = products
    }

    public struct Row {
        public let table: SyncTable
        public let id: String
        public let projectId: String?
        public let json: [String: Any]
        public let hash: String
    }

    static func json<T: Encodable>(_ v: T) -> ([String: Any], String) {
        let enc = JSONEncoder()
        enc.outputFormatting = [.sortedKeys]
        let data = (try? enc.encode(v)) ?? Data()
        let obj = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] ?? [:]
        return (obj, fnv1a(data))
    }

    static func fnv1a(_ d: Data) -> String {
        var h: UInt64 = 0xcbf29ce484222325
        for b in d { h ^= UInt64(b); h = h &* 0x100000001b3 }
        return String(h, radix: 16)
    }

    // MARK: prices kept apart (office only)

    struct DeviceTypePriceRow: Codable { var id: String; var unitPrice: Double; var laborPrice: Double; var billduProductId: Int?; var updatedAt: String }
    struct ProductPriceRow: Codable { var id: String; var unitPrice: Double; var laborPrice: Double; var updatedAt: String }
    struct ProjectFinanceRow: Codable { var id: String; var pricing: PricingOverrides?; var billduDocs: [BillduDocRef]; var billduClientId: Int?; var updatedAt: String }

    /// A price row's JSON and fingerprint. The fingerprint leaves out `updatedAt`: editing a type's name mustn't send its
    /// prices again.
    static func priceJSON<T: Codable>(_ row: T, clear: (inout T) -> Void) -> ([String: Any], String) {
        var bare = row
        clear(&bare)
        return (json(row).0, json(bare).1)
    }
    static func priceRow(_ d: DeviceType) -> ([String: Any], String) {
        priceJSON(DeviceTypePriceRow(id: d.id, unitPrice: d.unitPrice, laborPrice: d.laborPrice, billduProductId: d.billduProductId, updatedAt: d.updatedAt)) { $0.updatedAt = "" }
    }
    static func priceRow(_ p: Product) -> ([String: Any], String) {
        priceJSON(ProductPriceRow(id: p.id, unitPrice: p.unitPrice, laborPrice: p.laborPrice, updatedAt: p.updatedAt)) { $0.updatedAt = "" }
    }
    static func priceRow(_ p: Project) -> ([String: Any], String) {
        priceJSON(ProjectFinanceRow(id: p.id, pricing: p.pricing, billduDocs: p.billduDocs, billduClientId: p.billduClientId, updatedAt: p.updatedAt)) { $0.updatedAt = "" }
    }

    /// The JSON (whole, prices included: merges build on it) and fingerprint of a row. The fingerprint of a job, a
    /// catalog type or a product leaves its prices out: they go up in their own price table, office only.
    static func rowJSON(_ t: SyncTable, _ v: some Encodable) -> ([String: Any], String) {
        let (j, h) = json(v)
        switch v {
        case var d as DeviceType where t == .deviceTypes:
            d.unitPrice = 0; d.laborPrice = 0; d.billduProductId = nil
            return (j, json(d).1)
        case var p as Product where t == .products:
            p.unitPrice = 0; p.laborPrice = 0
            return (j, json(p).1)
        case var p as Project where t == .projects:
            p.pricing = nil; p.billduDocs = []; p.billduClientId = nil
            return (j, json(p).1)
        default:
            return (j, h)
        }
    }

    /// Techs: forget every price on this device (they never come back for a technician), without sending anything: the
    /// catalog's and products' prices, each job's pricing and Billdu links, its estimate lines, quotes, invoices and
    /// payments (left over when an office member becomes a technician). The pull watermarks of the price tables are
    /// reset, so moving back to the office brings them all down again. True when something changed.
    @discardableResult
    public mutating func dropPrices(ledger: inout SyncLedger) -> Bool {
        var changed = false
        for i in catalog.indices where catalog[i].unitPrice != 0 || catalog[i].laborPrice != 0 || catalog[i].billduProductId != nil {
            catalog[i].unitPrice = 0; catalog[i].laborPrice = 0; catalog[i].billduProductId = nil; changed = true
        }
        for i in products.indices where products[i].unitPrice != 0 || products[i].laborPrice != 0 {
            products[i].unitPrice = 0; products[i].laborPrice = 0; changed = true
        }
        for id in bundles.keys {
            var b = bundles[id]!
            guard b.project.pricing != nil || !b.project.billduDocs.isEmpty || b.project.billduClientId != nil
                || !b.estimateLines.isEmpty || !b.salesDocs.isEmpty || !b.salesPayments.isEmpty else { continue }
            b.project.pricing = nil; b.project.billduDocs = []; b.project.billduClientId = nil
            b.estimateLines = []; b.salesDocs = []; b.salesPayments = []
            bundles[id] = b
            changed = true
        }
        let priceTables: Set<SyncTable> = [.deviceTypePrices, .productPrices, .projectFinance]
        markSynced(rows().filter { priceTables.contains($0.table) }, ledger: &ledger)
        for t in SyncMap.pricesOnly {
            ledger.watermarks.removeValue(forKey: t.rawValue)
            ledger.retry.removeValue(forKey: t.rawValue)
        }
        return changed
    }

    /// Every syncing row with its fingerprint.
    public func rows() -> [Row] {
        var out: [Row] = []
        func add<T: Encodable>(_ t: SyncTable, _ id: String, _ pid: String?, _ v: T) {
            let (j, h) = Self.rowJSON(t, v)
            out.append(Row(table: t, id: id, projectId: pid, json: j, hash: h))
        }
        func addPrice(_ t: SyncTable, _ id: String, _ pid: String?, _ jh: ([String: Any], String)) {
            out.append(Row(table: t, id: id, projectId: pid, json: jh.0, hash: jh.1))
        }
        for b in bundles.values.sorted(by: { $0.project.id < $1.project.id }) {
            let pid = b.project.id
            add(.projects, pid, pid, b.project)
            addPrice(.projectFinance, pid, pid, Self.priceRow(b.project))
            for s in b.sheets { add(.sheets, s.id, pid, s) }
            for c in b.closets { add(.closets, c.id, pid, c) }
            for m in b.markers { add(.markers, m.id, pid, m) }
            for r in b.runs { add(.runs, r.id, pid, r) }
            for l in b.estimateLines { add(.estimateLines, l.id, pid, l) }
            for x in b.photos { add(.photos, x.id, pid, x) }
            for x in b.photoComments { add(.photoComments, x.id, pid, x) }
            for x in b.checklists { add(.checklists, x.id, pid, x) }
            for x in b.jobLogs { add(.jobLogs, x.id, pid, x) }
            for x in b.documents { add(.documents, x.id, pid, x) }
            for x in b.forms { add(.forms, x.id, pid, x) }
            for x in b.tasks { add(.tasks, x.id, pid, x) }
            for x in b.salesDocs { add(.salesDocs, x.id, pid, x) }
            for x in b.salesPayments { add(.salesPayments, x.id, pid, x) }
            for x in b.rfis { add(.rfis, x.id, pid, x) }
            for x in b.scheduleItems { add(.scheduleItems, x.id, pid, x) }
            for x in b.measurements { add(.measurements, x.id, pid, x) }
            for x in b.sheetLinks { add(.sheetLinks, x.id, pid, x) }
            for x in b.planMarkups { add(.planMarkups, x.id, pid, x) }
        }
        for d in catalog {
            add(.deviceTypes, d.id, nil, d)
            addPrice(.deviceTypePrices, d.id, nil, Self.priceRow(d))
        }
        for p in products {
            add(.products, p.id, nil, p)
            addPrice(.productPrices, p.id, nil, Self.priceRow(p))
        }
        return out
    }

    /// Rows changed since the last sync, in push order. Rows of tables this app only reads are left out.
    public func changes(since ledger: SyncLedger) -> [Row] {
        let all = rows().filter { ledger.hashes[SyncLedger.key($0.table, $0.id)] != $0.hash && SyncMap.pushes($0.table, $0.json) }
        return SyncMap.pushOrder.flatMap { t in all.filter { $0.table == t } }
    }

    /// Projects this device synced before that are now gone locally (deleted here): to mark deleted on the server.
    public func removedProjects(since ledger: SyncLedger) -> [String] {
        ledger.hashes.keys.compactMap { k in
            guard k.hasPrefix("projects:") else { return nil }
            let id = String(k.dropFirst("projects:".count))
            return bundles[id] == nil ? id : nil
        }.sorted()
    }

    private func local(_ t: SyncTable, _ id: String, projectId: String?) -> ([String: Any], String)? {
        func pick<T: Encodable & Identifiable>(_ xs: [T]) -> ([String: Any], String)? where T.ID == String { xs.first { $0.id == id }.map { Self.rowJSON(t, $0) } }
        switch t {
        case .deviceTypes: return pick(catalog)
        case .products: return pick(products)
        case .projects: return bundles[id].map { Self.rowJSON(t, $0.project) }
        case .deviceTypePrices: return catalog.first { $0.id == id }.map(Self.priceRow)
        case .productPrices: return products.first { $0.id == id }.map(Self.priceRow)
        case .projectFinance: return bundles[id].map { Self.priceRow($0.project) }
        default:
            guard let pid = projectId, let b = bundles[pid] else { return nil }
            switch t {
            case .sheets: return pick(b.sheets)
            case .closets: return pick(b.closets)
            case .markers: return pick(b.markers)
            case .runs: return pick(b.runs)
            case .estimateLines: return pick(b.estimateLines)
            case .photos: return pick(b.photos)
            case .photoComments: return pick(b.photoComments)
            case .checklists: return pick(b.checklists)
            case .jobLogs: return pick(b.jobLogs)
            case .documents: return pick(b.documents)
            case .forms: return pick(b.forms)
            case .tasks: return pick(b.tasks)
            case .salesDocs: return pick(b.salesDocs)
            case .salesPayments: return pick(b.salesPayments)
            case .rfis: return pick(b.rfis)
            case .scheduleItems: return pick(b.scheduleItems)
            case .measurements: return pick(b.measurements)
            case .sheetLinks: return pick(b.sheetLinks)
            case .planMarkups: return pick(b.planMarkups)
            default: return nil
            }
        }
    }

    /// `skipped`: nothing to do with the row (a deletion of something not here, no id). `unreadable`: this build couldn't
    /// read the row — fetch it again later. `orphan`: its job isn't on this device (yet). `refused`: its id (or its job's)
    /// isn't one this app makes, so it never reaches this device's files (counted, never fetched again).
    public enum MergeResult: Equatable { case applied, keptLocal, skipped, removedProject, unreadable, orphan, refused }

    /// Whether a merge result means the row should be fetched again on a later pull.
    public static func needsRetry(_ r: MergeResult, parentsFailed: Bool) -> Bool {
        r == .unreadable || (r == .orphan && parentsFailed)
    }

    /// Merge one remote row. Remote wins when this device hasn't changed the row since the last sync, or when it is newer.
    @discardableResult
    public mutating func merge(_ t: SyncTable, remote: [String: Any], ledger: inout SyncLedger) -> MergeResult {
        guard let spec = SyncMap.specs[t], let id = remote[spec.idColumn] as? String else { return .skipped }
        // Ids become file names and storage paths here: anything but letters, digits, - and _ is refused.
        guard SyncMap.isSafeRow(t, remote) else { return .refused }
        let pid = (t == .projects || t == .projectFinance) ? id : remote["project_id"] as? String
        let key = SyncLedger.key(t, id)
        let existing = local(t, id, projectId: pid)
        if let (json, hash) = existing, ledger.hashes[key] != hash {
            // Changed here since the last sync: keep ours unless the server copy is newer than the edit.
            let remoteAt = SyncMap.date(SyncMap.normalizeTimestamp(remote["updated_at"] as? String ?? ""))
            let row = Row(table: t, id: id, projectId: pid, json: json, hash: hash)
            if remoteAt <= SyncMap.date(ledger.editTime(row, fallback: "")) { return .keptLocal }
        }
        ledger.dirtyAt.removeValue(forKey: key)
        if t == .deviceTypePrices || t == .productPrices || t == .projectFinance {
            return mergePrices(t, id: id, key: key, remote: remote, ledger: &ledger)
        }
        if t == .projects, (remote["deleted"] as? Bool) == true {
            if bundles.removeValue(forKey: id) != nil {
                // Exactly this job's key: a prefix match would also drop "projects:p10" when "p1" goes.
                ledger.hashes.removeValue(forKey: key)
                return .removedProject
            }
            return .skipped
        }
        var base = existing?.0
        // A new drawing for the sheet: the PDF detail kept for the old one no longer matches it.
        if t == .sheets, var b = base, let img = remote["image_id"] as? String, img != b["imageId"] as? String {
            for k in ["sourcePdfId", "sourcePage", "sourceRotation"] { b.removeValue(forKey: k) }
            base = b
        }
        let merged = SyncMap.toLocal(t, remote, over: base)
        guard let data = try? JSONSerialization.data(withJSONObject: merged) else { return .unreadable }
        let dec = JSONDecoder()
        func put<T: Codable & Identifiable>(_ xs: inout [T]) -> Bool where T.ID == String {
            guard let v = try? dec.decode(T.self, from: data) else { return false }
            if let i = xs.firstIndex(where: { $0.id == id }) { xs[i] = v } else { xs.append(v) }
            ledger.hashes[key] = Self.rowJSON(t, v).1
            return true
        }
        /// A row new to this device has no prices of its own here yet: its price row isn't a change to send (the
        /// office's prices come down from the price table).
        func seedPrices(_ pt: SyncTable, _ hash: String) {
            let pk = SyncLedger.key(pt, id)
            if existing == nil, ledger.hashes[pk] == nil { ledger.hashes[pk] = hash }
        }
        var ok = false
        switch t {
        case .deviceTypes:
            ok = put(&catalog)
            if ok, let d = catalog.first(where: { $0.id == id }) { seedPrices(.deviceTypePrices, Self.priceRow(d).1) }
        case .products:
            ok = put(&products)
            if ok, let p = products.first(where: { $0.id == id }) { seedPrices(.productPrices, Self.priceRow(p).1) }
        case .projects:
            guard let p = try? dec.decode(Project.self, from: data) else { return .unreadable }
            if bundles[id] != nil { bundles[id]!.project = p } else { bundles[id] = ProjectBundle(project: p) }
            ledger.hashes[key] = Self.rowJSON(t, p).1
            seedPrices(.projectFinance, Self.priceRow(p).1)
            ok = true
        default:
            guard let pid, var b = bundles[pid] else { return (remote["deleted"] as? Bool) == true ? .skipped : .orphan }
            switch t {
            case .sheets: ok = put(&b.sheets); b.sheets.sort { $0.order < $1.order }
            case .closets: ok = put(&b.closets)
            case .markers: ok = put(&b.markers)
            case .runs: ok = put(&b.runs)
            case .estimateLines: ok = put(&b.estimateLines)
            case .photos: ok = put(&b.photos)
            case .photoComments: ok = put(&b.photoComments)
            case .checklists: ok = put(&b.checklists)
            case .jobLogs: ok = put(&b.jobLogs)
            case .documents: ok = put(&b.documents)
            case .forms: ok = put(&b.forms)
            case .tasks: ok = put(&b.tasks)
            case .salesDocs: ok = put(&b.salesDocs)
            case .salesPayments: ok = put(&b.salesPayments)
            case .rfis: ok = put(&b.rfis)
            case .scheduleItems: ok = put(&b.scheduleItems)
            case .measurements: ok = put(&b.measurements)
            case .sheetLinks: ok = put(&b.sheetLinks)
            case .planMarkups: ok = put(&b.planMarkups)
            default: break
            }
            bundles[pid] = b
        }
        return ok ? .applied : .unreadable
    }

    /// A pulled price row (office only) laid over its catalog type, product or job. Only the price fields change: the
    /// row's own `updatedAt` stays, so the row itself isn't sent again.
    private mutating func mergePrices(_ t: SyncTable, id: String, key: String, remote: [String: Any], ledger: inout SyncLedger) -> MergeResult {
        let fields = SyncMap.specs[t]!.columns.filter { $0.local != "id" && $0.local != "updatedAt" }
        func overlay<T: Codable>(_ v: T) -> T? {
            var j = Self.json(v).0
            for (local, col) in fields {
                guard let x = remote[col] else { continue }
                if x is NSNull { j.removeValue(forKey: local) } else { j[local] = x }
            }
            if t == .projectFinance, !(j["billduDocs"] is [Any]) { j["billduDocs"] = [Any]() }
            for k in ["unitPrice", "laborPrice"] where t != .projectFinance && j[k] == nil { j[k] = 0 }
            guard let data = try? JSONSerialization.data(withJSONObject: j) else { return nil }
            return try? JSONDecoder().decode(T.self, from: data)
        }
        switch t {
        case .deviceTypePrices:
            guard let i = catalog.firstIndex(where: { $0.id == id }) else { return .orphan }
            guard let v = overlay(catalog[i]) else { return .unreadable }
            catalog[i] = v
            ledger.hashes[key] = Self.priceRow(v).1
        case .productPrices:
            guard let i = products.firstIndex(where: { $0.id == id }) else { return .orphan }
            guard let v = overlay(products[i]) else { return .unreadable }
            products[i] = v
            ledger.hashes[key] = Self.priceRow(v).1
        case .projectFinance:
            guard let b = bundles[id] else { return .orphan }
            guard let v = overlay(b.project) else { return .unreadable }
            bundles[id]!.project = v
            ledger.hashes[key] = Self.priceRow(v).1
        default:
            return .skipped
        }
        return .applied
    }

    /// Record that these rows are now on the server as they are here.
    public func markSynced(_ rows: [Row], ledger: inout SyncLedger) {
        for r in rows {
            let k = SyncLedger.key(r.table, r.id)
            ledger.hashes[k] = r.hash
            ledger.dirtyAt.removeValue(forKey: k)
        }
    }
}

/// Signing in on a device that holds another account's jobs. Those jobs must never be pushed into the new account,
/// so the person is asked first: remove them from this device, or sign out.
public enum AccountSwitch {
    public enum Decision: Equatable, Sendable {
        /// Sync as usual (this account's data, or nothing on the device yet).
        case proceed
        /// The device holds jobs of another account: ask before syncing (and remove them from this device to go on).
        case askToRemoveLocalJobs
    }

    /// - Parameters:
    ///   - dataOwner: the account the jobs on this device were last synced with (nil: never recorded).
    ///   - signingIn: the account signing in.
    ///   - hasLocalJobs: jobs are on this device.
    ///   - otherAccountLedgers: this device has sync records of another account (devices from before the owner was recorded).
    ///   - ownLedger: this device has a sync record of `signingIn`.
    public static func decide(dataOwner: String?, signingIn: String, hasLocalJobs: Bool, otherAccountLedgers: Bool = false, ownLedger: Bool = false) -> Decision {
        guard hasLocalJobs else { return .proceed }
        return isOtherAccount(dataOwner: dataOwner, signingIn: signingIn, otherAccountLedgers: otherAccountLedgers, ownLedger: ownLedger)
            ? .askToRemoveLocalJobs : .proceed
    }

    /// Whether what this device holds was last synced with another account than `signingIn`.
    public static func isOtherAccount(dataOwner: String?, signingIn: String, otherAccountLedgers: Bool = false, ownLedger: Bool = false) -> Bool {
        if let owner = dataOwner { return owner != signingIn }
        // Not recorded (first sign-in, or a device from before this check): jobs made signed out belong to whoever
        // signs in first. Only another account's earlier sync, with none of this account's, means they're someone else's.
        return otherAccountLedgers && !ownLedger
    }

    /// Keep the catalog and products on this device without sending them: they came from another account, so they are
    /// marked as already on the server (this account's own copies come down and replace them).
    public static func keepWithoutSending(_ catalog: [DeviceType], products: [Product], in ledger: inout SyncLedger) {
        let s = SyncState(bundles: [], catalog: catalog, products: products)
        s.markSynced(s.rows(), ledger: &ledger)
    }

    /// What the device keeps after removing the other account's jobs: the catalog and products stay, but are marked as
    /// already on the server so they aren't pushed into the new account (the new account's own copies come down).
    public static func freshLedger(for userId: String, keeping catalog: [DeviceType], products: [Product]) -> SyncLedger {
        var l = SyncLedger(userId: userId)
        keepWithoutSending(catalog, products: products, in: &l)
        return l
    }
}
