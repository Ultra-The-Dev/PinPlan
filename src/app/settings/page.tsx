import AppHeader from "@/components/AppHeader";
import SettingsForm from "@/components/SettingsForm";
import IntegrationsPanel from "@/components/integrations/IntegrationsPanel";

export default function SettingsPage() {
  return (
    <>
      <AppHeader />
      <main className="flex-1 overflow-auto">
        <SettingsForm />
        <IntegrationsPanel />
      </main>
    </>
  );
}
