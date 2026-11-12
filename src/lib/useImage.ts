"use client";
import { useEffect, useState } from "react";
import { db } from "./db";

/** Object URL + decoded image for a stored sheet image. */
export function useSheetImage(imageId: string | null | undefined) {
  const [state, setState] = useState<{ id: string; url: string; img: HTMLImageElement } | null>(null);
  useEffect(() => {
    if (!imageId) return;
    let url = "";
    let cancelled = false;
    (async () => {
      const rec = await db().images.get(imageId);
      if (!rec || cancelled) return;
      url = URL.createObjectURL(rec.blob);
      const img = new Image();
      img.onload = () => !cancelled && setState({ id: imageId, url, img });
      img.src = url;
    })();
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [imageId]);
  return state?.id === imageId ? state : null;
}
