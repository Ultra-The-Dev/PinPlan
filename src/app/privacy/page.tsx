/*
 * ============================================================================================================
 *  DRAFT — HAVE A QUALIFIED LAWYER REVIEW THIS BEFORE LAUNCH.
 *  Written for a US-based B2B SaaS with CCPA/CPRA and GDPR/UK GDPR-style rights. It is not legal advice.
 *  Keep it accurate: when the app starts collecting something new (analytics, push notifications, a new
 *  subprocessor), update this page, SUBPROCESSORS in src/lib/legal.ts and the App Store privacy labels
 *  (docs/production-checklist.md), and bump LEGAL_EFFECTIVE_DATE. Fill in every [placeholder] in src/lib/legal.ts.
 * ============================================================================================================
 */
import type { Metadata } from "next";
import Link from "next/link";
import LegalDoc, { Ph, Section, type TocItem } from "@/components/legal/LegalDoc";
import { COMPANY, LEGAL_EFFECTIVE_DATE, SUBPROCESSORS } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Privacy Policy · PinPlan",
  description: "What PinPlan collects, why, who processes it, how long we keep it and the choices you have.",
};

const S = {
  scope: { id: "scope", title: "Who we are and what this covers" },
  collect: { id: "collect", title: "Information we collect" },
  use: { id: "use", title: "How we use information" },
  ai: { id: "ai", title: "AI processing" },
  sharing: { id: "sharing", title: "How we share information" },
  subprocessors: { id: "subprocessors", title: "Subprocessors" },
  retention: { id: "retention", title: "Retention and deletion" },
  security: { id: "security", title: "Security" },
  rights: { id: "rights", title: "Your rights and choices" },
  clients: { id: "your-clients", title: "Information about our customers’ clients" },
  transfers: { id: "transfers", title: "International transfers" },
  children: { id: "children", title: "Children" },
  changes: { id: "changes", title: "Changes to this policy" },
  contact: { id: "contact", title: "Contact" },
} satisfies Record<string, TocItem>;
const toc = Object.values(S);
const n = (item: TocItem) => toc.indexOf(item) + 1;

export default function PrivacyPage() {
  return (
    <LegalDoc
      title="Privacy Policy"
      effective={LEGAL_EFFECTIVE_DATE}
      toc={toc}
      intro={
        <p>
          Installers trust PinPlan with their jobs, their floor plans and their clients’ details. This policy explains, in plain language, what we collect, why,
          who helps us process it, how long we keep it and how you can control it. In short: we use your data to run PinPlan for you, we don’t sell it, and we
          don’t use it to train AI models.
        </p>
      }
    >
      <Section item={S.scope} n={n(S.scope)}>
        <p>
          PinPlan is operated by <Ph>{COMPANY.legalName}</Ph> (“PinPlan”, “we”, “us”), based in the United States. This policy covers our website, web
          application and iOS app (together, the “Service”).
        </p>
        <p>PinPlan is a business tool, so we handle personal information in two roles:</p>
        <ul>
          <li>
            <strong>As a business (controller)</strong> for information about the companies and people who sign up and use PinPlan: account, billing,
            support and usage information.
          </li>
          <li>
            <strong>As a service provider (processor)</strong> for the job data our customers put into PinPlan, including information about their own clients.
            Our customers decide what goes in and why; we process it on their behalf under our <Link href="/terms">Terms of Service</Link>. See{" "}
            <a href="#your-clients">section {n(S.clients)}</a>.
          </li>
        </ul>
      </Section>

      <Section item={S.collect} n={n(S.collect)}>
        <h3>Information you give us</h3>
        <ul>
          <li>
            <strong>Account and team information:</strong> name, email address, password (stored only as a secure hash by our authentication provider),
            company name, team role, and invitations you send.
          </li>
          <li>
            <strong>Business profile:</strong> company name, logo, phone, email, address and terms that you add to estimates and proposals.
          </li>
          <li>
            <strong>Billing information:</strong> billing contact, plan and invoices. Card details are collected and stored by Stripe; we only see limited
            details such as card brand, last four digits and expiry.
          </li>
          <li>
            <strong>Job data (“Customer Data”):</strong> projects, floor plans and drawings, device placements and cable runs, takeoffs, catalogs and prices,
            estimates, proposals, checklists, tasks, notes, documents and daily logs. This can include your clients’ names, addresses, phone numbers and email
            addresses.
          </li>
          <li>
            <strong>Photos and their metadata:</strong> photos you take or upload, with captions, tags and annotations. Photos can contain embedded metadata
            (EXIF) such as the time taken, camera model and <strong>GPS location</strong>; PinPlan reads the location and time to place photos on job maps and in
            reports.
          </li>
          <li>
            <strong>Support communications:</strong> what you send us when you contact support.
          </li>
        </ul>
        <h3>Information collected automatically</h3>
        <ul>
          <li>
            <strong>Device location</strong>, only if you allow it on your device, to geotag photos and show nearby jobs on the map. You can turn this off in
            your browser or iOS settings at any time.
          </li>
          <li>
            <strong>Camera access</strong>, only when you choose to take a photo in the app.
          </li>
          <li>
            <strong>Diagnostics:</strong> when the app hits an error it sends us an error report: the error message and technical stack trace, the page address
            (with query strings and tokens removed), browser or app version, platform and, if you are signed in, your user ID. We remove email addresses and
            access tokens from these reports before they are sent.
          </li>
          <li>
            <strong>Server and security logs:</strong> our hosting provider records technical request data such as IP address, time, requested address and
            browser type. We use IP addresses to protect the Service, including rate limiting.
          </li>
          <li>
            <strong>Local storage on your device:</strong> PinPlan stores your jobs in your browser’s storage (IndexedDB) or on your iOS device so it works
            offline, plus a sign-in session. These are essential for the Service; we do not use advertising cookies or third-party advertising trackers.
          </li>
        </ul>
        <h3>Information about people who receive proposals and reports</h3>
        <p>
          When one of our customers sends a proposal or photo report link and the recipient opens it, we record that it was opened and when. If the recipient
          accepts or declines, we record their typed name, signature, any options they chose, their note and the time, and share this with the customer who sent
          it.
        </p>
      </Section>

      <Section item={S.use} n={n(S.use)}>
        <p>We use information to:</p>
        <ul>
          <li>provide the Service: store and sync your jobs across your devices and team, generate takeoffs, estimates, PDFs, proposals and reports;</li>
          <li>run AI features when you use them (see below);</li>
          <li>process payments and manage subscriptions;</li>
          <li>send service emails such as sign-in links, team invitations, proposal notifications, receipts and important changes;</li>
          <li>provide support, and diagnose and fix problems;</li>
          <li>keep the Service and our customers secure, prevent abuse and enforce our Terms;</li>
          <li>understand overall usage in aggregated or de-identified form to improve PinPlan; and</li>
          <li>comply with legal obligations.</li>
        </ul>
        <p>
          We do <strong>not</strong> sell personal information, share it for cross-context behavioral advertising, or use Customer Data to train AI models. If we
          ever send marketing emails, you can unsubscribe at any time.
        </p>
        <p>
          Where GDPR-style laws apply, our legal bases are: performing our contract with you; our legitimate interests in running, securing and improving a
          business service (balanced against your rights); your consent, for example for device location (which you can withdraw); and legal obligations.
        </p>
      </Section>

      <Section item={S.ai} n={n(S.ai)}>
        <p>
          AI features — reading a plan sheet, suggesting device locations, explaining a sheet, captioning a photo or drafting a daily log — run only when someone
          on your team uses them. The image or images involved and related text (such as room names, captions, notes or your device catalog) are then sent to
          Anthropic, PBC for processing under their commercial terms. Under those terms Anthropic does not use this data to train its models, and may retain it
          for a limited period for purposes such as trust and safety, as described in its commercial terms and policies. AI results come back to PinPlan as
          suggestions that a person must review.
        </p>
      </Section>

      <Section item={S.sharing} n={n(S.sharing)}>
        <p>We share information only:</p>
        <ul>
          <li>
            <strong>Within your team:</strong> team members see the team’s jobs according to their role.
          </li>
          <li>
            <strong>With people you choose:</strong> when you send a proposal or report link, or connect an integration such as Billdu, we send the relevant data
            where you direct.
          </li>
          <li>
            <strong>With subprocessors</strong> who host and operate parts of the Service for us under contracts that limit their use of the data (listed
            below).
          </li>
          <li>
            <strong>For legal reasons:</strong> to comply with law or valid legal process, or to protect the rights, safety and security of our customers, the
            public or PinPlan. Where allowed, we will tell you about requests for your data.
          </li>
          <li>
            <strong>In a business transfer:</strong> if PinPlan is involved in a merger, acquisition or sale of assets, subject to this policy.
          </li>
        </ul>
        <p>
          Some features load content from third parties directly in your browser: map tiles come from OpenStreetMap’s tile servers, and client proposal and
          report pages load fonts from Google Fonts. Those providers receive your IP address and the request, as with any website.
        </p>
      </Section>

      <Section item={S.subprocessors} n={n(S.subprocessors)}>
        <div className="overflow-x-auto">
          <table>
            <thead>
              <tr>
                <th>Provider</th>
                <th>Purpose</th>
                <th>Data involved</th>
                <th>Location</th>
              </tr>
            </thead>
            <tbody>
              {SUBPROCESSORS.map((s) => (
                <tr key={s.name}>
                  <td className="font-medium whitespace-nowrap text-slate-900">{s.name}</td>
                  <td>{s.purpose}</td>
                  <td>{s.data}</td>
                  <td>
                    <Ph>{s.location}</Ph>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>
          If you connect Billdu, job and client details you choose to send go to Billdu under your own agreement with them. We will update this list before adding
          a new subprocessor that handles Customer Data; customers with a data processing agreement can ask to be notified at <Ph>{COMPANY.privacyEmail}</Ph>.
        </p>
      </Section>

      <Section item={S.retention} n={n(S.retention)}>
        <ul>
          <li>
            <strong>Customer Data</strong> is kept while your account is active and until you delete it. Deleted items are first marked as deleted so other
            devices can sync the deletion, then removed.
          </li>
          <li>
            <strong>When an account is deleted</strong> (by you, or 30 days after a subscription ends), we delete its Customer Data and account information from
            our live systems within 30 days. Copies in encrypted backups are overwritten as backups expire, within <Ph>[35]</Ph> days.
          </li>
          <li>
            <strong>Error reports</strong> are deleted automatically after 90 days. Server logs are kept by our hosting provider for a short period under its
            retention settings.
          </li>
          <li>
            <strong>Billing records</strong> are kept as long as tax and accounting laws require (typically up to seven years).
          </li>
          <li>
            <strong>Data on your devices</strong> stays there until you delete it, sign out and clear the app’s data, or uninstall the app.
          </li>
        </ul>
        <p>
          You can export your jobs at any time and delete your account from the app; see <Link href="/support#delete-account">Support</Link>. Photos keep their
          original metadata (including GPS location) when exported or shared, so review them before sending outside your company.
        </p>
      </Section>

      <Section item={S.security} n={n(S.security)}>
        <p>We use administrative, technical and physical safeguards appropriate to a business service, including:</p>
        <ul>
          <li>encryption in transit (HTTPS/TLS with HSTS) and encryption at rest for our database and file storage;</li>
          <li>row-level security in the database so each account and team can reach only its own data, with role-based permissions inside a team;</li>
          <li>server-side keys kept out of the browser and app, and third-party integration credentials encrypted at rest (AES-256-GCM);</li>
          <li>strict browser security headers, rate limiting and abuse protection on sensitive endpoints;</li>
          <li>regular backups with point-in-time recovery; and</li>
          <li>access to production systems limited to the people who need it to run and support the Service.</li>
        </ul>
        <p>
          No system is perfectly secure. If we learn of a breach affecting your personal information, we will notify you and the authorities as the law
          requires. Please report vulnerabilities to <Ph>{COMPANY.securityEmail}</Ph>.
        </p>
      </Section>

      <Section item={S.rights} n={n(S.rights)}>
        <p>Depending on where you live, you may have the right to:</p>
        <ul>
          <li>know and access the personal information we hold about you, and receive a portable copy;</li>
          <li>correct inaccurate information;</li>
          <li>delete your information;</li>
          <li>object to or restrict certain processing, and withdraw consent where we rely on it;</li>
          <li>opt out of the “sale” or “sharing” of personal information (we don’t sell or share it in that sense) and limit the use of sensitive information such as precise location (we use it only to provide the Service); and</li>
          <li>complain to your local data-protection authority.</li>
        </ul>
        <p>
          <strong>California residents:</strong> in the past 12 months we have collected identifiers, commercial information (subscriptions), internet activity
          (diagnostics and logs), geolocation (photo and device location), audio-visual information (photos) and professional information (company and role)
          for the business purposes described above, and disclosed them to the service providers listed above. We have not sold or shared personal information or
          used sensitive personal information for purposes that require a right to limit. We won’t discriminate against you for exercising your rights, and you
          may use an authorized agent. We honor Global Privacy Control signals as an opt-out request.
        </p>
        <p>
          To make a request, use the in-app tools (export, delete account) or email <Ph>{COMPANY.privacyEmail}</Ph>. We will verify your request, usually by
          confirming access to your account email, and respond within the time the law requires (for example, 45 days under California law or one month under
          GDPR).
        </p>
      </Section>

      <Section item={S.clients} n={n(S.clients)}>
        <p>
          If you are a client of a company that uses PinPlan (for example, you received a proposal), that company controls your information and decides how it
          is used. Please contact them to access, correct or delete it. If you contact us, we will pass your request to them and help them respond.
        </p>
      </Section>

      <Section item={S.transfers} n={n(S.transfers)}>
        <p>
          PinPlan is operated from the United States and stores data in <Ph>{COMPANY.dataRegion}</Ph>. If you use PinPlan from outside the US, your information
          is transferred to and processed in the US. Where required, we rely on appropriate safeguards such as the European Commission’s Standard Contractual
          Clauses <Ph>[confirm transfer mechanism]</Ph>.
        </p>
      </Section>

      <Section item={S.children} n={n(S.children)}>
        <p>
          PinPlan is a business service and is not directed to children. We do not knowingly collect personal information from anyone under 16. If you believe a
          child has given us personal information, contact us and we will delete it.
        </p>
      </Section>

      <Section item={S.changes} n={n(S.changes)}>
        <p>
          We will update this policy when our practices change and change the effective date above. If a change is material, we will notify account owners by
          email or in the app before it takes effect.
        </p>
      </Section>

      <Section item={S.contact} n={n(S.contact)}>
        <p>
          Questions or requests: <Ph>{COMPANY.privacyEmail}</Ph>
          <br />
          <Ph>{COMPANY.legalName}</Ph>, <Ph>{COMPANY.address}</Ph>
        </p>
      </Section>
    </LegalDoc>
  );
}
