// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Dialog from "@/components/Dialog";
import Modal from "@/components/ui/Modal";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const key = (el: Element, k: string, shiftKey = false) => act(() => void el.dispatchEvent(new KeyboardEvent("keydown", { key: k, shiftKey, bubbles: true, cancelable: true })));

/** A page with an "Open" button that shows a Dialog. */
function Page({ onCancel }: { onCancel?: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button onClick={() => setOpen(true)}>Open</button>
      {open && (
        <Dialog
          title="Calibrate"
          description="Type the real length"
          fields={[{ name: "ft", label: "Feet" }]}
          onSubmit={() => setOpen(false)}
          onCancel={() => {
            onCancel?.();
            setOpen(false);
          }}
        />
      )}
    </div>
  );
}

describe("Modal", () => {
  // React's autoFocus would run while the <dialog> is still closed (a closed dialog can't take focus), so Dialog marks
  // its first field with data-autofocus and Modal focuses it once the dialog is open.
  it("focuses the first field of a Dialog", () => {
    act(() => root.render(<Page />));
    const open = host.querySelector("button")!;
    act(() => open.click());
    expect(document.activeElement).toBe(host.querySelector("dialog input"));
  });

  it("marks the dialog aria-modal itself", () => {
    act(() =>
      root.render(
        <Modal onClose={() => {}} label="Test">
          <button>One</button>
        </Modal>,
      ),
    );
    expect(host.querySelector("dialog")?.getAttribute("aria-modal")).toBe("true");
  });

  it("opens as a named dialog, focus starts inside it, closes on Escape and gives focus back", () => {
    const onCancel = vi.fn();
    act(() => root.render(<Page onCancel={onCancel} />));
    const open = host.querySelector("button")!;
    open.focus();
    act(() => open.click());

    const dlg = host.querySelector("dialog")!;
    expect(dlg).toBeTruthy();
    expect(dlg.open).toBe(true);
    const title = document.getElementById(dlg.getAttribute("aria-labelledby")!);
    expect(title?.textContent).toBe("Calibrate");
    expect(document.getElementById(dlg.getAttribute("aria-describedby")!)?.textContent).toBe("Type the real length");
    const input = dlg.querySelector("input")!;
    expect(dlg.contains(document.activeElement)).toBe(true);
    // The label is tied to the field.
    expect(dlg.querySelector(`label[for="${input.id}"]`)?.textContent).toBe("Feet");

    key(input, "Escape");
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(host.querySelector("dialog")).toBeNull();
    expect(document.activeElement).toBe(open);
  });

  it("Escape is not seen by page shortcuts behind the dialog", () => {
    const pageKey = vi.fn();
    window.addEventListener("keydown", pageKey);
    const onClose = vi.fn();
    act(() =>
      root.render(
        <Modal onClose={onClose} label="Test">
          <button>One</button>
        </Modal>,
      ),
    );
    key(host.querySelector("button")!, "Escape");
    window.removeEventListener("keydown", pageKey);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(pageKey).not.toHaveBeenCalled();
  });

  it("keeps Tab inside the dialog", () => {
    act(() =>
      root.render(
        <Modal onClose={() => {}} label="Test">
          <div>
            <button>First</button>
            <button disabled>Off</button>
            <button>Last</button>
          </div>
        </Modal>,
      ),
    );
    const [first, , last] = Array.from(host.querySelectorAll("button"));
    expect(document.activeElement).toBe(first);
    last.focus();
    key(last, "Tab");
    expect(document.activeElement).toBe(first);
    key(first, "Tab", true);
    expect(document.activeElement).toBe(last);
  });

  it("closes on a click on the dimmed area, not on a click inside the panel", () => {
    const onClose = vi.fn();
    act(() =>
      root.render(
        <Modal onClose={onClose} label="Test">
          <div className="card">
            <button>Inside</button>
          </div>
        </Modal>,
      ),
    );
    const panel = host.querySelector(".card")!;
    const backdrop = panel.parentElement!;
    const press = (el: Element) =>
      act(() => {
        el.dispatchEvent(new Event("pointerdown", { bubbles: true }));
        el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
    press(panel.querySelector("button")!);
    expect(onClose).not.toHaveBeenCalled();
    press(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("full-screen editors can ignore backdrop clicks but still close on Escape", () => {
    const onClose = vi.fn();
    act(() =>
      root.render(
        <Modal onClose={onClose} label="Editor" closeOnBackdrop={false}>
          <span>Canvas</span>
        </Modal>,
      ),
    );
    const backdrop = host.querySelector("dialog > div")!;
    act(() => {
      backdrop.dispatchEvent(new Event("pointerdown", { bubbles: true }));
      backdrop.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onClose).not.toHaveBeenCalled();
    key(host.querySelector("dialog")!, "Escape");
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
