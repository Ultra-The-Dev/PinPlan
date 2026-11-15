// Quick charges: extra labor, prewire and other work added to an estimate in one tap.
// "Per device" charges count themselves from the plan (key "custom:<id>@cam-indoor+cam-outdoor"), so the
// quantity follows the devices placed until someone types a quantity on the line.
import type { TakeoffBucket } from "./takeoff";

export interface QuickCharge {
  id: string;
  name: string;
  unit: string;
  price: number;
  /** Device types whose placed count sets the quantity (empty = a fixed quantity of 1). */
  countFrom?: string[];
}

export const DEFAULT_CHARGES: QuickCharge[] = [
  { id: "prewire-cam", name: "Prewire Cat6 to each camera location", unit: "each", price: 180, countFrom: ["cam-indoor", "cam-outdoor"] },
  { id: "prewire-spk", name: "Prewire 16/4 and 16/2 to each speaker", unit: "each", price: 100, countFrom: ["speaker"] },
  { id: "prewire-wap", name: "Prewire Cat6 to each access point", unit: "each", price: 180, countFrom: ["wap"] },
  { id: "prewire-tv", name: "Prewire HDMI + Cat6 to each TV location", unit: "each", price: 0, countFrom: ["tv"] },
  { id: "prewire-data", name: "Prewire Cat6 to each data drop", unit: "each", price: 0, countFrom: ["data-drop"] },
  { id: "closet", name: "Equipment closet build-out — rack, patch cables and data terminations", unit: "each", price: 4500 },
  { id: "labor", name: "Additional labor", unit: "hr", price: 0 },
  { id: "programming", name: "Programming and system setup", unit: "hr", price: 0 },
  { id: "trip", name: "Trip / service charge", unit: "each", price: 0 },
  { id: "permit", name: "Permit and filing", unit: "each", price: 0 },
];

/** Line key for a new charge line; per-device charges carry the device types after "@". */
export function chargeKey(c: Pick<QuickCharge, "countFrom">, id: string): string {
  return c.countFrom?.length ? `custom:${id}@${c.countFrom.join("+")}` : `custom:${id}`;
}

/** Device types a charge line counts from, or null for a fixed line. */
export function linkedTypes(key: string): string[] | null {
  if (!key.startsWith("custom:")) return null;
  const at = key.indexOf("@");
  return at < 0 ? null : key.slice(at + 1).split("+").filter(Boolean);
}

/** Placed (confirmed) devices of these types on the whole job. */
export function countOf(bucket: Pick<TakeoffBucket, "counts" | "tentative">, typeIds: string[]): number {
  return typeIds.reduce((n, id) => n + (bucket.counts[id] ?? 0) - (bucket.tentative[id] ?? 0), 0);
}
