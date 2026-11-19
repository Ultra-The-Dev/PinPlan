import AppHeader from "@/components/AppHeader";
import CrewBoard from "@/components/schedule/CrewBoard";

export default function SchedulePage() {
  return (
    <>
      <AppHeader />
      <main className="flex-1 overflow-auto">
        <CrewBoard />
      </main>
    </>
  );
}
