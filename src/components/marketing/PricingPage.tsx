// /pricing: the plan, a seat calculator, the trial and the questions people ask before paying.
import Link from "next/link";
import { PLANS, PRODUCT_NAME, TRIAL_DAYS } from "@/lib/plans";
import { PlanCard } from "./Pricing";
import { Faq, SitePage, TryDemoLink } from "./Site";

export default function PricingPage() {
  const plan = PLANS[0];
  return (
    <SitePage>
      <section aria-labelledby="pricing-title">
        <div className="mx-auto max-w-[1240px] px-4 pt-14 pb-20 sm:px-6 lg:pt-20 lg:pb-24">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:items-end lg:gap-16">
            <h1 id="pricing-title" className="mk-display">
              One plan for the whole company
            </h1>
            <p className="mk-lede lg:pb-2">
              Every feature, every trade and unlimited jobs. You pay for the people who log in, and the first {TRIAL_DAYS} days are free.
            </p>
          </div>
          <div className="mt-12 lg:mt-16">
            <PlanCard plan={plan} />
          </div>
          <dl className="mt-14 grid gap-x-10 gap-y-8 sm:grid-cols-2 lg:grid-cols-4">
            {[
              [`${TRIAL_DAYS}-day free trial`, "Every feature from day one. Set up your company, upload a plan and send a real quote before you decide."],
              ["Prices stay with the office", "Techs get their own login for plans, devices, photos, checklists and tasks. Their logins hide prices, quotes and invoices in the app."],
              ["Your data, always", "Export every job as a backup file any time: during the trial, after it, or after you cancel."],
              ["Private to your company", "Jobs are visible only to your team, enforced in the database. Delete your account from Settings whenever you like."],
            ].map(([t, d]) => (
              <div key={t} className="border-t-2 border-mk-graphite pt-4">
                <dt className="text-[17px] font-semibold">{t}</dt>
                <dd className="mt-2 text-[15px] leading-relaxed text-mk-pencil">{d}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section aria-labelledby="pricing-faq" className="border-t border-mk-rule">
        <div className="mx-auto grid max-w-[1240px] gap-10 px-4 py-20 sm:px-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-16 lg:py-24">
          <div>
            <h2 id="pricing-faq" className="mk-h2">
              Pricing questions
            </h2>
            <p className="mt-5 text-[15px] text-mk-pencil">
              Still deciding?{" "}
              <Link href="/support" className="mk-link text-mk-graphite">
                Ask us anything
              </Link>{" "}
              or <TryDemoLink className="mk-link text-mk-graphite" />.
            </p>
          </div>
          <Faq
            items={[
              ["Can I cancel any time?", "Yes. There’s no contract: cancel from Settings and you won’t be charged again. Your jobs stay readable and exportable."],
              [
                "What happens when the trial ends?",
                `After ${TRIAL_DAYS} days, add a card to keep working. If you don’t, nothing is deleted: your jobs become read-only until you subscribe.`,
              ],
              [
                "Who counts as a user?",
                `Anyone with their own login on your team: you, office staff and technicians. ${plan.includedSeats} are included; each extra person is $${plan.seatPrice} a month.`,
              ],
              [
                "What do technicians see?",
                "Plans, devices, wire runs, photos, checklists, daily logs and tasks on every team job. Prices, quotes and invoices are hidden from their logins in the app, and they can’t delete jobs.",
              ],
              [
                "Do I need separate accounting software?",
                "Not for quotes and invoices: quotes, invoices and payments are built in, and counts and quotes export as PDF or CSV for your bookkeeping.",
              ],
              [
                "Can I export my data?",
                <>
                  Yes. Settings, then Account, then <span className="font-semibold text-mk-graphite">Export my data</span> downloads every job (plans, devices, photos and
                  quotes) as one backup file you can restore into {PRODUCT_NAME} on any device. Counts and quotes also export as PDF and CSV.
                </>,
              ],
              ["Do I pay for the iPad and iPhone apps?", "No. One subscription covers the web app and the iPad and iPhone apps for everyone on your team."],
            ]}
          />
        </div>
      </section>
    </SitePage>
  );
}
