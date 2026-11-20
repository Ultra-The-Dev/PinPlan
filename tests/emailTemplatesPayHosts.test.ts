// Pay-online buttons only for known payment sites (allowedPayUrl), whatever a company's settings or snapshot say.
import { describe, expect, it } from "vitest";
import { allowedPayUrl, documentEmail, PAY_HOSTS } from "@/lib/emailTemplates";

describe("allowedPayUrl", () => {
  it("allows the known payment sites and their subdomains, over https", () => {
    for (const u of [
      "https://checkout.stripe.com/c/pay/cs_test_x",
      "https://buy.stripe.com/abc",
      "https://www.paypal.com/paypalme/acme/100",
      "https://paypal.com/invoice/p/#X",
      "https://squareup.com/pay-invoice/x",
      "https://checkout.squareup.com/x",
      "https://quickbooks.intuit.com/pay/x",
    ])
      expect(allowedPayUrl(u)).toBe(new URL(u).toString());
    expect(PAY_HOSTS).toContain("buy.stripe.com");
  });

  it("refuses everything else", () => {
    for (const u of [
      "http://buy.stripe.com/abc", // not https
      "https://stripe.com/abc", // not a pay host
      "https://evil.example/buy.stripe.com",
      "https://buy.stripe.com.evil.example/x", // look-alike
      "https://evilpaypal.com/x",
      "https://user:pw@buy.stripe.com/x", // credentials in the link
      "https://buy.stripe.com:8443/x", // odd port
      "javascript:alert(1)",
      "",
      null,
      undefined,
    ])
      expect(allowedPayUrl(u)).toBeNull();
  });

  it("documentEmail itself drops a pay link on any other site", () => {
    const base = { kind: "document" as const, docKind: "invoice" as const, title: "Invoice", number: "INV-1", companyName: "Acme", total: 100, balanceDue: 60, url: "https://app.example.com/d?t=abc" };
    const bad = documentEmail({ ...base, payUrl: "https://pay.evil.example/x" });
    expect(bad.text).not.toContain("evil");
    expect(bad.text).not.toContain("online:");
    const good = documentEmail({ ...base, payUrl: "https://buy.stripe.com/x" });
    expect(good.text).toContain("Pay $60.00 online: https://buy.stripe.com/x");
  });
});
