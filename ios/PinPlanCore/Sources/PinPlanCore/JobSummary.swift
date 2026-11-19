import Foundation

/// Job health at a glance: counts, checklist progress, tasks, photos, logs and the one thing to do next.
/// Pure, local data only. Same rules as src/lib/jobSummary.ts.
public struct JobSummary: Hashable, Sendable {
    /// A sent proposal or plan review (cloud data — pass it only when already loaded).
    public struct ProposalInfo: Hashable, Sendable {
        public var isReview: Bool
        /// sent, viewed, accepted, declined, revoked
        public var status: String
        public var createdAt: String
        public init(isReview: Bool, status: String, createdAt: String) { self.isReview = isReview; self.status = status; self.createdAt = createdAt }
    }

    public enum NextKind: String, Sendable {
        case addPlans, placeDevices, overdueTasks, priceEstimate, sendReview, sendProposal, awaitClient, reviseProposal, markApproved
        case tasksToday, startChecklist, checklistPhotos, finishChecklists, markInstalled, closeTasks, invoice, officePricing, done
    }

    public struct NextStep: Hashable, Sendable {
        public var kind: NextKind
        public var text: String
        /// Web tab id: plan, sheets, photos, field, takeoff, estimate, crew, info (= the app's Job tab).
        public var tab: String
    }

    public var sheets = 0
    public var devices = 0
    public var tentative = 0
    public var ledRuns = 0
    public var checklists = 0
    public var itemsDone = 0
    public var itemsTotal = 0
    public var missingPhotos = 0
    public var openTasks = 0
    public var overdueTasks = 0
    public var dueToday = 0
    public var photos = 0
    public var lastPhotoAt: String?
    public var logs = 0
    public var lastLogDate: String?
    public var estimateTotal: Double?
    public var unpricedLines = 0
    public var proposal: ProposalInfo?
    public var review: ProposalInfo?
    public var next = NextStep(kind: .done, text: "", tab: "info")

    public var checklistPct: Int { itemsTotal > 0 ? Int((Double(itemsDone) / Double(itemsTotal) * 100).rounded()) : 0 }

    /// - Parameters:
    ///   - estimate: grand total and the number of included lines with no price (from the local estimate), if known.
    ///   - proposals: proposals and plan reviews when loaded; nil when not known.
    ///   - today: local day, YYYY-MM-DD.
    ///   - prices: false for technicians (no prices, proposals or invoices): the next step stays on field work.
    public static func make(_ b: ProjectBundle, estimate: (total: Double, unpriced: Int)? = nil, proposals: [ProposalInfo]? = nil, today: String,
                            prices: Bool = true) -> JobSummary {
        var s = JobSummary()
        s.sheets = b.sheets.filter { $0.deleted != true }.count
        let markers = b.markers.filter { $0.deleted != true }
        s.devices = markers.count
        s.tentative = markers.filter { $0.tentative }.count
        s.ledRuns = b.runs.filter { $0.deleted != true && ($0.kind == .led || $0.kind == .stair) }.count
        let photos = b.photos.filter { $0.deleted != true }
        let lists = b.checklists.filter { $0.deleted != true }
        let logs = b.jobLogs.filter { $0.deleted != true }
        s.checklists = lists.count
        for c in lists {
            let p = FieldDocs.progress(c, photos: photos)
            s.itemsDone += p.done; s.itemsTotal += p.total; s.missingPhotos += p.missingPhotos
            for i in c.items where i.done != true && ((i.assignee ?? "").isEmpty == false || (i.due ?? "").isEmpty == false) {
                s.openTasks += 1
                switch FieldDocs.taskBucket(i.due, today: today) {
                case .overdue: s.overdueTasks += 1
                case .today: s.dueToday += 1
                default: break
                }
            }
        }
        s.photos = photos.count
        s.lastPhotoAt = photos.map(\.takenAt).filter { !$0.isEmpty }.max()
        s.logs = logs.count
        s.lastLogDate = logs.map(\.date).filter { !$0.isEmpty }.max()
        if let estimate { s.estimateTotal = estimate.total; s.unpricedLines = estimate.unpriced }
        if let proposals {
            s.proposal = latest(proposals, review: false)
            s.review = latest(proposals, review: true)
        }
        s.next = nextStep(s, project: b.project, proposalsKnown: proposals != nil, prices: prices)
        return s
    }

    static func latest(_ list: [ProposalInfo], review: Bool) -> ProposalInfo? {
        list.filter { $0.isReview == review && $0.status != "revoked" }.max { $0.createdAt < $1.createdAt }
    }

    static func plural(_ n: Int, _ one: String, _ many: String? = nil) -> String { "\(n) \(n == 1 ? one : (many ?? one + "s"))" }

    /// The single most useful thing to do next on the job.
    public static func nextStep(_ s: JobSummary, project: Project, proposalsKnown: Bool, prices: Bool = true) -> NextStep {
        func step(_ k: NextKind, _ text: String, _ tab: String) -> NextStep { NextStep(kind: k, text: text, tab: tab) }
        if s.sheets == 0 { return step(.addPlans, "Add the floor plans", "sheets") }
        if s.devices == 0 && s.ledRuns == 0 { return step(.placeDevices, "Pin devices on the plan", "plan") }
        if s.overdueTasks > 0 { return step(.overdueTasks, plural(s.overdueTasks, "overdue task"), "field") }
        if !prices {
            // Technicians: estimates, proposals and invoices are the office's job.
            if project.status == .estimate {
                if s.dueToday > 0 { return step(.tasksToday, "\(plural(s.dueToday, "task")) due today", "field") }
                return step(.officePricing, "With the office for pricing — check the plan and devices", "plan")
            }
            if project.status == .installed {
                return s.openTasks > 0 ? step(.closeTasks, "Close out \(plural(s.openTasks, "open task"))", "field") : step(.done, "All wrapped up", "info")
            }
        }
        let unpriced = s.estimateTotal != nil && (s.unpricedLines > 0 || (s.estimateTotal ?? 0) <= 0)
        let billed = !project.billduDocs.isEmpty

        switch project.status {
        case .estimate:
            if let p = s.proposal {
                if p.status == "accepted" { return step(.markApproved, "Client accepted — mark the job approved", "estimate") }
                if p.status == "declined" { return step(.reviseProposal, "Proposal declined — revise and resend", "estimate") }
                return step(.awaitClient, p.status == "viewed" ? "Client viewed the proposal — follow up" : "Waiting on the client’s answer", "estimate")
            }
            // Not priced yet and the client hasn't seen the layout: a plan review needs no prices.
            if proposalsKnown && unpriced && s.review == nil && !billed { return step(.sendReview, "Send plan for review", "takeoff") }
            if unpriced {
                return step(.priceEstimate, s.unpricedLines > 0 ? "Price the estimate (\(plural(s.unpricedLines, "line")) without a price)" : "Price the estimate", "estimate")
            }
            if billed { return step(.awaitClient, "Estimate sent — mark the job approved when the client signs", "estimate") }
            return step(.sendProposal, "Send the proposal", "estimate")
        case .approved:
            if s.dueToday > 0 { return step(.tasksToday, "\(plural(s.dueToday, "task")) due today", "field") }
            if s.checklists == 0 { return step(.startChecklist, "Start an install checklist", "field") }
            if s.missingPhotos > 0 { return step(.checklistPhotos, "\(plural(s.missingPhotos, "checklist item")) need\(s.missingPhotos == 1 ? "s" : "") a photo", "field") }
            if s.itemsDone < s.itemsTotal { return step(.finishChecklists, "Finish checklists (\(s.itemsDone) of \(s.itemsTotal) done)", "field") }
            return step(.markInstalled, "Everything checked off — mark the job installed", "info")
        case .installed:
            if s.openTasks > 0 { return step(.closeTasks, "Close out \(plural(s.openTasks, "open task"))", "field") }
            if !project.billduDocs.contains(where: { $0.type == "invoice" }) { return step(.invoice, "Send the final invoice", "estimate") }
            return step(.done, "All wrapped up", "info")
        }
    }
}
