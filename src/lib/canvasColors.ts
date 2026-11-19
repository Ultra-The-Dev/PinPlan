// One look for "selected" and "being drawn" on the plan, whatever drew it (devices, runs, closets, markups,
// measurements, the editor's drafts). Device letters and trade colours are not here: they stay as they are.
// See docs/plan-viewer.md ("Selection and draft colours").

/** Selected thing: a dark ink outline… */
export const SELECT_INK = "#0F2340";
/** …inside a light-blue halo, so it reads on white paper and on dark linework alike. */
export const SELECT_HALO = "#33A9FF";
/** Halo fill behind a selected device (the halo colour, faint). */
export const SELECT_HALO_FILL = "rgba(51,169,255,0.18)";
/** Halo opacity for lines (runs, measurements) drawn under the selected line. */
export const SELECT_HALO_OPACITY = 0.45;

/** Points and lines still being drawn (not saved yet): light blue, dashed. */
export const DRAFT = "#33A9FF";
/** Dash pattern for drafts, in screen px. */
export const DRAFT_DASH = [8, 6];

/** Handle (a draggable vertex / corner) of the selected thing: white with an ink ring. */
export const HANDLE_FILL = "#FFFFFF";
export const HANDLE_STROKE = SELECT_INK;
