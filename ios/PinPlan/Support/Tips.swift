import SwiftUI
import TipKit

/// First-run hints (TipKit). Each shows until dismissed or the action is done.
struct PlaceDeviceTip: Tip {
    var title: Text { Text("Pick a device, then tap the plan") }
    var message: Text? { Text("It stays selected so you can tap again and again. Recent devices also appear in the dock on the plan.") }
    var image: Image? { Image(systemName: "hand.tap") }
}

struct ScaleTip: Tip {
    var title: Text { Text("Set the scale for lengths") }
    var message: Text? { Text("Type the scale printed on the sheet, or draw a line over a known dimension. LED runs and home runs are then measured for you.") }
    var image: Image? { Image(systemName: "ruler") }
}

struct LongPressTip: Tip {
    var title: Text { Text("Long-press a device") }
    var message: Text? { Text("Quick actions: mark tentative (?), duplicate, place more like it, delete. Drag to move it.") }
    var image: Image? { Image(systemName: "hand.point.up.left") }
}

enum TipsSetup {
    static func configure() {
        if ProcessInfo.processInfo.arguments.contains("--no-tips") { return }
        try? Tips.configure([.displayFrequency(.immediate)])
    }
}
