import SwiftUI
import UIKit
import PencilKit
import PinPlanCore

/// Weather for a job day from Open-Meteo (no API key). 5 s timeout; offline or any error gives nil. Cached for the session.
@MainActor
enum DailyWeatherService {
    enum Outcome { case filled(DailyReport.Weather), offline, unavailable }
    private static var cache: [String: DailyReport.Weather] = [:]
    private static let session: URLSession = {
        let c = URLSessionConfiguration.ephemeral
        c.timeoutIntervalForRequest = 5
        c.timeoutIntervalForResource = 5
        c.waitsForConnectivity = false
        return URLSession(configuration: c)
    }()

    static func fetch(lat: Double, lng: Double, date: String, today: String) async -> Outcome {
        guard let url = DailyReportLogic.openMeteoURL(lat: lat, lng: lng, date: date, today: today) else { return .unavailable }
        let key = "\(String(format: "%.3f,%.3f", lat, lng)),\(date),\(date >= today ? today : "")"
        if let w = cache[key] { return .filled(w) }
        do {
            let (data, resp) = try await session.data(for: URLRequest(url: url, timeoutInterval: 5))
            guard (resp as? HTTPURLResponse)?.statusCode == 200,
                  let w = DailyReportLogic.weatherFromOpenMeteo(data, date: date, today: today) else { return .unavailable }
            cache[key] = w
            return .filled(w)
        } catch let e as URLError {
            let offline: [URLError.Code] = [.notConnectedToInternet, .networkConnectionLost, .timedOut, .cannotFindHost, .dataNotAllowed, .internationalRoamingOff]
            return offline.contains(e.code) ? .offline : .unavailable
        } catch {
            return .unavailable
        }
    }
}

/// Draw-to-sign box (PencilKit: finger or Pencil). Reports whether something is drawn.
struct SignatureCanvas: UIViewRepresentable {
    @Binding var drawing: PKDrawing
    func makeUIView(context: Context) -> PKCanvasView {
        let v = PKCanvasView()
        v.drawingPolicy = .anyInput
        v.tool = PKInkingTool(.pen, color: .black, width: 3)
        v.backgroundColor = .white
        v.isOpaque = true
        v.isScrollEnabled = false
        v.delegate = context.coordinator
        v.drawing = drawing
        return v
    }
    func updateUIView(_ v: PKCanvasView, context: Context) {
        // Only "Clear" changes the drawing from outside.
        if drawing.strokes.isEmpty && !v.drawing.strokes.isEmpty { v.drawing = drawing }
    }
    func makeCoordinator() -> Coordinator { Coordinator(self) }
    final class Coordinator: NSObject, PKCanvasViewDelegate {
        let parent: SignatureCanvas
        init(_ p: SignatureCanvas) { parent = p }
        func canvasViewDrawingDidChange(_ canvasView: PKCanvasView) { parent.drawing = canvasView.drawing }
    }
}

/// The structured daily report editor (weather, crew & hours, work, deliveries, equipment, delays, safety, visitors,
/// photos, notes, signature). Same rules as the web editor (DailyReportLogic in PinPlanCore).
struct DailyReportEditor: View {
    @Environment(AppModel.self) private var app
    @Environment(\.dismiss) private var dismiss
    let model: EditorModel
    @State var log: JobLog
    @State private var report = DailyReport()
    @State private var loaded = false
    @State private var weatherState: WeatherState = .idle
    @State private var sigDrawing = PKDrawing()
    @State private var sigName = ""
    @State private var unlocked = false
    @State private var notice: String?

    enum WeatherState: Equatable { case idle, loading, offline, later, noLocation, unavailable }

    private var isNew: Bool { !model.bundle.jobLogs.contains { $0.id == log.id } }
    private var access: DailyReportLogic.EditAccess {
        DailyReportLogic.editAccess(log, role: app.cloud.role, me: FieldAuthor.name(app))
    }
    private var locked: Bool { log.report?.signature != nil && !unlocked && !isNew }

    var body: some View {
        NavigationStack {
            Form {
                if locked {
                    lockedSection
                } else {
                    daySection
                    weatherSection
                    crewSection
                    workSection
                    listSection(String(localized: "Materials delivered"), items: $report.deliveries, placeholder: String(localized: "e.g. 4 boxes Cat6 from ADI"), add: String(localized: "Add delivery"))
                    listSection(String(localized: "Equipment"), items: $report.equipment, placeholder: String(localized: "e.g. Scissor lift"), add: String(localized: "Add equipment"))
                    delaysSection
                    safetySection
                    listSection(String(localized: "Visitors & inspections"), items: $report.visitors, placeholder: String(localized: "e.g. City inspector — rough-in passed"), add: String(localized: "Add visitor"))
                    photosSection
                    Section("Notes") {
                        TextField("Anything else: issues, what’s next…", text: $log.body, axis: .vertical).lineLimit(3...12)
                    }
                    signatureSection
                }
            }
            .navigationTitle(isNew ? "New daily log" : "Daily log")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                if !locked {
                    ToolbarItem(placement: .confirmationAction) { Button("Save") { save() }.bold().disabled(!canSave) }
                }
            }
            .alert("Daily log", isPresented: Binding(get: { notice != nil }, set: { if !$0 { notice = nil } })) {
                Button("OK", role: .cancel) {}
            } message: { Text(notice ?? "") }
            .onAppear(perform: load)
        }
    }

    // MARK: Sections

    private var lockedSection: some View {
        Section {
            if let s = log.report?.signature {
                Label("Signed by \(s.name)", systemImage: "checkmark.seal.fill").foregroundStyle(Color.green)
                if let img = app.store.image(s.imageId) {
                    Image(uiImage: img).resizable().scaledToFit().frame(maxHeight: 90)
                }
            }
            if access == .denied {
                Text("Only the person who signed it or the office can change a signed log.").foregroundStyle(.secondary)
            } else {
                Button(role: .destructive) {
                    unlocked = true
                    report.signature = nil
                } label: { Label("Edit (clears the signature)", systemImage: "pencil") }
            }
        } footer: { Text("Sign again after editing.") }
    }

    private var day: Binding<Date> {
        Binding(get: {
            let f = DateFormatter(); f.locale = Locale(identifier: "en_US_POSIX"); f.dateFormat = "yyyy-MM-dd"
            return f.date(from: log.date) ?? Date()
        }, set: { d in
            let f = DateFormatter(); f.locale = Locale(identifier: "en_US_POSIX"); f.dateFormat = "yyyy-MM-dd"
            log.date = f.string(from: d)
            let w = report.weather
            if DailyReportLogic.weatherLine(w).isEmpty || w?.source == "auto" { Task { await fillWeather(replace: true) } }
        })
    }

    private var daySection: some View {
        Section {
            DatePicker("Day", selection: day, displayedComponents: .date)
            TextField("Title (e.g. Rough-in, 2nd floor)", text: Binding(get: { log.title ?? "" }, set: { log.title = $0 }))
        } footer: {
            let missing = DailyReportLogic.completeness(reportForChecks)
            if !missing.isEmpty { Text("Not filled in yet: \(missing.map { tr($0.label) }.joined(separator: ", "))") }
        }
    }

    private var hasLocation: Bool { model.bundle.project.lat != nil && model.bundle.project.lng != nil }

    /// A typed weather number: makes the weather manual (no longer labelled auto / forecast).
    private func setWeather(_ change: (inout DailyReport.Weather) -> Void) {
        var w = report.weather ?? DailyReport.Weather()
        change(&w)
        w.source = "manual"; w.forecast = nil
        report.weather = w
    }

    private var weatherSection: some View {
        Section {
            let line = DailyReportLogic.weatherLine(report.weather)
            let placeholder: String = weatherState == .loading ? String(localized: "Getting weather…") : String(localized: "No weather yet")
            HStack {
                if line.isEmpty {
                    Text(placeholder).foregroundStyle(.secondary)
                } else {
                    Label(line, systemImage: DailyReportLogic.weatherSymbol(report.weather?.summary))
                }
                Spacer()
                if weatherState == .loading { ProgressView() }
            }
            Picker("Conditions", selection: Binding(get: { report.weather?.summary ?? "" }, set: { s in
                var w = report.weather ?? DailyReport.Weather()
                w.summary = s.isEmpty ? nil : s
                w.source = "manual"; w.forecast = nil
                report.weather = w
            })) {
                Text("—").tag("")
                ForEach(conditionChoices, id: \.self) { c in Label(c, systemImage: DailyReportLogic.weatherSymbol(c)).tag(c) }
            }
            HStack {
                DecimalField(title: String(localized: "High °F"), value: report.weather?.tempHighF, onChange: { v in setWeather { $0.tempHighF = v } })
                DecimalField(title: String(localized: "Low °F"), value: report.weather?.tempLowF, onChange: { v in setWeather { $0.tempLowF = v } })
            }
            HStack {
                DecimalField(title: String(localized: "Precip (in)"), value: report.weather?.precipIn, onChange: { v in setWeather { $0.precipIn = v } })
                DecimalField(title: String(localized: "Wind (mph)"), value: report.weather?.windMph, onChange: { v in setWeather { $0.windMph = v } })
            }
            if hasLocation && weatherState != .later {
                Button { Task { await fillWeather(replace: true) } } label: { Label("Auto-fill", systemImage: "arrow.clockwise") }
                    .disabled(weatherState == .loading)
            }
            if weatherState == .offline {
                Button { weatherState = .later } label: { Label("Fill weather later", systemImage: "icloud.slash") }
            }
        } header: {
            Text("Weather")
        } footer: {
            weatherFooter
        }
    }

    @ViewBuilder private var weatherFooter: some View {
        switch weatherState {
        case .offline: Text("You’re offline — type it in, or fill it later.")
        case .later: Text("Open this log again when you’re online and the weather fills in.")
        case .noLocation: Text("Set the job’s location (or add a photo with GPS) to fill the weather automatically.")
        case .unavailable: Text("Couldn’t get the weather for this day — type it in.")
        default:
            if report.weather?.forecast == true { Text("From the forecast.") } else if report.weather?.source == "auto" { Text("From Open-Meteo.") }
        }
    }

    private var conditionChoices: [String] {
        var c = DailyReportLogic.weatherChoices
        if let s = report.weather?.summary, !s.isEmpty, !c.contains(s) { c.insert(s, at: 0) }
        return c
    }

    private var crewSection: some View {
        Section {
            ForEach(Array((report.crew ?? []).indices), id: \.self) { i in
                CrewRowView(row: crewRow(i))
            }
            .onDelete { idx in report.crew = (report.crew ?? []).enumerated().filter { !idx.contains($0.offset) }.map { $0.element } }
            Button { report.crew = (report.crew ?? []) + [DailyReport.Crew(name: "", hours: 8)] } label: { Label("Add person", systemImage: "person.badge.plus") }
            let quick = quickNames
            if !quick.isEmpty {
                Menu {
                    ForEach(quick, id: \.self) { n in
                        Button(n) { report.crew = (report.crew ?? []).filter { !$0.name.trimmingCharacters(in: .whitespaces).isEmpty } + [DailyReport.Crew(name: n, hours: 8)] }
                    }
                } label: { Label("Add from team / recent crew", systemImage: "person.2") }
            }
            if let prev = DailyReportLogic.previousLog(model.bundle.jobLogs, before: log.date, excluding: log.id) {
                let title: String = prev.date == DailyReportLogic.addDays(log.date, -1) ? String(localized: "Copy from yesterday") : String(localized: "Copy from \(dayTitle(prev.date))")
                Button { copy(from: prev) } label: { Label(title, systemImage: "doc.on.doc") }
            }
        } header: {
            Text("Crew & hours")
        } footer: {
            crewFooter
        }
    }

    @ViewBuilder private var crewFooter: some View {
        let t = DailyReportLogic.totals(report)
        let dupes = DailyReportLogic.mergeCrew(report.crew ?? []).duplicates
        VStack(alignment: .leading, spacing: 4) {
            if t.crew > 0 { Text("\(t.crew) people · \(DailyReportLogic.number(t.manHours)) man-hours") }
            if !dupes.isEmpty {
                Text("\(dupes.joined(separator: ", ")) listed more than once — the hours are added together when you save.").foregroundStyle(Color.orange)
            }
        }
    }

    private var quickNames: [String] {
        let names = DailyReportLogic.crewSuggestions(members: app.cloud.teamMembers.map(\.label), logs: model.bundle.jobLogs)
        let have = Set((report.crew ?? []).map { $0.name.lowercased() })
        return names.filter { !have.contains($0.lowercased()) }
    }

    private var workSection: some View {
        Section("Work performed") {
            ForEach(Array((report.work ?? []).indices), id: \.self) { i in
                WorkRowView(row: workRow(i), sheets: model.bundle.liveSheets)
            }
            .onDelete { idx in report.work = (report.work ?? []).enumerated().filter { !idx.contains($0.offset) }.map { $0.element } }
            Button { report.work = (report.work ?? []) + [DailyReport.Work(text: "")] } label: { Label("Add work", systemImage: "hammer") }
        }
    }

    private func listSection(_ title: String, items: Binding<[String]?>, placeholder: String, add: String) -> some View {
        Section(title) {
            ForEach(Array((items.wrappedValue ?? []).indices), id: \.self) { i in
                TextField(placeholder, text: Binding(get: {
                    let xs = items.wrappedValue ?? []
                    return i < xs.count ? xs[i] : ""
                }, set: { v in
                    var xs = items.wrappedValue ?? []
                    if i < xs.count { xs[i] = v; items.wrappedValue = xs }
                }))
            }
            .onDelete { idx in items.wrappedValue = (items.wrappedValue ?? []).enumerated().filter { !idx.contains($0.offset) }.map { $0.element } }
            Button { items.wrappedValue = (items.wrappedValue ?? []) + [""] } label: { Label(add, systemImage: "plus") }
        }
    }

    private var delaysSection: some View {
        Section {
            ForEach(Array((report.delays ?? []).indices), id: \.self) { i in
                DelayRowView(row: delayRow(i))
            }
            .onDelete { idx in report.delays = (report.delays ?? []).enumerated().filter { !idx.contains($0.offset) }.map { $0.element } }
            Button { report.delays = (report.delays ?? []) + [DailyReport.Delay(reason: "")] } label: { Label("Add delay", systemImage: "hourglass") }
        } header: { Text("Delays") } footer: {
            let h = DailyReportLogic.totals(report).delayHours
            if h > 0 { Text("\(DailyReportLogic.hoursText(h)) lost") }
        }
    }

    private var safetySection: some View {
        Section("Safety") {
            HStack(spacing: 10) {
                safetyButton(String(localized: "No incidents"), incident: false)
                safetyButton(String(localized: "Incident"), incident: true)
            }
            let hint: String = report.safety?.incident == true ? String(localized: "What happened, who, first aid / follow-up…") : String(localized: "Toolbox talk, hazards, PPE (optional)")
            TextField(hint,
                      text: Binding(get: { report.safety?.notes ?? "" }, set: { v in
                          report.safety = DailyReport.Safety(incident: report.safety?.incident ?? false, notes: v)
                      }), axis: .vertical)
                .lineLimit(1...6)
        }
    }

    private func safetyButton(_ title: String, incident: Bool) -> some View {
        let on = report.safety != nil && report.safety?.incident == incident
        let tint: Color = incident ? Color.red : Color.green
        return Button {
            report.safety = DailyReport.Safety(incident: incident, notes: report.safety?.notes)
        } label: {
            Text(title).frame(maxWidth: .infinity).padding(.vertical, 6)
        }
        .buttonStyle(.bordered)
        .tint(on ? tint : Color.secondary)
    }

    private var photosSection: some View {
        let dayPhotos = model.bundle.livePhotos.filter { FieldDocs.localDay($0.takenAt) == log.date || (log.photoIds ?? []).contains($0.id) }
        let chosen = Set(log.photoIds ?? [])
        return Section {
            if dayPhotos.isEmpty { Text("No photos taken on this day yet.").foregroundStyle(.secondary) }
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 70), spacing: 6)], spacing: 6) {
                ForEach(dayPhotos) { p in
                    let on = chosen.contains(p.id)
                    Button {
                        log.photoIds = on ? (log.photoIds ?? []).filter { $0 != p.id } : (log.photoIds ?? []) + [p.id]
                    } label: {
                        PhotoThumb(photo: p)
                            .opacity(on ? 1 : 0.55)
                            .overlay(alignment: .topTrailing) { if on { Image(systemName: "checkmark.circle.fill").foregroundStyle(Color.white, Color.accentColor).padding(3) } }
                    }
                    .buttonStyle(.plain)
                }
            }
            PhotoAddMenu(model: model, onAdded: { added in
                log.photoIds = (log.photoIds ?? []) + added.map(\.id)
            }) { Label("Add photos", systemImage: "camera") }
        } header: { Text("Photos") }
    }

    private var signatureSection: some View {
        Section {
            if let s = report.signature {
                if let img = app.store.image(s.imageId) {
                    Image(uiImage: img).resizable().scaledToFit().frame(maxHeight: 90)
                }
                Text("Signed by \(s.name)").font(.subheadline)
                Button("Sign again") { report.signature = nil }
            } else {
                TextField("Foreman", text: $sigName).textContentType(.name)
                SignatureCanvas(drawing: $sigDrawing)
                    .frame(height: 150)
                    .clipShape(RoundedRectangle(cornerRadius: 10))
                    .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color.secondary.opacity(0.4)))
                    .listRowInsets(EdgeInsets(top: 8, leading: 12, bottom: 8, trailing: 12))
                if !sigDrawing.strokes.isEmpty {
                    Button("Clear signature", role: .destructive) { sigDrawing = PKDrawing() }
                }
            }
        } header: { Text("Signature") } footer: { Text("Sign with your finger or Apple Pencil.") }
    }

    // MARK: Row bindings (index-safe: a row deleted while its field is focused must not crash)

    private func crewRow(_ i: Int) -> Binding<DailyReport.Crew> {
        Binding(get: {
            let xs = report.crew ?? []
            return i < xs.count ? xs[i] : DailyReport.Crew(name: "", hours: 0)
        }, set: { v in
            var xs = report.crew ?? []
            if i < xs.count { xs[i] = v; report.crew = xs }
        })
    }
    private func workRow(_ i: Int) -> Binding<DailyReport.Work> {
        Binding(get: {
            let xs = report.work ?? []
            return i < xs.count ? xs[i] : DailyReport.Work(text: "")
        }, set: { v in
            var xs = report.work ?? []
            if i < xs.count { xs[i] = v; report.work = xs }
        })
    }
    private func delayRow(_ i: Int) -> Binding<DailyReport.Delay> {
        Binding(get: {
            let xs = report.delays ?? []
            return i < xs.count ? xs[i] : DailyReport.Delay(reason: "")
        }, set: { v in
            var xs = report.delays ?? []
            if i < xs.count { xs[i] = v; report.delays = xs }
        })
    }

    // MARK: Actions

    /// What the completeness hint looks at (a signature drawn but not saved yet counts).
    private var reportForChecks: DailyReport {
        var r = report
        if r.signature == nil && !sigDrawing.strokes.isEmpty { r.signature = DailyReport.Signature(name: sigName, imageId: "pending", signedAt: "") }
        return r
    }

    private var canSave: Bool {
        !log.body.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || !(log.title ?? "").trimmingCharacters(in: .whitespaces).isEmpty
            || DailyReportLogic.hasContent(report) || !sigDrawing.strokes.isEmpty
    }

    private func load() {
        guard !loaded else { return }
        loaded = true
        report = log.report ?? DailyReportLogic.empty()
        if report.crew == nil { report.crew = [] }
        if report.work == nil { report.work = [] }
        if report.delays == nil { report.delays = [] }
        sigName = log.report?.signature?.name ?? log.author ?? FieldAuthor.name(app)
        let auto = isNew || (log.report != nil && DailyReportLogic.weatherLine(log.report?.weather).isEmpty)
        if auto && !locked { Task { await fillWeather(replace: false) } }
    }

    private func fillWeather(replace: Bool) async {
        guard let lat = model.bundle.project.lat, let lng = model.bundle.project.lng else { weatherState = .noLocation; return }
        weatherState = .loading
        let date = log.date
        let outcome = await DailyWeatherService.fetch(lat: lat, lng: lng, date: date, today: FieldDocs.localDay(isoNow()))
        guard date == log.date else { return }
        switch outcome {
        case .filled(let w):
            let current = report.weather
            if replace || DailyReportLogic.weatherLine(current).isEmpty || current?.source == "auto" { report.weather = w }
            weatherState = .idle
        case .offline: weatherState = .offline
        case .unavailable: weatherState = .unavailable
        }
    }

    private func copy(from prev: JobLog) {
        let c = DailyReportLogic.copyFromPrevious(prev)
        if (c.crew ?? []).isEmpty && (c.equipment ?? []).isEmpty && (c.delays ?? []).isEmpty {
            notice = String(localized: "Nothing to copy from \(dayTitle(prev.date)).")
            return
        }
        let crew = (report.crew ?? []).filter { !$0.name.trimmingCharacters(in: .whitespaces).isEmpty }
        let have = Set(crew.map { $0.name.lowercased() })
        report.crew = crew + (c.crew ?? []).filter { !have.contains($0.name.lowercased()) }
        var equipment = (report.equipment ?? []).filter { !$0.trimmingCharacters(in: .whitespaces).isEmpty }
        for e in c.equipment ?? [] where !equipment.contains(e) { equipment.append(e) }
        report.equipment = equipment
        let delays = (report.delays ?? []).filter { !$0.reason.trimmingCharacters(in: .whitespaces).isEmpty }
        let reasons = Set(delays.map { $0.reason.lowercased() })
        report.delays = delays + (c.delays ?? []).filter { !reasons.contains($0.reason.lowercased()) }
    }

    private func save() {
        var cleaned = DailyReportLogic.cleaned(report)
        let author = (log.author ?? "").isEmpty ? FieldAuthor.name(app) : (log.author ?? "")
        if cleaned.report.signature == nil && !sigDrawing.strokes.isEmpty, let id = saveSignature() {
            let name = sigName.trimmingCharacters(in: .whitespaces)
            cleaned.report.signature = DailyReport.Signature(name: name.isEmpty ? author : name, imageId: id, signedAt: isoNow())
        }
        var l = log
        l.author = author
        l.title = l.title?.trimmingCharacters(in: .whitespaces).isEmpty == true ? nil : l.title?.trimmingCharacters(in: .whitespaces)
        l.body = l.body.trimmingCharacters(in: .whitespacesAndNewlines)
        // Older free-text logs stay as they were unless something structured was added.
        if isNew || log.report != nil || DailyReportLogic.hasContent(cleaned.report) { l.report = cleaned.report }
        model.saveRow(l, in: \.jobLogs)
        dismiss()
    }

    /// The signature as a JPEG on white (like the web app's image), stored with the job's images.
    private func saveSignature() -> String? {
        let bounds = sigDrawing.bounds.insetBy(dx: -12, dy: -12)
        guard !bounds.isEmpty else { return nil }
        let ink = sigDrawing.image(from: bounds, scale: 2)
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        let size = CGSize(width: ink.size.width * 2, height: ink.size.height * 2)
        let img = UIGraphicsImageRenderer(size: size, format: format).image { ctx in
            UIColor.white.setFill()
            ctx.fill(CGRect(origin: .zero, size: size))
            ink.draw(in: CGRect(origin: .zero, size: size))
        }
        return app.store.saveImage(img, quality: 0.85)
    }
}

// MARK: - Rows

/// Number box that keeps what's typed ("7," on the way to "7,5") and reports the parsed value.
private struct DecimalField: View {
    let title: String
    let value: Double?
    var parse: (String) -> Double? = { Double($0.trimmingCharacters(in: .whitespaces).replacingOccurrences(of: ",", with: ".")) }
    let onChange: (Double?) -> Void
    @State private var text = ""

    var body: some View {
        TextField(title, text: $text)
            .keyboardType(.decimalPad)
            .onAppear { text = value.map { DailyReportLogic.number($0) } ?? "" }
            .onChange(of: value) { _, v in
                // Set from outside (auto-fill, stepper): show it unless it's what's already typed.
                if parse(text) != v { text = v.map { DailyReportLogic.number($0) } ?? "" }
            }
            .onChange(of: text) { _, t in
                let v = parse(t)
                if v != value { onChange(v) }
            }
    }
}

private struct CrewRowView: View {
    @Binding var row: DailyReport.Crew
    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            TextField("Name", text: $row.name).textContentType(.name)
            Stepper(value: Binding(get: { row.hours }, set: { row.hours = DailyReportLogic.clampHours($0) }), in: 0...24, step: 0.5) {
                HStack(spacing: 6) {
                    DecimalField(title: String(localized: "Hours"), value: row.hours, parse: { DailyReportLogic.parseHours($0) }, onChange: { v in row.hours = v ?? 0 })
                        .frame(width: 56)
                        .multilineTextAlignment(.trailing)
                    Text("h").foregroundStyle(.secondary)
                }
            }
        }
    }
}

private struct WorkRowView: View {
    @Binding var row: DailyReport.Work
    let sheets: [Sheet]
    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            TextField("e.g. Pulled Cat6 to 12 drops", text: $row.text, axis: .vertical)
            HStack {
                if !sheets.isEmpty {
                    Picker("Sheet", selection: Binding(get: { row.sheetId ?? "" }, set: { row.sheetId = $0.isEmpty ? nil : $0 })) {
                        Text("No sheet").tag("")
                        ForEach(sheets) { s in Text(s.name).tag(s.id) }
                    }
                    .labelsHidden()
                    .font(.caption)
                }
                TextField("Area / room", text: Binding(get: { row.area ?? "" }, set: { row.area = $0.isEmpty ? nil : $0 }))
                    .font(.caption)
            }
        }
    }
}

private struct DelayRowView: View {
    @Binding var row: DailyReport.Delay
    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            TextField("Reason, e.g. Waiting on drywall", text: $row.reason)
            Stepper(value: Binding(get: { row.hours ?? 0 }, set: { row.hours = $0 > 0 ? DailyReportLogic.clampHours($0) : nil }), in: 0...24, step: 0.5) {
                Text("\(DailyReportLogic.hoursText(row.hours ?? 0)) lost").foregroundStyle(.secondary)
            }
            Toggle("Still ongoing", isOn: Binding(get: { row.ongoing == true }, set: { row.ongoing = $0 ? true : nil }))
                .font(.subheadline)
        }
    }
}

// MARK: - Weekly hours

struct WeeklyHoursView: View {
    @Environment(\.dismiss) private var dismiss
    let model: EditorModel
    @State private var start = ""
    @State private var share: SharedFile?

    var body: some View {
        let w = DailyReportLogic.weeklyHours(model.bundle.jobLogs, weekStart: start.isEmpty ? DailyReportLogic.weekStart(of: FieldDocs.localDay(isoNow())) : start)
        NavigationStack {
            List {
                Section {
                    HStack {
                        Button { start = DailyReportLogic.addDays(w.days[0], -7) } label: { Image(systemName: "chevron.left") }.buttonStyle(.borderless).accessibilityLabel("Previous week")
                        Spacer()
                        Text("\(dayTitle(w.days[0])) – \(dayTitle(w.days[6]))").font(.subheadline)
                        Spacer()
                        Button { start = DailyReportLogic.addDays(w.days[0], 7) } label: { Image(systemName: "chevron.right") }.buttonStyle(.borderless).accessibilityLabel("Next week")
                    }
                }
                if w.rows.isEmpty {
                    Text("No crew hours on the daily logs this week.").foregroundStyle(.secondary)
                } else {
                    Section {
                        ForEach(w.rows, id: \.name) { r in WeeklyRow(name: r.name, hours: r.hours, total: r.total, days: w.days, bold: false) }
                        WeeklyRow(name: String(localized: "Total"), hours: w.dayTotals, total: w.total, days: w.days, bold: true)
                    }
                }
            }
            .navigationTitle("Weekly hours")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Close") { dismiss() } }
                ToolbarItem(placement: .primaryAction) {
                    Button { exportCSV(w) } label: { Label("CSV", systemImage: "square.and.arrow.up") }.disabled(w.rows.isEmpty)
                }
            }
            .onAppear {
                if start.isEmpty { start = DailyReportLogic.weekStart(of: model.bundle.liveLogs.first?.date ?? FieldDocs.localDay(isoNow())) }
            }
            .shareSheet($share)
        }
    }

    private func exportCSV(_ w: DailyReportLogic.WeeklyHours) {
        let job = model.bundle.project.address.isEmpty ? model.bundle.project.clientName : model.bundle.project.address
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("\(slug(job.isEmpty ? "job" : job))-hours-\(w.days[0]).csv")
        try? DailyReportLogic.weeklyHoursCSV(w).data(using: .utf8)?.write(to: url, options: .atomic)
        share = SharedFile(url: url)
    }
}

private struct WeeklyRow: View {
    let name: String
    let hours: [Double]
    let total: Double
    let days: [String]
    let bold: Bool
    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(name).fontWeight(bold ? .semibold : .regular)
                Spacer()
                Text("\(DailyReportLogic.number(total)) h").fontWeight(.semibold).monospacedDigit()
            }
            HStack(spacing: 0) {
                ForEach(0..<7, id: \.self) { i in
                    VStack(spacing: 2) {
                        Text(weekday(days[i])).font(.caption2).foregroundStyle(.secondary)
                        Text(hours[i] > 0 ? DailyReportLogic.number(hours[i]) : "–").font(.caption).monospacedDigit()
                    }
                    .frame(maxWidth: .infinity)
                }
            }
        }
        .padding(.vertical, 2)
    }
    private func weekday(_ d: String) -> String {
        let f = DateFormatter(); f.locale = Locale(identifier: "en_US_POSIX"); f.dateFormat = "yyyy-MM-dd"
        guard let date = f.date(from: d) else { return "" }
        return date.formatted(.dateTime.weekday(.abbreviated))
    }
}

/// One-line badges for a structured log in the list: weather, man-hours, delays, incident, signed.
struct DailyReportBadges: View {
    let log: JobLog
    var body: some View {
        if let r = log.report {
            let t = DailyReportLogic.totals(r)
            HStack(spacing: 6) {
                if let w = r.weather, !DailyReportLogic.weatherLine(w).isEmpty {
                    badge(weatherText(w), symbol: DailyReportLogic.weatherSymbol(w.summary), tint: Color.blue)
                }
                if t.manHours > 0 { badge(String(localized: "\(DailyReportLogic.number(t.manHours)) man-hours"), symbol: "person.2", tint: Color.indigo) }
                if t.delayHours > 0 { badge(String(localized: "\(DailyReportLogic.hoursText(t.delayHours)) delay"), symbol: "hourglass", tint: Color.orange) }
                if r.safety?.incident == true { badge(String(localized: "Incident"), symbol: "exclamationmark.shield", tint: Color.red) }
                if r.signature != nil { badge(String(localized: "Signed"), symbol: "checkmark.seal", tint: Color.green) }
            }
        }
    }
    private func weatherText(_ w: DailyReport.Weather) -> String {
        var parts: [String] = []
        if let s = w.summary, !s.isEmpty { parts.append(s) }
        if let hi = w.tempHighF { parts.append("\(DailyReportLogic.number(hi))°") }
        return parts.joined(separator: " · ")
    }
    private func badge(_ text: String, symbol: String, tint: Color) -> some View {
        Label(text, systemImage: symbol)
            .font(.caption2.weight(.medium))
            .lineLimit(1)
            .padding(.horizontal, 6)
            .padding(.vertical, 3)
            .background(tint.opacity(0.12), in: Capsule())
            .foregroundStyle(tint)
    }
}

