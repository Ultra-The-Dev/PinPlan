// 20 Hilltop Dr E — the installer's hand counts from PLAN.md, rebuilt as placed markers and runs.
// These counts were read from handwriting; confirm them against the scans before relying on them.
import type { Closet, Marker, Run, Sheet } from "@/lib/types";

export const HILLTOP_COUNTS = {
  Attic: { indoorCam: 3, outdoorCam: 0, speakers: 0, tvs: 1, sh: 1, vs: 0, wap: 1, ledZones: 3, ledTotal: 48 },
  "1st Fl": { indoorCam: 3, outdoorCam: 9, speakers: 2, tvs: 1, sh: 0, vs: 0, wap: 2, ledZones: 9, ledTotal: 305 },
  "2nd Fl": { indoorCam: 4, outdoorCam: 0, speakers: 2, tvs: 1, sh: 1, vs: 1, wap: 0, shades: 1, ledZones: 16, ledTotal: 520 },
  Cellar: { indoorCam: 3, outdoorCam: 0, speakers: 0, tvs: 1, sh: 1, vs: 1, wap: 1, ledZones: 8, ledTotal: null },
} as const;

type FloorName = keyof typeof HILLTOP_COUNTS;
const TYPE_IDS = { indoorCam: "cam-indoor", outdoorCam: "cam-outdoor", speakers: "speaker", tvs: "tv", sh: "sh", vs: "vs", wap: "wap", shades: "shade" } as const;

/**
 * Decisions on the open questions (see PLAN.md):
 * - circled M on the 2nd Fl = one motorized shade;
 * - circled S marks beyond the written totals are placed as tentative speakers (EXTRA_S, illustrative counts);
 * - the Attic note "Setup LED 60" is a tentative 60 LF LED run (optional, outside the 48 LF total).
 */
export const EXTRA_S: Partial<Record<FloorName, number>> = { "1st Fl": 2, Cellar: 3 };
export const ATTIC_SETUP_LED_LF = 60;

const ts = "2026-11-11T00:00:00.000Z";
const projectId = "hilltop";

/** Split a total LF across n zones (integers that sum exactly). */
function split(total: number, n: number): number[] {
  const base = Math.floor(total / n);
  return Array.from({ length: n }, (_, i) => base + (i < total - base * n ? 1 : 0));
}

export function buildHilltop() {
  const sheets: Sheet[] = [];
  const markers: Marker[] = [];
  const runs: Run[] = [];
  const closets: Closet[] = [];
  (Object.keys(HILLTOP_COUNTS) as FloorName[]).forEach((name, order) => {
    const sheetId = `sheet-${order}`;
    sheets.push({ id: sheetId, projectId, name, pageNumber: order + 1, order, imageId: "img", width: 3000, height: 2000, pxPerFt: 12, createdAt: ts, updatedAt: ts });
    const c = HILLTOP_COUNTS[name];
    let n = 0;
    for (const [key, typeId] of Object.entries(TYPE_IDS)) {
      const qty = (c as Record<string, number | null>)[key] ?? 0;
      for (let i = 0; i < qty; i++) {
        n++;
        markers.push({
          id: `${sheetId}-m${n}`, projectId, sheetId, deviceTypeId: typeId, x: (n % 20) / 20, y: 0.5, label: `${typeId}-${i + 1}`,
          room: "", mount: "ceiling", wireType: "Cat6", tentative: name === "1st Fl" && typeId === "speaker", notes: "", createdAt: ts, updatedAt: ts,
        });
      }
    }
    for (let i = 0; i < (EXTRA_S[name] ?? 0); i++) {
      n++;
      markers.push({
        id: `${sheetId}-xs${i}`, projectId, sheetId, deviceTypeId: "speaker", x: 0.9, y: (i + 1) / 10, label: `SPK-extra-${i + 1}`,
        room: "", mount: "ceiling", wireType: "16/4 speaker", tentative: true, notes: "circled S beyond the written total", createdAt: ts, updatedAt: ts,
      });
    }
    if (name === "Attic") {
      runs.push({
        id: `${sheetId}-setup-led`, projectId, sheetId, kind: "led", deviceTypeId: "led-ceiling", points: [0.5, 0.5, 0.6, 0.5],
        typedFt: ATTIC_SETUP_LED_LF, zone: "", switchLabel: "", tentative: true, notes: "Setup LED 60", createdAt: ts, updatedAt: ts,
      });
    }
    // LED zones. Where the total LF is written, type each zone's LF; the Cellar total was not written,
    // so its runs are left unmeasured.
    const lfs = c.ledTotal == null ? Array(c.ledZones).fill(null) : split(c.ledTotal, c.ledZones);
    lfs.forEach((lf, i) => {
      runs.push({
        id: `${sheetId}-led${i}`, projectId, sheetId, kind: "led", deviceTypeId: "led-ceiling", points: [0.1, 0.1, 0.2, 0.1],
        typedFt: lf, zone: String(i + 1), switchLabel: `S${i + 1}`, createdAt: ts, updatedAt: ts,
      });
    });
  });
  closets.push({ id: "closet-av", projectId, sheetId: "sheet-3", kind: "equipment", x: 0.5, y: 0.5, name: "AV Equipment", createdAt: ts, updatedAt: ts });
  return { sheets, markers, runs, closets, TYPE_IDS };
}
