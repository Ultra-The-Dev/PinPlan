import type { Metadata } from "next";
import AppHeader from "@/components/AppHeader";
import CatalogEditor from "@/components/CatalogEditor";
import PriceListNav from "@/components/nav/PriceListNav";
import RoleGate from "@/components/RoleGate";

export const metadata: Metadata = { title: "Price list" };

/** Price list → Devices (the device catalog). */
export default function CatalogPage() {
  return (
    <>
      <AppHeader />
      <main className="flex-1 overflow-auto">
        <RoleGate action="editCatalog" what="The price list">
          <PriceListNav />
          <CatalogEditor />
        </RoleGate>
      </main>
    </>
  );
}
