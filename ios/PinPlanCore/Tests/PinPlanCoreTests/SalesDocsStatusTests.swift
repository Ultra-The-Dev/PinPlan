import XCTest
@testable import PinPlanCore

/// Same cases as "honest statuses" (tests/moneyFlow.test.ts) and "numbering" (tests/documents.test.ts).
final class SalesDocsStatusTests: XCTestCase {
    let day = "2026-11-19"

    private func inv() -> SalesDoc {
        var d = SalesDoc(id: "i", projectId: "p", kind: .invoice, status: .sent, total: 100)
        d.number = "INV-9"; d.dueDate = "2026-11-01"
        return d
    }

    func testFinalizedButNotSharedIsReadyToSend() {
        var d = inv()
        XCTAssertFalse(SalesDocs.wasSent(d))
        XCTAssertEqual(SalesDocs.displayStatus(d, day: day), .ready)
        XCTAssertEqual(SalesDocDisplayStatus.ready.label, "Ready to send")
        d.sentAt = "2026-10-20T10:00:00Z"
        XCTAssertEqual(SalesDocs.displayStatus(d, day: day), .overdue)
        var shared = inv(); shared.shareToken = "tok"
        XCTAssertEqual(SalesDocs.displayStatus(shared, day: "2026-10-01"), .sent)
        var viewed = inv(); viewed.viewedAt = "2026-10-02T10:00:00Z"; viewed.status = .viewed
        XCTAssertEqual(SalesDocs.displayStatus(viewed, day: "2026-10-01"), .viewed)
        var q = SalesDoc(id: "q", projectId: "p", kind: .quote, status: .sent, total: 500)
        q.validUntil = "2026-11-01"
        XCTAssertEqual(SalesDocs.displayStatus(q, day: day), .ready)
        q.sentAt = "2026-10-01T00:00:00Z"
        XCTAssertEqual(SalesDocs.displayStatus(q, day: day), .expired)
        q.status = .accepted
        XCTAssertEqual(SalesDocs.displayStatus(q, day: day).label, "Approved")
    }

    /// Payments the server recorded from Stripe (docs/payments.md), as the web's isOnlinePayment().
    func testPaidOnline() {
        var d = inv(); d.status = .partiallyPaid
        let card = SalesPayment(id: "stripe_pi_123", projectId: "p", documentId: "i", amount: 60, date: day, method: "card")
        let check = SalesPayment(id: "abc", projectId: "p", documentId: "i", amount: 40, date: day, method: "check")
        XCTAssertTrue(card.isOnline)
        XCTAssertFalse(check.isOnline)
        XCTAssertNil(SalesDocs.paidOnline(d, payments: [check]))
        XCTAssertEqual(SalesDocs.paidOnline(d, payments: [card, check]), OnlinePaid(amount: 60, bank: false))
        XCTAssertEqual(SalesDocs.onlinePaidText(d, payments: [card])?.key, "%@ paid online")
        XCTAssertEqual(SalesDocs.onlinePaidText(d, payments: [card])?.amount, "$60.00")
        // A Stripe refund comes back as a negative payment.
        let refund = SalesPayment(id: "stripe_re_re_1", projectId: "p", documentId: "i", amount: -60, date: day, method: "card")
        XCTAssertNil(SalesDocs.paidOnline(d, payments: [card, refund]))
        // Voided, deleted or another invoice's payments don't count.
        var voided = card; voided.voided = true
        var other = card; other.documentId = "x"
        XCTAssertNil(SalesDocs.paidOnline(d, payments: [voided, other]))
        // Paid in full by bank.
        d.status = .paid
        let ach = SalesPayment(id: "stripe_pi_456", projectId: "p", documentId: "i", amount: 100, date: day, method: "ach")
        XCTAssertEqual(SalesDocs.onlinePaidText(d, payments: [ach])?.key, "Paid online by bank")
        XCTAssertEqual(SalesDocs.onlinePaidText(d, payments: [card])?.key, "Paid online by card")
        // Quotes never.
        XCTAssertNil(SalesDocs.paidOnline(SalesDoc(id: "i", projectId: "p", kind: .quote, status: .accepted, total: 60), payments: [card]))
    }

    func testQuotesNumberAsQ() {
        XCTAssertEqual(SalesDocs.defaultNumberFormat(.quote), "Q-{0000}")
        XCTAssertEqual(SalesDocs.formatNumber(SalesDocs.defaultNumberFormat(.quote), seq: 7, day: day), "Q-0007")
        XCTAssertEqual(SalesDocs.formatNumber(SalesDocs.defaultNumberFormat(.invoice), seq: 3, day: day), "INV-2026-0003")
        XCTAssertEqual(SalesDocs.formatNumber(SalesDocs.defaultNumberFormat(.creditNote), seq: 1, day: day), "CN-0001")
        XCTAssertEqual(SalesDocs.name(SalesDoc(projectId: "p", kind: .quote, status: .sent)), "Quote (number pending)")
    }

    func testFormatNumberLikeTheDatabase() {
        XCTAssertEqual(SalesDocs.formatNumber("INV-{YYYY}-{0000}", seq: 42, day: "2026-03-05"), "INV-2026-0042")
        XCTAssertEqual(SalesDocs.formatNumber("Q-{0000}", seq: 12345, day: day), "Q-12345")
        XCTAssertEqual(SalesDocs.formatNumber("{YY}{MM}-{#}", seq: 7, day: "2026-03-05"), "2603-7")
        XCTAssertEqual(SalesDocs.formatNumber("EST", seq: 3, day: day), "EST0003")
        XCTAssertEqual(SalesDocs.formatNumber("", seq: 3, day: day), "0003")
        XCTAssertEqual(SalesDocs.formatNumber("{000}/{0}", seq: 5, day: day), "005/5")
    }

    /// Deposit / progress / custom amount (billed as progress) / final invoices, as the web editor labels them.
    func testInvoiceTypeText() {
        var d = inv()
        XCTAssertNil(SalesDocs.invoiceTypeText(d))
        d.invoiceType = "standard"
        XCTAssertNil(SalesDocs.invoiceTypeText(d))
        d.invoiceType = "deposit"; d.billedPct = 30
        XCTAssertEqual(SalesDocs.invoiceTypeText(d), "Deposit invoice · 30% of the quote")
        d.invoiceType = "progress"; d.billedPct = 12.5
        XCTAssertEqual(SalesDocs.invoiceTypeText(d), "Progress invoice · 12.5% of the quote")
        d.invoiceType = "final"; d.billedPct = nil
        XCTAssertEqual(SalesDocs.invoiceTypeText(d), "Final invoice")
        XCTAssertNil(SalesDocs.invoiceTypeText(SalesDoc(projectId: "p", kind: .quote)))
    }
}
