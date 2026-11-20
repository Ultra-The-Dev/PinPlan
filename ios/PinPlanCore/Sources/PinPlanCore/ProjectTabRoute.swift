import Foundation

/// Where a job tab id leads, on iPad and iPhone: the five job sections (docs/ux-audit.md) plus a page inside one.
/// Takes the sections' own ids and the older and web ids, so JobSummary's next steps (web ids: plan, sheets, photos,
/// field, takeoff, estimate, crew, info) and links from the web open the right place.
public enum ProjectTabRoute {
    /// Overview · Plan · Takeoff · Money · Field. Same ids as the app's ProjectTab.
    public enum Section: String, CaseIterable, Sendable {
        case overview, plan, takeoff, money, field
    }

    /// A page inside a section that a link can open straight away.
    public enum Page: Sendable, Equatable {
        case managePlans, wiring, photos
    }

    public static func resolve(_ id: String) -> (section: Section, page: Page?)? {
        if let s = Section(rawValue: id) { return (s, nil) }
        switch id {
        case "info", "job": return (.overview, nil)
        case "sheets": return (.plan, .managePlans)
        case "crew", "wiring": return (.takeoff, .wiring)
        case "estimate", "billing", "pricing": return (.money, nil)
        case "photos": return (.field, .photos)
        default: return nil
        }
    }
}
