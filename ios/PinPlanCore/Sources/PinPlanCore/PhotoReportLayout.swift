import Foundation

/// Photo report layout: chosen photos grouped into sections (by room or by day), before/after pairs side by side,
/// and the rows on each PDF page. Same rules as src/lib/photoReport.ts.
public enum PhotoReportLayout {
    public enum GroupBy: String, CaseIterable, Sendable {
        case none, room, day
        public var name: String {
            switch self {
            case .none: return "In order"
            case .room: return "By room"
            case .day: return "By day"
            }
        }
    }

    /// A run of cells under one heading. A cell is one photo, or a [before, after] pair.
    public struct Section<T> {
        public var key: String
        public var title: String
        public var cells: [[T]]
        public init(key: String, title: String, cells: [[T]]) { self.key = key; self.title = title; self.cells = cells }
        public func map<U>(_ f: (T) -> U?) -> Section<U> {
            Section<U>(key: key, title: title, cells: cells.map { $0.compactMap(f) }.filter { !$0.isEmpty })
        }
    }

    public static let noRoom = "Other photos"

    /// "2026-11-19" → "Thursday, November 19, 2026" (in the user's locale).
    public static func dayTitle(_ day: String) -> String {
        let p = DateFormatter()
        p.locale = Locale(identifier: "en_US_POSIX"); p.dateFormat = "yyyy-MM-dd"
        guard let d = p.date(from: day) else { return day }
        let f = DateFormatter()
        f.dateStyle = .full; f.timeStyle = .none
        return f.string(from: d)
    }

    /// Chosen photos (oldest first) as sections. `.none` → one untitled section (the original report); `.room` → A–Z,
    /// photos without a room last; `.day` → oldest day first. With `pairs`, an "after" whose "before" is also chosen
    /// joins it in one cell, placed where the before is; each photo is used in at most one pair.
    public static func sections(_ photos: [Photo], groupBy: GroupBy, pairs: Bool, timeZone: TimeZone = .current,
                                dayTitle: (String) -> String = PhotoReportLayout.dayTitle) -> [Section<Photo>] {
        let ordered = photos.sorted { ($0.takenAt, $0.id) < ($1.takenAt, $1.id) }
        let ids = Set(ordered.map(\.id))
        var afterOf: [String: Photo] = [:]
        if pairs {
            var used = Set<String>()
            for p in ordered {
                guard let b = p.beforeId, b != p.id, ids.contains(b), !used.contains(b), !used.contains(p.id) else { continue }
                used.insert(b); used.insert(p.id)
                afterOf[b] = p
            }
        }
        let paired = Set(afterOf.values.map(\.id))
        var cells: [[Photo]] = []
        for p in ordered where !paired.contains(p.id) {
            if let a = afterOf[p.id] { cells.append([p, a]) } else { cells.append([p]) }
        }
        if groupBy == .none { return cells.isEmpty ? [] : [Section(key: "", title: "", cells: cells)] }

        var order: [String] = []
        var byKey: [String: Section<Photo>] = [:]
        for c in cells {
            let key: String, title: String
            if groupBy == .day {
                key = FieldDocs.localDay(c[0].takenAt, timeZone: timeZone)
                title = dayTitle(key)
            } else {
                let raw = c.compactMap { $0.room?.trimmingCharacters(in: .whitespacesAndNewlines) }.first { !$0.isEmpty } ?? ""
                let room = raw.split(whereSeparator: { $0.isWhitespace }).joined(separator: " ")
                key = room.lowercased()
                title = room.isEmpty ? noRoom : room
            }
            if byKey[key] == nil { order.append(key); byKey[key] = Section(key: key, title: title, cells: []) }
            byKey[key]?.cells.append(c)
        }
        let list = order.compactMap { byKey[$0] }
        if groupBy == .day { return list.sorted { $0.key < $1.key } }
        return list.sorted { l, r in
            if l.key.isEmpty != r.key.isEmpty { return r.key.isEmpty }
            return l.title.compare(r.title, options: [.caseInsensitive, .numeric]) == .orderedAscending
        }
    }

    public enum Row<T> {
        case heading(String)
        case photos([T], pair: Bool)
    }

    /// Sections as PDF pages: 1 per page → one photo; 2 → two side by side; 4 → two rows of two. A pair fills a row;
    /// headings take no photo slot but never end a page. Without headings or pairs this is the original fixed layout.
    public static func pages<T>(_ sections: [Section<T>], perPage: Int) -> [[Row<T>]] {
        let cols = perPage == 1 ? 1 : 2
        let rowsPerPage = perPage == 4 ? 2 : 1
        var pages: [[Row<T>]] = []
        var page: [Row<T>] = []
        var used = 0
        func push(_ r: Row<T>) {
            if used >= rowsPerPage { pages.append(page); page = []; used = 0 }
            page.append(r)
            if case .photos = r { used += 1 }
        }
        for s in sections {
            if !s.title.isEmpty { push(.heading(s.title)) }
            var row: [T] = []
            for c in s.cells {
                if c.count > 1 {
                    if !row.isEmpty { push(.photos(row, pair: false)) }
                    row = []
                    push(.photos(Array(c.prefix(2)), pair: true))
                    continue
                }
                guard let only = c.first else { continue }
                row.append(only)
                if row.count >= cols { push(.photos(row, pair: false)); row = [] }
            }
            if !row.isEmpty { push(.photos(row, pair: false)) }
        }
        if !page.isEmpty { pages.append(page) }
        return pages
    }

    public struct Comment: Hashable, Sendable {
        public let author: String
        public let text: String
        public let at: String
    }

    /// A photo's live comments, oldest first, for printing.
    public static func comments(_ all: [PhotoComment], photoId: String) -> [Comment] {
        all.filter { $0.photoId == photoId && $0.deleted != true && !$0.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
            .sorted { $0.createdAt < $1.createdAt }
            .map { Comment(author: $0.author?.trimmingCharacters(in: .whitespacesAndNewlines) ?? "", text: $0.text.trimmingCharacters(in: .whitespacesAndNewlines), at: $0.createdAt) }
    }

    /// Share-link snapshot form: `[{title, cells: [[photo index]]}]`, indexes into the snapshot's flat `photos`.
    public static func snapshotSections(_ sections: [Section<Photo>], indexOf: [String: Int]) -> [[String: Any]] {
        sections.map { s in
            ["title": s.title, "cells": s.cells.map { $0.compactMap { indexOf[$0.id] } }.filter { !$0.isEmpty }] as [String: Any]
        }
    }
}
