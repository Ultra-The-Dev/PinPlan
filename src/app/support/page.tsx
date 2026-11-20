/*
 * ============================================================================================================
 *  DRAFT — HAVE A QUALIFIED LAWYER REVIEW THE ACCOUNT-DELETION AND DATA-EXPORT WORDING BEFORE LAUNCH.
 *  Apple requires a working support URL and in-app account deletion; this page is that support URL.
 *  Keep the steps below in sync with the app's actual menus. Fill in every placeholder in src/lib/legal.ts (never
 *  type one here). The AI question appears only while AI_ENABLED (src/lib/features.ts) is on.
 * ============================================================================================================
 */
import type { Metadata } from "next";
import Link from "next/link";
import LegalDoc, { Ph, Section, type TocItem } from "@/components/legal/LegalDoc";
import { supportRu } from "@/components/legal/ru/SupportRu";
import StatusCheck from "@/components/legal/StatusCheck";
import { publicMetadata } from "@/components/marketing/seo";
import { AI_ENABLED } from "@/lib/features";
import { COMPANY, RETENTION } from "@/lib/legal";

export const metadata: Metadata = publicMetadata({
  path: "/support",
  title: "Support · Northpin",
  description: "Contact Northpin support, export your data, delete your account and check service status.",
});

const S = {
  contact: { id: "contact", title: "Contact us" },
  status: { id: "status", title: "Service status" },
  faq: { id: "faq", title: "Frequently asked questions" },
  export: { id: "export", title: "Export your data" },
  deleteAccount: { id: "delete-account", title: "Delete your account" },
  security: { id: "security", title: "Report a security issue" },
} satisfies Record<string, TocItem>;
const toc = Object.values(S);

const FAQ: { q: string; a: React.ReactNode; onlyWhen?: "ai" }[] = [
  {
    q: "Does Northpin work without signal?",
    a: "Yes. Jobs, plans and photos are saved on your device first, so you can keep pinning devices and taking photos with no connection. When you’re back online, changes sync to your team automatically. The cloud badge in the header shows anything still waiting to upload.",
  },
  {
    q: "Where is my data stored?",
    a: (
      <>
        On your device, and — when you’re signed in — in our cloud database and file storage hosted by Supabase in <Ph>{COMPANY.dataRegion}</Ph>, encrypted in
        transit and at rest. See the <Link href="/privacy">Privacy Policy</Link> for the full list of providers.
      </>
    ),
  },
  {
    q: "Is my data used to train AI?",
    a: "No. AI features (plan reading, device suggestions, photo captions, daily-log drafts) only run when you use them. The images and text involved are processed by Anthropic under their commercial terms, which do not allow training on this data. AI suggestions never count in a takeoff or in pricing until someone accepts them.",
    onlyWhen: "ai",
  },
  {
    q: "How do I add my office staff and technicians?",
    a: "Open Settings → Team and invite them. Technicians can work on plans, photos, checklists and tasks; their logins hide prices, quotes and invoices in the app. Each person gets their own login.",
  },
  {
    q: "How do I change or cancel my subscription?",
    a: (
      <>
        Team owners can change plans or cancel under Settings → Plan &amp; billing; cancellation takes effect at the end of the current period. If you subscribed through
        the App Store, manage it in iOS Settings → your name → Subscriptions. See <Link href="/pricing">Pricing</Link> for plans.
      </>
    ),
  },
  {
    q: "A photo shows the wrong location or none at all.",
    a: "Northpin reads the GPS position saved in the photo by your camera. Make sure location access is allowed for your camera app (and for Northpin when taking photos in the app). Photos sent through some messaging apps have their location removed.",
  },
  {
    q: "I can’t sign in or didn’t get an email.",
    a: (
      <>
        Check your spam folder for a message from Northpin, and make sure you’re using the same email your team invited. Still stuck? Email{" "}
        <Ph>{COMPANY.supportEmail}</Ph> from that address and we’ll help.
      </>
    ),
  },
  {
    q: "Something went wrong in the app.",
    a: "Reload the page or reopen the app — your work is saved on the device. If an error screen appears, tap “Copy details” and paste them into an email to support so we can find the problem quickly.",
  },
];

export default function SupportPage() {
  return (
    <LegalDoc
      title="Support"
      toc={toc}
      ru={supportRu}
      intro={<p>We’re a small team that builds Northpin for electrical, low-voltage and specialty contractors. Real people answer every message.</p>}
    >
      <Section item={S.contact}>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="mk-sheet p-5">
            <p className="font-semibold text-mk-graphite">Email support</p>
            <p className="mt-1">
              <Ph>{COMPANY.supportEmail}</Ph>
            </p>
            <p className="mt-2 text-sm text-mk-pencil">
              We reply within one business day (US hours, <Ph>{COMPANY.supportTimeZone}</Ph>). Include your company name and, for a problem, what you were doing and a
              screenshot or the copied error details.
            </p>
          </div>
          <div className="mk-sheet p-5">
            <p className="font-semibold text-mk-graphite">Privacy and data requests</p>
            <p className="mt-1">
              <Ph>{COMPANY.privacyEmail}</Ph>
            </p>
            <p className="mt-2 text-sm text-mk-pencil">For access, export or deletion requests. Please send them from your account email so we can verify them.</p>
          </div>
        </div>
        <p>Please never send passwords, API keys or payment card numbers by email. We will never ask for them.</p>
      </Section>

      <Section item={S.status}>
        <div className="mk-sheet mt-4 p-5">
          <StatusCheck />
          <p className="mt-3 text-sm text-mk-pencil">
            Live check of our servers and database: <a href="/api/health">/api/health</a>
          </p>
        </div>
      </Section>

      <Section item={S.faq}>
        <div className="mt-4 divide-y divide-mk-rule mk-sheet">
          {FAQ.filter((f) => f.onlyWhen !== "ai" || AI_ENABLED).map((f) => (
            <details key={f.q} className="group px-5 py-4 [&_p]:mt-2">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium text-mk-graphite [&::-webkit-details-marker]:hidden">
                {f.q}
                <span className="text-slate-400 transition group-open:rotate-45" aria-hidden>
                  +
                </span>
              </summary>
              <p className="text-mk-pencil">{f.a}</p>
            </details>
          ))}
        </div>
      </Section>

      <Section item={S.export}>
        <p>Your jobs belong to you. You can take them out at any time, including after your subscription ends (the account stays readable).</p>
        <ul>
          <li>
            <strong>A whole job, with plans, markup, photos and pricing:</strong> open the job → <strong>Overview</strong> tab → <strong>Backup</strong> →{" "}
            <strong>Download backup</strong>. This saves a single file that Northpin can restore on any device (Jobs → <strong>Restore backup</strong>).
          </li>
          <li>
            <strong>Takeoff, pricing and reports:</strong> download PDFs and CSV files from the <strong>Takeoff</strong>, <strong>Money</strong> (Pricing section),{" "}
            <strong>Plan</strong> and <strong>Field</strong> tabs of a job.
          </li>
          <li>
            <strong>Your price list:</strong> <strong>Price list</strong> → download the CSV.
          </li>
          <li>
            <strong>Everything at once:</strong> email <Ph>{COMPANY.supportEmail}</Ph> from the team owner’s address and we’ll send a full export of your
            account’s data within {RETENTION.deletionRequestDays} days.
          </li>
        </ul>
      </Section>

      <Section item={S.deleteAccount}>
        <p>You can delete your account yourself:</p>
        <ol>
          <li>
            In the web app or iOS app, open <strong>Settings → Account</strong>.
          </li>
          <li>
            Choose <strong>Delete account</strong> and confirm.
          </li>
        </ol>
        <p>What happens next:</p>
        <ul>
          <li>Your login is removed immediately and you are signed out on every device.</li>
          <li>
            If you are a <strong>team owner</strong>, deleting your account deletes the team’s jobs, photos and documents too. Transfer ownership first (Settings
            → Team) if the company will keep using Northpin, and cancel any App Store subscription in iOS Settings.
          </li>
          <li>If you are a team member, your jobs stay with your team; only your login and personal details are removed.</li>
          <li>
            Your data is removed from our live database and file storage straight away, and from backups as they expire, as described in the{" "}
            <Link href="/privacy#retention">Privacy Policy</Link>. Copies saved on your own devices remain until you delete the app or its data.
          </li>
        </ul>
        <p>
          Can’t sign in? Email <Ph>{COMPANY.privacyEmail}</Ph> from your account email with the subject “Delete my account” and we’ll do it for you after
          confirming it’s you, within {RETENTION.deletionRequestDays} days of your email.
        </p>
      </Section>

      <Section item={S.security}>
        <p>
          If you think you’ve found a security vulnerability, email <Ph>{COMPANY.securityEmail}</Ph> with the details. Please give us a reasonable time to fix it
          before disclosing it, and don’t access other customers’ data or disrupt the Service while testing. We appreciate responsible reports.
        </p>
      </Section>
    </LegalDoc>
  );
}
