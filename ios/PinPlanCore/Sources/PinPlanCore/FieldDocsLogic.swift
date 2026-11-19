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

    public static func filter(_ photos: [Photo], tags: Set<String> = [], takenBy: String? = nil, text: String = "") -> [Photo] {
        let q = text.trimmingCharacters(in: .whitespaces).lowercased()
        return photos.filter { p in
            p.deleted != true && tags.isSubset(of: Set(p.tags ?? [])) && (takenBy == nil || p.takenBy == takenBy)
                && (q.isEmpty || "\(p.caption ?? "") \(p.room ?? "") \((p.tags ?? []).joined(separator: " "))".lowercased().contains(q))
        }
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
        for c in b.photoComments where c.deleted != true {
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
