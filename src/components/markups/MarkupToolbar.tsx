"use client";
// The markup tool column (big targets for gloves and phones): tools, colour / size, layers, show / hide, list,
// undo / redo, plus the long-press details card and the text box dialog. Keyboard: P H A C R E T, L (line), V (select),
// Esc, Delete, ⌘/Ctrl+Z while markups are open.
import {
  Circle as CircleIcon,
  Cloud,
  Copy,
  Eye,
  EyeOff,
  Highlighter,
  Layers,
  List,
  Lock,
  Minus,
  MousePointer2,
  MoveUpRight,
  PenLine,
  Pencil,
  Plus,
  Redo2,
  Square,
  Trash2,
  Type,
  Undo2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import { createPortal } from "react-dom";
import { canEditMarkup, canSeeMarkup, KIND_NAMES, layerNames, MARKUP_COLORS, PRIVATE_COLOR, STROKE_SIZES, type StrokeSize } from "@/lib/markups";
import { newId } from "@/lib/db";
import { fmtDate, msg, useT } from "@/lib/i18n";
import { letterShortcutsOn, planKeyBlocked, repeatBlocked } from "@/lib/planOverlays";
import { useEditor } from "@/lib/store";
import { useSyncStatus } from "@/lib/sync";
import { useRole } from "@/lib/team";
import { toast } from "@/lib/toast";
import type { PlanMarkup, Sheet } from "@/lib/types";
import { useMarkups, type MarkupTool } from "./useMarkups";

const TOOLS: { id: MarkupTool; name: string; key: string; Icon: ComponentType<{ className?: string }> }[] = [
  { id: "select", name: msg("Select"), key: "V", Icon: MousePointer2 },
  { id: "pen", name: msg("Pen"), key: "P", Icon: PenLine },
  { id: "highlight", name: msg("Highlighter"), key: "H", Icon: Highlighter },
  { id: "line", name: msg("Line"), key: "L", Icon: Minus },
  { id: "arrow", name: msg("Arrow"), key: "A", Icon: MoveUpRight },
  { id: "cloud", name: msg("Cloud"), key: "C", Icon: Cloud },
  { id: "rect", name: msg("Rectangle"), key: "R", Icon: Square },
  { id: "ellipse", name: msg("Ellipse"), key: "E", Icon: CircleIcon },
  { id: "text", name: msg("Text"), key: "T", Icon: Type },
];

const iconBtn = "flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-slate-600 transition hover:bg-slate-100 active:scale-95 disabled:opacity-35 disabled:pointer-events-none";
const onBtn = "bg-ink text-white hover:bg-ink";

function when(iso: string) {
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? fmtDate(d, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "";
}

export default function MarkupToolbar({ sheet }: { sheet: Sheet }) {
  const t = useT();
  const projectId = sheet.projectId;
  const st = useMarkups();
  const { open, tool, color, size, layer, hiddenLayers, allHidden, extraLayers, items, selectedId, details, textDraft, listOpen, past, future } = st;
  const userId = useSyncStatus((s) => s.userId);
  const role = useRole();
  const [fly, setFly] = useState<"style" | "layers" | null>(null);
  const [newLayer, setNewLayer] = useState("");

  useEffect(() => {
    void useMarkups.getState().load(projectId);
  }, [projectId]);

  // Picking a device tool closes markups (taps then place devices again).
  const editorTool = useEditor((s) => s.tool.kind);
  useEffect(() => {
    if (editorTool !== "select" && useMarkups.getState().open) useMarkups.getState().setOpen(false);
  }, [editorTool]);
  // A new sheet: nothing selected.
  useEffect(() => {
    useMarkups.getState().set({ selectedId: null, details: null });
  }, [sheet.id]);

  const sheetItems = useMemo(() => items.filter((m) => m.sheetId === sheet.id && !m.deleted && canSeeMarkup(m, userId)), [items, sheet.id, userId]);
  const layers = useMemo(() => layerNames(items, [...extraLayers, layer]), [items, extraLayers, layer]);
  const selected = items.find((m) => m.id === selectedId && !m.deleted);
  const canEditSel = !!selected && canEditMarkup(role, selected, userId);
  const anyHidden = allHidden || hiddenLayers.some((l) => layers.includes(l));
  const priv = color === PRIVATE_COLOR;

  function openMarkups() {
    const ed = useEditor.getState();
    if (ed.tool.kind !== "select") ed.setTool({ kind: "select" });
    ed.select(null);
    useMarkups.getState().setOpen(true);
  }
  function pickTool(x: MarkupTool) {
    if (!useMarkups.getState().open) openMarkups();
    useMarkups.getState().setTool(x);
    setFly(null);
  }
  function pickColor(c: string) {
    const s = useMarkups.getState();
    s.setColor(c);
    // Recolour the selected markup (private follows purple).
    const m = s.items.find((x) => x.id === s.selectedId);
    if (!m || !canEditMarkup(role, m, userId) || m.color === c) return;
    const priv = c === PRIVATE_COLOR;
    if (priv && !m.private) {
      // Only the author can make a markup private. Others may already have the shared copy, and they would never
      // hear about a change they can't see: delete it for them and keep a new private copy.
      if (m.authorId && m.authorId !== userId) return toast(t("Only the person who drew it can make it private"), "error");
      const id = newId();
      void s.remove(m.id).then(() => s.save({ ...m, id, color: c, private: true, authorId: m.authorId ?? userId ?? null }).then(() => s.select(id)));
      return;
    }
    void s.save({ ...m, color: c, private: priv });
  }
  function pickSize(z: StrokeSize) {
    const s = useMarkups.getState();
    s.setSize(z);
    const m = s.items.find((x) => x.id === s.selectedId);
    if (m && canEditMarkup(role, m, userId)) void s.save({ ...m, width: STROKE_SIZES[z].width, fontSize: m.kind === "text" ? STROKE_SIZES[z].fontSize : m.fontSize });
  }

  // ---- keyboard (capture phase, so the plan editor's own shortcuts don't also fire) ----
  const keyRef = useRef<(e: KeyboardEvent) => void>(() => {});
  useEffect(() => {
    keyRef.current = (e: KeyboardEvent) => {
      const s = useMarkups.getState();
      // Never behind a dialog, while typing or on a focused button's Space / Enter.
      if (!s.open || planKeyBlocked(e)) return;
      const mod = e.metaKey || e.ctrlKey;
      const stop = () => {
        e.preventDefault();
        e.stopImmediatePropagation();
      };
      if (mod && e.key.toLowerCase() === "z") {
        stop();
        void (e.shiftKey ? s.redo() : s.undo());
      } else if (mod && e.key.toLowerCase() === "y") {
        stop();
        void s.redo();
      } else if (e.key === "Escape") {
        stop();
        if (s.details) s.set({ details: null });
        else if (s.selectedId) s.select(null);
        else if (s.tool !== "select") s.setTool("select");
        else s.setOpen(false);
      } else if ((e.key === "Delete" || e.key === "Backspace") && s.selectedId) {
        stop();
        if (repeatBlocked(e)) return;
        const m = s.items.find((x) => x.id === s.selectedId);
        if (m && canEditMarkup(role, m, userId)) void s.remove(m.id);
      } else if (!mod && !e.altKey && !e.shiftKey && letterShortcutsOn()) {
        // Shift+letter belongs to others (Shift+T drops a task), and letters can be switched off ("?").
        const hit = TOOLS.find((x) => x.key.toLowerCase() === e.key.toLowerCase());
        if (hit) {
          stop();
          s.setTool(hit.id);
        }
      }
    };
  });
  useEffect(() => {
    const fn = (e: KeyboardEvent) => keyRef.current(e);
    window.addEventListener("keydown", fn, true);
    return () => window.removeEventListener("keydown", fn, true);
  }, []);

  if (!open) {
    return (
      <button
        className="pointer-events-auto relative flex h-11 w-11 items-center justify-center rounded-xl bg-white/95 text-slate-700 shadow-pop ring-1 ring-black/5 backdrop-blur-md hover:text-slate-900"
        onClick={openMarkups}
        title={t("Markups: pen, cloud, arrow, text…")}
        aria-label={t("Markups")}
        data-testid="markups-open"
      >
        <Pencil className="h-5 w-5" />
        {anyHidden && <span className="pointer-events-none absolute -top-1 -right-1 h-3 w-3 rounded-full bg-red-500 ring-2 ring-white" />}
      </button>
    );
  }

  return (
    // In the plan rail at the right edge: the tool column outermost, flyouts open toward the plan.
    <div className="pointer-events-none relative flex max-h-full min-h-0 flex-row-reverse items-start gap-2">
      <div className="scroll-thin pointer-events-auto flex max-h-full flex-col items-center gap-0.5 overflow-y-auto rounded-xl bg-white/95 p-1 shadow-pop ring-1 ring-slate-200 backdrop-blur" data-testid="markup-toolbar">
        <button className={iconBtn} onClick={() => useMarkups.getState().setOpen(false)} title={t("Close markups (Esc)")} aria-label={t("Close markups")}>
          <X className="h-5 w-5" />
        </button>
        <span className="my-0.5 h-px w-8 bg-slate-200" />
        {TOOLS.map(({ id, name, key, Icon }) => (
          <button key={id} className={`${iconBtn} ${tool === id ? onBtn : ""}`} onClick={() => pickTool(id)} title={`${t(name)} (${key})`} aria-label={t(name)} aria-pressed={tool === id}>
            <Icon className="h-5 w-5" />
          </button>
        ))}
      </div>
      {/* Style, layers, visibility and history: a second short column, so both fit on a phone without scrolling. */}
      <div className="scroll-thin pointer-events-auto flex max-h-full flex-col items-center gap-0.5 overflow-y-auto rounded-xl bg-white/95 p-1 shadow-pop ring-1 ring-slate-200 backdrop-blur" data-testid="markup-actions">
        <button className={`${iconBtn} ${fly === "style" ? "bg-slate-100" : ""}`} onClick={() => setFly(fly === "style" ? null : "style")} title={t("Colour and size")} aria-label={t("Colour and size")}>
          <span className="relative flex h-6 w-6 items-center justify-center rounded-full ring-2 ring-white" style={{ background: color, boxShadow: "0 0 0 1px rgb(0 0 0 / 0.15)" }}>
            {priv && <Lock className="h-3 w-3 text-white" />}
          </span>
        </button>
        <button className={`${iconBtn} ${fly === "layers" ? "bg-slate-100" : ""}`} onClick={() => setFly(fly === "layers" ? null : "layers")} title={t("Layer: {name}", { name: layer })} aria-label={t("Layers")}>
          <Layers className="h-5 w-5" />
        </button>
        <button className={`${iconBtn} ${listOpen ? "bg-slate-100" : ""}`} onClick={() => useMarkups.getState().set({ listOpen: !listOpen })} title={t("Markup list")} aria-label={t("Markup list")}>
          <List className="h-5 w-5" />
        </button>
        <span className="my-0.5 h-px w-8 bg-slate-200" />
        <button className={iconBtn} disabled={!past.length} onClick={() => void useMarkups.getState().undo()} title={t("Undo markup (⌘Z)")} aria-label={t("Undo markup")}>
          <Undo2 className="h-5 w-5" />
        </button>
        <button className={iconBtn} disabled={!future.length} onClick={() => void useMarkups.getState().redo()} title={t("Redo markup (⇧⌘Z)")} aria-label={t("Redo markup")}>
          <Redo2 className="h-5 w-5" />
        </button>
        {selected && (
          <button className={`${iconBtn} text-red-600 hover:bg-red-50`} disabled={!canEditSel} onClick={() => void useMarkups.getState().remove(selected.id)} title={t("Delete markup (Delete)")} aria-label={t("Delete markup")}>
            <Trash2 className="h-5 w-5" />
          </button>
        )}
      </div>

      {fly === "style" && (
        <div className="card animate-in pointer-events-auto w-60 max-w-[calc(100vw-9rem)] p-3 shadow-pop ring-1 ring-slate-200">
          <div className="section-title mb-2">{t("Colour")}</div>
          <div className="flex flex-wrap gap-2">
            {MARKUP_COLORS.map((c) => (
              <button
                key={c.color}
                className={`h-9 w-9 rounded-full ring-offset-2 transition active:scale-95 ${color === c.color ? "ring-2 ring-slate-900" : ""}`}
                style={{ background: c.color }}
                onClick={() => pickColor(c.color)}
                title={t(c.name)}
                aria-label={t(c.name)}
                aria-pressed={color === c.color}
              />
            ))}
          </div>
          <button
            className={`mt-2 flex h-10 w-full items-center gap-2 rounded-lg px-2 text-sm font-medium transition ${priv ? "bg-violet-50 text-violet-800 ring-2 ring-violet-600" : "text-slate-700 hover:bg-slate-50"}`}
            onClick={() => pickColor(PRIVATE_COLOR)}
            title={t("Private: only you see it")}
            data-testid="markup-private"
            aria-pressed={priv}
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-full" style={{ background: PRIVATE_COLOR }}>
              <Lock className="h-3.5 w-3.5 text-white" />
            </span>
            {t("Private")} <span className="text-xs font-normal text-slate-500">{t("only you see it")}</span>
          </button>
          <div className="section-title mt-3 mb-2">{t("Size")}</div>
          <div className="seg w-full">
            {(Object.keys(STROKE_SIZES) as StrokeSize[]).map((z) => (
              <button key={z} className={`tab h-9 flex-1 justify-center ${size === z ? "tab-active" : ""}`} onClick={() => pickSize(z)} aria-pressed={size === z}>
                <span className="rounded-full bg-current" style={{ width: 18, height: z === "S" ? 2 : z === "M" ? 4 : 7 }} />
                {z}
              </button>
            ))}
          </div>
        </div>
      )}

      {fly === "layers" && (
        <div className="card animate-in pointer-events-auto w-64 max-w-[calc(100vw-9rem)] p-2 shadow-pop ring-1 ring-slate-200" data-testid="markup-layers">
          <div className="section-title px-2 pt-1 pb-2">{t("Draw on layer")}</div>
          {layers.map((l) => {
            const hidden = allHidden || hiddenLayers.includes(l);
            const n = sheetItems.filter((m) => m.layer === l).length;
            return (
              <div key={l} className={`flex items-center gap-1 rounded-lg pr-1 ${layer === l ? "bg-slate-50" : ""}`}>
                <label className="flex h-10 min-w-0 flex-1 cursor-pointer items-center gap-2 px-2 text-sm">
                  <input type="radio" name="markup-layer" className="accent-brand-600" checked={layer === l} onChange={() => useMarkups.getState().setLayer(l)} />
                  <span className={`truncate ${hidden ? "text-slate-400 line-through" : ""}`}>{l}</span>
                  {n > 0 && <span className="text-xs text-slate-400 tabular-nums">{n}</span>}
                </label>
                {selected && canEditSel && selected.layer !== l && (
                  <button className="btn btn-sm btn-ghost px-1.5 text-[11px]" onClick={() => void useMarkups.getState().save({ ...selected, layer: l })} title={t("Move the selected markup to {layer}", { layer: l })}>
                    {t("Move here")}
                  </button>
                )}
                <button
                  className={`flex h-9 w-9 items-center justify-center rounded-lg ${hidden ? "text-red-600 hover:bg-red-50" : "text-slate-500 hover:bg-slate-100"}`}
                  onClick={() => {
                    const s = useMarkups.getState();
                    if (s.allHidden) {
                      // From "all hidden" to "all but this one hidden" feels wrong: just show everything, then toggle.
                      s.setAllHidden(false);
                      if (!hidden) return;
                    }
                    s.toggleLayer(l);
                  }}
                  title={hidden ? t("Show {layer}", { layer: l }) : t("Hide {layer}", { layer: l })}
                  aria-label={hidden ? t("Show {layer}", { layer: l }) : t("Hide {layer}", { layer: l })}
                  data-testid={`layer-eye-${l}`}
                >
                  {hidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            );
          })}
          <form
            className="mt-1 flex gap-1 border-t border-slate-100 px-1 pt-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!newLayer.trim()) return;
              useMarkups.getState().addLayer(newLayer);
              setNewLayer("");
            }}
          >
            <input className="input h-9" placeholder={t("New layer")} value={newLayer} onChange={(e) => setNewLayer(e.target.value)} maxLength={40} aria-label={t("New layer name")} />
            <button className="btn h-9 w-9 px-0" disabled={!newLayer.trim()} aria-label={t("Add layer")} title={t("Add layer")}>
              <Plus />
            </button>
          </form>
        </div>
      )}

      {listOpen && !fly && <MarkupList items={sheetItems} selectedId={selectedId} hiddenLayers={hiddenLayers} allHidden={allHidden} />}
      {/* Fixed cards go to the body: outside the plan (its gestures and stacking) and the rail. */}
      {details && typeof document !== "undefined" && createPortal(<DetailsCard id={details.id} x={details.x} y={details.y} />, document.body)}
      {textDraft && typeof document !== "undefined" && createPortal(<TextDialog />, document.body)}
    </div>
  );
}

function MarkupList({ items, selectedId, hiddenLayers, allHidden }: { items: PlanMarkup[]; selectedId: string | null; hiddenLayers: string[]; allHidden: boolean }) {
  const t = useT();
  const sorted = [...items].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return (
    <div className="card animate-in pointer-events-auto flex max-h-full w-72 max-w-[calc(100vw-9rem)] flex-col shadow-pop ring-1 ring-slate-200" data-testid="markup-list">
      <div className="flex items-center justify-between px-3 pt-2.5 pb-2">
        <div className="section-title">{t("Markups on this sheet · {n}", { n: items.length })}</div>
        <button className="btn btn-sm btn-icon btn-ghost" onClick={() => useMarkups.getState().set({ listOpen: false })} aria-label={t("Close list")}>
          <X />
        </button>
      </div>
      {sorted.length ? (
        <ul className="scroll-thin min-h-0 flex-1 overflow-y-auto px-1 pb-1">
          {sorted.map((m) => {
            const hidden = allHidden || hiddenLayers.includes(m.layer);
            return (
              <li key={m.id}>
                <button
                  className={`flex w-full items-start gap-2 rounded-lg px-2 py-2 text-left text-sm hover:bg-slate-50 ${selectedId === m.id ? "bg-blue-50" : ""} ${hidden ? "opacity-50" : ""}`}
                  onClick={() => {
                    const s = useMarkups.getState();
                    s.setTool("select");
                    s.select(m.id);
                  }}
                  data-testid="markup-row"
                  data-private={m.private ? "1" : "0"}
                >
                  <span className="mt-1 h-3 w-3 shrink-0 rounded-full" style={{ background: m.color }} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="font-medium text-slate-800">{t(KIND_NAMES[m.kind])}</span>
                      {m.private && (
                        <span className="chip bg-violet-50 px-1 py-0 text-[10px] text-violet-700">
                          <Lock className="h-2.5 w-2.5" /> {t("Private")}
                        </span>
                      )}
                      <span className="ml-auto truncate text-[11px] text-slate-400">{m.layer}</span>
                    </span>
                    {m.kind === "text" && m.text && <span className="block truncate text-xs text-slate-600">“{m.text}”</span>}
                    <span className="block truncate text-[11px] text-slate-500">
                      {m.author || t("Someone")} · {when(m.updatedAt)}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="px-3 pb-3 text-sm text-slate-500">{t("Nothing drawn on this sheet yet. Pick a tool and draw with one finger; pinch with two to zoom.")}</p>
      )}
    </div>
  );
}

function DetailsCard({ id, x, y }: { id: string; x: number; y: number }) {
  const t = useT();
  const m = useMarkups((s) => s.items.find((it) => it.id === id));
  const userId = useSyncStatus((s) => s.userId);
  const role = useRole();
  if (!m || m.deleted) return null;
  const editable = canEditMarkup(role, m, userId);
  const close = () => useMarkups.getState().set({ details: null });
  // Keep the card on screen.
  const left = Math.max(8, Math.min(x + 8, (typeof window !== "undefined" ? window.innerWidth : 1024) - 264));
  const top = Math.max(8, Math.min(y + 8, (typeof window !== "undefined" ? window.innerHeight : 768) - 240));
  return (
    <>
      <div className="pointer-events-auto fixed inset-0 z-40" onClick={close} onContextMenu={(e) => (e.preventDefault(), close())} />
      <div className="card animate-in pointer-events-auto fixed z-50 w-64 p-3 shadow-pop ring-1 ring-slate-200" style={{ left, top }} data-testid="markup-details">
        <div className="flex items-center gap-2">
          <span className="h-3.5 w-3.5 rounded-full" style={{ background: m.color }} />
          <span className="font-semibold text-slate-900">{t(KIND_NAMES[m.kind])}</span>
          {m.private && (
            <span className="chip bg-violet-50 text-violet-700">
              <Lock className="h-3 w-3" /> {t("Private")}
            </span>
          )}
          <span className="ml-auto text-xs text-slate-500">{m.layer}</span>
        </div>
        {m.kind === "text" && m.text && <p className="mt-2 line-clamp-3 text-sm whitespace-pre-wrap text-slate-700">{m.text}</p>}
        <dl className="mt-2 space-y-0.5 text-xs text-slate-600">
          <div>
            <dt className="inline text-slate-400">{t("By")} </dt>
            <dd className="inline">{m.author || t("Someone")}</dd>
          </div>
          <div>
            <dt className="inline text-slate-400">{t("Drawn")} </dt>
            <dd className="inline">{when(m.createdAt)}</dd>
          </div>
          {m.updatedAt !== m.createdAt && (
            <div>
              <dt className="inline text-slate-400">{t("Edited")} </dt>
              <dd className="inline">{when(m.updatedAt)}</dd>
            </div>
          )}
        </dl>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {m.kind === "text" && editable && (
            <button
              className="btn btn-sm"
              onClick={() => useMarkups.getState().set({ details: null, textDraft: { sheetId: m.sheetId, x: m.points[0], y: m.points[1], editId: m.id, value: m.text ?? "" } })}
            >
              <Pencil /> {t("Edit text")}
            </button>
          )}
          <button className="btn btn-sm" onClick={() => void useMarkups.getState().duplicate(m.id)}>
            <Copy /> {t("Duplicate")}
          </button>
          {editable ? (
            <button className="btn btn-sm btn-danger" onClick={() => void useMarkups.getState().remove(m.id)}>
              <Trash2 /> {t("Delete")}
            </button>
          ) : (
            <span className="self-center text-[11px] text-slate-500">{t("Only the author or the office can change it.")}</span>
          )}
        </div>
      </div>
    </>
  );
}

function TextDialog() {
  const t = useT();
  const draft = useMarkups((s) => s.textDraft);
  const [value, setValue] = useState(draft?.value ?? "");
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  if (!draft) return null;
  const close = () => useMarkups.getState().set({ textDraft: null });
  const save = () => {
    const s = useMarkups.getState();
    const text = value.replace(/\s+$/, "");
    close();
    if (draft.editId) {
      const m = s.items.find((x) => x.id === draft.editId);
      if (!m) return;
      if (!text.trim()) void s.remove(m.id);
      else if (text !== m.text) void s.save({ ...m, text });
      return;
    }
    if (!text.trim()) return;
    const m = s.draft("text", draft.sheetId, [draft.x, draft.y], text);
    if (m) void s.save(m);
  };
  return (
    <div className="pointer-events-auto fixed inset-0 z-50 flex items-end justify-center bg-slate-900/30 p-3 sm:items-center" onClick={close}>
      <div className="card animate-in max-h-[calc(100dvh-2rem)] w-full max-w-sm overflow-y-auto p-4 shadow-pop" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={t("Text markup")}>
        <label className="label" htmlFor="markup-text">
          {draft.editId ? t("Edit text") : t("Text on the plan")}
        </label>
        <textarea
          id="markup-text"
          ref={ref}
          className="input min-h-24 text-base"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              save();
            } else if (e.key === "Escape") {
              e.preventDefault();
              close();
            }
          }}
          placeholder={t("e.g. Relocated per field — see RFI 12")}
          maxLength={4000}
        />
        <div className="mt-3 flex justify-end gap-2">
          <button className="btn" onClick={close}>
            {t("Cancel")}
          </button>
          <button className="btn btn-brand" onClick={save} data-testid="markup-text-save">
            {draft.editId ? t("Save") : t("Add text")}
          </button>
        </div>
      </div>
    </div>
  );
}
