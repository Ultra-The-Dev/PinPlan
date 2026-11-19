/*
 * Accessibility statement. Keep "Known limitations" honest: update it when a limitation is fixed or a new one is
 * found. Contact goes to the support mailbox in src/lib/legal.ts (never type a placeholder here).
 */
import type { Metadata } from "next";
import LegalDoc, { Ph, Section, type TocItem } from "@/components/legal/LegalDoc";
import { publicMetadata } from "@/components/marketing/seo";
import { COMPANY, LEGAL_EFFECTIVE_DATE } from "@/lib/legal";

export const metadata: Metadata = publicMetadata({
  path: "/accessibility",
  title: "Accessibility · PinPlan",
  description: "PinPlan’s accessibility goal, what we know still needs work, and how to tell us about a barrier.",
});

const S = {
  goal: { id: "goal", title: "Our goal" },
  done: { id: "done", title: "What we do" },
  limits: { id: "limitations", title: "Known limitations" },
  feedback: { id: "feedback", title: "Tell us about a barrier" },
} satisfies Record<string, TocItem>;
const toc = Object.values(S);

export default function AccessibilityPage() {
  return (
    <LegalDoc
      title="Accessibility"
      updated={LEGAL_EFFECTIVE_DATE}
      toc={toc}
      intro={<p>We want everyone on a crew, in the office and on the client side to be able to use PinPlan, whatever device or assistive technology they use.</p>}
    >
      <Section item={S.goal}>
        <p>
          We aim to meet the{" "}
          <a href="https://www.w3.org/TR/WCAG22/" rel="noopener noreferrer">
            Web Content Accessibility Guidelines (WCAG) 2.2
          </a>{" "}
          at level AA on our website, the web app and the pages your clients open (quotes, invoices, change orders, RFIs and photo reports). This is a goal we
          work toward, not a claim that every page meets it today.
        </p>
      </Section>

      <Section item={S.done}>
        <ul>
          <li>Text and controls are designed for strong contrast, and the public site can be used with a keyboard, with visible focus and a skip link.</li>
          <li>Pages use real headings, labels and landmarks so screen readers can move around them.</li>
          <li>Pages reflow on phones, tablets and desktops, and the public site follows your device’s reduced-motion setting.</li>
          <li>Devices on plans are shown with letters and names, not by color alone, and counts are always available as tables.</li>
        </ul>
      </Section>

      <Section item={S.limits}>
        <ul>
          <li>
            <strong>Placing devices on a plan</strong> uses touch, a pen or a mouse on the drawing. The counts, quotes and lists the plan produces can be read and
            edited with a keyboard and screen reader, but pinning a device at a spot on the drawing can’t yet.
          </li>
          <li>
            <strong>Pinch-zoom</strong> is turned off in the browser so pinching zooms the plan instead of the page. Use your browser’s text size or zoom
            setting to enlarge text.
          </li>
          <li>
            <strong>Plan sheets</strong> are images of the drawings you upload, so their text is only as readable as the original file.
          </li>
          <li>
            <strong>PDF exports</strong> (counts, quotes, invoices, reports) are not yet tagged for screen readers. The same information is available on screen
            and as CSV.
          </li>
          <li>
            <strong>Documents your company writes</strong> (terms, notes, photos and captions in quotes and reports) are only as accessible as their content.
          </li>
        </ul>
      </Section>

      <Section item={S.feedback}>
        <p>
          If something in PinPlan is hard or impossible for you to use, email <Ph>{COMPANY.supportEmail}</Ph> with the page or screen, what you were trying to
          do, and the device and assistive technology you use. We aim to reply within two business days and will work with you on a fix or another way to get
          the job done. Clients of a PinPlan customer can also ask the company that sent them the link for the document in another format.
        </p>
      </Section>
    </LegalDoc>
  );
}
