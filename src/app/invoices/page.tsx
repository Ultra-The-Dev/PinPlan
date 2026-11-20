import type { Metadata } from "next";
import AppHeader from "@/components/AppHeader";
import RoleGate from "@/components/RoleGate";
import InvoicesPage from "@/components/documents/InvoicesPage";
import { msg } from "@/lib/i18n/msg";

export const metadata: Metadata = { title: "Money" };

export default function Invoices() {
  return (
    <>
      <AppHeader />
      <main className="flex-1 overflow-auto">
        <RoleGate action="prices" what={msg("Invoicing")}>
          <InvoicesPage />
        </RoleGate>
      </main>
    </>
  );
}
