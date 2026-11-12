import AppHeader from "@/components/AppHeader";
import SettingsForm from "@/components/SettingsForm";

export default function SettingsPage() {
  return (
    <>
      <AppHeader />
      <main className="flex-1 overflow-auto">
        <SettingsForm />
      </main>
    </>
  );
}
