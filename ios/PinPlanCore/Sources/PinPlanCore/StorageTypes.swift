import Foundation

/// File types the private "plans" bucket accepts: the same list as src/lib/storageTypes.ts and the bucket's
/// allowed_mime_types (supabase/migrations/20261124301000_access_guards.sql; tests/storageTypes.test.ts checks all three).
/// A job document of any other type is uploaded as application/octet-stream, so the bucket takes it.
public enum StorageTypes {
    public static let plansBucketTypes: [String] = [
        "image/jpeg", "image/png", "image/webp", "image/gif", "image/heic", "image/heif", "image/tiff", "image/bmp", "image/avif",
        "application/pdf",
        "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "application/vnd.ms-powerpoint", "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "application/vnd.ms-word.document.macroEnabled.12", "application/vnd.ms-excel.sheet.macroEnabled.12",
        "application/vnd.ms-word.document.macroenabled.12", "application/vnd.ms-excel.sheet.macroenabled.12",
        "application/vnd.oasis.opendocument.text", "application/vnd.oasis.opendocument.spreadsheet",
        "application/vnd.oasis.opendocument.presentation", "application/rtf", "text/rtf",
        "application/vnd.apple.pages", "application/vnd.apple.numbers", "application/vnd.apple.keynote",
        "application/vnd.ms-project", "application/vnd.visio", "application/vnd.ms-visio.drawing",
        "text/plain", "text/csv",
        "application/zip", "application/x-zip-compressed", "application/x-7z-compressed", "application/vnd.rar", "application/x-rar-compressed",
        "image/vnd.dwg", "image/x-dwg", "application/x-dwg", "image/vnd.dxf", "application/acad", "application/dxf", "application/x-autocad",
        "message/rfc822", "application/vnd.ms-outlook",
        "video/mp4", "video/quicktime", "video/x-m4v", "audio/mpeg", "audio/mp4", "audio/x-m4a", "audio/aac", "audio/wav", "audio/x-wav",
        "application/octet-stream",
    ]

    private static let lowered = Set(plansBucketTypes.map { $0.lowercased() })

    /// The Content-Type to upload a file with: its own type (lower case) when the bucket takes it, else application/octet-stream.
    public static func plansUploadType(_ mime: String?) -> String {
        let base = (mime ?? "").split(separator: ";", maxSplits: 1, omittingEmptySubsequences: false).first.map(String.init) ?? ""
        let t = base.trimmingCharacters(in: .whitespaces).lowercased()
        return lowered.contains(t) ? t : "application/octet-stream"
    }
}
