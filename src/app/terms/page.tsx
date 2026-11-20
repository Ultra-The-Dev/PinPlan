/*
 * ============================================================================================================
 *  DRAFT — HAVE A QUALIFIED LAWYER REVIEW THIS BEFORE LAUNCH.
 *  This is a starting point written for a US-based B2B SaaS. It is not legal advice. Fill in every
 *  placeholder in src/lib/legal.ts (they render highlighted until you do; never type one here), confirm the
 *  governing law, liability cap, refund and data-retention terms, and update LEGAL_EFFECTIVE_DATE whenever this
 *  changes. AI wording appears only while AI_ENABLED (src/lib/features.ts) is on.
 * ============================================================================================================
 */
import type { Metadata } from "next";
import Link from "next/link";
import LegalDoc, { Ph, Section, type TocItem } from "@/components/legal/LegalDoc";
import { termsRu } from "@/components/legal/ru/TermsRu";
import { publicMetadata } from "@/components/marketing/seo";
import { AI_ENABLED } from "@/lib/features";
import { COMPANY, LEGAL_EFFECTIVE_DATE, RETENTION } from "@/lib/legal";

export const metadata: Metadata = publicMetadata({
  path: "/terms",
  title: "Terms of Service · PinPlan",
  description: "The agreement between PinPlan and the businesses that use it.",
});

const S = {
  agreement: { id: "agreement", title: "The agreement" },
  definitions: { id: "definitions", title: "Definitions" },
  accounts: { id: "accounts", title: "Accounts and teams" },
  billing: { id: "billing", title: "Subscriptions, trials and billing" },
  data: { id: "customer-data", title: "Your data" },
  ai: { id: "ai", title: "AI features" },
  proposals: { id: "proposals", title: "Estimates, proposals and signatures" },
  use: { id: "acceptable-use", title: "Acceptable use" },
  thirdParty: { id: "third-party", title: "Third-party services" },
  availability: { id: "availability", title: "Availability, offline use and backups" },
  ip: { id: "ip", title: "Our intellectual property" },
  confidentiality: { id: "confidentiality", title: "Confidentiality" },
  termination: { id: "termination", title: "Term, cancellation and termination" },
  warranties: { id: "warranties", title: "Disclaimers" },
  liability: { id: "liability", title: "Limitation of liability" },
  indemnity: { id: "indemnity", title: "Indemnification" },
  law: { id: "law", title: "Governing law and disputes" },
  apple: { id: "apple", title: "Apple App Store terms" },
  changes: { id: "changes", title: "Changes to these terms" },
  general: { id: "general", title: "General" },
  contact: { id: "contact", title: "Contact" },
} satisfies Record<string, TocItem>;
const toc = Object.values(S).filter((t) => AI_ENABLED || t !== S.ai);
const n = (item: TocItem) => toc.indexOf(item) + 1;

export default function TermsPage() {
  return (
    <LegalDoc
      title="Terms of Service"
      effective={LEGAL_EFFECTIVE_DATE}
      toc={toc}
      ru={termsRu}
      intro={
        <p>
          PinPlan helps electrical, low-voltage and specialty trade contractors count from plans, send quotes and invoices, and run their jobs in the field.
          These terms explain what you can expect from us and what we expect from you. Please read them; by using PinPlan you agree to them.
        </p>
      }
    >
      <Section item={S.agreement} n={n(S.agreement)}>
        <p>
          These Terms of Service (the “Terms”) are an agreement between <Ph>{COMPANY.legalName}</Ph>, <Ph>{COMPANY.entity}</Ph> (“PinPlan”, “we”, “us”), and
          the business or organization that signs up for PinPlan (“Customer”, “you”). If you accept these Terms on behalf of a company, you confirm that you
          have authority to bind it. If you don’t have that authority, or don’t agree, don’t use PinPlan.
        </p>
        <p>
          PinPlan is a business tool. It is offered to companies and their staff for business purposes only, not to consumers for personal, family or household
          use. You must be at least 18 years old to create an account.
        </p>
        <p>
          Our <Link href="/privacy">Privacy Policy</Link> explains how we handle personal information and forms part of these Terms. If you have signed an order
          form or data processing agreement with us, that document controls where it conflicts with these Terms.
        </p>
      </Section>

      <Section item={S.definitions} n={n(S.definitions)}>
        <ul>
          <li>
            <strong>Service</strong> means the PinPlan website, web application, iOS app, APIs and related support we provide.
          </li>
          <li>
            <strong>Users</strong> are the people you allow to use the Service under your account, such as owners, office staff and technicians on your team.
          </li>
          <li>
            <strong>Customer Data</strong> is everything you and your Users put into the Service: jobs, plans and drawings, device placements, takeoffs, prices,
            quotes and estimates, invoices, credit notes and payment records, RFIs, change orders, forms, checklists, tasks, schedules, daily reports, photos
            (including their location and time metadata), notes, documents and files, and information about your own clients.
          </li>
          <li>
            <strong>Your Clients</strong> are the people and businesses you do work for, including anyone who opens a quote, invoice, change order, RFI or
            report link you send.
          </li>
        </ul>
      </Section>

      <Section item={S.accounts} n={n(S.accounts)}>
        <ul>
          <li>Give us accurate account information and keep it current, including a working email address.</li>
          <li>
            Keep passwords and access codes confidential and don’t share logins. Each User should have their own login. You are responsible for everything done
            under your account and by your Users, and for setting their roles (for example, which Users can see prices).
          </li>
          <li>
            Tell us promptly at <Ph>{COMPANY.securityEmail}</Ph> if you believe your account has been accessed without permission.
          </li>
          <li>
            The team owner controls the team account. If the owner leaves your company, contact us and we will help transfer ownership once we can verify the
            request with your company.
          </li>
        </ul>
      </Section>

      <Section item={S.billing} n={n(S.billing)}>
        <p>
          <strong>Plans and seats.</strong> Paid plans are billed per subscription period (monthly or annually) and may limit the number of Users (“seats”) or
          other usage, as shown on our <Link href="/pricing">pricing page</Link> or in your order.
          {AI_ENABLED && " Usage limits for AI features may apply to keep the Service fair and reliable."}
        </p>
        <p>
          <strong>Free trial.</strong> We may offer a free trial. When it ends, the Service continues only if you choose a paid plan. If you don’t, your account
          becomes limited or read-only and you can still export your data as described below.
        </p>
        <p>
          <strong>Payment.</strong> Payments made on the web are processed by Stripe, Inc. By subscribing you authorize us, through Stripe, to charge your
          payment method at the start of each period until you cancel. We don’t store full card numbers. Subscriptions renew automatically unless cancelled
          before the renewal date. Purchases made through the Apple App Store are billed and managed by Apple under its terms, and must be cancelled through
          your Apple account.
        </p>
        <p>
          <strong>Taxes.</strong> Prices exclude taxes unless stated. You are responsible for applicable sales, use and similar taxes, other than taxes on our
          income.
        </p>
        <p>
          <strong>Changes and refunds.</strong> We may change prices with at least 30 days’ notice; changes apply from your next renewal. Fees are
          non-refundable and we don’t give credits for partial periods, except where required by law or where we terminate the Service without cause, in which
          case we refund prepaid fees for the unused period.
        </p>
        <p>
          <strong>Late payment.</strong> If a payment fails we will tell you and retry. If it remains unpaid for 14 days after notice, we may suspend paid
          features until it is paid.
        </p>
      </Section>

      <Section item={S.data} n={n(S.data)}>
        <p>
          <strong>You own your Customer Data.</strong> You give us a limited license to host, copy, transmit, process and display Customer Data only as needed
          to provide, secure and support the Service for you, to prevent abuse, and as required by law. We don’t sell Customer Data and we don’t use it to
          advertise to you or anyone else.
        </p>
        <p>
          <strong>Your responsibilities.</strong> You are responsible for Customer Data and for having the rights and permissions needed to put it into the
          Service. That includes floor plans and drawings you upload (which may belong to architects, engineers or building owners), photos taken on your
          Clients’ premises, and personal information about your Clients such as names, addresses, phone numbers, emails and signatures. Where the law requires
          it, you are responsible for telling your Clients how you use their information and for getting their consent.
        </p>
        <p>
          <strong>Our role.</strong> For personal information inside Customer Data, we act as your service provider (or “processor”) and handle it on your
          instructions, as described in our <Link href="/privacy">Privacy Policy</Link> and our <Link href="/legal/dpa">Data Processing Addendum</Link>, which
          forms part of these Terms. A countersigned copy is available on request at <Ph>{COMPANY.privacyEmail}</Ph>.
        </p>
        <p>
          <strong>Sensitive information.</strong> Don’t use the Service to store payment card numbers, government ID numbers, health information, alarm codes,
          door codes or passwords for your Clients’ systems. The Service is not designed for that kind of data.
        </p>
        <p>
          <strong>Aggregated data.</strong> We may use de-identified, aggregated information about how the Service is used (for example, how many jobs are
          created) to operate and improve it, as long as it doesn’t identify you, your Users or your Clients.
        </p>
      </Section>

      {AI_ENABLED && (
        <Section item={S.ai} n={n(S.ai)}>
          <p>
            Some features use artificial intelligence: reading plan sheets, suggesting device locations, explaining a sheet, captioning photos and drafting daily
            logs. When you use one, the relevant images and text (for example a plan sheet, a photo, room names or your device catalog) are sent to our AI
            provider, Anthropic, PBC, for processing under their commercial terms. Under those terms, Anthropic does not use this data to train its models.
          </p>
          <ul>
            <li>
              <strong>Suggestions only.</strong> AI output can be wrong or incomplete. Suggested devices never count toward a takeoff or estimate until a person on
              your team accepts them. You are responsible for checking quantities, prices, captions and reports before you rely on them or send them to anyone.
            </li>
            <li>
              <strong>Not professional advice.</strong> PinPlan does not provide engineering, design, code-compliance, fire/life-safety or legal advice, and AI
              output is not a substitute for it.
            </li>
            <li>
              <strong>Your choice.</strong> AI features run only when someone on your team uses them.
            </li>
          </ul>
        </Section>
      )}

      <Section item={S.proposals} n={n(S.proposals)}>
        <p>
          PinPlan can produce quotes, invoices, change orders, RFIs, photo reports and other documents, and links your Clients can open, answer, sign and
          accept. You decide their content, pricing and
          terms. Any contract formed is between you and your Client; we are not a party to it and are not responsible for its terms, for your work, or for
          whether an electronic signature is valid for your purpose in your jurisdiction. Invoices and payment records in PinPlan are your records: you are
          responsible for the taxes you charge and for your own bookkeeping. Anyone with a document link can view it, so share links only
          with the intended recipient and withdraw links you no longer want active.
        </p>
        <p>
          Integrations such as Billdu send data to another service at your direction. Your use of that service is governed by your agreement with its provider.
        </p>
      </Section>

      <Section item={S.use} n={n(S.use)}>
        <p>You agree not to, and not to let anyone else:</p>
        <ul>
          <li>break the law, infringe anyone’s rights, or upload content you don’t have the right to use;</li>
          <li>upload malware, or try to access accounts, data or systems you are not authorized to access;</li>
          <li>probe, scan or test the vulnerability of the Service except through our responsible-disclosure process (see Support);</li>
          <li>overload or disrupt the Service, get around usage limits, or use automated means to access it other than our published APIs;</li>
          <li>resell, sublicense or provide the Service to third parties as a service bureau, except to your own Clients as the Service intends;</li>
          <li>copy, reverse engineer or build a competing product from the Service, except where the law expressly allows it; or</li>
          <li>use the Service to harass anyone or to send spam.</li>
        </ul>
        <p>We may suspend access that we reasonably believe violates this section or puts the Service or other customers at risk, and will tell you why when we can.</p>
      </Section>

      <Section item={S.thirdParty} n={n(S.thirdParty)}>
        <p>
          The Service relies on third-party providers, listed in our <Link href="/privacy#subprocessors">Privacy Policy</Link>. Maps in the Service use
          OpenStreetMap data, © OpenStreetMap contributors. Third-party products you choose to connect are provided by those third parties, not by us.
        </p>
      </Section>

      <Section item={S.availability} n={n(S.availability)}>
        <p>
          We work to keep the Service available and fast, but it may sometimes be unavailable for maintenance, updates or reasons outside our control. PinPlan is
          designed to keep working offline: data you enter is stored on your device first and synced to our servers when a connection is available. Data that
          has not yet synced exists only on that device, so it can be lost if the device is lost, reset or its browser storage is cleared.
        </p>
        <p>
          We back up synced data regularly (see our <Link href="/privacy#retention">Privacy Policy</Link>), but backups are for disaster recovery and are not a
          substitute for your own records. You can export your jobs at any time.
        </p>
      </Section>

      <Section item={S.ip} n={n(S.ip)}>
        <p>
          We own the Service, including its software, design, symbols and documentation. While your subscription is active we grant you and your Users a
          non-exclusive, non-transferable right to use the Service for your internal business purposes under these Terms. If you send us ideas or feedback, we may
          use them without obligation to you.
        </p>
      </Section>

      <Section item={S.confidentiality} n={n(S.confidentiality)}>
        <p>
          Each of us will protect the other’s non-public business information with reasonable care, use it only for the purposes of this agreement, and share it
          only with people and providers who need it and are bound to protect it. This doesn’t apply to information that is public, already known, independently
          developed, or that the law requires to be disclosed (with notice where allowed).
        </p>
      </Section>

      <Section item={S.termination} n={n(S.termination)}>
        <ul>
          <li>
            <strong>Cancelling.</strong> You can cancel any time from your billing settings (or through Apple, if you subscribed there). Cancellation takes
            effect at the end of the current period.
          </li>
          <li>
            <strong>Termination by us.</strong> We may terminate or suspend your account if you materially breach these Terms and don’t fix the breach within 15
            days of notice, immediately for serious violations of the acceptable-use rules, or if required by law. We may stop offering the Service with at
            least 60 days’ notice and a refund of prepaid fees for the unused period.
          </li>
          <li>
            <strong>Your data after it ends.</strong> When your subscription ends your account becomes read-only and you can still export your Customer Data
            (we will help on request). We delete it when you delete your account in the app, or within {RETENTION.deletionRequestDays} days of a written request
            to <Ph>{COMPANY.privacyEmail}</Ph>; it is then removed from backups as they expire, as described in our{" "}
            <Link href="/privacy#retention">Privacy Policy</Link>.
          </li>
          <li>Sections that by their nature should survive (such as payment owed, disclaimers, limitation of liability and indemnification) survive termination.</li>
        </ul>
      </Section>

      <Section item={S.warranties} n={n(S.warranties)}>
        <p>
          We will provide the Service with reasonable skill and care and in line with our documentation. Otherwise, to the maximum extent allowed by law, the
          Service is provided “as is” and “as available”, and we disclaim all other warranties, express or implied, including merchantability, fitness for a
          particular purpose, title and non-infringement. We don’t warrant that the Service will be error-free or uninterrupted, or that takeoffs, estimates
          {AI_ENABLED ? ", AI output" : ""} or measurements derived from plan scales are accurate. You are responsible for verifying quantities and prices
          before you rely on them.
        </p>
        <p>
          PinPlan is a tool for your own work. It does not provide engineering, design, code-compliance, fire/life-safety, tax or legal advice, and nothing in
          it is a substitute for that advice.
        </p>
      </Section>

      <Section item={S.liability} n={n(S.liability)}>
        <p>To the maximum extent allowed by law:</p>
        <ul>
          <li>
            neither party is liable for indirect, incidental, special, consequential or punitive damages, or for lost profits, revenue, goodwill or data
            (other than our obligation to restore data from our backups where available), even if advised they were possible; and
          </li>
          <li>
            each party’s total liability arising out of or relating to these Terms is limited to the amounts you paid us for the Service in the 12 months before
            the event giving rise to the claim (or US $100 if you have not paid anything).
          </li>
        </ul>
        <p>These limits don’t apply to your payment obligations, to either party’s indemnification obligations, or to liability that cannot be limited by law.</p>
      </Section>

      <Section item={S.indemnity} n={n(S.indemnity)}>
        <p>
          You will defend and indemnify PinPlan against third-party claims arising from Customer Data, your work for your Clients, or your use of the Service in
          breach of these Terms or the law. We will defend and indemnify you against third-party claims that the Service, as we provide it, infringes their
          intellectual property rights. The party seeking indemnity must notify the other promptly, let it control the defense, and reasonably cooperate.
        </p>
      </Section>

      <Section item={S.law} n={n(S.law)}>
        <p>
          These Terms are governed by the laws of the State of <Ph>{COMPANY.state}</Ph> and applicable US federal law, without regard to conflict-of-law rules.
          The state and federal courts located in <Ph>{COMPANY.county}</Ph>, <Ph>{COMPANY.state}</Ph> have exclusive jurisdiction, and both parties consent to
          them. Before filing a claim, each party agrees to try to resolve the dispute informally by contacting the other and negotiating in good faith for 30
          days.
        </p>
      </Section>

      <Section item={S.apple} n={n(S.apple)}>
        <p>If you use the PinPlan iOS app downloaded from the Apple App Store, the following also applies:</p>
        <ul>
          <li>These Terms are between you and PinPlan only, not Apple. PinPlan, not Apple, is solely responsible for the app and its content.</li>
          <li>Your license to use the app is limited to Apple-branded devices you own or control, as permitted by the App Store usage rules.</li>
          <li>Apple has no obligation to provide maintenance or support for the app.</li>
          <li>
            If the app fails to conform to any applicable warranty, you may notify Apple and Apple will refund the purchase price (if any). To the maximum extent
            allowed by law, Apple has no other warranty obligation for the app.
          </li>
          <li>
            PinPlan, not Apple, is responsible for addressing any claims relating to the app, including product liability claims, claims that it fails to meet
            legal or regulatory requirements, consumer protection or privacy claims, and claims that it infringes third-party intellectual property.
          </li>
          <li>You confirm you are not located in a country subject to a US embargo and are not on any US government list of prohibited or restricted parties.</li>
          <li>Apple and its subsidiaries are third-party beneficiaries of these Terms and may enforce them against you as they relate to the iOS app.</li>
        </ul>
      </Section>

      <Section item={S.changes} n={n(S.changes)}>
        <p>
          We may update these Terms as the Service evolves. If a change is material, we will tell you by email or in the app at least 30 days before it takes
          effect. If you don’t agree to the change, you can cancel before it takes effect; continuing to use the Service after that means you accept it.
        </p>
      </Section>

      <Section item={S.general} n={n(S.general)}>
        <ul>
          <li>You may not assign these Terms without our consent, except to a successor of your business. We may assign them in a merger, acquisition or sale of assets.</li>
          <li>Neither party is responsible for delays caused by events beyond its reasonable control.</li>
          <li>If any part of these Terms is unenforceable, the rest remains in effect. Not enforcing a right is not a waiver of it.</li>
          <li>We may send notices to the email address on your account. You can send notices to the address below.</li>
          <li>We are independent contractors. These Terms are the entire agreement about the Service and replace any earlier agreement on that subject.</li>
          <li>You will comply with US export control and sanctions laws in using the Service.</li>
        </ul>
      </Section>

      <Section item={S.contact} n={n(S.contact)}>
        <p>
          <Ph>{COMPANY.legalName}</Ph>
          <br />
          <Ph>{COMPANY.address}</Ph>
          <br />
          <Ph>{COMPANY.contactEmail}</Ph>
        </p>
      </Section>
    </LegalDoc>
  );
}
