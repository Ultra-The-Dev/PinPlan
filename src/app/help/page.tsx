import type { Metadata } from "next";
import HelpCenter from "@/components/help/HelpCenter";
import { publicMetadata } from "@/components/marketing/seo";
import { PRODUCT_NAME } from "@/lib/plans";

// Public and precached by the service worker, so it opens offline on site (docs/help-and-tours.md).
export const metadata: Metadata = publicMetadata({
  path: "/help",
  title: `Help and tutorials · ${PRODUCT_NAME}`,
  description: "Short guides with screenshots and guided tours: your first quote, plans, devices, doors and windows, takeoff, invoices, the crew on site, team, offline use and languages.",
});

export default function HelpPage() {
  return <HelpCenter />;
}
