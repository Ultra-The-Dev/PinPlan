import SwiftUI
import PinPlanCore

/// Takeoff: the device and wire count per floor, its exports, and the wiring sheets for the crew (no prices).
struct TakeoffView: View {
    @Environment(AppModel.self) private var app
    let model: EditorModel
    /// The wiring sheets page (home runs, wiring PDFs, closet ports), pushed from here.
    @Binding var showWiring: Bool
    @Environment(\.exportPlacement) private var exportPlacement
    @State private var share: SharedFile?
    @State private var busy = false
    @State private var openOrderList = false

    var body: some View {
        let t = model.takeoff
        let tot = t.total
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                // Buttons beside the note on wide screens; note under the buttons on a phone.
                ViewThatFits(in: .horizontal) {
                    HStack(alignment: .top) {
                        countedNote.frame(maxWidth: 420, alignment: .leading)
                        Spacer()
                        exportButtons
                    }
                    VStack(alignment: .leading, spacing: 8) {
                        HStack { exportButtons }
                        countedNote
                    }
                    // iPhone SE, long languages, large text: one button per line, never cut off.
                    VStack(alignment: .leading, spacing: 8) {
                        exportButtons
                        countedNote
                    }
                }
                LazyVGrid(columns: [GridItem(.adaptive(minimum: 150), spacing: 12)], spacing: 12) {
                    StatTile(label: String(localized: "Cameras"), value: "\(tot.count(["cam-indoor", "cam-outdoor"]))", sub: String(localized: "\(tot.counts["cam-outdoor"] ?? 0) outdoor"))
                    StatTile(label: String(localized: "Wi-Fi APs"), value: "\(tot.counts["wap"] ?? 0)")
                    StatTile(label: String(localized: "Speakers"), value: "\(tot.counts["speaker"] ?? 0)", sub: (tot.tentative["speaker"] ?? 0) > 0 ? String(localized: "\(tot.tentative["speaker"]!) optional") : nil)
                    StatTile(label: String(localized: "TVs"), value: "\(tot.counts["tv"] ?? 0)")
                    StatTile(label: "LED", value: "\(tot.ledTotalFt.clean) LF", sub: String(localized: "\(tot.ledZones) zones"))
                    StatTile(label: String(localized: "Cable"), value: "\(tot.wireFt.values.reduce(0, +).clean) ft", sub: String(localized: "\(tot.wireRuns.values.reduce(0, +)) home runs"))
                }
                openings(AlarmSensors.summary(t, catalog: app.catalog))
                ScrollView(.horizontal) {
                    Grid(alignment: .trailing, horizontalSpacing: 18, verticalSpacing: 8) {
                        GridRow {
                            Text("Item").gridColumnAlignment(.leading)
                            ForEach(t.floors) { Text($0.name) }
                            Text("Total").bold()
                        }
                        .font(.caption.weight(.semibold)).foregroundStyle(.secondary)
                        Divider()
                        ForEach(app.liveCatalog.filter { d in (tot.counts[d.id] ?? 0) > 0 || (tot.ledFt[d.id] ?? 0) > 0 || (tot.ledTentativeFt[d.id] ?? 0) > 0 }) { d in
                            GridRow {
                                HStack { DeviceSymbol(type: d, size: 20); Text(d.name) }.gridColumnAlignment(.leading)
                                ForEach(t.floors) { f in cell(d, f.bucket) }
                                cell(d, tot).bold()
                            }
                        }
                        Divider()
                        GridRow {
                            Text("LED zones").gridColumnAlignment(.leading)
                            ForEach(t.floors) { Text("\($0.bucket.ledZones)") }
                            Text("\(tot.ledZones)").bold()
                        }
                        GridRow {
                            Text("LED total").bold().gridColumnAlignment(.leading)
                            ForEach(t.floors) { Text("\($0.bucket.ledTotalFt.clean) LF") }
                            Text("\(tot.ledTotalFt.clean) LF").bold()
                        }
                        ForEach(tot.wireFt.keys.sorted(), id: \.self) { w in
                            GridRow {
                                Text("\(w) cable").gridColumnAlignment(.leading)
                                ForEach(t.floors) { Text("\(($0.bucket.wireFt[w] ?? 0).clean) ft") }
                                Text("\((tot.wireFt[w] ?? 0).clean) ft").bold()
                            }
                        }
                        ForEach(ClosetKind.allCases) { k in
                            if (tot.closets[k] ?? 0) > 0 {
                                GridRow {
                                    Text(Catalog.closetInfo(k).name).gridColumnAlignment(.leading)
                                    ForEach(t.floors) { Text("\($0.bucket.closets[k] ?? 0)") }
                                    Text("\(tot.closets[k] ?? 0)").bold()
                                }
                            }
                        }
                    }
                    .font(.subheadline.monospacedDigit())
                    .padding()
                }
                .paperCard()
                .tutorialAnchor("takeoff-table")
                if tot.unmeasuredRuns > 0 {
                    Label("\(tot.unmeasuredRuns) wire run(s) have no length yet. Set each plan's scale or type the LF on the run.", systemImage: "exclamationmark.triangle")
                        .font(.callout).foregroundStyle(.orange)
                }
                let tentative = model.bundle.liveMarkers.filter(\.tentative)
                if !tentative.isEmpty {
                    Text("Optional items (\(tentative.count))").font(.headline)
                    ForEach(tentative) { m in
                        Button { model.focusOn(.marker(m.id)) } label: {
                            HStack {
                                Text(m.label).bold()
                                Text(app.type(m.deviceTypeId)?.name ?? "").foregroundStyle(.secondary)
                                Spacer()
                                Text(model.sheets.first { $0.id == m.sheetId }?.name ?? "").font(.caption).foregroundStyle(.secondary)
                            }
                            .frame(minHeight: 44)
                            .contentShape(Rectangle())
                        }
                    }
                }
            }
            .padding()
        }
        .background(Color.paper)
        .shareSheet($share)
        .navigationDestination(isPresented: Binding(get: { openReview && app.cloud.can(.prices) }, set: { openReview = $0 })) { PlanReviewView(model: model) }
        .navigationDestination(isPresented: $showWiring) { CrewView(model: model).navigationTitle("Wiring sheets").navigationBarTitleDisplayMode(.inline) }
        .navigationDestination(isPresented: $openOrderList) { OrderListView(model: model) }
    }

    /// Openings: "Doors 14 · Windows 22" per floor and in total, and the alarm sensors on them once there are any
    /// (docs/find-similar.md, "Alarm sensors from openings"). Only from placed devices.
    @ViewBuilder
    private func openings(_ s: AlarmSensors.Summary) -> some View {
        if s.hasOpenings || s.hasSensors {
            let floors = s.floors.filter { !$0.counts.isEmpty }
            VStack(alignment: .leading, spacing: 8) {
                Text("Openings").font(.headline)
                if floors.count > 1 {
                    ForEach(floors) { f in openingsRow(Text(verbatim: f.name), f.counts, sensors: s.hasSensors) }
                }
                openingsRow(Text("Total").bold(), s.total, sensors: s.hasSensors)
            }
            .padding()
            .frame(maxWidth: .infinity, alignment: .leading)
            .paperCard()
            .accessibilityIdentifier("takeoff-openings")
        }
    }

    private func openingsRow(_ name: Text, _ c: AlarmSensors.Count, sensors: Bool) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            name.font(.subheadline.weight(.medium))
            Text("Doors: \(c.doors) · Windows: \(c.windows)").font(.subheadline)
            if sensors {
                Text("Door contacts: \(c.doorContacts) · Window contacts: \(c.windowContacts) · Glass-breaks: \(c.glassBreaks)")
                    .font(.caption).foregroundStyle(.secondary)
            }
        }
        .monospacedDigit()
        .accessibilityElement(children: .combine)
    }

    @ViewBuilder
    private func cell(_ d: DeviceType, _ b: TakeoffBucket) -> some View {
        if d.kind == .led {
            let v = b.ledFt[d.id] ?? 0, tn = b.ledTentativeFt[d.id] ?? 0
            Text(v == 0 && tn == 0 ? "—" : "\(v.clean) LF" + (tn > 0 ? " (\(tn.clean)?)" : "")).foregroundStyle(v == 0 && tn == 0 ? .tertiary : .primary)
        } else {
            let v = b.counts[d.id] ?? 0, tn = b.tentative[d.id] ?? 0
            Text(v == 0 ? "—" : "\(v)" + (tn > 0 ? " (\(tn)?)" : "")).foregroundStyle(v == 0 ? .tertiary : .primary)
        }
    }

    private var countedNote: some View {
        Text("Counted only from placed devices and wire runs. (n?) = optional, listed separately.")
            .font(.subheadline).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
    }

    @State private var openReview: Bool = {
        #if DEBUG
        return ProcessInfo.processInfo.arguments.contains("--plan-review")   // screenshot hook
        #else
        return false
        #endif
    }()

    /// Simple by default: the marked-up plans (the one action-blue button) and the wiring sheets; the rest under More.
    @ViewBuilder private var exportButtons: some View {
        Button { pdf() } label: { Label(busy ? "Building…" : "Plans PDF", systemImage: "doc.richtext").lineLimit(1) }
            .buttonStyle(.borderedProminent).disabled(busy || model.sheets.isEmpty)
        Button { showWiring = true } label: { Label("Wiring sheets", systemImage: "cable.connector").lineLimit(1) }.buttonStyle(.bordered)
        Menu {
            if app.cloud.can(.prices) {   // client-facing sending is the office's (technicians don't see it)
                Button { openReview = true } label: { Label("Send plan to client", systemImage: "eye") }
            }
            Button { openOrderList = true } label: { Label("Order list", systemImage: "cart") }
            Button { csv() } label: { Label("Count as CSV", systemImage: "tablecells") }
        } label: { Label("More", systemImage: "ellipsis.circle").lineLimit(1) }
        .buttonStyle(.bordered)
    }

    private func csv() {
        let text = TakeoffCalculator.csv(model.takeoff, catalog: app.catalog)
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("\(slug(model.bundle.project.address))-takeoff.csv")
        try? text.write(to: url, atomically: true, encoding: .utf8)
        share = SharedFile(url: url)
    }

    private func pdf() {
        busy = true
        let bundle = model.bundle, catalog = app.catalog, store = app.store
        Task.detached(priority: .userInitiated) {
            let data = PDFExporter.planSheets(bundle: bundle, catalog: catalog, crew: false) { store.image($0) }
            let url = PDFExporter.write(data, name: "\(slug(bundle.project.address))-marked-plans.pdf")
            await MainActor.run { busy = false; share = SharedFile(url: url) }
        }
    }
}
