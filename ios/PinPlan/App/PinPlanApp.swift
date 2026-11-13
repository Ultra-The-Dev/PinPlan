import SwiftUI
import TipKit

@main
struct PinPlanApp: App {
    @State private var app = AppModel()

    init() { TipsSetup.configure() }

    var body: some Scene {
        WindowGroup {
            ProjectsView()
                .environment(app)
                .onOpenURL { url in app.receive(url) }
                .tint(.brand)
                .textCase(nil)   // section headers in sentence case, not ALL CAPS
        }
    }
}
