import { Suspense } from "react";
import ProjectView from "@/components/ProjectView";

export default function ProjectPage() {
  return (
    <Suspense fallback={<div className="p-6 text-slate-500">Loading…</div>}>
      <ProjectView />
    </Suspense>
  );
}
