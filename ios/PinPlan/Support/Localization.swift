import Foundation

// Translation (docs/i18n.md, "iOS app"). The app follows the device language: English, or Russian from the String
// Catalogs. SwiftUI literals (Text("…"), Button("…"), Label("…", …), navigationTitle("…")) are looked up in
// Localizable.xcstrings automatically; text built in code uses String(localized: "…"). Plurals live in the catalog:
// write "\(n) photos" and let the catalog choose "1 photo" / "2 фото", never `n == 1 ? … : …`.

/// Translates fixed English text that is kept in data at the moment it is shown: enum raw values, option tables and
/// labels that come from PinPlanCore (role names, install steps, task statuses). Looks in Labels.xcstrings, then in
/// Localizable.xcstrings; unknown text is shown as it is. `context` tells apart words whose Russian differs by what
/// they describe ("Open" RFI vs "Open" task): Labels.xcstrings holds "Task status: Open" next to plain "Open".
/// Never pass text people typed (job names, notes, price list items), device letters or catalog data.
func tr(_ english: String, context: String? = nil) -> String {
    let missing = "\u{1}"
    if let context {
        let s = Bundle.main.localizedString(forKey: "\(context): \(english)", value: missing, table: "Labels")
        if s != missing { return s }
    }
    let s = Bundle.main.localizedString(forKey: english, value: missing, table: "Labels")
    if s != missing { return s }
    return Bundle.main.localizedString(forKey: english, value: english, table: nil)
}
