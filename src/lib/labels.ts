import type { DeviceType, Marker, Sheet } from "./types";

/** Next auto-numbered label for a device on a floor, e.g. CAM-1-03. Floor number = sheet position (1-based). */
export function nextLabel(type: Pick<DeviceType, "abbrev">, sheet: Pick<Sheet, "id" | "order">, sheets: Pick<Sheet, "id" | "order">[], markers: Pick<Marker, "sheetId" | "label">[]): string {
  const floorNo = [...sheets].sort((a, b) => a.order - b.order).findIndex((s) => s.id === sheet.id) + 1 || 1;
  const prefix = `${type.abbrev}-${floorNo}-`;
  let max = 0;
  for (const m of markers) {
    if (m.sheetId !== sheet.id || !m.label.startsWith(prefix)) continue;
    const n = parseInt(m.label.slice(prefix.length), 10);
    if (Number.isFinite(n)) max = Math.max(max, n);
  }
  return `${prefix}${String(max + 1).padStart(2, "0")}`;
}
