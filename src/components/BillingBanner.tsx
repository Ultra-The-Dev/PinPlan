"use client";
// App-wide notice under the header: the free trial ends within 3 days, a payment failed, the subscription is ending,
// or jobs are read-only (edits are refused on this device and in the cloud; viewing and exports keep working).
// Owners and admins get the button that fixes it; technicians are told to ask the office. People on no company team
// get the same for their personal trial, pointing at Settings → Team.
import { CircleAlert, Lock } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { openBillingPortal, startCheckout, useNow } from "@/lib/billing";
import { bannerFor, soloBannerFor } from "@/lib/billingLogic";
import { useCanEdit, useSoloBilling } from "@/lib/canEdit";
import { useTeam } from "@/lib/team";
import { useT } from "@/lib/i18n";
import { toast } from "@/lib/toast";

export default function BillingBanner() {
  const billing = useTeam((s) => s.billing);
  const role = useTeam((s) => s.role);
  const onTeam = useTeam((s) => !!s.team);
  const ready = useTeam((s) => s.ready);
  const userId = useTeam((s) => s.userId);
  const solo = useSoloBilling((s) => (s.userId === userId ? s.solo : null));
  useCanEdit(); // keeps the personal trial loaded for people on no team
  const [busy, setBusy] = useState(false);
  const t = useT();
  const now = useNow();
  const banner = !now ? null : onTeam ? bannerFor(billing, role, now) : ready && userId ? soloBannerFor(solo, now) : null;
  if (!banner) return null;
  const red = banner.tone === "red";
  const run = async () => {
    setBusy(true);
    try {
      await (banner.action === "portal" ? openBillingPortal() : startCheckout());
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), "error");
      setBusy(false);
    }
  };
  const Icon = red ? Lock : CircleAlert;
  return (
    <div
      role={red ? "alert" : "status"}
      className={`flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b px-3 py-2 text-sm sm:px-5 ${red ? "border-red-200 bg-red-50 text-red-800" : "border-amber-200 bg-amber-50 text-amber-900"}`}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="min-w-0 flex-1">{banner.text}</span>
      {banner.action === "team" ? (
        <Link href="/settings#team" className={`btn btn-sm ${red ? "btn-brand" : ""}`}>
          {t("Start a company team")}
        </Link>
      ) : banner.action ? (
        <button className={`btn btn-sm ${red ? "btn-brand" : ""}`} disabled={busy} onClick={() => void run()}>
          {busy ? t("Opening…") : banner.action === "portal" ? t("Update billing") : t("Start subscription")}
        </button>
      ) : (
        <Link href="/settings#billing" className="btn btn-sm">
          {t("Details")}
        </Link>
      )}
    </div>
  );
}
