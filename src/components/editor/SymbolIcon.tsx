"use client";
import { useEffect, useRef } from "react";
import { drawSymbol } from "@/lib/symbols";
import type { Shape } from "@/lib/types";

export default function SymbolIcon({ shape, color, symbol, size = 28, tentative }: { shape: Shape; color: string; symbol: string; size?: number; tentative?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current!;
    const dpr = window.devicePixelRatio || 1;
    c.width = size * dpr;
    c.height = size * dpr;
    const ctx = c.getContext("2d")!;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, size, size);
    drawSymbol(ctx, shape, size / 2, size / 2, size * 0.36, color, symbol, { tentative });
  }, [shape, color, symbol, size, tentative]);
  return <canvas ref={ref} style={{ width: size, height: size }} className="shrink-0" aria-hidden />;
}
