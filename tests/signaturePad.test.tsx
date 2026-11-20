// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SignaturePad, { drawTypedSignature } from "@/components/SignaturePad";

// next/font only works inside a Next build; the client pages just need a class name and a font family.
vi.mock("next/font/google", () => ({ Manrope: () => ({ className: "font-manrope", style: { fontFamily: "Manrope" } }) }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// jsdom has no canvas drawing: a recording 2D context and a fixed PNG are enough to follow what the pad does.
const PNG = "data:image/png;base64,iVBORw0KGgo=";
function fakeContext() {
  const ctx = {
    font: "",
    fillStyle: "",
    textAlign: "",
    textBaseline: "",
    lineWidth: 0,
    lineCap: "",
    lineJoin: "",
    strokeStyle: "",
    texts: [] as string[],
    scale: vi.fn(),
    clearRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    drawImage: vi.fn(),
    measureText: (t: string) => ({ width: t.length * 10 }),
    fillText(t: string) {
      ctx.texts.push(t);
    },
  };
  return ctx;
}
let contexts: ReturnType<typeof fakeContext>[];

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  contexts = [];
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(function (this: HTMLCanvasElement) {
    const self = this as HTMLCanvasElement & { __ctx?: ReturnType<typeof fakeContext> };
    if (!self.__ctx) contexts.push((self.__ctx = fakeContext()));
    return self.__ctx as unknown as CanvasRenderingContext2D;
  } as unknown as typeof HTMLCanvasElement.prototype.getContext);
  vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue(PNG);
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.restoreAllMocks();
});

const button = (text: RegExp) => Array.from(host.querySelectorAll("button")).find((b) => text.test(b.textContent ?? ""))!;
function type(input: HTMLInputElement, value: string) {
  // React tracks the input's value; set it the way a browser would, then fire "input".
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
  act(() => void input.dispatchEvent(new Event("input", { bubbles: true })));
}

describe("SignaturePad", () => {
  it("has a visible hint tied to the signature box", () => {
    act(() => root.render(<SignaturePad onChange={() => {}} />));
    const canvas = host.querySelector("canvas")!;
    const hint = document.getElementById(canvas.getAttribute("aria-describedby")!);
    expect(hint?.textContent).toMatch(/type your name instead/i);
    expect(button(/type your name instead/i)).toBeTruthy();
  });

  it("typing a name draws it on the same canvas and gives the same PNG data URL", () => {
    const onChange = vi.fn();
    act(() => root.render(<SignaturePad onChange={onChange} name="Pat Client" />));
    act(() => button(/type your name instead/i).click());

    const input = host.querySelector<HTMLInputElement>("input")!;
    expect(input.value).toBe("Pat Client");
    expect(document.activeElement).toBe(input);
    expect(host.querySelector(`label[for="${input.id}"]`)?.textContent).toMatch(/type your full name/i);
    expect(onChange).toHaveBeenLastCalledWith(PNG);
    expect(contexts.flatMap((c) => c.texts)).toContain("Pat Client");

    type(input, "Pat Q. Client");
    expect(onChange).toHaveBeenLastCalledWith(PNG);
    expect(contexts.flatMap((c) => c.texts)).toContain("Pat Q. Client");
    expect(host.querySelector("canvas")!.getAttribute("aria-label")).toBe("Signature: Pat Q. Client");

    // An empty name is no signature.
    type(input, "  ");
    expect(onChange).toHaveBeenLastCalledWith(null);

    type(input, "Pat");
    act(() => button(/clear/i).click());
    expect(onChange).toHaveBeenLastCalledWith(null);
    expect(input.value).toBe("");

    // Back to drawing starts over.
    type(input, "Pat");
    act(() => button(/draw instead/i).click());
    expect(onChange).toHaveBeenLastCalledWith(null);
    expect(host.querySelector("input")).toBeNull();
  });

  it("shrinks a long name to fit the box", () => {
    const ctx = fakeContext();
    drawTypedSignature(ctx as unknown as CanvasRenderingContext2D, "A very long company signatory name", 200, 100);
    const size = Number(/^([\d.]+)px/.exec(ctx.font)![1]);
    expect(size).toBeLessThan(45);
    expect(ctx.texts).toEqual(["A very long company signatory name"]);
    const blank = fakeContext();
    drawTypedSignature(blank as unknown as CanvasRenderingContext2D, "   ", 200, 100);
    expect(blank.texts).toEqual([]);
  });
});

describe("client proposal: keyboard pin drop", () => {
  it("arrow keys move the crosshair in small or big steps and stay on the plan", async () => {
    const { moveCrosshair } = await import("@/components/ClientProposal");
    expect(moveCrosshair({ x: 0.5, y: 0.5 }, "ArrowRight", false)).toEqual({ x: 0.51, y: 0.5 });
    expect(moveCrosshair({ x: 0.5, y: 0.5 }, "ArrowUp", true)).toEqual({ x: 0.5, y: 0.45 });
    expect(moveCrosshair({ x: 0.005, y: 0.99 }, "ArrowLeft", true)).toEqual({ x: 0, y: 0.99 });
    expect(moveCrosshair({ x: 0.5, y: 0.98 }, "ArrowDown", true)).toEqual({ x: 0.5, y: 1 });
    expect(moveCrosshair({ x: 0.5, y: 0.5 }, "a", false)).toBeNull();
  });
});
