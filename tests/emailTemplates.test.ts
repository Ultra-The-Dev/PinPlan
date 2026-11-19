// Email templates: subjects, links, plain-text alternatives, and escaping of everything a user typed.
import { describe, expect, it } from "vitest";
import {
  esc,
  paymentFailedEmail,
  proposalResponseEmail,
  safeUrl,
  teamInviteEmail,
  trialEndingEmail,
  welcomeEmail,
  type EmailContent,
} from "@/lib/emailTemplates";
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
    expect(e.text).toContain("Choose a plan: https://app.example.com/settings#billing");
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
