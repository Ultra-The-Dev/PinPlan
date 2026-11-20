"use client";
// "Linked on E-101" chips under a job document: the plan sheets with a link to it. Tapping one opens that sheet.
import { MapPin } from "lucide-react";
import { useRouter } from "next/navigation";
import { useT } from "@/lib/i18n";
import { useJobLinks } from "@/lib/sheetLinks";
import { useEditor } from "@/lib/store";

export default function DocumentBacklinks({ documentId }: { documentId: string }) {
  const t = useT();
  const links = useJobLinks();
  const sheets = useEditor((s) => s.sheets);
  const projectId = useEditor((s) => s.project?.id);
  const router = useRouter();
  const on = [...new Set(links.filter((l) => l.target.kind === "document" && l.target.documentId === documentId).map((l) => l.sheetId))]
    .map((id) => sheets.find((s) => s.id === id && !s.deleted))
    .filter((s): s is NonNullable<typeof s> => !!s);
  if (!on.length || !projectId) return null;
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {on.map((s) => (
        <button
          key={s.id}
          className="chip bg-red-50 text-red-600 hover:bg-red-100"
          onClick={() => {
            useEditor.getState().setActiveSheet(s.id);
            router.replace(`/project?id=${projectId}&tab=plan`);
          }}
          title={t("Open {sheet} on the plan", { sheet: s.number || s.name })}
        >
          <MapPin className="h-3 w-3" /> {t("Linked on {sheet}", { sheet: s.number || s.name })}
        </button>
      ))}
    </div>
  );
}
