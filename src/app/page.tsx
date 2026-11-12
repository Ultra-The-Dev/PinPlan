import AppHeader from "@/components/AppHeader";
import ProjectsList from "@/components/ProjectsList";

export default function Home() {
  return (
    <>
      <AppHeader />
      <main className="flex-1 overflow-auto">
        <ProjectsList />
      </main>
    </>
  );
}
