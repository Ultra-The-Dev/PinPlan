"use client";
// "Show more" at the end of a photo grid: loads the next page when it scrolls into view, or on tap.
import { useEffect, useRef } from "react";

export default function MorePhotos({ remaining, onMore }: { remaining: number; onMore: () => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  const more = useRef(onMore);
  useEffect(() => {
    more.current = onMore;
  }, [onMore]);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((es) => es.some((e) => e.isIntersecting) && more.current(), { rootMargin: "600px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [remaining]);
  if (remaining <= 0) return null;
  return (
    <div className="flex justify-center py-2">
      <button ref={ref} className="btn btn-sm" onClick={onMore}>
        Show more ({remaining})
      </button>
    </div>
  );
}
