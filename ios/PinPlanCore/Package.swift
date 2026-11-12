// swift-tools-version:5.9
// PinPlanCore: platform-independent domain logic shared by the iOS/iPadOS app
// (models, catalog, geometry, takeoff, estimate, labels, CSV, backup format). Foundation only.
import PackageDescription

let package = Package(
    name: "PinPlanCore",
    platforms: [.iOS(.v17), .macOS(.v14)],
    products: [.library(name: "PinPlanCore", targets: ["PinPlanCore"])],
    targets: [
        .target(name: "PinPlanCore"),
        .testTarget(name: "PinPlanCoreTests", dependencies: ["PinPlanCore"], resources: [.copy("Fixtures")]),
    ]
)
