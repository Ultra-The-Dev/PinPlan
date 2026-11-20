import type { Metadata } from "next";
import Landing from "@/components/marketing/Landing";
import { publicMetadata } from "@/components/marketing/seo";
import { PRODUCT_NAME } from "@/lib/plans";

// Old address of the home page (links and bookmarks from before the app moved to /jobs). Same page; canonical "/".
const title = `${PRODUCT_NAME}: pin the plan, send the quote, get it signed`;
const description = `${PRODUCT_NAME} is takeoff, quoting and job management for electrical, low-voltage and specialty contractors.`;

export const metadata: Metadata = publicMetadata({ path: "/", title, description });

export default function WelcomePage() {
  return <Landing />;
}
