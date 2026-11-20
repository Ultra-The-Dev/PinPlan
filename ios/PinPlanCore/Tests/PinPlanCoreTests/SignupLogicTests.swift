import XCTest
@testable import PinPlanCore

final class SignupLogicTests: XCTestCase {
    private let okPassword = "correct-horse"

    func testPasswordMinimumMatchesTheWeb() {
        XCTAssertEqual(SignupLogic.passwordMin, 10)
        let short = String(repeating: "a", count: 9)
        XCTAssertEqual(SignupLogic.problem(email: "a@b.co", password: short, name: "", company: "Acme", needsCompany: true, acceptedTerms: true),
                       "Use a password of at least 10 characters.")
        XCTAssertNil(SignupLogic.problem(email: "a@b.co", password: String(repeating: "a", count: 10), name: "", company: "Acme", needsCompany: true, acceptedTerms: true))
        XCTAssertNotNil(SignupLogic.problem(email: "a@b.co", password: String(repeating: "a", count: 73), name: "", company: "Acme", needsCompany: true, acceptedTerms: true))
    }

    func testCompanyIsNeededUnlessJoiningATeam() {
        XCTAssertEqual(SignupLogic.problem(email: "a@b.co", password: okPassword, name: "", company: "  ", needsCompany: true, acceptedTerms: true),
                       "Enter your company name.")
        XCTAssertNil(SignupLogic.problem(email: "a@b.co", password: okPassword, name: "", company: "", needsCompany: false, acceptedTerms: true))
    }

    func testTermsMustBeAccepted() {
        XCTAssertEqual(SignupLogic.problem(email: "a@b.co", password: okPassword, name: "Sam", company: "Acme", needsCompany: true, acceptedTerms: false),
                       "Agree to the Terms of Service and Privacy Policy to create an account.")
    }

    func testEmailCheck() {
        XCTAssertTrue(SignupLogic.isEmail(" sam@example.com "))
        XCTAssertFalse(SignupLogic.isEmail("sam@example"))
        XCTAssertFalse(SignupLogic.isEmail("sam example@x.com"))
        XCTAssertFalse(SignupLogic.isEmail("@example.com"))
        XCTAssertFalse(SignupLogic.isEmail("a@@example.com"))
        XCTAssertFalse(SignupLogic.isEmail("a@example..com"))
    }

    func testMetadataRecordsTermsAcceptance() {
        let m = SignupLogic.metadata(name: " Sam ", company: "Acme Low Voltage", acceptedAt: Date(timeIntervalSince1970: 0))
        XCTAssertEqual(m["terms_accepted_at"], "1970-01-01T00:00:00Z")
        XCTAssertEqual(m["name"], "Sam")
        XCTAssertEqual(m["company"], "Acme Low Voltage")
        XCTAssertNil(SignupLogic.metadata(name: "", company: "", acceptedAt: Date())["name"])
    }

    func testWebAccountLinkOnlyOnTheUSStorefront() {
        XCTAssertTrue(SignupLogic.mayLinkToWebAccount(storefrontCountry: "USA"))
        XCTAssertFalse(SignupLogic.mayLinkToWebAccount(storefrontCountry: "GBR"))
        XCTAssertFalse(SignupLogic.mayLinkToWebAccount(storefrontCountry: "US"))
        XCTAssertFalse(SignupLogic.mayLinkToWebAccount(storefrontCountry: nil))
    }
}
