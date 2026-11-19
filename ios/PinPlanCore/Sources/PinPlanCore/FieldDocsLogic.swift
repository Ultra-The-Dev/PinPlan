import Foundation

/// Checklist templates, checklist progress, tags, photo filters and the job timeline (same as src/lib/fieldDocs.ts).
public enum FieldDocs {
    public struct Template: Identifiable, Sendable {
        public let id: String
        public let name: String
        public let items: [(text: String, requiresPhoto: Bool)]
    }

    public static let templates: [Template] = [
        Template(id: "prewire", name: "Pre-wire walkthrough", items: [
            ("Low-voltage brackets / mud rings at every device location", true),
            ("Speaker and TV back boxes, blocking in place", true),
            ("Every cable labeled at both ends", true),
            ("All cables home-run to the equipment closet", true),
            ("Exterior camera locations prewired and sealed", true),
            ("Photos of every open wall before insulation / drywall", true),
            ("Walkthrough with GC / client done", false),
        ]),
        Template(id: "trim", name: "Trim-out", items: [
            ("Cameras mounted, aimed and focused", true),
            ("Wi-Fi access points mounted", true),
            ("Speakers installed, grilles on", true),
            ("TVs mounted and level", true),
            ("Keypads / touch panels installed", false),
            ("LED strips and drivers installed and tested", true),
            ("Wall plates and jacks finished", false),
        ]),
        Template(id: "rack", name: "Equipment closet / rack", items: [
            ("Rack mounted and secured", true),
            ("Patch panel terminated and labeled", true),
            ("Router, switches and NVR installed", false),
            ("Cable management dressed", true),
            ("UPS / surge protection installed", false),
            ("Final rack photos, front and back", true),
        ]),
        Template(id: "final", name: "Final walkthrough & handoff", items: [
            ("Every device tested", false),
            ("Wi-Fi coverage checked in every room", false),
            ("All cameras viewable in the app", true),
            ("Client trained on the apps", false),
            ("Logins and passwords handed over", false),
            ("Site cleaned up", true),
            ("Client sign-off", false),
        ]),
        Template(id: "punch", name: "Punch list", items: []),
    ]

    /// "2026-11-19T15:04:00.000Z" → Date (with or without fractional seconds).
    public static func date(_ iso: String) -> Date? {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let d = f.date(from: iso) { return d }
        f.formatOptions = [.withInternetDateTime]
        return f.date(from: iso)
    }

    /// The local calendar day (YYYY-MM-DD) of an ISO timestamp — how photos and logs are grouped.
    public static func localDay(_ iso: String, timeZone: TimeZone = .current) -> String {
        guard let d = date(iso) else { return String(iso.prefix(10)) }
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = timeZone
        let c = cal.dateComponents([.year, .month, .day], from: d)
        return String(format: "%04d-%02d-%02d", c.year ?? 0, c.month ?? 0, c.day ?? 0)
    }

    /// Photos grouped by local day, newest day first.
    public static func byDay(_ photos: [Photo], timeZone: TimeZone = .current) -> [(day: String, photos: [Photo])] {
        let groups = Dictionary(grouping: photos) { localDay($0.takenAt, timeZone: timeZone) }
        return groups.keys.sorted(by: >).map { k in (k, groups[k]!.sorted { $0.takenAt > $1.takenAt }) }
    }

    /// Job labels (same list as the web app's Job tab).
    public static let suggestedLabels = ["Pre-wire", "Trim-out", "Service call", "Waiting on GC", "Waiting on client", "Punch list", "Warranty", "Commercial"]

    public static let suggestedTags = ["Pre-wire", "Trim-out", "Rack", "Camera", "Wi-Fi", "Audio", "TV", "Lighting", "Issue", "Damage", "Before", "After", "Completed"]

    public static func checklist(from t: Template, projectId: String) -> Checklist {
        Checklist(projectId: projectId, name: t.name, items: t.items.map { ChecklistItem(text: $0.text, requiresPhoto: $0.requiresPhoto) })
    }

    public static func itemPhotos(_ photos: [Photo], checklistId: String, itemId: String) -> [Photo] {
        photos.filter { $0.deleted != true && $0.checklistId == checklistId && $0.checklistItemId == itemId }
    }

    /// Ticked — and, if it needs a photo, has one.
    public static func itemComplete(_ i: ChecklistItem, photoCount: Int) -> Bool {
        i.done == true && (i.requiresPhoto != true || photoCount > 0)
    }

    public static func progress(_ c: Checklist, photos: [Photo]) -> (done: Int, total: Int, missingPhotos: Int) {
        let done = c.items.filter { itemComplete($0, photoCount: itemPhotos(photos, checklistId: c.id, itemId: $0.id).count) }.count
        let missing = c.items.filter { $0.done == true && $0.requiresPhoto == true && itemPhotos(photos, checklistId: c.id, itemId: $0.id).isEmpty }.count
        return (done, c.items.count, missing)
    }

    /// Tags used on the job (most used first), then the suggestions not used yet.
    public static func tagOptions(_ photos: [Photo]) -> [String] {
        var n: [String: Int] = [:]
        for p in photos { for t in p.tags ?? [] { n[t, default: 0] += 1 } }
        let used = n.sorted { $0.value != $1.value ? $0.value > $1.value : $0.key < $1.key }.map(\.key)
        return used + suggestedTags.filter { n[$0] == nil }
    }

    /// `from` / `to` are local days (YYYY-MM-DD), inclusive, either end open; a reversed range is read the right way round.
    public static func filter(_ photos: [Photo], tags: Set<String> = [], takenBy: String? = nil, text: String = "",
                              from: String? = nil, to: String? = nil, timeZone: TimeZone = .current) -> [Photo] {
        let q = text.trimmingCharacters(in: .whitespaces).lowercased()
        var lo: String? = (from?.isEmpty ?? true) ? nil : from
        var hi: String? = (to?.isEmpty ?? true) ? nil : to
        if let a = lo, let b = hi, a > b { lo = b; hi = a }
        return photos.filter { p in
            guard p.deleted != true && tags.isSubset(of: Set(p.tags ?? [])) && (takenBy == nil || p.takenBy == takenBy) else { return false }
            if lo != nil || hi != nil {
                let day = localDay(p.takenAt, timeZone: timeZone)
                if let lo, day < lo { return false }
                if let hi, day > hi { return false }
            }
            return q.isEmpty || "\(p.caption ?? "") \(p.room ?? "") \((p.tags ?? []).joined(separator: " "))".lowercased().contains(q)
        }
    }

    // MARK: bulk edit (same as bulkEditPhotos in src/lib/fieldDocs.ts)

    /// One change applied to every selected photo.
    public enum PhotoBulkEdit: Sendable {
        /// Set the room (nil or blank clears it).
        case room(String?)
        /// Link to a device (its sheet, and its room when it has one); nil unlinks.
        case device(Marker?)
        case removeTag(String)
    }

    /// Applies the change to one photo; returns whether anything changed.
    @discardableResult
    public static func apply(_ e: PhotoBulkEdit, to p: inout Photo) -> Bool {
        let before = p
        switch e {
        case .room(let r):
            let room = r?.trimmingCharacters(in: .whitespaces) ?? ""
            p.room = room.isEmpty ? nil : room
        case .device(let m):
            if let m {
                p.markerId = m.id
                p.sheetId = m.sheetId
                let room = m.room.trimmingCharacters(in: .whitespaces)
                if !room.isEmpty { p.room = room }
            } else {
                p.markerId = nil
            }
        case .removeTag(let t):
            if let tags = p.tags, tags.contains(t) { p.tags = tags.filter { $0 != t } }
        }
        return p != before
    }

    /// The selected live photos that actually change, already changed.
    public static func bulkEdit(_ photos: [Photo], ids: Set<String>, _ e: PhotoBulkEdit) -> [Photo] {
        photos.compactMap { p in
            guard p.deleted != true, ids.contains(p.id) else { return nil }
            var q = p
            return apply(e, to: &q) ? q : nil
        }
    }

    /// Tags on any of these photos, most used first (for "remove tag" on a selection).
    public static func tagsInUse(_ photos: [Photo]) -> [String] {
        var n: [String: Int] = [:]
        for p in photos where p.deleted != true { for t in Set(p.tags ?? []) { n[t, default: 0] += 1 } }
        return n.sorted { $0.value != $1.value ? $0.value > $1.value : $0.key < $1.key }.map(\.key)
    }

    /// Rooms used on the job (photos, then devices), case-insensitively unique, alphabetical — suggestions for "set room".
    public static func roomOptions(_ photos: [Photo], markers: [Marker] = []) -> [String] {
        var seen: [String: String] = [:]
        let all: [String?] = photos.filter { $0.deleted != true }.map(\.room) + markers.filter { $0.deleted != true }.map(\.room)
        for r in all {
            let t = (r ?? "").trimmingCharacters(in: .whitespaces)
            if !t.isEmpty && seen[t.lowercased()] == nil { seen[t.lowercased()] = t }
        }
        return seen.values.sorted { $0.localizedStandardCompare($1) == .orderedAscending }
    }

    // MARK: tasks (same as src/lib/fieldDocs.ts)

    public enum TaskBucket: String, CaseIterable, Sendable {
        case overdue, today, week, later, none
        public var title: String {
            switch self { case .overdue: "Overdue"; case .today: "Today"; case .week: "Next 7 days"; case .later: "Later"; case .none: "No due date" }
        }
    }

    public struct OpenTask: Identifiable, Hashable, Sendable {
        public var project: Project
        public var checklist: Checklist
        public var item: ChecklistItem
        public var bucket: TaskBucket
        public var id: String { "\(checklist.id):\(item.id)" }
    }

    static func dayNumber(_ day: String) -> Int? {
        let p = day.split(separator: "-").compactMap { Int($0) }
        guard p.count == 3 else { return nil }
        var c = DateComponents(); c.year = p[0]; c.month = p[1]; c.day = p[2]
        var cal = Calendar(identifier: .gregorian); cal.timeZone = TimeZone(identifier: "UTC")!
        return cal.date(from: c).map { Int(($0.timeIntervalSince1970 / 86400).rounded()) }
    }

    public static func daysUntil(_ due: String, today: String) -> Int {
        guard let a = dayNumber(due), let b = dayNumber(today) else { return 0 }
        return a - b
    }

    public static func taskBucket(_ due: String?, today: String) -> TaskBucket {
        guard let due, !due.isEmpty else { return .none }
        let d = daysUntil(due, today: today)
        return d < 0 ? .overdue : d == 0 ? .today : d <= 7 ? .week : .later
    }

    /// Open items that are tasks (assigned or dated) across jobs; `who` keeps one person's. Sorted by due date, then job.
    public static func openTasks(_ bundles: [ProjectBundle], today: String, who: String? = nil) -> [OpenTask] {
        let w = who?.trimmingCharacters(in: .whitespaces).lowercased()
        var out: [OpenTask] = []
        for b in bundles where b.project.deleted != true {
            for c in b.checklists where c.deleted != true {
                for i in c.items where i.done != true && ((i.assignee ?? "").isEmpty == false || (i.due ?? "").isEmpty == false) {
                    if let w, !w.isEmpty, i.assignee?.trimmingCharacters(in: .whitespaces).lowercased() != w { continue }
                    out.append(OpenTask(project: b.project, checklist: c, item: i, bucket: taskBucket(i.due, today: today)))
                }
            }
        }
        return out.sorted { ($0.item.due ?? "9999", $0.project.address) < ($1.item.due ?? "9999", $1.project.address) }
    }

    /// Names seen on the jobs, one per person whatever the capitalisation.
    public static func teamNames(_ bundles: [ProjectBundle], me: String? = nil) -> [String] {
        var seen: [String: String] = [:]
        func add(_ n: String?) {
            guard let t = n?.trimmingCharacters(in: .whitespaces), !t.isEmpty, seen[t.lowercased()] == nil else { return }
            seen[t.lowercased()] = t
        }
        add(me)
        for b in bundles {
            for p in b.photos { add(p.takenBy) }
            for l in b.jobLogs { add(l.author) }
            for c in b.checklists { for i in c.items { add(i.doneBy); add(i.assignee) } }
        }
        return seen.values.sorted { $0.localizedCaseInsensitiveCompare($1) == .orderedAscending }
    }

    public struct Event: Identifiable, Hashable, Sendable {
        public enum Kind: String, Sendable { case created, photos, comment, checklist, log, document, billdu }
        public var at: String
        public var kind: Kind
        public var text: String
        public var who: String?
        public var photoIds: [String] = []
        public var id: String { "\(kind.rawValue)|\(at)|\(text)" }
    }

    /// Everything that happened on the job, newest first. Photo uploads are grouped per person per hour.
    public static func timeline(_ b: ProjectBundle) -> [Event] {
        var ev = [Event(at: b.project.createdAt, kind: .created, text: "Job created")]
        var groups: [String: [Photo]] = [:]
        for p in b.photos where p.deleted != true { groups["\(p.takenBy ?? "")|\(p.createdAt.prefix(13))", default: []].append(p) }
        for ps in groups.values {
            let latest = ps.max { $0.createdAt < $1.createdAt }!
            ev.append(Event(at: latest.createdAt, kind: .photos, text: "\(ps.count) photo\(ps.count == 1 ? "" : "s") added", who: latest.takenBy, photoIds: ps.map(\.id)))
        }
        let livePhotoIds = Set(b.photos.filter { $0.deleted != true }.map(\.id))
        for c in b.photoComments where c.deleted != true && livePhotoIds.contains(c.photoId) {
            ev.append(Event(at: c.createdAt, kind: .comment, text: "Commented: “\(c.text.count > 80 ? String(c.text.prefix(80)) + "…" : c.text)”", who: c.author, photoIds: [c.photoId]))
        }
        for c in b.checklists where c.deleted != true {
            ev.append(Event(at: c.createdAt, kind: .checklist, text: "Checklist started: \(c.name)"))
            for i in c.items where i.done == true { if let at = i.doneAt { ev.append(Event(at: at, kind: .checklist, text: "\(c.name): \(i.text)", who: i.doneBy)) } }
        }
        for l in b.jobLogs where l.deleted != true {
            ev.append(Event(at: l.createdAt, kind: .log, text: "Daily log\(l.title.map { ": \($0)" } ?? "")", who: l.author, photoIds: l.photoIds ?? []))
        }
        for d in b.documents where d.deleted != true { ev.append(Event(at: d.createdAt, kind: .document, text: "Document added: \(d.name)")) }
        for d in b.project.billduDocs { ev.append(Event(at: d.createdAt, kind: .billdu, text: "Billdu \(d.type) \(d.serial ?? "#\(d.id)")\(d.label.map { " (\($0))" } ?? "")")) }
        return ev.filter { !$0.at.isEmpty }.sorted { $0.at > $1.at }
    }
}
