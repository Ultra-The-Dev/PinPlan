import SwiftUI
import PinPlanCore

/// Layers › "From the office": switches for the markups, measurements and plan links made on the web, with how many
/// are on this plan. Shown only when the job has any. They never change the device count.
struct OfficeDrawingsSection: View {
    @Environment(AppModel.self) private var app
    let model: EditorModel
    let sheet: Sheet

    var body: some View {
        let b = model.bundle
        let markups = OfficeMarkupDrawing.markups(model, sheetId: sheet.id, userId: app.cloud.session?.userId).count
        let measurements = b.liveMeasurements.filter { $0.sheetId == sheet.id }.count
        let links = b.liveSheetLinks.filter { $0.sheetId == sheet.id }.count
        if !b.livePlanMarkups.isEmpty || !b.liveMeasurements.isEmpty || !b.liveSheetLinks.isEmpty {
            let prefs = OfficeOverlayPrefs.shared
            Section {
                row(String(localized: "Markups"), count: markups, on: Binding(get: { prefs.markups }, set: { prefs.markups = $0 }))
                row(String(localized: "Measurements"), count: measurements, on: Binding(get: { prefs.measurements }, set: { prefs.measurements = $0 }))
                row(String(localized: "Plan links"), count: links, on: Binding(get: { prefs.links }, set: { prefs.links = $0 }))
            } header: {
                SentenceHeader(title: String(localized: "From the office"))
            } footer: {
                Text("Made on the web. Shown here to read; they never change the device count.")
            }
        }
    }

    private func row(_ title: String, count: Int, on: Binding<Bool>) -> some View {
        Toggle(isOn: Binding(get: { on.wrappedValue }, set: { on.wrappedValue = $0; Haptics.select() })) {
            HStack {
                Text(title)
                Spacer()
                Text("\(count)").monospacedDigit().foregroundStyle(.secondary)
            }
        }
    }
}
