import SwiftUI
import PinPlanCore

// The top of Field for technicians: what matters today on this job — my tasks due today or overdue, this week's
// phases on my crew, open checklists — with Take photo and Today's daily log one tap away. Folds away (remembered).
// Rules: FieldParity.Today / .Schedule (PinPlanCore). Below it, one quiet "More on the web" row for what only the web
// does (MoreOnWebRow).

struct TodayCard: View {
    @Environment(AppModel.self) private var app
    let model: EditorModel
    /// Opens a Field section (checklists, schedule…).
    let open: (FieldView.Part) -> Void
    @AppStorage("pinplan.field.todayOpen") private var expanded = true
    @State private var task: TaskRef?
    @State private var log: JobLog?

    var body: some View {
        let today = TaskDates.today()
        let me = FieldAuthor.name(app)
        let b = model.bundle
        let tasks = FieldParity.Today.dueTasks(b.tasks, me: me, today: today)
        let phases = ScheduleField.items(b.liveScheduleItems, today: today, weeks: 1, me: me)
        let lists = FieldParity.Today.openChecklists(b.checklists, photos: b.photos)
        let todaysLog = FieldParity.Today.todaysLog(b.jobLogs, me: me, today: today)
        VStack(alignment: .leading, spacing: 10) {
            Button {
                withAnimation(.snappy) { expanded.toggle() }
            } label: {
                HStack {
                    Text("Today").font(.headline)
                    Text(summary(tasks: tasks.count, phases: phases.count, lists: lists.count)).font(.subheadline).foregroundStyle(.secondary).lineLimit(1)
                    Spacer()
                    Image(systemName: "chevron.down").rotationEffect(.degrees(expanded ? 0 : -90)).foregroundStyle(.secondary)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityValue(expanded ? "Expanded" : "Collapsed")

            if expanded {
                HStack(spacing: 8) {
                    PhotoAddMenu(model: model) {
                        actionLabel("Take photo", icon: "camera.fill", prominent: true)
                    }
                    Button {
                        log = todaysLog ?? JobLog(projectId: b.project.id, date: today, author: me)
                    } label: {
                        actionLabel(todaysLog == nil ? "Write today's log" : "Today's log", icon: "square.and.pencil", prominent: false)
                    }
                    .buttonStyle(.plain)
                }

                if !tasks.isEmpty {
                    group("My tasks") {
                        ForEach(tasks.prefix(4)) { t in
                            Button { task = TaskRef(id: t.task.id) } label: {
                                HStack(spacing: 8) {
                                    Text("#\(t.task.number)").font(.caption.weight(.semibold)).monospacedDigit().foregroundStyle(.secondary)
                                    Text(t.task.title).lineLimit(1).foregroundStyle(Color.primary)
                                    Spacer()
                                    Text(t.bucket == .overdue ? "Overdue" : "Today").font(.caption.weight(.semibold))
                                        .foregroundStyle(t.bucket == .overdue ? Color.red : Color.orange)
                                }
                                .frame(minHeight: 32)
                                .contentShape(Rectangle())
                            }
                            .buttonStyle(.plain)
                        }
                        if tasks.count > 4 { moreButton("All \(tasks.count) tasks") { open(.tasks) } }
                    }
                }

                if !phases.isEmpty {
                    group("This week") {
                        ForEach(phases.prefix(3)) { p in
                            let s = ScheduleField.status(p, today: today)
                            HStack(spacing: 8) {
                                Circle().fill(Color(hex: p.color ?? "#64748b")).frame(width: 8, height: 8).accessibilityHidden(true)
                                Text(p.name).lineLimit(1)
                                Spacer()
                                Text(ScheduleField.dates(p)).font(.caption).foregroundStyle(.secondary)
                                Text(s.label).font(.caption.weight(.semibold)).foregroundStyle(ScheduleField.color(s))
                            }
                            .frame(minHeight: 28)
                            .accessibilityElement(children: .combine)
                        }
                        moreButton("Schedule") { open(.schedule) }
                    }
                }

                if !lists.isEmpty {
                    group("Open checklists") {
                        ForEach(lists.prefix(3)) { c in
                            let p = FieldDocs.progress(c, photos: b.photos)
                            Button { open(.checklists) } label: {
                                HStack {
                                    Text(c.name).lineLimit(1).foregroundStyle(Color.primary)
                                    Spacer()
                                    Text("\(p.done)/\(p.total)").monospacedDigit().foregroundStyle(.secondary)
                                }
                                .frame(minHeight: 32)
                                .contentShape(Rectangle())
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }

                if tasks.isEmpty && phases.isEmpty && lists.isEmpty {
                    Text("Nothing due today. Photos and your daily log keep the office in the loop.").font(.subheadline).foregroundStyle(.secondary)
                }
            }
        }
        .padding(12)
        .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 14))
        .sheet(item: $task) { ref in TaskDetailView(model: model, taskId: ref.id) }
        .sheet(item: $log) { l in DailyReportEditor(model: model, log: l) }
    }

    private func summary(tasks: Int, phases: Int, lists: Int) -> String {
        var parts: [String] = []
        if tasks > 0 { parts.append("\(tasks) task\(tasks == 1 ? "" : "s") due") }
        if phases > 0 { parts.append("\(phases) phase\(phases == 1 ? "" : "s")") }
        if lists > 0 { parts.append("\(lists) checklist\(lists == 1 ? "" : "s")") }
        return parts.joined(separator: " · ")
    }

    private func actionLabel(_ title: String, icon: String, prominent: Bool) -> some View {
        Label(title, systemImage: icon)
            .font(.subheadline.weight(.semibold))
            .frame(maxWidth: .infinity, minHeight: 44)
            .background(prominent ? Color.brand : Color(.tertiarySystemFill), in: RoundedRectangle(cornerRadius: 10))
            .foregroundStyle(prominent ? Color.white : Color.primary)
    }

    private func group<Content: View>(_ title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(title).font(.caption.weight(.semibold)).foregroundStyle(.secondary)
            content()
        }
    }

    private func moreButton(_ title: String, action: @escaping () -> Void) -> some View {
        Button(action: action) { Text(title).font(.caption.weight(.semibold)) }
            .frame(minHeight: 28)
    }
}

/// One quiet row listing what's done on the web (change orders, quotes and invoices, job templates), each opening the
/// PinPlan web app in Safari. Hidden when no server is set up in Settings.
struct MoreOnWebRow: View {
    @Environment(AppModel.self) private var app
    @Environment(\.openURL) private var openURL
    let model: EditorModel

    var body: some View {
        let job = model.bundle.project.id
        let office = app.cloud.can(.prices)
        // Technicians can't send RFIs, plan the schedule or see job templates on the web either (rfis.ts canRfi,
        // schedule.ts canEditSchedule, SettingsForm "templates" is office only): they get the schedule, where a crew
        // member updates progress.
        let pages: [(String, String, String)] = office ? [
            ("Change orders", "doc.badge.plus", "project?id=\(job)&tab=changes"),
            ("Quotes and invoices", "doc.text", "project?id=\(job)&tab=billing"),
            ("Send RFIs", "questionmark.bubble", "project?id=\(job)&tab=field&section=rfis"),
            ("Plan the schedule", "calendar", "project?id=\(job)&tab=field&section=schedule"),
            ("Job templates", "square.on.square", "settings#templates"),
        ] : [
            ("Update schedule progress", "calendar", "project?id=\(job)&tab=field&section=schedule"),
        ]
        let links = pages.compactMap { p in serverPageURL(app.settings, p.2).map { (p.0, p.1, $0) } }
        if !links.isEmpty {
            Menu {
                ForEach(links, id: \.0) { l in
                    Button { openURL(l.2) } label: { Label(l.0, systemImage: l.1) }
                }
            } label: {
                HStack(spacing: 6) {
                    Image(systemName: "safari")
                    Text("More on the web")
                    Text(office ? "Change orders, quotes, invoices, RFIs, templates" : "Schedule progress").foregroundStyle(.secondary).lineLimit(1)
                    Spacer(minLength: 0)
                }
                .font(.footnote)
                .frame(minHeight: 32)
                .contentShape(Rectangle())
            }
            .foregroundStyle(Color.secondary)
            .accessibilityHint("Opens the PinPlan web app in Safari")
        }
    }
}
