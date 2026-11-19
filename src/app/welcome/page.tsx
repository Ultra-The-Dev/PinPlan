import type { Metadata } from "next";
import Landing from "@/components/marketing/Landing";
import { PRODUCT_NAME } from "@/lib/plans";

const title = `${PRODUCT_NAME}: pin the plan, send the quote, get it signed`;
const description = `${PRODUCT_NAME} is takeoff, quoting and job management for electrical, low-voltage, fire alarm, HVAC, plumbing and solar contractors. Pin devices on the floor plans, get the count per floor, send a quote your client approves on their phone, then invoice and run the job. iPad, iPhone and web, even offline.`;

export const metadata: Metadata = {
  title,
  description,
  openGraph: { title, description, type: "website", siteName: PRODUCT_NAME },
  twitter: { card: "summary", title, description },
};

export default function WelcomePage() {
  return <Landing />;
}
