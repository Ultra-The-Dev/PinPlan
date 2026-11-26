"use client";
// "Add by count": put many of one device on this plan with ONE pin, e.g. 12 windows, instead of tapping each one. The
// pin lands in the middle of the view (drag it anywhere) and shows "×12"; the takeoff, estimate, exports and alarm
// sensors count it as 12 (markerQty). Door and Window come first; any device type can be counted.
import { Hash, X } from "lucide-react";
import { useId, useMemo, useState } from "react";
import { openingKind } from "@/lib/alarmSensors";
import { OPENING_TYPE_IDS } from "@/lib/catalog";
import { useT } from "@/lib/i18n";
import { countPinSpot, markerQty, normalizeCount } from "@/lib/markerCount";
import type { PlanViewport } from "@/lib/planViewport";
import { useEditor } from "@/lib/store";
import { toast } from "@/lib/toast";
import { typeVisible } from "@/lib/trades";
import { useTrades } from "@/lib/useTrades";
import type { DeviceType } from "@/lib/types";
import Modal from "../ui/Modal";
import CountStepper from "./CountStepper";
import SymbolIcon from "./SymbolIcon";

const TYPE_KEY = "pinplan.addByCount.type";

function rememberedType(): string | null {
  try {
    return localStorage.getItem(TYPE_KEY);
  } catch {
    return null;
  }
}

export default function AddByCountDialog({ viewport, onClose }: { viewport: PlanViewport; onClose: () => void }) {
  const t = useT();
  const uid = useId();
  const trades = useTrades();
  const { catalog, markers, activeSheetId, room: currentRoom, addMarker, select, setTool } = useEditor();
  const types = useMemo(() => catalog.filter((d) => d.kind === "device" && typeVisible(d, trades)), [catalog, trades]);
  // Doors and windows first (the usual reason to count), then the rest of the price list.
  const openings = useMemo(() => {
    const out = types.filter((d) => openingKind(d) != null);
    return out.sort((a, b) => Number(OPENING_TYPE_IDS.includes(b.id)) - Number(OPENING_TYPE_IDS.includes(a.id)) || a.sort - b.sort);
  }, [types]);
  const [typeId, setTypeId] = useState<string>(() => {
    const r = rememberedType();
    if (r && types.some((d) => d.id === r)) return r;
    return types.find((d) => d.id === OPENING_TYPE_IDS[1])?.id ?? openings[0]?.id ?? types[0]?.id ?? "";
  });
  const [count, setCount] = useState(10);
  const [room, setRoom] = useState(currentRoom);
  const rooms = useMemo(() => Array.from(new Set(markers.filter((m) => m.sheetId === activeSheetId && m.room.trim()).map((m) => m.room.trim()))).sort(), [markers, activeSheetId]);
  const type: DeviceType | undefined = types.find((d) => d.id === typeId);

  const place = async () => {
    if (!type) return;
    const mid = viewport.center();
    const center = viewport.screenToRel(mid);
    const taken = markers.filter((m) => m.sheetId === activeSheetId && !m.deleted);
    // Step aside by about a pin and its ×N on screen (40 px), whatever the zoom.
    const step = Math.abs(viewport.screenToRel({ x: mid.x + 40, y: mid.y }).x - center.x);
    const at = countPinSpot(center, taken, step);
    const m = await addMarker(type.id, at.x, at.y, { count: normalizeCount(count), room: room.trim() });
    if (!m) return;
    try {
      localStorage.setItem(TYPE_KEY, type.id);
    } catch {
      /* storage unavailable */
    }
    setTool({ kind: "select" });
    select({ table: "markers", id: m.id });
    toast(t("Added {name} ×{n}. Drag the pin where you like.", { name: type.name, n: markerQty(m) }), "success");
    onClose();
  };

  return (
    <Modal onClose={onClose} labelledBy={`${uid}-title`} className="fixed inset-0 z-[70] flex items-end justify-center bg-slate-900/30 backdrop-blur-[2px] sm:items-center sm:p-4">
      <form
        className="card animate-in flex max-h-[90vh] w-full max-w-sm flex-col gap-3.5 overflow-auto rounded-b-none p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-pop sm:rounded-b-xl"
        onSubmit={(e) => {
          e.preventDefault();
          void place();
        }}
        data-testid="add-by-count"
        data-plan-ui
      >
        <div className="flex items-center gap-2">
          <Hash className="h-4 w-4 shrink-0 text-brand-600" />
          <h2 id={`${uid}-title`} className="flex-1 font-semibold text-slate-900">{t("Add by count")}</h2>
          <button type="button" className="btn btn-sm btn-icon btn-ghost" onClick={onClose} aria-label={t("Close")}>
            <X />
          </button>
        </div>
        <p className="-mt-2 text-xs text-slate-500">{t("Too many to pin one by one? One pin stands for all of them and counts as that many everywhere.")}</p>

        <div>
          <span className="label">{t("Device")}</span>
          {openings.length > 0 && (
            <div className="mb-1.5 flex flex-wrap gap-1.5">
              {openings.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  className={`flex min-h-10 items-center gap-1.5 rounded-xl px-2.5 text-sm font-medium ring-1 pointer-coarse:min-h-11 ${d.id === typeId ? "bg-brand-50 text-brand-700 ring-brand-300" : "bg-white text-slate-700 ring-slate-200 hover:bg-slate-50"}`}
                  onClick={() => setTypeId(d.id)}
                  aria-pressed={d.id === typeId}
                  data-testid={`count-type-${d.id}`}
                >
                  <SymbolIcon type={d} size={22} />
                  {d.name}
                </button>
              ))}
            </div>
          )}
          <select className="input" value={typeId} onChange={(e) => setTypeId(e.target.value)} aria-label={t("Device")} data-testid="count-type">
            {types.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="label" htmlFor={`${uid}-n`}>{t("How many")}</label>
          <CountStepper id={`${uid}-n`} value={count} onChange={setCount} live autoFocus testId="count-input" />
        </div>

        <div>
          <label className="label" htmlFor={`${uid}-room`}>{t("Room (optional)")}</label>
          <input id={`${uid}-room`} className="input" list={`${uid}-rooms`} value={room} placeholder={t("e.g. Kitchen")} onChange={(e) => setRoom(e.target.value)} data-testid="count-room" />
          <datalist id={`${uid}-rooms`}>
            {rooms.map((r) => (
              <option key={r} value={r} />
            ))}
          </datalist>
        </div>

        <button type="submit" className="btn btn-brand w-full pointer-coarse:min-h-12" disabled={!type} data-testid="count-place">
          {type ? t("Add {name} ×{n}", { name: type.name, n: count }) : t("Add")}
        </button>
        <p className="-mt-1.5 text-center text-[11px] text-slate-500">{t("It goes in the middle of the plan view. Drag it where you like.")}</p>
      </form>
    </Modal>
  );
}
