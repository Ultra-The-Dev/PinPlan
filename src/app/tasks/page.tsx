import AppHeader from "@/components/AppHeader";
import TasksBoard from "@/components/TasksBoard";

export default function TasksPage() {
  return (
    <>
      <AppHeader />
      <main className="flex-1 overflow-auto">
        <TasksBoard />
      </main>
    </>
  );
}
