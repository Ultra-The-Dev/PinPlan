import SwiftUI
import PinPlanCore

/// Follow-up input after drawing: scale calibration, LED run details, stair LED.
struct PendingInputSheet: View {
    @Environment(\.dismiss) private var dismiss
    let model: EditorModel
    let pending: PendingInput
    @State private var a = ""
    @State private var b = ""
    @State private var c = ""
    @State private var d = ""
    @State private var error: String?

    var body: some View {
        NavigationStack {
            SentenceForm {
                switch pending {
                case .calibrate:
                    Section { TextField("Real length, e.g. 12'6\" or 12.5", text: $a).keyboardType(.numbersAndPunctuation) } footer: { Text("How long is the line you drew, in real life?") }
                case .led(let pts, _):
                    let measured = model.activeSheet.flatMap { Geometry.polylineFt(pts, sheet: $0) }
                    Section {
                        LabeledContent("Zone #") { TextField("Zone", text: $a).keyboardType(.numberPad).multilineTextAlignment(.trailing) }
                        LabeledContent("Switch") { TextField("S21", text: $b).multilineTextAlignment(.trailing) }
                        LabeledContent("LF") { TextField(measured.map { $0.clean } ?? "from the plan callout", text: $c).keyboardType(.decimalPad).multilineTextAlignment(.trailing) }
                    } footer: { Text(measured.map { "Measured \($0.clean) LF from the scale. Type the plan's LF to override." } ?? "No scale on this sheet — type the LF from the plan callout.") }
                case .stair:
                    Section {
                        LabeledContent("Steps") { TextField("14", text: $a).keyboardType(.numberPad).multilineTextAlignment(.trailing) }
                        LabeledContent("LF per step") { TextField("3.5", text: $b).keyboardType(.decimalPad).multilineTextAlignment(.trailing) }
                        LabeledContent("Zone #") { TextField("Zone", text: $c).keyboardType(.numberPad).multilineTextAlignment(.trailing) }
                        LabeledContent("Switch") { TextField("S5", text: $d).multilineTextAlignment(.trailing) }
                    } footer: { Text("Total LF = steps × LF per step.") }
                }
                if let error { Text(error).foregroundStyle(.red) }
            }
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) { Button("Save") { save() } }
            }
            .onAppear {
                if case .calibrate = pending, let hint = model.calibrationHint { a = hint; model.calibrationHint = nil }
                if let sid = model.activeSheet?.id {
                    if case .led = pending { a = model.nextZone(on: sid) }
                    if case .stair = pending { c = model.nextZone(on: sid) }
                }
            }
        }
        .presentationDetents([.medium])
    }

    private var title: String {
        switch pending {
        case .calibrate: return "Set scale"
        case .led: return "LED run"
        case .stair: return "Stair-step LED"
        }
    }

    private func save() {
        guard let sheet = model.activeSheet else { return }
        let pricing = model.pricing
        switch pending {
        case .calibrate(let pts):
            guard let ft = Geometry.parseFeet(a), ft > 0 else { error = "Enter a length like 12'6\" or 12.5"; return }
            let px = Geometry.polylinePx(pts, width: sheet.width, height: sheet.height)
            model.edit { $0.setScale(sheetId: sheet.id, pxPerFt: px / ft, label: "line \(a)", pricing: pricing) }
            model.use(.select)
            model.say("Scale set")
        case .led(let pts, let typeId):
            let typed = c.isEmpty ? nil : Geometry.parseFeet(c)
            if !c.isEmpty && typed == nil { error = "LF must be a number"; return }
            model.edit { $0.addRun(Run(projectId: $0.project.id, sheetId: sheet.id, kind: .led, deviceTypeId: typeId, points: pts, typedFt: typed, zone: a, switchLabel: b)) }
            model.say("LED zone \(a) added")
        case .stair(let pts):
            guard let steps = Int(a), steps > 0, let per = Geometry.parseFeet(b) else { error = "Enter the steps and LF per step"; return }
            model.edit { $0.addRun(Run(projectId: $0.project.id, sheetId: sheet.id, kind: .stair, deviceTypeId: "led-stair", points: pts, zone: c, switchLabel: d, steps: steps, lfPerStep: per)) }
            model.say("Stair LED: \(steps) × \(per.clean) = \((Double(steps) * per).clean) LF")
        }
        dismiss()
    }
}

/// Type the printed plan scale (PDF sheets know their paper size) or switch to drawing a line.
struct ScaleSheet: View {
    @Environment(\.dismiss) private var dismiss
    let model: EditorModel
    let sheet: Sheet
    @State private var text = ""
    @State private var error: String?

    var body: some View {
        NavigationStack {
            SentenceForm {
                if sheet.pxPerInch != nil {
                    Section {
                        TextField("1/4\" = 1'-0\"", text: $text).keyboardType(.numbersAndPunctuation)
                    } header: { Text("Plan scale") } footer: { Text("Type the scale printed on the sheet, e.g. 1/4\" = 1'-0\" or 1:48.") }
                } else {
                    Text("This sheet came from a photo or scan, so its paper size is unknown. Draw a line over a known dimension instead.")
                }
                Section { Button("Draw a line over a known dimension") { model.use(.calibrate); dismiss() } }
                if let error { Text(error).foregroundStyle(.red) }
            }
            .navigationTitle("Scale")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                if sheet.pxPerInch != nil {
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Save") {
                            guard let inPerFt = Geometry.parseScale(text), let ppi = sheet.pxPerInch else { error = "Enter a scale like 1/4\" = 1'-0\" or 1:48"; return }
                            let pricing = model.pricing
                            model.edit { $0.setScale(sheetId: sheet.id, pxPerFt: inPerFt * ppi, label: text, pricing: pricing) }
                            model.say("Scale set")
                            dismiss()
                        }
                    }
                }
            }
            .onAppear { if let l = sheet.scaleLabel, !l.hasPrefix("line") { text = l } }
        }
        .presentationDetents([.medium])
    }
}
