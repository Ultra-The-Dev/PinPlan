"use client";
// Mounted once (Providers, inside <Suspense>): reads this device's tour state, follows the account's, and shows the
// running tour or the place's one-time tip. Never on client pages (quotes, invoices, plan review…).
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { isClientPath } from "@/lib/tour/model";
import { startTourAccountSync, useTour } from "@/lib/tour/store";
import RouteTip from "./RouteTip";

// Only loaded while a tour runs.
const TourCoach = dynamic(() => import("./TourCoach"), { ssr: false, loading: () => null });

export default function TourHost() {
  const path = usePathname() ?? "";
  const loaded = useTour((s) => s.loaded);
  const active = useTour((s) => s.active);
  useEffect(() => {
    useTour.getState().load();
    return startTourAccountSync();
  }, []);
  if (!loaded || isClientPath(path)) return null;
  return active ? <TourCoach /> : <RouteTip />;
}
