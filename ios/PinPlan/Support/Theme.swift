import SwiftUI

// Blueprint Ink: the brand palette from docs/brand.md, shared with the web app. Ink navy linework on cool blueprint
// paper, one action-blue element per view (the primary button or the highlighted figure, not both), teal for
// approved and paid. Device colours are not brand colours: they come from the trade packs.
//
// Light values are the brand's. Dark values invert to ink paper with light linework and keep action blue as the
// action colour (a little brighter so it reads on dark).

extension Color {
    /// Action blue #0B6FE0: the one primary action per view, selection, Edit mode. Same as the AccentColor asset.
    static let brand = Color(uiColor: .themed(light: "#0B6FE0", dark: "#3D8EF0"))
    /// Action deep #0958B5: pressed / emphasis on action blue.
    static let brandDeep = Color(uiColor: .themed(light: "#0958B5", dark: "#2F7AD6"))
    /// Ink navy #0F2340: dark fills behind white text (toasts, snackbars, View mode), the logo tile. Fixed in both
    /// schemes so white text on it always reads.
    static let ink = Color(hex: "#0F2340")
    /// Paper #F2F6FA: screen background behind lists, grids and cards.
    static let paper = Color(uiColor: .themed(light: "#F2F6FA", dark: "#0A1628"))
    /// Sheet #FFFFFF ("surface"): cards and panels that hold product content (plans, documents).
    static let surface = Color(uiColor: .themed(light: "#FFFFFF", dark: "#13233A"))
    /// Pencil #526580: secondary text (5.6:1 on paper).
    static let pencil = Color(uiColor: .themed(light: "#526580", dark: "#A9BCD4"))
    /// Rule #C9D6E5: hairlines and card borders. Never text.
    static let rule = Color(uiColor: .themed(light: "#C9D6E5", dark: "#2A3D58"))
    /// Electric #33A9FF: the logo pin and bright accents on ink.
    static let electric = Color(hex: "#33A9FF")
    /// Highlight #CFE6FF: the takeoff highlighter behind counted figures (ink text on it).
    static let highlight = Color(uiColor: .themed(light: "#CFE6FF", dark: "#17375E"))
    /// Approved teal #0B7F72: approved and paid states (white text 4.9:1).
    static let approved = Color(uiColor: .themed(light: "#0B7F72", dark: "#2BB3A3"))
    /// Redline #C73A2C: mark-up on photos and plans only. Not for errors or decoration.
    static let redline = Color(hex: "#C73A2C")
}

extension UIColor {
    /// A colour that follows light / dark mode.
    static func themed(light: String, dark: String) -> UIColor {
        UIColor { $0.userInterfaceStyle == .dark ? UIColor(hex: dark) : UIColor(hex: light) }
    }
}

/// Paper surfaces and hairlines, used by the list and card screens.
enum Theme {
    /// Paper radius (sheets, panels, tables) and button radius from docs/brand.md.
    static let paperRadius: CGFloat = 4
    static let cardRadius: CGFloat = 12
    static let buttonRadius: CGFloat = 10
}

extension View {
    /// A white card on paper with a 1px rule border, like a sheet lying on a desk.
    func paperCard(radius: CGFloat = Theme.cardRadius) -> some View {
        self
            .background(Color.surface, in: RoundedRectangle(cornerRadius: radius, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: radius, style: .continuous).strokeBorder(Color.rule, lineWidth: 1))
    }

    /// Paper behind a Form or List (rows stay white).
    func paperBackground() -> some View {
        self.scrollContentBackground(.hidden).background(Color.paper)
    }
}
