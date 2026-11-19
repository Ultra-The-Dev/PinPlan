// Small layout maths shared by the photo viewer / mark-up editor.

/** Where an image of `aspect` (width / height) sits inside a `w`×`h` box with object-fit: contain. */
export function containRect(w: number, h: number, aspect: number): { x: number; y: number; w: number; h: number } {
  if (!Number.isFinite(aspect) || !(aspect > 0) || !(w > 0) || !(h > 0)) return { x: 0, y: 0, w: Math.max(1, w), h: Math.max(1, h) };
  if (w / h > aspect) {
    const iw = h * aspect;
    return { x: (w - iw) / 2, y: 0, w: iw, h };
  }
  const ih = w / aspect;
  return { x: 0, y: (h - ih) / 2, w, h: ih };
}
