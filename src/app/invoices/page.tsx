import type { Metadata } from "next";
import AppHeader from "@/components/AppHeader";
import RoleGate from "@/components/RoleGate";
import InvoicesPage from "@/components/documents/InvoicesPage";

export const metadata: Metadata = { title: "Invoices" };

export default function Invoices() {
  return (
    <>
      <AppHeader />
      <main className="flex-1 overflow-auto">
        <RoleGate action="prices" what="Invoicing">
          <InvoicesPage />
        </RoleGate>
      </main>
    </>
  );
}
