import SwiftUI

@main
struct PinPlanApp: App {
    @State private var app = AppModel()

    var body: some Scene {
        WindowGroup {
            ProjectsView()
                .environment(app)
                .tint(.brand)
        }
    }
}
