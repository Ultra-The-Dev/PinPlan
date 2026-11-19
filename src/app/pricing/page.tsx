import type { Metadata } from "next";
import PricingPage from "@/components/marketing/PricingPage";
import { PRODUCT_NAME } from "@/lib/plans";

export const metadata: Metadata = {
  title: `Pricing — ${PRODUCT_NAME}`,
  description: "One plan for the whole company: unlimited jobs, estimates, proposals and field docs. Start with a free trial.",
};

export default function Pricing() {
  return <PricingPage />;
}
