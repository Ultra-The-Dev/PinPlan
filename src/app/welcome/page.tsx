import type { Metadata } from "next";
import Landing from "@/components/marketing/Landing";
import { PRODUCT_NAME } from "@/lib/plans";

export const metadata: Metadata = {
  title: `${PRODUCT_NAME} — Floor plans to signed proposals for low-voltage installers`,
  description:
    "Pin cameras, network, AV, smart home and lighting devices on floor plans. Get a per-floor takeoff, a priced estimate and a client proposal with e-signature, plus field photos, checklists and logs. iPad, iPhone and web, even offline.",
};

export default function WelcomePage() {
  return <Landing />;
}
