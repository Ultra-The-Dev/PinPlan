"use client";
// One modal for the whole app, on the native <dialog> element opened with showModal(): the browser keeps focus
// inside, makes the page behind it inert and puts it above everything else. On top of that we:
//   - close on Escape (and the Android back gesture, which fires "cancel") through onClose, so React stays in charge;
//   - close on a click on the dimmed area around the panel;
//   - cycle Tab / Shift+Tab inside the dialog (browsers otherwise let focus leave for the address bar);
//   - give focus back to whatever opened the dialog when it goes away;
//   - name the dialog with aria-labelledby (an id inside it) or aria-label;
//   - mark it aria-modal="true", so the plan's shortcuts and Escape handlers (which look for [aria-modal='true'])
//     stand down while it is open.
// Render it only while open: mounting opens it, unmounting closes it.
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";

// Open modals, innermost last. Everything outside the top one is inert, so the Toaster moves its live regions into
// the top modal's slot: toasts stay visible, clickable and announced while a dialog is open.
let slots: HTMLElement[] = [];
const slotListeners = new Set<() => void>();
const setSlots = (next: HTMLElement[]) => {
  slots = next;
  for (const l of slotListeners) l();
};
const subscribeSlots = (l: () => void) => {
  slotListeners.add(l);
  return () => void slotListeners.delete(l);
};
/** The toast slot of the innermost open modal, or null when none is open. */
export function useTopModalSlot(): HTMLElement | null {
  return useSyncExternalStore(
    subscribeSlots,
    () => slots[slots.length - 1] ?? null,
    () => null,
  );
}

const FOCUSABLE =
  'a[href], area[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), iframe, [contenteditable="true"], [tabindex]:not([tabindex="-1"])';

/** Elements Tab can reach inside `root`, in document order. */
export function focusableIn(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => !el.closest("[inert]") && !el.closest("[hidden]") && el.getAttribute("aria-hidden") !== "true");
}

// Layout effect on the client (so the dialog is modal before the first paint), plain effect elsewhere.
const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

export default function Modal(props: {
  onClose: () => void;
  /** id of the dialog's heading. Prefer this over `label`. */
  labelledBy?: string;
  /** Accessible name when there's no visible heading. */
  label?: string;
  describedBy?: string;
  /** Classes of the dimmed full-screen layer that holds the panel (layout, padding, backdrop colour). */
  className?: string;
  /** Click on the dimmed area closes (default true). Full-screen editors turn it off. */
  closeOnBackdrop?: boolean;
  /** Element to focus first; otherwise an autoFocus / data-autofocus element, else the first focusable one, else the dialog. */
  initialFocus?: React.RefObject<HTMLElement | null>;
  /** role="alertdialog" for confirmations that need an answer. */
  alert?: boolean;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const slot = useRef<HTMLDivElement>(null);
  const onClose = useRef(props.onClose);
  useEffect(() => {
    onClose.current = props.onClose;
  }, [props.onClose]);
  const initialFocus = props.initialFocus;
  // Where the last press started: a drag from inside the panel that ends on the dimmed area is not a backdrop click.
  const downOnBackdrop = useRef(false);
  // Read while rendering, before React's autoFocus moves focus into the dialog.
  const [opener] = useState(() => (typeof document !== "undefined" && document.activeElement instanceof HTMLElement ? document.activeElement : null));

  useIsoLayoutEffect(() => {
    const dlg = ref.current;
    if (!dlg) return;
    // The <dialog> mounts open but not yet modal (the `open` attribute below): a closed dialog can't take focus, and
    // React's autoFocus runs before this effect. So a field with autoFocus is focused by now; keep it, then reopen the
    // dialog as a modal (showModal() moves focus to the first button, so `pre` gets it back below).
    const active = document.activeElement;
    const pre = active instanceof HTMLElement && active !== dlg && dlg.contains(active) ? active : null;
    try {
      if (dlg.open) {
        if (typeof dlg.close === "function") dlg.close();
        else dlg.removeAttribute("open");
      }
      if (!dlg.open) {
        if (typeof dlg.showModal === "function") dlg.showModal();
        else dlg.setAttribute("open", "");
      }
    } catch {
      // Not connected yet or already open elsewhere: still show it.
      dlg.setAttribute("open", "");
    }
    const first = initialFocus?.current ?? pre ?? dlg.querySelector<HTMLElement>("[data-autofocus]") ?? focusableIn(dlg)[0] ?? dlg;
    first.focus({ preventScroll: true });
    // Android back gesture / browsers that turn Escape into "cancel" themselves.
    const cancel = (e: Event) => {
      e.preventDefault();
      onClose.current();
    };
    dlg.addEventListener("cancel", cancel);
    // Some browsers close the dialog themselves anyway (e.g. a repeated Escape / back gesture ignores the cancel's
    // preventDefault). If we're still mounted (onClose chose to keep it open, say after a "Discard?" question),
    // open it again so it doesn't stay on the page invisible and non-modal.
    let mounted = true;
    const reopen = () => {
      if (!mounted || dlg.open || !dlg.isConnected) return;
      try {
        if (typeof dlg.showModal === "function") dlg.showModal();
        else dlg.setAttribute("open", "");
      } catch {
        dlg.setAttribute("open", "");
      }
    };
    const closed = () => queueMicrotask(reopen);
    dlg.addEventListener("close", closed);
    const mySlot = slot.current;
    if (mySlot) setSlots([...slots, mySlot]);
    return () => {
      mounted = false;
      dlg.removeEventListener("cancel", cancel);
      dlg.removeEventListener("close", closed);
      if (mySlot) setSlots(slots.filter((s) => s !== mySlot));
      try {
        if (dlg.open && typeof dlg.close === "function") dlg.close();
      } catch {
        /* already gone */
      }
      // Give focus back to the button that opened us (if it's still on the page).
      if (opener && opener.isConnected) opener.focus({ preventScroll: true });
    };
    // Opening/closing follows mount/unmount only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <dialog
      ref={ref}
      aria-labelledby={props.labelledBy}
      aria-label={props.labelledBy ? undefined : props.label}
      aria-describedby={props.describedBy}
      role={props.alert ? "alertdialog" : undefined}
      aria-modal="true"
      open
      tabIndex={-1}
      // A transparent full-screen box: the panel inside keeps its own card classes.
      className="m-0 h-full max-h-none w-full max-w-none overflow-visible border-0 bg-transparent p-0 text-inherit outline-none backdrop:bg-transparent"
      onKeyDown={(e) => {
        if (e.defaultPrevented) return;
        if (e.key === "Escape") {
          // Handled here so the page's own shortcuts (and outer dialogs) don't also act on it.
          e.preventDefault();
          e.stopPropagation();
          onClose.current();
          return;
        }
        if (e.key !== "Tab") return;
        e.stopPropagation(); // an outer dialog must not re-run this for a nested one
        const items = focusableIn(e.currentTarget);
        if (!items.length) {
          e.preventDefault();
          return;
        }
        const first = items[0];
        const last = items[items.length - 1];
        const now = document.activeElement;
        if (e.shiftKey && (now === first || now === e.currentTarget)) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && now === last) {
          e.preventDefault();
          first.focus();
        }
      }}
    >
      <div
        className={props.className ?? "fixed inset-0 flex items-end justify-center bg-slate-900/30 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur-[2px] sm:items-center"}
        onPointerDown={(e) => {
          downOnBackdrop.current = e.target === e.currentTarget;
        }}
        onClick={(e) => {
          const fromBackdrop = downOnBackdrop.current;
          downOnBackdrop.current = false;
          if (props.closeOnBackdrop !== false && e.target === e.currentTarget && fromBackdrop) onClose.current();
        }}
      >
        {props.children}
      </div>
      <div ref={slot} data-toast-slot="" />
    </dialog>
  );
}
