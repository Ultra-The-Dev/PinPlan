/*
 * ============================================================================================================
 *  DRAFT — HAVE A QUALIFIED LAWYER REVIEW THIS BEFORE LAUNCH. It is not legal advice.
 *  A short-form Data Processing Addendum for a US B2B SaaS acting as processor / service provider, written to
 *  match what the Service actually does (see /privacy). If you need the EU SCCs or UK Addendum attached, your
 *  lawyer adds them as annexes. Fill in every placeholder in src/lib/legal.ts (never type one here).
 * ============================================================================================================
 */
import type { Metadata } from "next";
import Link from "next/link";
import LegalDoc, { Ph, Section, type TocItem } from "@/components/legal/LegalDoc";
import { dpaRu } from "@/components/legal/ru/DpaRu";
import { publicMetadata } from "@/components/marketing/seo";
import { COMPANY, LEGAL_EFFECTIVE_DATE, RETENTION } from "@/lib/legal";

export const metadata: Metadata = publicMetadata({
  path: "/legal/dpa",
  title: "Data Processing Addendum · Northpin",
  description: "How Northpin processes personal information in customer data on behalf of the businesses that use it.",
});

const S = {
  scope: { id: "scope", title: "Scope and roles" },
  instructions: { id: "instructions", title: "Processing on your instructions" },
  people: { id: "people", title: "Our people" },
  security: { id: "security", title: "Security" },
  subprocessors: { id: "subprocessors", title: "Subprocessors" },
  requests: { id: "requests", title: "Helping with requests" },
  incidents: { id: "incidents", title: "Security incidents" },
  deletion: { id: "deletion", title: "Return and deletion" },
  audits: { id: "audits", title: "Information and audits" },
  transfers: { id: "transfers", title: "International transfers" },
  ccpa: { id: "ccpa", title: "US state privacy laws" },
  general: { id: "general", title: "General" },
  details: { id: "details", title: "Annex: details of the processing" },
} satisfies Record<string, TocItem>;
const toc = Object.values(S);
const n = (item: TocItem) => toc.indexOf(item) + 1;

export default function DpaPage() {
  return (
    <LegalDoc
      title="Data Processing Addendum"
      effective={LEGAL_EFFECTIVE_DATE}
      toc={toc}
      ru={dpaRu}
      intro={
        <p>
          This addendum is part of our <Link href="/terms">Terms of Service</Link> and applies whenever we process personal information inside your Customer
          Data. You don’t need to sign anything for it to apply; if you need a countersigned copy, email <Ph>{COMPANY.privacyEmail}</Ph>.
        </p>
      }
    >
      <Section item={S.scope} n={n(S.scope)}>
        <p>
          In this addendum, “we” means <Ph>{COMPANY.legalName}</Ph> and “you” means the customer that agreed to the Terms. Words defined in the Terms (such as
          Customer Data and Service) mean the same here. For personal information in Customer Data, you are the controller (or business) and we are your
          processor (or service provider). Where you act for someone else, such as a general contractor or building owner, we are your subprocessor.
        </p>
      </Section>

      <Section item={S.instructions} n={n(S.instructions)}>
        <p>
          We process Customer Data only to provide, secure and support the Service, on your documented instructions. The Terms, your settings and the way you and
          your Users use the Service are your instructions. If we believe an instruction breaks data-protection law, we will tell you. We process Customer Data
          otherwise only when the law requires it, and will tell you first unless the law prevents us.
        </p>
      </Section>

      <Section item={S.people} n={n(S.people)}>
        <p>People who can access Customer Data are bound by confidentiality and get access only when they need it to run or support the Service.</p>
      </Section>

      <Section item={S.security} n={n(S.security)}>
        <p>
          We keep appropriate technical and organizational measures in place to protect Customer Data, including those described in the{" "}
          <Link href="/privacy#security">Security section of our Privacy Policy</Link>: encryption in transit and at rest, database row-level security
          separating each company’s data, role-based access inside a team, restricted production access and regular backups. We may update these measures as
          long as the overall level of protection doesn’t go down.
        </p>
      </Section>

      <Section item={S.subprocessors} n={n(S.subprocessors)}>
        <p>
          You authorize the subprocessors on our <Link href="/legal/subprocessors">subprocessor list</Link>. We bind each one to data-protection terms at
          least as protective as this addendum and remain responsible for their work. We will update the list before a new subprocessor starts processing
          Customer Data and email you if you asked for notice at <Ph>{COMPANY.privacyEmail}</Ph>. You can object on reasonable data-protection grounds within
          30 days; if we can’t address the objection, you may end the affected part of the Service and get a refund of prepaid fees for it.
        </p>
      </Section>

      <Section item={S.requests} n={n(S.requests)}>
        <p>
          The Service lets you access, correct, export and delete Customer Data yourself. If we receive a request from one of your Users or Clients about
          Customer Data, we will pass it to you and not answer it ourselves unless you ask us to. We will give you reasonable help with requests you can’t handle
          in the Service, and with data-protection impact assessments and consultations with authorities, as far as they concern the Service.
        </p>
      </Section>

      <Section item={S.incidents} n={n(S.incidents)}>
        <p>
          If we become aware of a breach of security leading to unauthorized access to, or loss, alteration or disclosure of, Customer Data, we will tell you
          without undue delay, describe what happened and what we are doing about it as we learn more, and help you meet your own notification duties.
        </p>
      </Section>

      <Section item={S.deletion} n={n(S.deletion)}>
        <p>
          You can export Customer Data at any time while your account exists, including after your subscription ends. We delete Customer Data when you delete
          your account in the Service, or within {RETENTION.deletionRequestDays} days of your written request to <Ph>{COMPANY.privacyEmail}</Ph>. Deleted
          data stays in encrypted backups until they expire, within <Ph>{RETENTION.backupDays}</Ph> days, unless the law requires us to keep it longer.
        </p>
      </Section>

      <Section item={S.audits} n={n(S.audits)}>
        <p>
          On written request, no more than once a year (or after a security incident), we will answer reasonable questions about how we protect Customer Data and
          share relevant summaries of our subprocessors’ security certifications and reports. Any audit beyond that is by agreement, at your cost, with
          reasonable notice and confidentiality.
        </p>
      </Section>

      <Section item={S.transfers} n={n(S.transfers)}>
        <p>
          We store Customer Data in <Ph>{COMPANY.dataRegion}</Ph> and process it in the United States. Where data-protection law requires a transfer mechanism
          for personal information sent to us from outside the US, we rely on <Ph>{COMPANY.transferMechanism}</Ph>.
        </p>
      </Section>

      <Section item={S.ccpa} n={n(S.ccpa)}>
        <p>
          Where the California Consumer Privacy Act or a similar US state law applies, we act as your service provider (or processor). We will not sell or share
          personal information from Customer Data, keep, use or disclose it outside our direct business relationship with you or for any purpose other than
          providing the Service, or combine it with personal information we get from others except as those laws allow. We will tell you if we can no longer
          meet these obligations.
        </p>
      </Section>

      <Section item={S.general} n={n(S.general)}>
        <p>
          This addendum lasts as long as we process Customer Data for you. The limits of liability in the Terms apply to it. If it conflicts with the Terms on
          the processing of personal information, this addendum wins.
        </p>
      </Section>

      <Section item={S.details} n={n(S.details)}>
        <table>
          <tbody>
            <tr>
              <th>Subject and purpose</th>
              <td>Providing the Service: storing, syncing and displaying Customer Data, generating documents and links, and support.</td>
            </tr>
            <tr>
              <th>Duration</th>
              <td>For as long as your account exists, then until deletion as described above.</td>
            </tr>
            <tr>
              <th>Nature of processing</th>
              <td>Hosting, storage, transmission, display, backup, deletion and the other operations needed to provide the Service.</td>
            </tr>
            <tr>
              <th>People concerned</th>
              <td>Your Users; your Clients and their contacts; people named in plans, photos, documents and job records; recipients of links you send.</td>
            </tr>
            <tr>
              <th>Personal information</th>
              <td>
                Names, email addresses, phone numbers and postal addresses; job site addresses; signatures; photos and their time and location metadata; notes,
                answers and other content you or your Clients add.
              </td>
            </tr>
            <tr>
              <th>Sensitive information</th>
              <td>Not intended. The Terms ask you not to store sensitive information such as government ID numbers, health information or access codes.</td>
            </tr>
          </tbody>
        </table>
      </Section>
    </LegalDoc>
  );
}
