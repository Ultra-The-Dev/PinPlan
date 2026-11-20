"use client";
// The current sheet's menu, under the sheet pill (its ⋯ button, a long press on touch, or a right-click): rename it
// in place, move it up or down the set, delete it (asks first; Undo on the toast and the toolbar), or open Manage
// sheets. Office only: technicians see the sheets as they are.
import { ArrowDown, ArrowUp, Check, Pencil, Settings2, Trash, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useT } from "@/lib/i18n";
import { useEditor } from "@/lib/store";
import type { Sheet } from "@/lib/types";
import { deleteSheetsWithUndo, renameSheet } from "../../sheetActions";

export default function SheetMenu(props: { sheet: Sheet; index: number; count: number; onClose: () => void; onManage?: () => void; startRename?: boolean }) {
  const t = useT();
  const { sheet } = props;
  const [renaming, setRenaming] = useState(!!props.startRename);
  const [name, setName] = useState(sheet.name);
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || document.querySelector("[aria-modal='true']")) return;
      e.stopPropagation();
      props.onClose();
    };
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node) && !(e.target as HTMLElement).closest?.("[data-sheet-menu-anchor]")) props.onClose();
    };
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("pointerdown", onDown, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("pointerdown", onDown, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (renaming) {
      inputRef.current?.focus();
      inputRef.current?.select();
    } else ref.current?.querySelector<HTMLElement>("button")?.focus();
  }, [renaming]);

  async function saveName() {
    await renameSheet(sheet.id, name);
    props.onClose();
  }

  const item = "flex h-11 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-sm text-slate-800 hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-transparent";
  return (
    <div ref={ref} role="menu" aria-label={t("Sheet actions")} className="animate-in absolute top-full left-0 z-30 mt-2 w-72 max-w-[calc(100vw-1rem)] rounded-xl bg-white p-1.5 shadow-pop ring-1 ring-black/5" data-plan-ui data-testid="sheet-menu">
      {renaming ? (
        <form
          className="flex items-center gap-1.5 p-1"
          onSubmit={(e) => {
            e.preventDefault();
            void saveName();
          }}
        >
          <input
            ref={inputRef}
            className="input h-11 min-w-0 flex-1 font-medium"
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-label={t("Sheet name")}
            maxLength={120}
            data-testid="sheet-menu-name"
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.stopPropagation();
                setRenaming(false);
                setName(sheet.name);
              }
            }}
          />
          <button type="submit" className="btn btn-brand btn-icon h-11 w-11" aria-label={t("Save name")} disabled={!name.trim()}>
            <Check />
          </button>
          <button
            type="button"
            className="btn btn-icon btn-ghost h-11 w-11"
            aria-label={t("Cancel")}
            onClick={() => {
              setRenaming(false);
              setName(sheet.name);
            }}
          >
            <X />
          </button>
        </form>
      ) : (
        <>
          <p className="truncate px-2.5 pt-1.5 pb-1 text-xs text-slate-500">{t("Sheet {n} of {count}", { n: props.index + 1, count: props.count })}</p>
          <button role="menuitem" type="button" className={item} onClick={() => setRenaming(true)} data-testid="sheet-menu-rename">
            <Pencil className="h-4 w-4 text-slate-500" /> {t("Rename")}
          </button>
          <button
            role="menuitem"
            type="button"
            className={item}
            disabled={props.index <= 0}
            onClick={() => {
              void useEditor.getState().moveSheet(sheet.id, -1);
              props.onClose();
            }}
          >
            <ArrowUp className="h-4 w-4 text-slate-500" /> {t("Move up")}
          </button>
          <button
            role="menuitem"
            type="button"
            className={item}
            disabled={props.index >= props.count - 1}
            onClick={() => {
              void useEditor.getState().moveSheet(sheet.id, 1);
              props.onClose();
            }}
          >
            <ArrowDown className="h-4 w-4 text-slate-500" /> {t("Move down")}
          </button>
          {props.onManage && (
            <button role="menuitem" type="button" className={item} onClick={props.onManage}>
              <Settings2 className="h-4 w-4 text-slate-500" /> {t("Manage sheets")}
            </button>
          )}
          <div className="my-1 border-t border-slate-100" />
          <button
            role="menuitem"
            type="button"
            className={`${item} text-red-600 hover:bg-red-50`}
            onClick={async () => {
              // Step to the neighbouring sheet first, so the plan doesn't jump back to the first one.
              const st = useEditor.getState();
              const next = st.sheets[props.index + 1] ?? st.sheets[props.index - 1];
              props.onClose();
              if (await deleteSheetsWithUndo([sheet.id])) {
                if (next) st.setActiveSheet(next.id);
              }
            }}
            data-testid="sheet-menu-delete"
          >
            <Trash className="h-4 w-4" /> {t("Delete sheet")}
          </button>
        </>
      )}
    </div>
  );
}
