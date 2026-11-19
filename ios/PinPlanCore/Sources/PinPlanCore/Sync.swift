import Foundation

/// Rows synced with Supabase — the same tables and columns as the web app (src/lib/syncMap.ts).
public enum SyncTable: String, CaseIterable, Codable, Sendable {
    case projects, deviceTypes, products, sheets, closets, markers, runs, estimateLines
    case photos, photoComments, checklists, jobLogs, documents
    case forms
    case tasks
    /// Made on the web, pulled here (FieldSync.swift / SalesDocs.swift). See `SyncMap.pullOnly`.
    case salesDocs, salesPayments, rfis, scheduleItems, measurements, sheetLinks, planMarkups
}

public struct TableSpec: Sendable {
    public let remote: String
    public let conflict: String
    /// Local (JSON) key → remote column. Only these are sent and read.
    public let columns: [(local: String, remote: String)]
}

public enum SyncMap {
    private static let common: [(String, String)] = [("id", "id"), ("createdAt", "created_at"), ("updatedAt", "updated_at"), ("deleted", "deleted")]
    private static let child = common + [("projectId", "project_id")]

    public static let specs: [SyncTable: TableSpec] = [
        .projects: TableSpec(remote: "projects", conflict: "id", columns: common + [
            ("clientName", "client_name"), ("clientEmail", "client_email"), ("clientPhone", "client_phone"), ("address", "address"),
            ("status", "status"), ("notes", "notes"), ("billduClientId", "billdu_client_id"), ("billduDocs", "billdu_docs"),
            ("pricing", "pricing"), ("productChoices", "product_choices"), ("labels", "labels"), ("lat", "lat"), ("lng", "lng"),
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
            ("icon", "icon"), ("abbrev", "abbrev"), ("shape", "shape"), ("color", "color"), ("unit", "unit"), ("unitPrice", "unit_price"),
            ("laborPrice", "labor_price"), ("defaultWire", "default_wire"), ("defaultMount", "default_mount"), ("kind", "kind"),
            ("billduProductId", "billdu_product_id"), ("sort", "sort_order"), ("archived", "archived"),
        ]),
        .products: TableSpec(remote: "products", conflict: "owner_id,id", columns: [
            ("id", "id"), ("updatedAt", "updated_at"), ("deleted", "deleted"), ("deviceTypeId", "device_type_id"), ("brand", "brand"),
            ("model", "model"), ("sku", "sku"), ("unitPrice", "unit_price"), ("laborPrice", "labor_price"), ("notes", "notes"), ("archived", "archived"),
        ]),
        .markers: TableSpec(remote: "markers", conflict: "id", columns: child + [
            ("sheetId", "sheet_id"), ("deviceTypeId", "device_type_id"), ("x", "x"), ("y", "y"), ("label", "label"), ("room", "room"),
            ("mount", "mount"), ("wireType", "wire_type"), ("wires", "wires"), ("productId", "product_id"), ("closetId", "closet_id"),
            ("circuit", "circuit"), ("tentative", "tentative"), ("notes", "notes"), ("photoId", "photo_id"),
            ("install", "install"),
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
    public static let pushOrder: [SyncTable] = [.projects, .deviceTypes, .products, .sheets, .closets, .markers, .runs, .estimateLines,
                                                 .photos, .photoComments, .checklists, .jobLogs, .documents, .salesDocs, .salesPayments,
                                                 .rfis, .scheduleItems, .forms, .measurements, .sheetLinks, .tasks, .planMarkups]
    /// Tables this app only reads: made and changed on the web. Rows here are never sent.
    public static let pullOnly: Set<SyncTable> = [.salesDocs, .salesPayments, .scheduleItems, .measurements, .sheetLinks, .planMarkups]
    /// Tables only people who may see prices pull (the database hides them from technicians anyway).
    public static let pricesOnly: Set<SyncTable> = [.estimateLines, .salesDocs, .salesPayments]

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
        if t == .projects, !(out["billdu_docs"] is [Any]) { out["billdu_docs"] = [Any]() }
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
    /// At most this many ids wait per table (the oldest go first).
    public static let retryLimit = 500

    public init(userId: String? = nil) { self.userId = userId }
    public static func key(_ t: SyncTable, _ id: String) -> String { "\(t.rawValue):\(id)" }

    private enum CodingKeys: String, CodingKey { case hashes, watermarks, uploadedImages, userId, teamId, retry }
    /// Ledgers saved by older versions (without the newer fields) still load.
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        hashes = (try? c.decodeIfPresent([String: String].self, forKey: .hashes)) ?? [:]
        watermarks = (try? c.decodeIfPresent([String: String].self, forKey: .watermarks)) ?? [:]
        uploadedImages = (try? c.decodeIfPresent(Set<String>.self, forKey: .uploadedImages)) ?? []
        userId = (try? c.decodeIfPresent(String.self, forKey: .userId)) ?? nil
        teamId = (try? c.decodeIfPresent(String.self, forKey: .teamId)) ?? nil
        retry = (try? c.decodeIfPresent([String: [String]].self, forKey: .retry)) ?? [:]
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

    /// Every syncing row with its fingerprint.
    public func rows() -> [Row] {
        var out: [Row] = []
        func add<T: Encodable>(_ t: SyncTable, _ id: String, _ pid: String?, _ v: T) {
            let (j, h) = Self.json(v)
            out.append(Row(table: t, id: id, projectId: pid, json: j, hash: h))
        }
        for b in bundles.values.sorted(by: { $0.project.id < $1.project.id }) {
            let pid = b.project.id
            add(.projects, pid, pid, b.project)
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
        for d in catalog { add(.deviceTypes, d.id, nil, d) }
        for p in products { add(.products, p.id, nil, p) }
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
        func pick<T: Encodable & Identifiable>(_ xs: [T]) -> ([String: Any], String)? where T.ID == String { xs.first { $0.id == id }.map(Self.json) }
        switch t {
        case .deviceTypes: return pick(catalog)
        case .products: return pick(products)
        case .projects: return bundles[id].map { Self.json($0.project) }
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
    /// read the row — fetch it again later. `orphan`: its job isn't on this device (yet).
    public enum MergeResult: Equatable { case applied, keptLocal, skipped, removedProject, unreadable, orphan }

    /// Whether a merge result means the row should be fetched again on a later pull.
    public static func needsRetry(_ r: MergeResult, parentsFailed: Bool) -> Bool {
        r == .unreadable || (r == .orphan && parentsFailed)
    }

    /// Merge one remote row. Remote wins when this device hasn't changed the row since the last sync, or when it is newer.
    @discardableResult
    public mutating func merge(_ t: SyncTable, remote: [String: Any], ledger: inout SyncLedger) -> MergeResult {
        guard let id = remote["id"] as? String else { return .skipped }
        let pid = (t == .projects) ? id : remote["project_id"] as? String
        let key = SyncLedger.key(t, id)
        let existing = local(t, id, projectId: pid)
        if let (json, hash) = existing, ledger.hashes[key] != hash {
            // Changed here since the last sync: keep ours unless the server copy is newer.
            let remoteAt = SyncMap.date(SyncMap.normalizeTimestamp(remote["updated_at"] as? String ?? ""))
            if remoteAt <= SyncMap.date(json["updatedAt"] as? String) { return .keptLocal }
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
            ledger.hashes[key] = Self.json(v).1
            return true
        }
        var ok = false
        switch t {
        case .deviceTypes: ok = put(&catalog)
        case .products: ok = put(&products)
        case .projects:
            guard let p = try? dec.decode(Project.self, from: data) else { return .unreadable }
            if bundles[id] != nil { bundles[id]!.project = p } else { bundles[id] = ProjectBundle(project: p) }
            ledger.hashes[key] = Self.json(p).1
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

    /// Record that these rows are now on the server as they are here.
    public func markSynced(_ rows: [Row], ledger: inout SyncLedger) {
        for r in rows { ledger.hashes[SyncLedger.key(r.table, r.id)] = r.hash }
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
        if let owner = dataOwner { return owner == signingIn ? .proceed : .askToRemoveLocalJobs }
        // Not recorded (first sign-in, or a device from before this check): jobs made signed out belong to whoever
        // signs in first. Only another account's earlier sync, with none of this account's, means they're someone else's.
        return otherAccountLedgers && !ownLedger ? .askToRemoveLocalJobs : .proceed
    }

    /// What the device keeps after removing the other account's jobs: the catalog and products stay, but are marked as
    /// already on the server so they aren't pushed into the new account (the new account's own copies come down).
    public static func freshLedger(for userId: String, keeping catalog: [DeviceType], products: [Product]) -> SyncLedger {
        var l = SyncLedger(userId: userId)
        let s = SyncState(bundles: [], catalog: catalog, products: products)
        s.markSynced(s.rows(), ledger: &l)
        return l
    }
}
