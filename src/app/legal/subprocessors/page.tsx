/*
 * The public subprocessor list (linked from /privacy, /legal/dpa and the footer). It renders SUBPROCESSORS from
 * src/lib/legal.ts, so a provider behind a switched-off feature (AI) is listed only while that feature is on.
 * When the list changes, update SUBPROCESSORS_UPDATED (and tell customers who asked for notice) before the change.
 */
import type { Metadata } from "next";
import Link from "next/link";
import LegalDoc, { Ph } from "@/components/legal/LegalDoc";
import { subprocessorsRu } from "@/components/legal/ru/SubprocessorsRu";
import { publicMetadata } from "@/components/marketing/seo";
import { COMPANY, SUBPROCESSORS, SUBPROCESSORS_UPDATED } from "@/lib/legal";

export const metadata: Metadata = publicMetadata({
  path: "/legal/subprocessors",
  title: "Subprocessors · Northpin",
  description: "The companies that host and operate parts of Northpin and process customer data on our behalf.",
});

export default function SubprocessorsPage() {
  return (
    <LegalDoc
      title="Subprocessors"
      updated={SUBPROCESSORS_UPDATED}
      ru={subprocessorsRu}
      intro={
        <p>
          These companies host and operate parts of Northpin for us and may process Customer Data on our behalf. Each is bound by a contract that limits its use
          of the data to providing its service to us. See our <Link href="/privacy">Privacy Policy</Link> and{" "}
          <Link href="/legal/dpa">Data Processing Addendum</Link> for how we handle data.
        </p>
      }
    >
      <h2 id="list">Current subprocessors</h2>
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
                <td className="font-medium whitespace-nowrap">{s.name}</td>
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

      <h2 id="not-subprocessors">Services you choose to use</h2>
      <p>
        If you connect an integration such as Billdu, the job and client details you choose to send go to that service under your own agreement with its
        provider; it is not our subprocessor. The jobs map loads map tiles from OpenStreetMap directly in your browser, which receives your IP address and the
        map area shown, but no Customer Data.
      </p>

      <h2 id="changes">Changes to this list</h2>
      <p>
        We update this page before a new subprocessor starts processing Customer Data. To get an email when it changes, write to{" "}
        <Ph>{COMPANY.privacyEmail}</Ph> from your account email. Customers covered by our Data Processing Addendum can object to a new subprocessor as
        described there.
      </p>
    </LegalDoc>
  );
}
