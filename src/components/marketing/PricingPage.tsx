"use client";
// /pricing: the plan, a seat calculator, the trial and the questions people ask before paying.
// A client component so the text follows the visitor's language (it still renders in English on the server).
import Link from "next/link";
import { msg, useT } from "@/lib/i18n";
import { PLANS, PRODUCT_NAME, TRIAL_DAYS } from "@/lib/plans";
import { PlanCard } from "./Pricing";
import { Faq, SitePage, TryDemoLink } from "./Site";
import { rich } from "../auth/rich";

/** The button's name in Settings › Account. */
const EXPORT_MY_DATA = msg("Export my data");

export default function PricingPage() {
  const t = useT();
  const plan = PLANS[0];
  return (
    <SitePage>
      <section aria-labelledby="pricing-title">
        <div className="mk-dark mk-table flow-root">
          <div className="mx-auto max-w-[1240px] px-4 pt-14 sm:px-6 lg:pt-24">
            <div className="grid gap-6 lg:grid-cols-[minmax(0,6fr)_minmax(0,5fr)] lg:items-end lg:gap-16">
              <h1 id="pricing-title" className="mk-display max-w-[9em]">
                {t("One plan for the whole company")}
              </h1>
              <p className="mk-lede lg:pb-2">
                {t.tn(
                  "Every feature, every trade and unlimited jobs. You pay for the people who log in, and the first {n} day is free.",
                  "Every feature, every trade and unlimited jobs. You pay for the people who log in, and the first {n} days are free.",
                  TRIAL_DAYS,
                )}
              </p>
            </div>
            {/* The plan card lies on the ink table and runs off its edge onto the paper, like the plan on the home page. */}
            <div className="relative z-10 mt-12 -mb-24 lg:mt-16 lg:-mb-36">
              <PlanCard plan={plan} />
            </div>
          </div>
        </div>
        <div className="mx-auto max-w-[1240px] px-4 pt-24 pb-20 sm:px-6 lg:pt-36 lg:pb-28">
          <dl className="mt-16 grid gap-x-10 gap-y-8 sm:grid-cols-2 lg:mt-20 lg:grid-cols-4">
            {[
              [t.tn("{n}-day free trial", "{n}-day free trial", TRIAL_DAYS), t("Every feature from day one. Set up your company, upload a plan and send a real quote before you decide.")],
              [t("Prices stay with the office"), t("Techs get their own login for plans, devices, photos, checklists and tasks. Their logins hide prices, quotes and invoices in the app.")],
              [t("Your data, always"), t("Export every job as a backup file any time: during the trial, after it, or after you cancel.")],
              [t("Private to your company"), t("Jobs are visible only to your team, enforced in the database. Delete your account from Settings whenever you like.")],
            ].map(([term, d]) => (
              <div key={term} className="border-t-2 border-mk-marker pt-4">
                <dt className="text-[20px] leading-tight font-semibold" style={{ fontStretch: "75%" }}>
                  {term}
                </dt>
                <dd className="mt-2 text-[15px] leading-relaxed text-mk-pencil">{d}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section aria-labelledby="pricing-faq" className="border-t border-mk-rule">
        <div className="mx-auto grid max-w-[1240px] gap-10 px-4 py-20 sm:px-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-16 lg:py-28">
          <div>
            <h2 id="pricing-faq" className="mk-h2">
              {t("Pricing questions")}
            </h2>
            <p className="mt-5 text-[15px] text-mk-pencil">
              {rich(t("Still deciding? {ask} or {demo}."), {
                ask: (
                  <Link href="/support" className="mk-link text-mk-graphite">
                    {t("Ask us anything")}
                  </Link>
                ),
                demo: <TryDemoLink className="mk-link text-mk-graphite" />,
              })}
            </p>
          </div>
          <Faq
            items={[
              [t("Can I cancel any time?"), t("Yes. There’s no contract: cancel from Settings and you won’t be charged again. Your jobs stay readable and exportable.")],
              [
                t("What happens when the trial ends?"),
                t.tn(
                  "After {n} day, add a card to keep working. If you don’t, nothing is deleted: your jobs become read-only until you subscribe.",
                  "After {n} days, add a card to keep working. If you don’t, nothing is deleted: your jobs become read-only until you subscribe.",
                  TRIAL_DAYS,
                ),
              ],
              [
                t("Who counts as a user?"),
                t.tn(
                  "Anyone with their own login on your team: you, office staff and technicians. {n} is included; each extra person is {price} a month.",
                  "Anyone with their own login on your team: you, office staff and technicians. {n} are included; each extra person is {price} a month.",
                  plan.includedSeats,
                  { price: `$${plan.seatPrice}` },
                ),
              ],
              [
                t("What do technicians see?"),
                t("Plans, devices, wire runs, photos, checklists, daily logs and tasks on every team job. Prices, quotes and invoices are hidden from their logins in the app, and they can’t delete jobs."),
              ],
              [
                t("Do I need separate accounting software?"),
                t("Not for quotes and invoices: quotes, invoices and payments are built in, and counts and quotes export as PDF or CSV for your bookkeeping."),
              ],
              [
                t("Can I export my data?"),
                rich(
                  t(
                    "Yes. Settings, then Account, then {export} downloads every job (plans, devices, photos and quotes) as one backup file you can restore into {product} on any device. Counts and quotes also export as PDF and CSV.",
                    { product: PRODUCT_NAME },
                  ),
                  { export: <span className="font-semibold text-mk-graphite">{t(EXPORT_MY_DATA)}</span> },
                ),
              ],
              [t("Do I pay for the iPad and iPhone apps?"), t("No. One subscription covers the web app and the iPad and iPhone apps for everyone on your team.")],
            ]}
          />
        </div>
      </section>
    </SitePage>
  );
}
