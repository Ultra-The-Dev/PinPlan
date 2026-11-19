import type { Metadata } from "next";
import AppHeader from "@/components/AppHeader";
import PriceListNav from "@/components/nav/PriceListNav";
import ProductsEditor from "@/components/ProductsEditor";
import RoleGate from "@/components/RoleGate";

export const metadata: Metadata = { title: "Price list · Products" };

/** Price list → Products (brands and models). */
export default function ProductsPage() {
  return (
    <>
      <AppHeader />
      <main className="flex-1 overflow-auto">
        <RoleGate action="editCatalog" what="The price list">
          <PriceListNav />
          <ProductsEditor />
        </RoleGate>
      </main>
    </>
  );
}
