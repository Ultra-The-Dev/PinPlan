import type { Metadata } from "next";
import { Suspense } from "react";
import { T } from "@/lib/i18n/T";
import LoginForm from "@/components/auth/LoginForm";
import { PRODUCT_NAME } from "@/lib/plans";

// Out of search results like /reset (robots.txt keeps crawlers out too); the public entry point is /signup.
export const metadata: Metadata = {
  title: `Sign in — ${PRODUCT_NAME}`,
  description: `Sign in to ${PRODUCT_NAME} to open your jobs on the web, iPad and iPhone.`,
  robots: { index: false, follow: false },
};

export default function LoginPage() {
  return (
    <Suspense fallback={<p className="p-10 text-center text-slate-500"><T>Loading…</T></p>}>
      <LoginForm />
    </Suspense>
  );
}
