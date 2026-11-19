import Foundation

// Field documentation (CompanyCam-style): job photos with mark-up, comments, checklists, daily logs and documents.
// Same JSON as the web app (src/lib/types.ts), so backups and cloud sync carry them between devices.

/// A shape drawn over a photo. Coordinates are relative (0–1) to the photo.
public struct PhotoShape: Codable, Hashable, Sendable {
    public enum Kind: String, Codable, Sendable, CaseIterable { case pen, arrow, rect, circle, text }
    public var kind: Kind
    public var color: String
    /// Stroke width relative to the photo's longer side (e.g. 0.006).
    public var width: Double
    /// pen: [x0,y0,x1,y1,…]; arrow/rect/circle: [x0,y0,x1,y1]; text: [x,y].
    public var points: [Double]
    public var text: String?
    public init(kind: Kind, color: String, width: Double, points: [Double], text: String? = nil) {
        self.kind = kind; self.color = color; self.width = width; self.points = points; self.text = text
    }
}

public struct Photo: Codable, Hashable, Identifiable, Sendable {
    public var id: String
    public var projectId: String
    public var imageId: String
    public var width: Double
    public var height: Double
    public var takenAt: String
    public var takenBy: String?
    public var lat: Double?
    public var lng: Double?
    public var caption: String?
    public var tags: [String]?
    public var annotations: [PhotoShape]?
    public var markerId: String?
    public var sheetId: String?
    public var room: String?
    /// Before/after: an "after" photo points at its "before".
    public var beforeId: String?
    public var checklistId: String?
    public var checklistItemId: String?
    public var createdAt: String
    public var updatedAt: String
    public var deleted: Bool?

    public init(id: String = newId(), projectId: String, imageId: String, width: Double, height: Double, takenAt: String = isoNow(), takenBy: String? = nil,
                lat: Double? = nil, lng: Double? = nil) {
        self.id = id; self.projectId = projectId; self.imageId = imageId; self.width = width; self.height = height
        self.takenAt = takenAt; self.takenBy = takenBy; self.lat = lat; self.lng = lng
        let now = isoNow(); createdAt = now; updatedAt = now
    }
}

public struct PhotoComment: Codable, Hashable, Identifiable, Sendable {
    public var id: String
    public var projectId: String
    public var photoId: String
    public var author: String?
    public var text: String
    public var createdAt: String
    public var updatedAt: String
    public var deleted: Bool?
    public init(id: String = newId(), projectId: String, photoId: String, author: String?, text: String) {
        self.id = id; self.projectId = projectId; self.photoId = photoId; self.author = author; self.text = text
        let now = isoNow(); createdAt = now; updatedAt = now
    }
}

public struct ChecklistItem: Codable, Hashable, Identifiable, Sendable {
    public var id: String
    public var text: String
    public var requiresPhoto: Bool?
    public var done: Bool?
    public var doneBy: String?
    public var doneAt: String?
    public var note: String?
    public init(id: String = newId(8), text: String, requiresPhoto: Bool = false) {
        self.id = id; self.text = text; self.requiresPhoto = requiresPhoto
    }
}

public struct Checklist: Codable, Hashable, Identifiable, Sendable {
    public var id: String
    public var projectId: String
    public var name: String
    public var items: [ChecklistItem]
    public var createdAt: String
    public var updatedAt: String
    public var deleted: Bool?
    public init(id: String = newId(), projectId: String, name: String, items: [ChecklistItem]) {
        self.id = id; self.projectId = projectId; self.name = name; self.items = items
        let now = isoNow(); createdAt = now; updatedAt = now
    }
}

public struct JobLog: Codable, Hashable, Identifiable, Sendable {
    public var id: String
    public var projectId: String
    /// Day it covers (YYYY-MM-DD).
    public var date: String
    public var title: String?
    public var body: String
    public var author: String?
    public var photoIds: [String]?
    public var createdAt: String
    public var updatedAt: String
    public var deleted: Bool?
    public init(id: String = newId(), projectId: String, date: String, title: String? = nil, body: String = "", author: String? = nil) {
        self.id = id; self.projectId = projectId; self.date = date; self.title = title; self.body = body; self.author = author
        let now = isoNow(); createdAt = now; updatedAt = now
    }
}

public struct JobDocument: Codable, Hashable, Identifiable, Sendable {
    public var id: String
    public var projectId: String
    public var name: String
    public var mime: String
    public var size: Double
    public var fileId: String
    public var createdAt: String
    public var updatedAt: String
    public var deleted: Bool?
    public init(id: String = newId(), projectId: String, name: String, mime: String, size: Double, fileId: String) {
        self.id = id; self.projectId = projectId; self.name = name; self.mime = mime; self.size = size; self.fileId = fileId
        let now = isoNow(); createdAt = now; updatedAt = now
    }
}
