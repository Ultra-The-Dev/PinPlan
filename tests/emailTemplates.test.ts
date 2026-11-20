// Email templates: subjects, links, plain-text alternatives, and escaping of everything a user typed.
import { describe, expect, it } from "vitest";
import {
  authEmailTemplates,
  changeOrderResponseEmail,
  documentEmail,
  esc,
  httpsUrl,
  paymentFailedEmail,
  proposalResponseEmail,
  rfiAnsweredEmail,
  safeUrl,
  stripLinks,
  teamInviteEmail,
  trialEndingEmail,
  welcomeEmail,
  type EmailContent,
} from "@/lib/emailTemplates";
import { readFileSync } from "node:fs";
import { packClientNote } from "@/lib/proposal";

const EVIL = `<script>alert("x")</script> O'Brien & "Sons"`;

/** No raw tag, quote-breakout or javascript: link from user input made it into the HTML. */
function expectSafe(e: EmailContent) {
  expect(e.html).not.toContain("<script>");
  expect(e.html).not.toMatch(/<img[^>]+onerror/i);
  expect(e.html).not.toMatch(/href="javascript:/i);
  expect(e.html).not.toContain(`"Sons"`);
  expect(e.subject).not.toMatch(/[\r\n]/);
}

const invite = { inviterName: "Dana", teamName: "Acme Low Voltage", role: "tech" as const, code: "k7qmxr4tpa", joinUrl: "https://app.example.com/join?code=K7QMXR4TPA", expiresAt: "2026-12-03T10:00:00Z" };

describe("esc / safeUrl", () => {
  it("escapes the five HTML characters", () => {
    expect(esc(`<a href="x">'&'</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;");
    expect(esc(null)).toBe("");
  });
  it("only lets http(s) links through", () => {
    expect(safeUrl("https://x.com/a?b=1")).toBe("https://x.com/a?b=1");
    expect(safeUrl("javascript:alert(1)")).toBeNull();
    expect(safeUrl("data:text/html,hi")).toBeNull();
    expect(safeUrl("/relative")).toBeNull();
    expect(safeUrl("")).toBeNull();
  });
});

describe("team invite", () => {
  it("reads like the brief, with the big code, join button and iPad steps", () => {
    const e = teamInviteEmail(invite);
    expect(e.subject).toBe("Dana invited you to join Acme Low Voltage on PinPlan");
    expect(e.text).toContain("Dana invited you to join Acme Low Voltage on PinPlan as a Technician.");
    expect(e.html).toContain("K7QM-XR4T-PA");
    expect(e.text).toContain("Your invite code: K7QM-XR4T-PA");
    expect(e.html).toContain(`href="https://app.example.com/join?code=K7QMXR4TPA"`);
    expect(e.text).toContain("Join Acme Low Voltage: https://app.example.com/join?code=K7QMXR4TPA");
    expect(e.text).toContain("Settings → Team → Join a team");
    expect(e.text).toContain("Dec 3, 2026");
    expect(e.html).toMatch(/^<!DOCTYPE html>/);
    expect(e.html).toContain(`name="color-scheme" content="light dark"`);
  });
  it("says an Office admin, and copes without an inviter name", () => {
    const e = teamInviteEmail({ ...invite, role: "admin", inviterName: "" });
    expect(e.subject).toBe("You're invited to join Acme Low Voltage on PinPlan");
    expect(e.text).toContain("You've been invited to join Acme Low Voltage on PinPlan as an Office admin.");
  });
  it("escapes the names and drops a non-http join link", () => {
    const e = teamInviteEmail({ ...invite, inviterName: EVIL, teamName: EVIL, inviteeName: EVIL, joinUrl: "javascript:alert(1)" });
    expectSafe(e);
    expect(e.html).toContain("&lt;script&gt;");
    expect(e.html).not.toContain("javascript:");
    // Plain text keeps the words (it's not HTML), on one line in the subject.
    expect(e.subject).toContain(`<script>alert("x")</script>`);
  });
  it("keeps line breaks out of the subject", () => {
    const e = teamInviteEmail({ ...invite, inviterName: "Dana\r\nBcc: evil@x.com", teamName: "Acme\nCorp" });
    expect(e.subject).toBe("Dana Bcc: evil@x.com invited you to join Acme Corp on PinPlan");
  });
});

describe("proposal / plan review response", () => {
  const base = {
    companyName: "Acme Low Voltage",
    clientName: "Pat Jones",
    signerName: "Pat Jones",
    jobName: "12 Elm St",
    title: "Proposal — 12 Elm St",
    respondedAt: "2026-11-19T15:00:00Z",
    jobUrl: "https://app.example.com/project?id=p1&tab=estimate",
  };
  it("accepted proposal: signer, options, total and a link to the job", () => {
    const e = proposalResponseEmail({ ...base, kind: "proposal", outcome: "accepted", acceptedOptions: ["Extra camera", "Wi-Fi upgrade"], total: 12345.5, currency: "USD" });
    expect(e.subject).toBe("Proposal accepted: 12 Elm St");
    expect(e.text).toContain("Pat Jones accepted and signed your proposal for 12 Elm St.");
    expect(e.text).toContain("Accepted total: $12,345.50");
    expect(e.text).toContain("Extra camera");
    expect(e.text).toContain("Wi-Fi upgrade");
    expect(e.html).toContain(`href="https://app.example.com/project?id=p1&amp;tab=estimate"`);
  });
  it("declined proposal shows the note", () => {
    const e = proposalResponseEmail({ ...base, kind: "proposal", outcome: "declined", note: "Too expensive\nmaybe next year" });
    expect(e.subject).toBe("Proposal declined: 12 Elm St");
    expect(e.html).toContain("Too expensive<br>maybe next year");
    expect(e.text).toContain("> Too expensive\n> maybe next year");
  });
  it("plan approved", () => {
    const e = proposalResponseEmail({ ...base, kind: "review", outcome: "accepted" });
    expect(e.subject).toBe("Plan approved: 12 Elm St");
    expect(e.text).toContain("approved the device layout");
  });
  it("changes requested: note text and pin count, pins listed", () => {
    const note = packClientNote("Move the office speaker", [
      { floor: "1st Floor", x: 0.42, y: 0.31, note: "TV here instead" },
      { floor: "Basement", x: 0.1, y: 0.2, note: "" },
    ]);
    const e = proposalResponseEmail({ ...base, kind: "review", outcome: "declined", note });
    expect(e.subject).toBe("Changes requested: 12 Elm St");
    expect(e.text).toContain("Pins on the plan: 2");
    expect(e.text).toContain("> Move the office speaker");
    expect(e.text).not.toContain("Pinned on the plan:");
    expect(e.text).toContain("1st Floor · pin 1 — TV here instead");
    expect(e.text).toContain("Basement · pin 2 — (no comment)");
    expect(e.text).toContain("Review the changes: https://app.example.com/project?id=p1&tab=estimate");
  });
  it("escapes everything the client typed", () => {
    const note = packClientNote(EVIL, [{ floor: EVIL, x: 0.5, y: 0.5, note: `<img src=x onerror=alert(1)>` }]);
    const e = proposalResponseEmail({ ...base, kind: "review", outcome: "declined", clientName: EVIL, signerName: EVIL, jobName: EVIL, companyName: EVIL, note });
    expectSafe(e);
    expect(e.html).toContain("&lt;img src=x onerror=alert(1)&gt;");
    const p = proposalResponseEmail({ ...base, kind: "proposal", outcome: "accepted", acceptedOptions: [EVIL], total: 1, jobUrl: "javascript:alert(1)" });
    expectSafe(p);
    expect(p.html).not.toContain("javascript:");
  });
});

describe("welcome and billing", () => {
  it("welcome links into the app", () => {
    const e = welcomeEmail({ name: "Dana", companyName: "Acme Low Voltage", appUrl: "https://app.example.com/" });
    expect(e.subject).toBe("Welcome to PinPlan, Acme Low Voltage");
    expect(e.html).toContain(`href="https://app.example.com/settings#business"`);
    expect(e.text).toContain("Open PinPlan: https://app.example.com/");
    expectSafe(welcomeEmail({ name: EVIL, companyName: EVIL, appUrl: "https://a.b" }));
  });
  it("trial ending in 3 days", () => {
    const e = trialEndingEmail({ name: "Dana", companyName: "Acme", endsAt: "2026-11-22T00:00:00Z", billingUrl: "https://app.example.com/settings#billing" });
    expect(e.subject).toBe("Your PinPlan trial ends in 3 days");
    expect(e.text).toContain("Nov 22, 2026");
    expect(e.text).toContain("Start subscription: https://app.example.com/settings#billing");
    expect(trialEndingEmail({ daysLeft: 1, billingUrl: "https://x.y" }).subject).toBe("Your PinPlan trial ends tomorrow");
    expectSafe(trialEndingEmail({ name: EVIL, companyName: EVIL, planName: EVIL, billingUrl: "https://x.y" }));
  });
  it("payment failed", () => {
    const e = paymentFailedEmail({ companyName: "Acme", amount: 79, currency: "USD", nextAttemptAt: "2026-11-25T00:00:00Z", billingUrl: "https://app.example.com/settings#billing" });
    expect(e.subject).toBe("Action needed: your PinPlan payment didn't go through");
    expect(e.text).toContain("Amount: $79.00");
    expect(e.text).toContain("Next try: Nov 25, 2026");
    expect(e.html).toContain(`href="https://app.example.com/settings#billing"`);
    expectSafe(paymentFailedEmail({ name: EVIL, companyName: EVIL, billingUrl: "https://x.y" }));
  });
});

describe("Blueprint Ink look", () => {
  it("uses the brand palette, a dark scheme and no all-caps labels", () => {
    const e = teamInviteEmail(invite);
    expect(e.html).toContain("#0b6fe0"); // action blue button
    expect(e.html).toContain("#0f2340"); // ink navy text
    expect(e.html).toContain("#f2f6fa"); // paper
    expect(e.html).toContain(".pp-bg { background:#081629 !important; }");
    expect(e.html).not.toMatch(/text-transform:uppercase/);
    // None of the old orange palette is left.
    expect(e.html).not.toMatch(/#c2410c|#9a3412|#fff7ed/i);
  });
});

describe("links in client mail", () => {
  it("httpsUrl only lets https through", () => {
    expect(httpsUrl("https://pay.example.com/x")).toBe("https://pay.example.com/x");
    expect(httpsUrl("http://pay.example.com/x")).toBeNull();
    expect(httpsUrl("javascript:alert(1)")).toBeNull();
    expect(httpsUrl(null)).toBeNull();
  });

  it("stripLinks removes web addresses, bare domains and emails, and keeps normal sentences", () => {
    expect(stripLinks("Pay here https://evil.example/login?x=1 today")).toBe("Pay here [link removed] today");
    expect(stripLinks("go to www.evil.example")).toBe("go to [link removed]");
    expect(stripLinks("visit secure-pay.com/login now")).toBe("visit [link removed] now");
    expect(stripLinks("bit.ly/abc")).toBe("[link removed]");
    expect(stripLinks("write to billing@evil.example")).toBe("write to [link removed]");
    expect(stripLinks("HXXP://x.example")).toBe("[link removed]");
    const normal = "Thanks for the work.See you Monday, e.g. at 8. Total is 3.5 hours.";
    expect(stripLinks(normal)).toBe(normal);
  });

  it("the pay button needs an https link and names the payment site", () => {
    const base = { kind: "document" as const, docKind: "invoice" as const, title: "Invoice", number: "INV-1", companyName: "Acme", total: 100, balanceDue: 60, url: "https://app.example.com/d?t=abc" };
    const ok = documentEmail({ ...base, payUrl: "https://pay.example.com/p?a=1" });
    expect(ok.text).toContain("Pay $60.00 online: https://pay.example.com/p?a=1");
    expect(ok.text).toContain("The payment page is on pay.example.com, chosen by Acme.");
    const plain = documentEmail({ ...base, payUrl: "http://pay.example.com/p" });
    expect(plain.text).not.toContain("Pay $60.00 online");
    expect(plain.text).not.toContain("pay online");
    expect(plain.text).not.toContain("payment page");
    const paid = documentEmail({ ...base, balanceDue: 0, payUrl: "https://pay.example.com/p" });
    expect(paid.text).not.toContain("payment page");
  });
});

describe("change order and RFI answers (to the office)", () => {
  const co = {
    outcome: "approved" as const,
    code: "CO-003",
    title: "Two extra cameras",
    signerName: "Jane Client",
    clientName: "Jane Client",
    jobName: "12 Sample St",
    total: 1450,
    currency: "USD",
    comment: "Go ahead.",
    respondedAt: "2026-11-19T10:00:00Z",
    url: "https://app.example.com/project?id=p1&tab=changes",
    companyName: "Acme",
  };

  it("approved change order: subject, details, comment and link", () => {
    const e = changeOrderResponseEmail(co);
    expect(e.subject).toBe("Approved: CO-003 Two extra cameras — 12 Sample St");
    expect(e.text).toContain("Jane Client approved and signed change order CO-003 Two extra cameras for 12 Sample St.");
    expect(e.text).toContain("Total: $1,450.00");
    expect(e.text).toContain("Approved on: Nov 19, 2026");
    expect(e.text).toContain("Go ahead.");
    expect(e.text).toContain("Open the change order: https://app.example.com/project?id=p1&tab=changes");
    expect(e.html).toContain(`href="https://app.example.com/project?id=p1&amp;tab=changes"`);
  });

  it("rejected change order reads right and is escaped", () => {
    const e = changeOrderResponseEmail({ ...co, outcome: "rejected" });
    expect(e.subject).toBe("Rejected: CO-003 Two extra cameras — 12 Sample St");
    expect(e.text).toContain("Answered by: Jane Client");
    expectSafe(changeOrderResponseEmail({ ...co, title: EVIL, signerName: EVIL, comment: EVIL, jobName: EVIL, companyName: EVIL }));
    expect(changeOrderResponseEmail({ ...co, url: "javascript:alert(1)" }).html).not.toContain("javascript:");
  });

  it("RFI answered: question, answer and a link to the RFIs", () => {
    const e = rfiAnsweredEmail({
      code: "RFI-007",
      subject: "Mount height for the AP",
      question: "Ceiling or wall?",
      answer: "Ceiling, centre of the room.",
      answeredBy: "Pat Architect",
      toCompany: "Sample Design Co",
      jobName: "12 Sample St",
      answeredAt: "2026-11-19T10:00:00Z",
      url: "https://app.example.com/project?id=p1&tab=field&section=rfis",
      companyName: "Acme",
    });
    expect(e.subject).toBe("Answered: RFI-007: Mount height for the AP — 12 Sample St");
    expect(e.text).toContain("Pat Architect (Sample Design Co) answered RFI-007: Mount height for the AP on 12 Sample St.");
    expect(e.text).toContain("> Ceiling, centre of the room.");
    expect(e.text).toContain("Open the RFI: https://app.example.com/project?id=p1&tab=field&section=rfis");
    expectSafe(rfiAnsweredEmail({ code: "RFI-1", subject: EVIL, question: EVIL, answer: EVIL, answeredBy: EVIL, toCompany: EVIL, jobName: EVIL, url: "https://x.y", companyName: EVIL }));
  });
});

describe("Supabase Auth templates (supabase/templates)", () => {
  const all = authEmailTemplates();
  it("the files match the generator, in the same look", () => {
    expect(Object.keys(all).sort()).toEqual(["change-email", "confirm-signup", "invite", "magic-link", "reauthentication", "reset-password"]);
    for (const [name, t] of Object.entries(all)) {
      expect(readFileSync(`supabase/templates/${name}.html`, "utf8")).toBe(t.html);
      expect(t.html).toContain(".pp-bg { background:#081629 !important; }");
      expect(t.html).not.toMatch(/#c2410c/i);
    }
  });
  it("keeps Supabase's placeholders intact", () => {
    for (const name of ["confirm-signup", "invite", "magic-link", "reset-password", "change-email"]) expect(all[name].html).toContain(`href="{{ .ConfirmationURL }}"`);
    expect(all["change-email"].html).toContain("{{ .NewEmail }}");
    expect(all.reauthentication.html).toContain("{{ .Token }}");
    expect(all.reauthentication.html).not.toContain("ConfirmationURL");
  });
});
