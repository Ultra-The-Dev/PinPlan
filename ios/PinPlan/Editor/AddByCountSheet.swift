import SwiftUI
import PinPlanCore

// "Add by count": many of one device on this plan with ONE pin, e.g. 12 windows, instead of tapping each one. The pin
// lands in the middle of the view (drag it anywhere) and shows "×12"; the takeoff, estimate, exports and alarm sensors
// count it as 12 (Marker.quantity). Door and Window come first; any device type can be counted. Same as the web's
// AddByCountDialog.tsx. Kept to small, typed expressions (the app target can't be compiled on Linux).
struct AddByCountSheet: View {
    @Environment(AppModel.self) private var app
    @Environment(\.dismiss) private var dismiss
    let model: EditorModel
    let sheet: Sheet
    let controller: PlanViewportController

    @AppStorage("addByCount.type") private var typeId: String = Catalog.openingTypeIds[1]
    @State private var count: Int = 10
    @State private var room: String = ""

    private var types: [DeviceType] {
        let trades: [TradeId] = app.trades
        return app.liveCatalog.filter { $0.kind == .device && Trades.typeVisible($0, for: trades) }
    }

    /// Doors and windows (and the company's own door / window types), the generic ones first.
    private var openings: [DeviceType] {
        let list: [DeviceType] = types.filter { AlarmSensors.openingKind($0) != nil }
        let generic: [DeviceType] = list.filter { Catalog.openingTypeIds.contains($0.id) }
        let own: [DeviceType] = list.filter { !Catalog.openingTypeIds.contains($0.id) }
        return generic + own
    }

    private var chosen: DeviceType? {
        let all: [DeviceType] = types
        if let t = all.first(where: { $0.id == typeId }) { return t }
        return openings.first ?? all.first
    }

    var body: some View {
        NavigationStack {
            SentenceForm {
                Section {
                    ForEach(openings) { d in
                        Button { typeId = d.id } label: { typeRow(d) }
                            .accessibilityAddTraits(chosen?.id == d.id ? .isSelected : [])
                            .accessibilityIdentifier("count-type-\(d.id)")
                    }
                    Picker("Other device", selection: Binding(get: { chosen?.id ?? "" }, set: { typeId = $0 })) {
                        ForEach(types) { d in Text(d.name).tag(d.id) }
                    }
                    .accessibilityIdentifier("count-type")
                } header: {
                    Text("Device").textCase(nil)
                } footer: {
                    Text("Too many to pin one by one? One pin stands for all of them and counts as that many everywhere.")
                }
                Section {
                    CountStepperField(value: $count)
                } header: {
                    Text("How many").textCase(nil)
                }
                Section {
                    TextField("Room (optional)", text: $room)
                        .accessibilityIdentifier("count-room")
                } footer: {
                    Text("It goes in the middle of the plan view. Drag it where you like.")
                }
            }
            .navigationTitle("Add by count")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Add") { place() }
                        .disabled(chosen == nil)
                        .accessibilityIdentifier("count-place")
                }
            }
            .onAppear { room = model.room }
        }
        .presentationDetents([.medium, .large])
    }

    private func typeRow(_ d: DeviceType) -> some View {
        let on: Bool = chosen?.id == d.id
        return HStack(spacing: 10) {
            DeviceSymbol(type: d, size: 26)
            Text(d.name).foregroundStyle(Color.primary)
            Spacer()
            if on { Image(systemName: "checkmark").foregroundStyle(Color.brand) }
        }
        .contentShape(Rectangle())
    }

    private func place() {
        guard let t = chosen else { return }
        let visible: PlanRect = controller.viewport.visibleSheetRect
        let center: PlanPoint = visible.isEmpty ? PlanPoint(x: 0.5, y: 0.5) : visible.center
        let taken: [PlanPoint] = model.bundle.liveMarkers.filter { $0.sheetId == sheet.id }.map { PlanPoint(x: $0.x, y: $0.y) }
        let at: PlanPoint = Marker.countPinSpot(center: center, taken: taken)
        let n: Int = count
        let r: String = room.trimmingCharacters(in: .whitespaces)
        var newId: String = ""
        let ok: Bool = model.edit { b in
            let m: Marker = b.addMarker(type: t, sheetId: sheet.id, x: at.x, y: at.y, room: r, count: n)
            newId = m.id
        }
        guard ok else { return }
        typeId = t.id
        model.use(.select)
        model.selection = .marker(newId)
        model.say(String(localized: "Added \(t.name) ×\(n). Drag the pin where you like."))
        Haptics.tap()
        dismiss()
    }
}

/// − [ 12 ] + for a count (1…9999): big buttons for gloves, and the number field takes the keypad.
struct CountStepperField: View {
    @Binding var value: Int
    /// False: a typed number is applied when the field loses focus (the device card: one undo step, never passing
    /// through 1 on the way from 12 to 15). True: every keystroke (the add sheet's button).
    var live: Bool = true
    @State private var text: String = ""
    @FocusState private var focused: Bool

    /// A number, not a word: not looked up in the string catalog.
    private let placeholder: String = "10"

    private func clamp(_ n: Int) -> Int { min(Marker.maxCount, max(1, n)) }

    var body: some View {
        HStack(spacing: 12) {
            Button { setValue(value - 1) } label: { Image(systemName: "minus") }
                .buttonStyle(.bordered)
                .disabled(value <= 1)
                .accessibilityLabel("One less")
            TextField(placeholder, text: $text)
                .keyboardType(.numberPad)
                .multilineTextAlignment(.center)
                .font(.title3.weight(.semibold).monospacedDigit())
                .frame(minWidth: 70)
                .focused($focused)
                .onChange(of: text) { _, s in typed(s) }
                .onChange(of: focused) { _, f in if !f { commitText() } }
                .accessibilityIdentifier("count-input")
            Button { setValue(value + 1) } label: { Image(systemName: "plus") }
                .buttonStyle(.bordered)
                .disabled(value >= Marker.maxCount)
                .accessibilityLabel("One more")
        }
        .controlSize(.large)
        .frame(maxWidth: .infinity)
        .onAppear { text = String(value) }
        .onChange(of: value) { _, v in if !focused { text = String(v) } }
    }

    private func setValue(_ n: Int) {
        let v: Int = clamp(n)
        value = v
        text = String(v)
    }

    private func typed(_ s: String) {
        let digits: String = String(s.filter { $0.isNumber }.prefix(4))
        if digits != s { text = digits; return }
        guard live, let n = Int(digits), n >= 1 else { return }
        value = clamp(n)
    }

    private func commitText() {
        guard let n = Int(text), n >= 1 else { text = String(value); return }
        let v: Int = clamp(n)
        text = String(v)
        if v != value { value = v }
    }
}
