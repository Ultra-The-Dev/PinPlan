import type { Metadata } from "next";
import { Suspense } from "react";
import LoginForm from "@/components/auth/LoginForm";
import { PRODUCT_NAME } from "@/lib/plans";

export const metadata: Metadata = { title: `Sign in — ${PRODUCT_NAME}` };

export default function LoginPage() {
  return (
    <Suspense fallback={<p className="p-10 text-center text-slate-500">Loading…</p>}>
      <LoginForm />
    </Suspense>
  );
}
