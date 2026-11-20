"use client";
// "Create task for this" on a device set to Issue: opens the new-task sheet prefilled with the device, its spot on the
// plan, its room and the issue note.
import { ListPlus } from "lucide-react";
import { useState } from "react";
import { taskFromDevice } from "@/lib/tasks";
import type { Marker } from "@/lib/types";
import TaskQuickCreate from "./TaskQuickCreate";
import { useT } from "@/lib/i18n";

export default function IssueTaskButton({ marker, label }: { marker: Marker; label: string }) {
  const [open, setOpen] = useState(false);
  const note = [...(marker.install?.history ?? [])].reverse().find((h) => h.status === "issue")?.note;
  const draft = taskFromDevice(marker, label, note);
  const t = useT();
  return (
    <>
      <button type="button" className="btn h-11 w-full" onClick={() => setOpen(true)}>
        <ListPlus /> {t("Create task for this")}
      </button>
      {open && <TaskQuickCreate projectId={marker.projectId} draft={{ sheetId: draft.sheetId ?? null, x: draft.x ?? null, y: draft.y ?? null, room: draft.room, title: draft.title, description: draft.description, markerId: draft.markerId }} onClose={() => setOpen(false)} />}
    </>
  );
}
