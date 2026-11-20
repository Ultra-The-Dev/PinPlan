"use client";
// Plan hyperlinks: the HTML part over the plan (screen px). "Back to E-101" after following a link and the Link tool
// button (office, Edit mode) in the plan's left rail (the right rail on phones), the box-drawing surface of the link
// tool with its bar in the status slot, the target picker, a photo opened from a link and the "open web page?" check. Show / hide and auto links are in
// Layers ("Show on plan"). The Link tool owns plan taps: starting it closes the other tools (claimPlanInput).
import { ArrowLeft, Check, Link2, X } from "lucide-react";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { claimPlanInput, planKeyBlocked, type PlanOverlayContext } from "@/lib/planOverlays";
import { linkAt, rectFromCorners, sheetDisplayName, type Rect } from "@/lib/sheetIndex";
import { useJobLinks, useSheetLinks } from "@/lib/sheetLinks";
import { useT } from "@/lib/i18n";
import { useEditor } from "@/lib/store";
import { useRole } from "@/lib/team";
import { toast } from "@/lib/toast";
import { useMedia } from "@/lib/useMedia";
import { PHONE_QUERY, RailSlot, StatusSlot } from "../editor/overlays/PlanRail";
import { goBack } from "./follow";
import LinkTargetPicker, { targetLabel } from "./LinkTargetPicker";

const PhotoViewer = dynamic(() => import("../photos/PhotoViewer"), { ssr: false });

/** Default box for a tap with the link tool (screen px). */
const TAP_BOX = { w: 120, h: 48 };
/** Smaller drags are taps. */
const DRAG_MIN = 8;

export default function LinksControls({ ctx }: { ctx: PlanOverlayContext }) {
  const t = useT();
  const { sheet, editing } = ctx;
  const links = useJobLinks();
  const role = useRole();
  const office = role !== "tech";
  const st = useSheetLinks();
  const sheets = useEditor((s) => s.sheets);
  const photos = useEditor((s) => s.photos);
  const documents = useEditor((s) => s.documents);
  const tool = useEditor((s) => s.tool.kind);
  const canEdit = office && editing;
  // Phones: the Link tool goes in the right rail with the other plan tools (Tasks, Markups). In the left rail it was
  // pushed down under Back / Measure / Progress onto the drawing's top-left corner at the default zoom.
  const phone = useMedia(PHONE_QUERY);

  // The link tool is an edit-mode tool: leave it when the mode, role or editor tool changes.
  useEffect(() => {
    if (st.drawing && (!canEdit || tool !== "select")) st.setDrawing(false);
  }, [canEdit, tool, st]);
  // Esc leaves the link tool.
  useEffect(() => {
    if (!st.drawing) return;
    const key = (e: KeyboardEvent) => e.key === "Escape" && !planKeyBlocked(e) && !st.pending && !st.editingId && st.setDrawing(false);
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [st]);

  const backId = st.back[st.back.length - 1];
  const backSheet = backId && backId !== sheet.id ? sheets.find((s) => s.id === backId && !s.deleted) : undefined;
  const editingLink = st.editingId ? links.find((l) => l.id === st.editingId) : undefined;
  const photo = st.photoId ? photos.find((p) => p.id === st.photoId && !p.deleted) : undefined;

  return (
    <>
      {backSheet && !st.drawing && (
        <RailSlot side="left" order={10}>
          <button
            className="pointer-events-auto flex h-10 max-w-full items-center gap-1.5 rounded-full bg-ink/90 pr-4 pl-3 text-[13px] font-semibold text-white shadow-pop backdrop-blur hover:bg-ink"
            onClick={goBack}
            data-plan-ui
            data-testid="link-back"
          >
            <ArrowLeft className="h-4 w-4 shrink-0" />
            <span className="truncate">{t("Back to {sheet}", { sheet: sheetDisplayName(backSheet) })}</span>
          </button>
        </RailSlot>
      )}

      {canEdit && !st.drawing && tool === "select" && (
        <RailSlot side={phone ? "right" : "left"} order={40}>
          <button
            className="pointer-events-auto flex h-11 w-11 items-center justify-center rounded-xl bg-white/95 text-slate-700 shadow-pop ring-1 ring-black/5 backdrop-blur-md hover:text-slate-900"
            onClick={() => {
              // The link tool takes the plan's taps: Measure, Markups, Walk, a task drop and device tools close.
              claimPlanInput("links");
              st.setDrawing(true);
            }}
            title={t("Link tool: draw a box over a callout and choose where it goes")}
            aria-label={t("Link tool: draw a box over a callout and choose where it goes")}
            data-plan-ui
            data-testid="link-tool"
          >
            <Link2 className="h-[18px] w-[18px]" />
          </button>
        </RailSlot>
      )}

      {st.drawing && <DrawSurface ctx={ctx} />}

      {st.pending && (
        <LinkTargetPicker
          sourceSheetId={st.pending.sheetId}
          title={t("Link to…")}
          onCancel={() => st.setPending(null)}
          onPick={async (target, label) => {
            const p = st.pending!;
            st.setPending(null);
            const l = await st.add(p.sheetId, p.rect, target, label);
            if (l) toast(t("Linked to {label}", { label }));
          }}
        />
      )}
      {editingLink && (
        <LinkTargetPicker
          sourceSheetId={editingLink.sheetId}
          title={t("Link to {label}", { label: targetLabel(editingLink.target, { sheets, documents, photos }) })}
          initial={editingLink.target}
          onCancel={() => st.setEditing(null)}
          onDelete={() => void st.remove([editingLink.id]).then(() => toast(t("Link deleted")))}
          onPick={async (target, label) => {
            st.setEditing(null);
            await st.update(editingLink.id, { target, label });
            toast(t("Linked to {label}", { label }));
          }}
        />
      )}

      {photo && (
        <div className="pointer-events-auto" data-plan-ui>
          <PhotoViewer photos={[photo]} startId={photo.id} onClose={() => st.setPhoto(null)} />
        </div>
      )}

      {st.confirmUrl && <ConfirmUrl url={st.confirmUrl} onClose={() => st.setConfirmUrl(null)} />}
    </>
  );
}

/** The link tool: drag a box over a callout (or tap for a standard box); tap an existing link to change or delete it. */
function DrawSurface({ ctx }: { ctx: PlanOverlayContext }) {
  const t = useT();
  const { viewport: vp, sheet } = ctx;
  const st = useSheetLinks();
  const ref = useRef<HTMLDivElement>(null);
  const start = useRef<{ id: number; x: number; y: number } | null>(null);
  const pointers = useRef(new Set<number>());
  const [box, setBox] = useState<{ x: number; y: number; w: number; h: number } | null>(null);

  const local = (e: { clientX: number; clientY: number }) => {
    const r = ref.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  // Wheel / trackpad zoom keeps working while the tool is on.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      vp.zoomBy(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.002)), { x: e.clientX - r.left, y: e.clientY - r.top }, 0);
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
  }, [vp]);

  const down = (e: ReactPointerEvent) => {
    pointers.current.add(e.pointerId);
    if (pointers.current.size > 1) {
      // A second finger: not a box.
      start.current = null;
      setBox(null);
      return;
    }
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = local(e);
    start.current = { id: e.pointerId, ...p };
  };
  const move = (e: ReactPointerEvent) => {
    const s = start.current;
    if (!s || s.id !== e.pointerId) return;
    const p = local(e);
    if (Math.hypot(p.x - s.x, p.y - s.y) < DRAG_MIN && !box) return;
    setBox({ x: Math.min(s.x, p.x), y: Math.min(s.y, p.y), w: Math.abs(p.x - s.x), h: Math.abs(p.y - s.y) });
  };
  const up = (e: ReactPointerEvent) => {
    pointers.current.delete(e.pointerId);
    const s = start.current;
    start.current = null;
    if (!s || s.id !== e.pointerId) return;
    const p = local(e);
    const drag = Math.hypot(p.x - s.x, p.y - s.y) >= DRAG_MIN;
    setBox(null);
    let rect: Rect;
    if (!drag) {
      // A tap on an existing link edits it.
      const rel = vp.screenToRel(p);
      const scale = vp.transform.scale;
      const hit = linkAt(useSheetLinks.getState().links.filter((l) => l.sheetId === sheet.id), rel, { x: 10 / (scale * sheet.width), y: 10 / (scale * sheet.height) });
      if (hit) return st.setEditing(hit.id);
      rect = rectFromCorners(vp.screenToRel({ x: p.x - TAP_BOX.w / 2, y: p.y - TAP_BOX.h / 2 }), vp.screenToRel({ x: p.x + TAP_BOX.w / 2, y: p.y + TAP_BOX.h / 2 }));
    } else {
      // Very thin drags still make a box that can be tapped.
      const a = { x: Math.min(s.x, p.x), y: Math.min(s.y, p.y) };
      const b = { x: Math.max(s.x, p.x, a.x + 24), y: Math.max(s.y, p.y, a.y + 18) };
      rect = rectFromCorners(vp.screenToRel(a), vp.screenToRel(b));
    }
    if (rect.w <= 0 || rect.h <= 0) return toast(t("Draw the box on the sheet"), "info");
    st.setPending({ rect, sheetId: sheet.id });
  };

  return (
    <>
      <div
        ref={ref}
        // z 12: over the plan and its top / bottom bars (10), under the rails (13, 21) and the status slot (14), so the
        // bar's Done and the rail buttons stay pressable while drawing.
        className="pointer-events-auto absolute inset-0 z-[12] cursor-crosshair touch-none"
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={(e) => {
          pointers.current.delete(e.pointerId);
          start.current = null;
          setBox(null);
        }}
        data-plan-ui
        data-testid="link-draw-surface"
      >
        {box && <div className="pointer-events-none absolute rounded-md border-2 border-red-500 bg-red-500/15" style={{ left: box.x, top: box.y, width: box.w, height: box.h }} />}
      </div>
      <StatusSlot order={30}>
      <div
        className="pointer-events-auto flex max-w-full items-center gap-2 rounded-xl bg-ink/90 py-1 pr-1 pl-3.5 text-[13px] text-white shadow-pop backdrop-blur"
        data-plan-ui
        data-testid="link-tool-bar"
      >
        <Link2 className="h-4 w-4 shrink-0 text-red-300" />
        <span className="min-w-0 py-1 leading-snug">{t("Drag a box over a callout · tap a link to change it")}</span>
        <button className="ml-1 flex h-8 shrink-0 items-center gap-1 rounded-lg bg-white/15 px-2.5 text-xs font-semibold hover:bg-white/25" onClick={() => st.setDrawing(false)} data-testid="link-tool-done">
          <Check className="h-3.5 w-3.5" /> {t("Done")}
        </button>
      </div>
      </StatusSlot>
    </>
  );
}

/** Web links open in a new tab after a check (a plan link shouldn't take anyone off the job by surprise). */
function ConfirmUrl({ url, onClose }: { url: string; onClose: () => void }) {
  const t = useT();
  let host = url;
  try {
    host = new URL(url).hostname;
  } catch {
    /* shown as typed */
  }
  return (
    <div className="pointer-events-auto fixed inset-0 z-50 flex items-end justify-center bg-slate-900/30 p-4 backdrop-blur-[2px] sm:items-center" onClick={onClose} onKeyDown={(e) => e.key === "Escape" && (e.stopPropagation(), onClose())} data-plan-ui>
      <div role="dialog" aria-modal="true" aria-label={t("Open web page")} className="card animate-in w-full max-w-sm space-y-4 p-5 shadow-pop" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold">{t("Open {host}?", { host })}</h2>
            <p className="mt-1 text-sm break-all text-slate-500">{url}</p>
          </div>
          <button type="button" className="btn btn-sm btn-icon btn-ghost -mt-1 -mr-1" onClick={onClose} aria-label={t("Close")}>
            <X />
          </button>
        </div>
        <div className="flex justify-end gap-2">
          <button className="btn" onClick={onClose}>
            {t("Cancel")}
          </button>
          <a className="btn btn-brand" href={url} target="_blank" rel="noopener noreferrer" onClick={() => setTimeout(onClose, 0)}>
            {t("Open in new tab")}
          </a>
        </div>
      </div>
    </div>
  );
}
