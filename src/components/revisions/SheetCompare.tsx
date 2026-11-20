"use client";
import { ArrowLeftRight, Check, MapPin, Move, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { applyTransform, CURRENT, hasStoredAlignment, IDENTITY, revisionChain, toPixelMatrix, transformBetween, type Affine } from "@/lib/revisions";
import { useEditor } from "@/lib/store";
import type { Sheet } from "@/lib/types";
import { TwoPointAlign } from "./AlignRevision";
import { useT } from "@/lib/i18n";
import { Dots, fmtDate, Screen, useStoredImage, ZoomPane, type StoredImage } from "./ui";

const MAX_SIDE = 2400;
const RED: [number, number, number] = [220, 38, 38];
const BLUE: [number, number, number] = [37, 99, 235];

interface Option {
  value: string;
  sheet: Sheet;
  key: string;
  label: string;
  imageId: string;
  width: number;
  height: number;
}

/** Draw `img` (in its own pixel space, `size`) through `M` onto `canvas`, then tint ink by darkness (null: greyscale-free original). */
function paint(canvas: HTMLCanvasElement, img: StoredImage, size: { width: number; height: number }, M: Affine, k: number, tint: [number, number, number] | null) {
  const ctx = canvas.getContext("2d", { willReadFrequently: !!tint });
  if (!ctx) return;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (img.state !== "ready") return;
  ctx.setTransform(k * M[0], k * M[1], k * M[2], k * M[3], k * M[4], k * M[5]);
  ctx.drawImage(img.bitmap, 0, 0, size.width, size.height);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (!tint) return;
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const px = data.data;
  const [r, g, b] = tint;
  for (let i = 0; i < px.length; i += 4) {
    // Darkness of the ink, boosted a little so thin linework reads.
    const d = Math.min(1, (1 - (0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2]) / 255) * 1.4);
    px[i] = 255 - d * (255 - r);
    px[i + 1] = 255 - d * (255 - g);
    px[i + 2] = 255 - d * (255 - b);
    px[i + 3] = 255;
  }
  ctx.putImageData(data, 0, 0);
}

/**
 * Compare two drawings: any revision of this sheet or any other sheet. Overlay (A red, B blue, shared ink black) or
 * swipe, with a fader and the current devices on top. Works offline on drawings stored on this device.
 */
export default function SheetCompare({ sheet, onClose, initialA }: { sheet: Sheet; onClose: () => void; initialA?: string }) {
  const t = useT();
  const { sheets, markers, catalog } = useEditor();
  const options = useMemo<Option[]>(() => {
    const list = sheets.some((s) => s.id === sheet.id) ? sheets : [sheet, ...sheets];
    return list.flatMap((s) =>
      revisionChain(s).map((e) => ({
        value: `${s.id}|${e.key}`,
        sheet: s,
        key: e.key,
        label: `${s.name} · ${e.current && (e.label === "Current" || e.label === "Original") ? t(e.label) : e.label}${e.current && s.revisions?.length ? ` ${t("(current)")}` : ""}${!e.current ? ` · ${fmtDate(e.since)}` : ""}`,
        imageId: e.imageId,
        width: e.width,
        height: e.height,
      })),
    );
  }, [sheets, sheet, t]);
  const live = sheets.find((s) => s.id === sheet.id) ?? sheet;
  const [aVal, setA] = useState(() => (initialA ? `${live.id}|${initialA}` : live.revisions?.[0] ? `${live.id}|${live.revisions[0].id}` : `${live.id}|${CURRENT}`));
  const [bVal, setB] = useState(`${live.id}|${CURRENT}`);
  const A = options.find((o) => o.value === aVal) ?? options[0];
  const B = options.find((o) => o.value === bVal) ?? options[0];
  const [mode, setMode] = useState<"overlay" | "swipe">("overlay");
  const [fade, setFade] = useState(0.5);
  const [swipe, setSwipe] = useState(0.5);
  const [showDevices, setShowDevices] = useState(false);
  const [adhoc, setAdhoc] = useState<{ pair: string; T: Affine } | null>(null);
  const [aligning, setAligning] = useState(false);
  const [pending, setPending] = useState<Affine | null>(null);

  const pair = `${A?.value}>${B?.value}`;
  const stored = A && B && A.sheet.id === B.sheet.id ? transformBetween(A.sheet, A.key, B.key) : null;
  const T: Affine = adhoc?.pair === pair ? adhoc.T : (stored ?? IDENTITY);
  const sameShape = A && B && Math.abs(A.width / A.height / (B.width / B.height) - 1) <= 0.01;
  const aligned = adhoc?.pair === pair || (A && B && A.sheet.id === B.sheet.id && hasStoredAlignment(A.sheet, A.key, B.key));

  const imgA = useStoredImage(A?.imageId, live.projectId, A?.width ?? 0, A?.height ?? 0);
  const imgB = useStoredImage(B?.imageId, live.projectId, B?.width ?? 0, B?.height ?? 0);
  const k = B ? Math.min(1, MAX_SIDE / Math.max(B.width, B.height)) : 1;
  const OW = B ? Math.round(B.width * k) : 1;
  const OH = B ? Math.round(B.height * k) : 1;

  const tintA = useRef<HTMLCanvasElement>(null);
  const tintB = useRef<HTMLCanvasElement>(null);
  const plainA = useRef<HTMLCanvasElement>(null);
  const plainB = useRef<HTMLCanvasElement>(null);
  const Tkey = T.join(",");
  useEffect(() => {
    if (!A || !B) return;
    const M = toPixelMatrix(T, A, B);
    const id: Affine = [1, 0, 0, 1, 0, 0];
    if (mode === "overlay") {
      if (tintA.current) paint(tintA.current, imgA, A, M, k, RED);
      if (tintB.current) paint(tintB.current, imgB, B, id, k, BLUE);
    } else {
      if (plainA.current) paint(plainA.current, imgA, A, M, k, null);
      if (plainB.current) paint(plainB.current, imgB, B, id, k, null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imgA, imgB, Tkey, mode, OW, OH, A?.value, B?.value]);

  // Devices on B: they live on B's sheet at current-drawing positions.
  const colors = useMemo(() => new Map(catalog.map((d) => [d.id, d.color])), [catalog]);
  const dots = useMemo(() => {
    if (!showDevices || !B) return [];
    const toB = transformBetween(B.sheet, CURRENT, B.key) ?? IDENTITY;
    return markers
      .filter((m) => m.sheetId === B.sheet.id && !m.deleted)
      .map((m) => {
        const [x, y] = applyTransform(toB, m.x, m.y);
        return { key: m.id, x: x * OW, y: y * OH, color: colors.get(m.deviceTypeId) };
      });
  }, [showDevices, B, markers, colors, OW, OH]);

  if (!A || !B) return null;
  const missing = [imgA.state === "missing" ? A.label : null, imgB.state === "missing" ? B.label : null].filter(Boolean);
  const select = (value: string, set: (v: string) => void, label: string, color: string) => (
    <label className="flex min-w-0 flex-1 items-center gap-1.5 text-xs font-semibold" style={{ color }}>
      <span className="shrink-0">{label}</span>
      <select className="input h-9 min-w-0 flex-1 py-0 text-sm text-slate-800" value={value} onChange={(e) => set(e.target.value)} aria-label={t("Drawing {label}", { label })}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );

  if (aligning)
    return (
      <Screen
        label={t("Align drawings")}
        title={t("Line up the two drawings")}
        subtitle={t("Tap the same 2 spots on each. Only used for this comparison.")}
        onClose={() => setAligning(false)}
        actions={
          <button
            className="btn btn-brand"
            disabled={!pending}
            onClick={() => {
              if (pending) setAdhoc({ pair, T: pending });
              setAligning(false);
            }}
          >
            <Check /> {t("Use alignment")}
          </button>
        }
      >
        <TwoPointAlign projectId={live.projectId} a={{ imageId: A.imageId, width: A.width, height: A.height, label: "A" }} b={{ imageId: B.imageId, width: B.width, height: B.height, label: "B" }} onTransform={setPending} />
      </Screen>
    );

  return (
    <Screen label={t("Compare drawings")} title={t("Compare drawings")} subtitle={`${live.name}${live.revisionLabel ? ` · ${live.revisionLabel}` : ""}`} onClose={onClose}>
      <div className="absolute inset-0 flex flex-col">
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-3 py-2">
          <div className="flex w-full min-w-0 items-center gap-2 lg:w-auto lg:flex-1">
            {select(aVal, setA, "A", "#dc2626")}
            <button className="btn btn-sm btn-icon btn-ghost shrink-0" onClick={() => (setA(bVal), setB(aVal))} title={t("Swap A and B")} aria-label={t("Swap A and B")}>
              <ArrowLeftRight />
            </button>
            {select(bVal, setB, "B", "#2563eb")}
          </div>
          <div className="seg flex rounded-lg bg-slate-100 p-0.5 text-sm">
            {(["overlay", "swipe"] as const).map((m) => (
              <button key={m} className={`rounded-md px-3 py-1.5 capitalize ${mode === m ? "bg-white font-medium shadow-sm" : "text-slate-600"}`} onClick={() => setMode(m)} data-testid={`compare-${m}`}>
                {m === "overlay" ? t("Overlay") : t("Swipe")}
              </button>
            ))}
          </div>
          <button className={`btn btn-sm ${showDevices ? "btn-on" : ""}`} onClick={() => setShowDevices((v) => !v)} aria-pressed={showDevices}>
            <MapPin /> {t("Devices")}
          </button>
          <button className={`btn btn-sm ${adhoc?.pair === pair ? "btn-on" : ""}`} onClick={() => (setPending(null), setAligning(true))} title={t("Line up drawings that moved or changed size")}>
            <Move /> {t("Align")}
          </button>
          {adhoc?.pair === pair && (
            <button className="btn btn-sm btn-ghost" onClick={() => setAdhoc(null)} title={t("Drop this comparison's alignment")}>
              <X /> {t("Clear")}
            </button>
          )}
        </div>
        {(!sameShape && !aligned) || missing.length ? (
          <div className="shrink-0 border-b border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-800">
            {missing.length ? `${t("Not downloaded yet: {names}.", { names: missing.join(", ") })} ` : ""}
            {!sameShape && !aligned ? t("These drawings have different page shapes — tap Align and pick 2 matching spots for a precise overlay.") : ""}
          </div>
        ) : null}
        <ZoomPane width={OW} height={OH} className="min-h-0 flex-1 bg-slate-200" fitKey={`${OW}x${OH}`} testId="compare-pane">
          {(scale) => (
            <>
              {mode === "overlay" ? (
                <>
                  <canvas ref={tintA} width={OW} height={OH} data-testid="compare-a" className="absolute inset-0 h-full w-full bg-white" style={{ opacity: Math.min(1, 2 * (1 - fade)) }} />
                  <canvas ref={tintB} width={OW} height={OH} data-testid="compare-b" className="absolute inset-0 h-full w-full" style={{ mixBlendMode: "multiply", opacity: Math.min(1, 2 * fade) }} />
                </>
              ) : (
                <>
                  <canvas ref={plainA} width={OW} height={OH} className="absolute inset-0 h-full w-full bg-white" />
                  <canvas ref={plainB} width={OW} height={OH} className="absolute inset-0 h-full w-full" style={{ clipPath: `inset(0 0 0 ${swipe * 100}%)` }} />
                  <div className="pointer-events-none absolute top-0 bottom-0 bg-ink" style={{ left: swipe * OW - 1.5 / scale, width: 3 / scale }} />
                </>
              )}
              {showDevices && <Dots points={dots} scale={scale} />}
            </>
          )}
        </ZoomPane>
        <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 border-t border-slate-200 bg-white px-3 py-2 text-xs">
          {mode === "overlay" ? (
            <>
              <label className="flex flex-1 items-center gap-2">
                <span className="font-semibold text-red-600">A</span>
                <input type="range" min={0} max={1} step={0.01} value={fade} onChange={(e) => setFade(Number(e.target.value))} className="min-w-0 flex-1" aria-label={t("Fade between A and B")} />
                <span className="font-semibold text-blue-600">B</span>
              </label>
              <span className="flex items-center gap-3 text-slate-600">
                <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-red-600" />{t("only in A")}</span>
                <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-blue-600" />{t("only in B")}</span>
                <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-ink" />{t("both")}</span>
              </span>
            </>
          ) : (
            <label className="flex flex-1 items-center gap-2">
              <span className="font-semibold">A</span>
              <input type="range" min={0} max={1} step={0.005} value={swipe} onChange={(e) => setSwipe(Number(e.target.value))} className="min-w-0 flex-1" aria-label={t("Swipe between A and B")} />
              <span className="font-semibold">B</span>
            </label>
          )}
        </div>
      </div>
    </Screen>
  );
}
