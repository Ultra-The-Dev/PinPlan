import type { Metadata } from "next";
import SignupForm from "@/components/auth/SignupForm";
import { publicMetadata } from "@/components/marketing/seo";
import { PRODUCT_NAME, TRIAL_DAYS } from "@/lib/plans";

// Public and in the sitemap, so it carries its own canonical link and share card (the ?plan= / ?invite= variants point here).
export const metadata: Metadata = publicMetadata({
  path: "/signup",
  title: `Start your free trial — ${PRODUCT_NAME}`,
  description: `Create your company on ${PRODUCT_NAME}: ${TRIAL_DAYS} days free, every feature.`,
});

export default function SignupPage() {
  return <SignupForm />;
}
