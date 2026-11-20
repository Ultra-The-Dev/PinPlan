"use client";
import { useMemo, useRef, useState } from "react";
import { detectPageCorners, warpToRect, type Pt } from "@/lib/perspective";
import Modal from "./ui/Modal";
import { msg, useT } from "@/lib/i18n";

const CORNER_NAMES = [msg("Corner top left: arrow keys move it"), msg("Corner top right: arrow keys move it"), msg("Corner bottom right: arrow keys move it"), msg("Corner bottom left: arrow keys move it")];

/** Straighten and crop a phone photo of a plan: auto-detect page edges, then adjust the 4 corners by hand. */
export default function PhotoStraighten({ image, name, onDone }: { image: HTMLImageElement; name: string; onDone: (c: HTMLCanvasElement | null) => void }) {
  const t = useT();
  const [rotation, setRotation] = useState(0);
  const source = useMemo(() => {
    const c = document.createElement("canvas");
    const w = image.naturalWidth;
    const h = image.naturalHeight;
    const swap = rotation % 180 !== 0;
    c.width = swap ? h : w;
    c.height = swap ? w : h;
    const ctx = c.getContext("2d")!;
    ctx.translate(c.width / 2, c.height / 2);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.drawImage(image, -w / 2, -h / 2);
    return c;
  }, [image, rotation]);
  const W = source.width;
  const H = source.height;
  const inset = (k: number): Pt[] => [
    { x: W * k, y: H * k },
    { x: W * (1 - k), y: H * k },
    { x: W * (1 - k), y: H * (1 - k) },
    { x: W * k, y: H * (1 - k) },
  ];
  const [cornerState, setCornerState] = useState<{ rot: number; pts: Pt[] }>(() => ({ rot: 0, pts: inset(0.03) }));
  const corners = cornerState.rot === rotation ? cornerState.pts : inset(0.03);
  const setCorners = (u: Pt[] | ((c: Pt[]) => Pt[])) => setCornerState({ rot: rotation, pts: typeof u === "function" ? u(corners) : u });
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<number | null>(null);
  const previewUrl = useMemo(() => source.toDataURL("image/jpeg", 0.7), [source]);

  async function auto() {
    setStatus(t("Finding page edges…"));
    setBusy(true);
    try {
      const img = new Image();
      img.src = previewUrl;
      await img.decode();
      const found = await detectPageCorners(img);
      if (found) {
        // detection ran on the preview (same pixel size as source)
        setCorners(found);
        setStatus(t("Page found — adjust the corners if needed."));
      } else setStatus(t("Couldn't find the page edges. Drag the corners onto the page corners."));
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function toImage(e: React.PointerEvent): Pt {
    const r = svgRef.current!.getBoundingClientRect();
    return { x: Math.max(0, Math.min(W, ((e.clientX - r.left) / r.width) * W)), y: Math.max(0, Math.min(H, ((e.clientY - r.top) / r.height) * H)) };
  }

  async function apply(whole = false) {
    setBusy(true);
    setStatus(t("Straightening…"));
    await new Promise((r) => setTimeout(r, 20));
    const out = whole ? source : warpToRect(source, corners);
    onDone(out);
  }

  // Keyboard: Tab to a corner, arrow keys move it (Shift for bigger steps).
  function nudge(i: number, e: React.KeyboardEvent) {
    const step = Math.max(W, H) * (e.shiftKey ? 0.02 : 0.004);
    const d = ({ ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] } as Record<string, [number, number]>)[e.key];
    if (!d) return;
    e.preventDefault();
    setCorners((cs) => cs.map((c, j) => (j === i ? { x: Math.max(0, Math.min(W, c.x + d[0])), y: Math.max(0, Math.min(H, c.y + d[1])) } : c)));
  }

  const handle = Math.max(W, H) * 0.018;
  return (
    <Modal
      onClose={() => !busy && onDone(null)}
      labelledBy="straighten-title"
      describedBy="straighten-hint"
      closeOnBackdrop={false}
      className="fixed inset-0 flex flex-col bg-slate-900/90 p-3 text-white"
    >
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <div className="mr-auto">
          <h2 id="straighten-title" className="font-semibold">
            {t("Straighten photo")}
          </h2>
          <div id="straighten-hint" className="text-xs text-slate-300">
            {t("{name} — drag the 4 corners onto the page corners (or Tab to a corner and use the arrow keys)", { name })}
          </div>
        </div>
        <button className="btn btn-sm" disabled={busy} onClick={() => setRotation((r) => (r + 270) % 360)} aria-label={t("Rotate left")}>
          ⟲ {t("Rotate")}
        </button>
        <button className="btn btn-sm" disabled={busy} onClick={() => setRotation((r) => (r + 90) % 360)} aria-label={t("Rotate right")}>
          ⟳ {t("Rotate")}
        </button>
        <button className="btn btn-sm" disabled={busy} onClick={auto}>
          {t("Auto-detect edges")}
        </button>
        <button className="btn btn-sm" disabled={busy} onClick={() => setCorners(inset(0))}>
          {t("Reset")}
        </button>
        <button className="btn btn-sm" disabled={busy} onClick={() => onDone(null)}>
          {t("Skip")}
        </button>
        <button className="btn btn-sm" disabled={busy} onClick={() => apply(true)}>
          {t("Use as is")}
        </button>
        <button className="btn btn-sm btn-primary !border-amber-400 !bg-amber-500" disabled={busy} onClick={() => apply(false)}>
          {t("Straighten & save")}
        </button>
      </div>
      <div className="mb-2 text-sm text-amber-200 empty:mb-0" role="status">
        {status}
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          className="max-h-full max-w-full touch-none"
          style={{ aspectRatio: `${W} / ${H}` }}
          onPointerMove={(e) => {
            if (drag.current == null) return;
            const p = toImage(e);
            setCorners((cs) => cs.map((c, i) => (i === drag.current ? p : c)));
          }}
          onPointerUp={() => (drag.current = null)}
          onPointerLeave={() => (drag.current = null)}
        >
          <image href={previewUrl} width={W} height={H} aria-hidden />
          <polygon points={corners.map((c) => `${c.x},${c.y}`).join(" ")} fill="rgba(245,158,11,0.15)" stroke="#f59e0b" strokeWidth={handle / 4} />
          {corners.map((c, i) => (
            <circle
              key={i}
              cx={c.x}
              cy={c.y}
              r={handle}
              fill="rgba(245,158,11,0.5)"
              stroke="#fff"
              strokeWidth={handle / 5}
              style={{ cursor: "grab" }}
              tabIndex={0}
              role="button"
              aria-label={t(CORNER_NAMES[i])}
              className="outline-none focus-visible:stroke-sky-300"
              onKeyDown={(e) => nudge(i, e)}
              onPointerDown={(e) => {
                (e.target as Element).setPointerCapture?.(e.pointerId);
                drag.current = i;
              }}
            />
          ))}
        </svg>
      </div>
    </Modal>
  );
}
