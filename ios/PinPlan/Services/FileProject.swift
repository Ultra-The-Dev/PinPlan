import UIKit
import PinPlanCore

/// Builds a project from one plan file using exactly the app's import paths: a PDF is rendered from vector
/// (floor names and printed scale read from its text); a photo or scan gets page detection, perspective
/// correction, cleanup and text recognition, as in the scan review with its defaults.
/// Used by automation to run real plan files end to end (`--import-file=<name in Documents>`).
enum FileProject {
    static func make(url: URL, store: Store) -> ProjectBundle {
        let name = url.deletingPathExtension().lastPathComponent
        var b = ProjectBundle(project: Project(clientName: "Test file", address: "Test — \(name)"))
        if url.pathExtension.lowercased() == "pdf" {
            if let r = try? PlanImporter.sheets(fromPDF: url, store: store, projectId: b.project.id, startOrder: 0, fallbackName: { "Sheet \($0 + 1)" }) {
                b.sheets = r.sheets
            }
            return b
        }
        guard let raw = UIImage(contentsOfFile: url.path) else { return b }
        let quad = ScanProcessing.detectPage(in: raw)
        let cleaned = PlanImporter.normalized(ScanProcessing.process(raw, quad: quad, rotation: 0, mode: .clean))
        let text = ScanProcessing.recognizeText(in: cleaned)
        guard let id = store.saveImage(cleaned, quality: 0.92) else { return b }
        let px = cleaned.pixelSize
        b.sheets = [Sheet(projectId: b.project.id, name: PlanImporter.guessFloorName(text, fallback: "Sheet 1"),
                          pageNumber: 1, order: 0, imageId: id, width: px.width, height: px.height)]
        return b
    }

    /// The file named by a `--<flag>=<name>` launch argument, in the app's Documents folder.
    static func launchFile(_ flag: String) -> URL? {
        guard let arg = ProcessInfo.processInfo.arguments.first(where: { $0.hasPrefix("--\(flag)=") }) else { return nil }
        let name = String(arg.dropFirst(flag.count + 3))
        let url = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0].appendingPathComponent(name)
        return FileManager.default.fileExists(atPath: url.path) ? url : nil
    }
}
