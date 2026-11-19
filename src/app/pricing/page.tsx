import type { Metadata } from "next";
import PricingPage from "@/components/marketing/PricingPage";
import { jsonLdHtml, pricingJsonLd, publicMetadata } from "@/components/marketing/seo";
import { PLANS, PRODUCT_NAME, TRIAL_DAYS } from "@/lib/plans";

const plan = PLANS[0];
const title = `Pricing: ${PRODUCT_NAME}`;
const description = `One plan for the whole company: $${plan.basePrice} a month with ${plan.includedSeats} users, $${plan.seatPrice} for each extra user (USD, plus applicable tax). Unlimited jobs, quotes, invoices and field docs. Start with a ${TRIAL_DAYS}-day free trial.`;

export const metadata: Metadata = publicMetadata({ path: "/pricing", title, description });

export default function Pricing() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdHtml(pricingJsonLd()) }} />
      <PricingPage />
    </>
  );
}
