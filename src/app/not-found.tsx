import type { Metadata } from "next";
import NotFound from "@/components/marketing/NotFound";
import { PRODUCT_NAME } from "@/lib/plans";

// Any address with no page: the branded 404 with the site header, a way home and to the jobs. (Next.js adds the
// noindex robots tag to it by itself.)
export const metadata: Metadata = { title: `Page not found — ${PRODUCT_NAME}` };

export default function NotFoundPage() {
  return <NotFound />;
}
