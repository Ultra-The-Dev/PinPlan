// /pricing: the plan, a seat calculator, the trial and the questions people ask before paying.
import { Download, Eye, ShieldCheck, Timer } from "lucide-react";
import Link from "next/link";
import { PLANS, PRODUCT_NAME, TRIAL_DAYS } from "@/lib/plans";
import { PlanCard } from "./Pricing";
import { Faq, SitePage } from "./Site";

export default function PricingPage() {
  const plan = PLANS[0];
  return (
    <SitePage>
      <section className="mx-auto max-w-6xl px-4 pt-12 pb-16 sm:px-6 sm:pt-16 sm:pb-24">
        <div className="mx-auto max-w-2xl text-center">
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900 sm:text-5xl">One plan. Your whole crew.</h1>
          <p className="mt-4 text-base text-slate-600 sm:text-lg">
            Every feature for every job, priced by the number of people who log in. Try it free for {TRIAL_DAYS} days.
          </p>
        </div>
        <div className="mx-auto mt-10 grid max-w-5xl items-start gap-8 lg:grid-cols-[1.15fr_1fr]">
          <PlanCard plan={plan} />
          <ul className="space-y-4">
            {[
              { icon: Timer, t: `${TRIAL_DAYS}-day free trial`, d: "Every feature from day one. Set up your company, upload a plan and send a real proposal before you decide." },
              {
                icon: Eye,
                t: "Technicians without prices",
                d: "Techs get their own login for plans, devices, photos, checklists and tasks. Prices, estimates, proposals and Billdu stay with the office.",
              },
              { icon: Download, t: "Your data, always", d: "Export every job as a backup file any time — during the trial, after it, or after you cancel." },
              { icon: ShieldCheck, t: "Private to your company", d: "Jobs are visible only to your team, enforced in the database. Delete your account from Settings whenever you like." },
            ].map((x) => (
              <li key={x.t} className="flex gap-4 rounded-xl bg-white p-4 shadow-soft ring-1 ring-slate-200/60">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                  <x.icon className="h-4 w-4" />
                </span>
                <div>
                  <div className="text-sm font-semibold text-slate-900">{x.t}</div>
                  <p className="mt-0.5 text-sm leading-relaxed text-slate-600">{x.d}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-4 pb-16 sm:px-6 sm:pb-24">
        <h2 className="mb-6 text-center text-2xl font-semibold tracking-tight text-slate-900">Pricing questions</h2>
        <Faq
          items={[
            ["Can I cancel any time?", "Yes. There’s no contract: cancel from Settings and you won’t be charged again. Your jobs stay readable and exportable."],
            [
              "What happens when the trial ends?",
              `After ${TRIAL_DAYS} days, add a card to keep working. If you don’t, nothing is deleted — your jobs become read-only until you subscribe.`,
            ],
            [
              "Who counts as a user?",
              `Anyone with their own login on your team: you, office staff and technicians. ${plan.includedSeats} are included; each extra person is $${plan.seatPrice}/month.`,
            ],
            [
              "What do technicians see?",
              "Plans, devices, cable runs, photos, checklists, daily logs and tasks on every team job. They don’t see prices, estimates, proposals or Billdu, and can’t delete jobs.",
            ],
            [
              "Can I export my data?",
              <>
                Yes. <span className="font-medium">Settings › Account › Export my data</span> downloads every job (plans, devices, photos and estimates) as one backup
                file you can restore into {PRODUCT_NAME} on any device. Estimates and takeoffs also export as PDF and CSV.
              </>,
            ],
            ["Do I pay for the iPad and iPhone apps?", "No. One subscription covers the web app and the iPad and iPhone apps for everyone on your team."],
          ]}
        />
        <p className="mt-8 text-center text-sm text-slate-500">
          Still deciding? <Link href="/support" className="font-medium text-slate-700 underline underline-offset-4">Ask us anything</Link>.
        </p>
      </section>
    </SitePage>
  );
}
