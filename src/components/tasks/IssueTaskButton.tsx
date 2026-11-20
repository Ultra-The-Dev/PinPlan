"use client";
// "Create task for this" on a device set to Issue: opens the new-task sheet prefilled with the device, its spot on the
// plan, its room and the issue note.
import { ListPlus } from "lucide-react";
import { useState } from "react";
import { taskFromDevice } from "@/lib/tasks";
import type { Marker } from "@/lib/types";
import TaskQuickCreate from "./TaskQuickCreate";

export default function IssueTaskButton({ marker, label }: { marker: Marker; label: string }) {
  const [open, setOpen] = useState(false);
  const note = [...(marker.install?.history ?? [])].reverse().find((h) => h.status === "issue")?.note;
  const t = taskFromDevice(marker, label, note);
  return (
    <>
      <button type="button" className="btn h-11 w-full" onClick={() => setOpen(true)}>
        <ListPlus /> Create task for this
      </button>
      {open && <TaskQuickCreate projectId={marker.projectId} draft={{ sheetId: t.sheetId ?? null, x: t.x ?? null, y: t.y ?? null, room: t.room, title: t.title, description: t.description, markerId: t.markerId }} onClose={() => setOpen(false)} />}
    </>
  );
}
