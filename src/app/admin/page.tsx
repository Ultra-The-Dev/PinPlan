import type { Metadata } from "next";
import AppHeader from "@/components/AppHeader";
import AdminDashboard from "@/components/AdminDashboard";

export const metadata: Metadata = { title: "Admin · PinPlan", robots: { index: false, follow: false } };

export default function AdminPage() {
  return (
    <>
      <AppHeader />
      <main className="flex-1 overflow-auto">
        <AdminDashboard />
      </main>
    </>
  );
}
