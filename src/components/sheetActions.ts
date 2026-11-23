"use client";
// Sheet actions shared by the plan's sheet menu and Manage sheets: delete (asks first, one undo step, "Undo" on the
// toast) and rename. Deleting keeps the existing soft delete: the sheet row gets `deleted: true` and syncs; its
// devices stay stored but leave the takeoff with it, and Undo brings it all back.
import { sumQty } from "@/lib/markerCount";
import { tn, t } from "@/lib/i18n";
import { useEditor } from "@/lib/store";
import { toast } from "@/lib/toast";

/** Ask, delete the sheets as one step and offer Undo on the toast. True when they were deleted. */
export async function deleteSheetsWithUndo(ids: string[], opts: { confirm?: boolean } = {}): Promise<boolean> {
  const st = useEditor.getState();
  const sheets = st.sheets.filter((s) => ids.includes(s.id) && !s.deleted);
  if (!sheets.length) return false;
  if (opts.confirm !== false) {
    const devices = sumQty(st.markers.filter((m) => sheets.some((s) => s.id === m.sheetId) && !m.deleted));
    const q =
      sheets.length === 1
        ? devices
          ? tn("Delete sheet “{name}” and its {n} device?", "Delete sheet “{name}” and its {n} devices?", devices, { name: sheets[0].name })
          : t("Delete sheet “{name}”?", { name: sheets[0].name })
        : [tn("Delete {n} sheet?", "Delete {n} sheets?", sheets.length), devices ? tn("{n} device on them goes with them.", "{n} devices on them go with them.", devices) : ""].filter(Boolean).join("\n");
    if (!confirm(q)) return false;
  }
  try {
    const step = await st.deleteSheets(sheets.map((s) => s.id));
    if (!step) return false;
    toast(sheets.length === 1 ? t("Deleted “{name}”", { name: sheets[0].name }) : tn("Deleted {n} sheet", "Deleted {n} sheets", sheets.length), "success", {
      action: {
        label: t("Undo"),
        onClick: () =>
          void useEditor
            .getState()
            .undoStep(step)
            .then((ok) => toast(ok ? t("Restored") : t("Something else changed since — use Undo on the plan toolbar."), ok ? "success" : "info")),
      },
    });
    return true;
  } catch (e) {
    toast(e instanceof Error ? e.message : String(e), "error");
    return false;
  }
}

/** Rename a sheet (trimmed; empty names are ignored). */
export async function renameSheet(id: string, name: string): Promise<void> {
  const st = useEditor.getState();
  const v = name.trim().replace(/\s+/g, " ");
  const sheet = st.sheets.find((s) => s.id === id);
  if (!sheet || !v || v === sheet.name) return;
  await st.updateSheet(id, { name: v });
}
