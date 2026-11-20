import Foundation

/// Where a job tab id leads, on iPad and iPhone: the job sections (docs/navigation.md) plus a page inside one.
/// Takes the sections' own ids and the older and web ids, so JobSummary's next steps (web ids: plan, sheets, photos,
/// field, takeoff, estimate, crew, info) and links from the web open the right place.
public enum ProjectTabRoute {
    /// Overview · Plan · Takeoff · Tasks · Photos · Money · Field. Same ids as the app's ProjectTab and the web's
    /// JOB_TABS (src/lib/tabRoutes.ts).
    public enum Section: String, CaseIterable, Sendable {
        case overview, plan, takeoff, tasks, photos, money, field
    }

    /// A page inside a section that a link can open straight away.
    public enum Page: Sendable, Equatable {
        case managePlans, wiring
    }

    public static func resolve(_ id: String) -> (section: Section, page: Page?)? {
        if let s = Section(rawValue: id) { return (s, nil) }
        switch id {
        case "info", "job": return (.overview, nil)
        case "sheets": return (.plan, .managePlans)
        case "crew", "wiring": return (.takeoff, .wiring)
        case "estimate", "billing", "pricing": return (.money, nil)
        default: return nil
        }
    }

    /// iPhone tab bar: four sections and More (the rest, in order). The office gets Money in the bar; technicians
    /// (no Money) get Field there instead. Mirrors `phoneTabs` in src/lib/tabRoutes.ts.
    public static func phoneTabs(office: Bool) -> (bar: [Section], more: [Section]) {
        let bar: [Section] = office ? [.plan, .tasks, .photos, .money] : [.plan, .tasks, .photos, .field]
        let more = Section.allCases.filter { !bar.contains($0) && (office || $0 != .money) }
        return (bar, more)
    }
}
