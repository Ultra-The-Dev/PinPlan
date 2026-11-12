"use client";
import { useMemo, useRef, useState } from "react";
import { detectPageCorners, warpToRect, type Pt } from "@/lib/perspective";

/** Straighten and crop a phone photo of a plan: auto-detect page edges, then adjust the 4 corners by hand. */
export default function PhotoStraighten({ image, name, onDone }: { image: HTMLImageElement; name: string; onDone: (c: HTMLCanvasElement | null) => void }) {
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
    setStatus("Finding page edges…");
    setBusy(true);
    try {
      const img = new Image();
      img.src = previewUrl;
      await img.decode();
      const found = await detectPageCorners(img);
      if (found) {
        // detection ran on the preview (same pixel size as source)
        setCorners(found);
        setStatus("Page found — adjust the corners if needed.");
      } else setStatus("Couldn't find the page edges. Drag the corners onto the page corners.");
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
    setStatus("Straightening…");
    await new Promise((r) => setTimeout(r, 20));
    const out = whole ? source : warpToRect(source, corners);
    onDone(out);
  }

  const handle = Math.max(W, H) * 0.018;
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-900/90 p-3 text-white">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <div className="mr-auto">
          <div className="font-semibold">Straighten photo</div>
          <div className="text-xs text-slate-300">{name} — drag the 4 corners onto the page corners</div>
        </div>
        <button className="btn btn-sm" disabled={busy} onClick={() => setRotation((r) => (r + 270) % 360)}>
          ⟲ Rotate
        </button>
        <button className="btn btn-sm" disabled={busy} onClick={() => setRotation((r) => (r + 90) % 360)}>
          ⟳ Rotate
        </button>
        <button className="btn btn-sm" disabled={busy} onClick={auto}>
          Auto-detect edges
        </button>
        <button className="btn btn-sm" disabled={busy} onClick={() => setCorners(inset(0))}>
          Reset
        </button>
        <button className="btn btn-sm" disabled={busy} onClick={() => onDone(null)}>
          Skip
        </button>
        <button className="btn btn-sm" disabled={busy} onClick={() => apply(true)}>
          Use as is
        </button>
        <button className="btn btn-sm btn-primary !border-amber-400 !bg-amber-500" disabled={busy} onClick={() => apply(false)}>
          Straighten &amp; save
        </button>
      </div>
      {status && <div className="mb-2 text-sm text-amber-200">{status}</div>}
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
          <image href={previewUrl} width={W} height={H} />
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
              onPointerDown={(e) => {
                (e.target as Element).setPointerCapture?.(e.pointerId);
                drag.current = i;
              }}
            />
          ))}
        </svg>
      </div>
    </div>
  );
}
