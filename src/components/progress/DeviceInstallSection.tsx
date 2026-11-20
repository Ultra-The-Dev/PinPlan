"use client";
// The "Install" section of the device inspector: current status, one button for the next step, and the full install
// record (photos, test, issue, history) in the device sheet.
import { ChevronRight } from "lucide-react";
import { useState } from "react";
import { STATUS_COLORS, STATUS_LABELS, markable, nextStatus, statusOf, workflowOf } from "@/lib/installProgress";
import { useT } from "@/lib/i18n";
import { useEditor } from "@/lib/store";
import { useTrades } from "@/lib/useTrades";
import type { Marker, Run } from "@/lib/types";
import { findItem, itemLabel, photoNeeded, setInstall } from "./actions";
import DeviceInstallSheet from "./DeviceInstallSheet";
import { photoInput, showSnack, useProgressUi } from "./progressStore";

export default function DeviceInstallSection({ marker, run }: { marker?: Marker; run?: Run }) {
  const t = useT();
  const item = marker ?? run;
  const catalog = useEditor((s) => s.catalog);
  const trades = useTrades();
  const [open, setOpen] = useState(false);
  if (!item) return null;
  const table: "markers" | "runs" = marker ? "markers" : "runs";
  const wf = workflowOf(item, catalog, trades);
  const status = statusOf(item);
  const next = nextStatus(status, wf);
  const can = markable({ tentative: !!item.tentative, deleted: item.deleted });
  const advance = async () => {
    if (!next) return;
    const ref = { table, id: item.id };
    const label = itemLabel(findItem(ref));
    if (photoNeeded(next)) {
      // The plan's camera prompt takes it from here (photo first, then the status).
      useProgressUi.getState().set({ pendingPhoto: { ...ref, to: next, label } });
      photoInput.current?.click();
      return;
    }
    if (await setInstall(ref, next)) showSnack(ref, label, t(STATUS_LABELS[next]));
  };
  return (
    <div data-testid="inspector-install">
      <label className="label">{t("Install")}</label>
      <div className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 ring-1 ring-slate-200">
        <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: STATUS_COLORS[status] }} />
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{!can ? t("Not tracked (optional)") : status === "planned" ? t("Not started") : t(wf.labels[status])}</span>
        {can && next && (
          <button className="btn btn-sm" onClick={() => void advance()} title={photoNeeded(next) ? t("Needs a photo") : undefined}>
            {t(wf.labels[next])}
          </button>
        )}
        {can && (
          <button className="btn btn-sm btn-icon btn-ghost" onClick={() => setOpen(true)} aria-label={t("Install details")}>
            <ChevronRight />
          </button>
        )}
      </div>
      {open && <DeviceInstallSheet item={{ table, id: item.id }} onClose={() => setOpen(false)} />}
    </div>
  );
}
