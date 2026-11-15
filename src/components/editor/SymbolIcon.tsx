"use client";
import { useEffect, useRef } from "react";
import { drawSymbol, iconFor } from "@/lib/symbols";
import type { DeviceType } from "@/lib/types";

/** A device type's symbol as drawn on the plan (solid badge + pictogram, or letters for custom types). */
export default function SymbolIcon({ type, size = 28, tentative }: { type: Pick<DeviceType, "id" | "shape" | "color" | "symbol" | "icon">; size?: number; tentative?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const icon = iconFor(type);
  const { shape, color, symbol } = type;
  useEffect(() => {
    const c = ref.current!;
    const dpr = window.devicePixelRatio || 1;
    c.width = size * dpr;
    c.height = size * dpr;
    const ctx = c.getContext("2d")!;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, size, size);
    drawSymbol(ctx, shape, size / 2, size / 2, size * 0.36, color, symbol || "?", { tentative, icon });
  }, [shape, color, symbol, icon, size, tentative]);
  return <canvas ref={ref} style={{ width: size, height: size }} className="shrink-0" aria-hidden />;
}
