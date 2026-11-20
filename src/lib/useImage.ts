"use client";
import { useEffect, useState } from "react";
import { db } from "./db";
import { ensureThumb, thumbId } from "./thumbs";

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

/** Object URL for a stored image or file (no decoding — cheap enough for photo grids). */
export function useBlobUrl(id: string | null | undefined) {
  const [state, setState] = useState<{ id: string; url: string } | null>(null);
  useEffect(() => {
    if (!id) return;
    let url = "";
    let cancelled = false;
    db()
      .images.get(id)
      .then((rec) => {
        if (!rec || cancelled) return;
        url = URL.createObjectURL(rec.blob);
        setState({ id, url });
      });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [id]);
  return state && state.id === id ? state.url : null;
}

/**
 * Object URL of a small preview (src/lib/thumbs.ts) of a stored image, made on first use. Falls back to the full image
 * when no preview can be made. Use for cards and grids; open the full image only in a viewer.
 */
export function useThumbUrl(id: string | null | undefined, maxSide: number) {
  const [state, setState] = useState<{ key: string; url: string } | null>(null);
  const key = id ? thumbId(id, maxSide) : "";
  useEffect(() => {
    if (!id) return;
    let url = "";
    let cancelled = false;
    void (async () => {
      const t = await ensureThumb(id, maxSide);
      const blob = t?.blob ?? (cancelled ? null : (await db().images.get(id))?.blob);
      if (!blob || cancelled) return;
      url = URL.createObjectURL(blob);
      setState({ key: thumbId(id, maxSide), url });
    })();
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [id, maxSide]);
  return state && state.key === key ? state.url : null;
}
