import type { Metadata } from "next";
import SignupForm from "@/components/auth/SignupForm";
import { PRODUCT_NAME, TRIAL_DAYS } from "@/lib/plans";

export const metadata: Metadata = {
  title: `Start your free trial — ${PRODUCT_NAME}`,
  description: `Create your company on ${PRODUCT_NAME}: ${TRIAL_DAYS} days free, every feature.`,
};

export default function SignupPage() {
  return <SignupForm />;
}
