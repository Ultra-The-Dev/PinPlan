// Guards on the iPad / iPhone app's cloud and sign-in code (ios/PinPlan), for what Swift unit tests can't reach without
// Xcode: the Keychain, the clipboard, sign-out and where the session token goes. Each check names the issue it covers.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(__dirname, "..", "ios", "PinPlan");
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

function swiftFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return swiftFiles(p);
    return p.endsWith(".swift") ? [p] : [];
  });
}

describe("iOS cloud sign-in and sync", () => {
  const cloud = read("Services/CloudSync.swift");
  const api = read("Services/APIClient.swift");

  it("keeps the session in the Keychain for this device only, and drops it on a fresh install", () => {
    expect(cloud).toContain("kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly");
    expect(cloud).not.toMatch(/kSecAttrAccessibleAfterFirstUnlock\b(?!ThisDeviceOnly)/);
    expect(cloud).toContain('"pinplan.installId"');
    expect(cloud).toMatch(/resetOnFreshInstall\(account: Self\.sessionAccount\b/);
    // The marker is checked before the session is read.
    expect(cloud.indexOf("Keychain.resetOnFreshInstall(")).toBeLessThan(cloud.indexOf("Keychain.load(account: Self.sessionAccount)"));
    expect(cloud).toMatch(/let status = SecItemAdd\(/);
  });

  it("revokes the session on the server when signing out and clears a remembered invite", () => {
    expect(cloud).toContain('"/auth/v1/logout", query: "scope=local"');
    const end = cloud.slice(cloud.indexOf("private func endSession"), cloud.indexOf("private func hideLockedJobs"));
    expect(end).toContain("clearPendingInvite()");
    expect(end).toContain("Keychain.delete(account: Self.sessionAccount)");
  });

  it("sends each row's own edit time, never the time of the push", () => {
    expect(cloud).not.toMatch(/row\["updated_at"\]\s*=\s*now\b/);
    expect(cloud).toContain('row["updated_at"] = ledger.editTime(r, fallback: now)');
  });

  it("never selects '*' from the cloud", () => {
    for (const f of swiftFiles(root)) expect(readFileSync(f, "utf8"), f).not.toContain("select=*");
  });

  it("only uses https servers and sends the session only to trusted ones", () => {
    expect(api).toContain("CloudEndpoint.url(raw, allowHTTP: allowsHTTP)");
    expect(api).toMatch(/#if DEBUG\s+return true\s+#else\s+return false/);
    expect(api).toContain("var tok = mayCarrySession ? token : nil");
    expect(api).not.toMatch(/raw\.hasPrefix\("http"\)/);
    expect(cloud).toContain("guard api.mayCarrySession else");
  });

  it("deletes the account only after a fresh sign-in", () => {
    expect(cloud).not.toContain("confirmEmail: String?");
    expect(cloud).toContain("func reauthenticate(password: String)");
    expect(cloud).toContain('"/auth/v1/verify"');
  });

  it("copies client links and invite links for this device only, for 10 minutes", () => {
    for (const f of swiftFiles(root)) {
      const src = readFileSync(f, "utf8");
      expect(src, f).not.toMatch(/UIPasteboard\.general\.url\s*=/);
    }
    for (const rel of ["Views/TeamView.swift", "Views/ClientProposalView.swift", "Views/PlanReviewView.swift", "Field/PhotoReport.swift"]) {
      expect(read(rel), rel).not.toMatch(/UIPasteboard\.general\.(string|url)\s*=/);
    }
    const clip = read("Views/ClientProposalView.swift");
    expect(clip).toContain(".localOnly: true");
    expect(clip).toContain("static let lifetime: TimeInterval = 10 * 60");
  });
});
