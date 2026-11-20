"use client";
// The tour on screen: a spotlight around the step's element and a short card beside it (a sheet on phones). It never
// blocks the page: the dimmed layer lets every tap through, so people can do the step for real; a missing element
// just shows the card in the middle. Keyboard: the card takes focus, Esc closes (Help offers Resume), ← → move.
import { ArrowLeft, ArrowRight, Check, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useT } from "@/lib/i18n";
import { JOB_TABS } from "@/lib/tabRoutes";
import { useRole } from "@/lib/team";
import { can } from "@/lib/teamLogic";
import { toast } from "@/lib/toast";
import { anchorSelector } from "@/lib/tour/anchors";
import { atLocation, hrefFor, placeCard, PHONE_MAX, rectVisible, spotlightRect, stepAnchor, visibleSteps, type Rect } from "@/lib/tour/model";
import { useTour } from "@/lib/tour/store";
import { TOURS } from "@/lib/tour/tours";
import { useTopModalSlot } from "../ui/Modal";
import "./tour.css";

/** How long to wait for a step's element (lazy tabs, a plan loading) before showing the card in the middle. */
const WAIT_MS = 1500;

/** The first matching element that's actually showing (the job tabs exist twice: header strip and phone bar). */
function findAnchor(selector: string): HTMLElement | null {
  let els: NodeListOf<HTMLElement>;
  try {
    els = document.querySelectorAll<HTMLElement>(selector);
  } catch {
    return null;
  }
  for (const el of els) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden") return el;
  }
  return null;
}

const sameRect = (a: Rect | null, b: Rect | null) => (!a || !b ? a === b : Math.abs(a.x - b.x) < 1 && Math.abs(a.y - b.y) < 1 && Math.abs(a.w - b.w) < 1 && Math.abs(a.h - b.h) < 1);

export default function TourCoach() {
  const t = useT();
  const router = useRouter();
  const path = usePathname() ?? "";
  const search = useSearchParams()?.toString() ?? "";
  const office = can(useRole(), "prices");
  const active = useTour((s) => s.active);
  const dispatch = useTour((s) => s.dispatch);
  const tour = active ? TOURS[active.id] : null;
  const steps = tour ? visibleSteps(tour, office) : [];
  const step = active ? steps[active.step] : undefined;
  const total = steps.length;
  const n = active?.step ?? 0;

  // While a dialog is open (the pages screen after an upload) the page behind it is inert and below it: the card goes
  // inside the dialog, like the toasts.
  const slot = useTopModalSlot();
  const [vp, setVp] = useState({ w: 1024, h: 768 });
  const phone = vp.w < PHONE_MAX;
  const [rect, setRect] = useState<Rect | null>(null);
  const [waited, setWaited] = useState(false);
  const [card, setCard] = useState({ w: 360, h: 200 });
  const cardRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const titleId = useId();
  const bodyId = useId();
  const navigated = useRef<string | null>(null);
  const scrolled = useRef<string | null>(null);
  const stepKey = active ? `${active.id}:${n}` : "";

  // Out of range (the steps changed, or the role did): close quietly.
  useEffect(() => {
    if (active && !step) dispatch({ type: "close" });
  }, [active, step, dispatch]);

  // Go where the step happens, once per step (if the person wanders off, the card stays and Next carries on).
  useEffect(() => {
    if (!active || !step || navigated.current === stepKey) return;
    navigated.current = stepKey;
    const o = { jobId: active.jobId, knownTabs: JOB_TABS as readonly string[] };
    if (atLocation(step.at, { path, search }, o)) return;
    const href = hrefFor(step.at, o);
    if (href) router.push(href);
  }, [active, step, stepKey, path, search, router]);

  // Screen size.
  useEffect(() => {
    const read = () => setVp({ w: window.innerWidth, h: window.innerHeight });
    read();
    window.addEventListener("resize", read);
    return () => window.removeEventListener("resize", read);
  }, []);

  // Follow the element: it may appear late (lazy tabs), move (scrolling, panels opening) or go away.
  const anchorId = step ? stepAnchor(step, phone) : undefined;
  const openId = step?.whenOpen;
  useEffect(() => {
    if (!anchorId) {
      const id = setTimeout(() => {
        setRect(null);
        setWaited(true);
      }, 0);
      return () => clearTimeout(id);
    }
    const selector = anchorSelector(anchorId);
    // A dialog the step leads to (the pages screen after an upload) wins while it's open.
    const openSelector = openId ? anchorSelector(openId) : null;
    const started = Date.now();
    let last: Rect | null = null;
    const tick = () => {
      const open = openSelector ? findAnchor(openSelector) : null;
      const el = open ?? findAnchor(selector);
      const key = `${stepKey}:${open ? openId : anchorId}`;
      if (el && scrolled.current !== key) {
        scrolled.current = key;
        const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        el.scrollIntoView({ block: "nearest", inline: "nearest", behavior: reduce ? "auto" : "smooth" });
      }
      const r = el?.getBoundingClientRect();
      const next = r ? { x: r.left, y: r.top, w: r.width, h: r.height } : null;
      if (!sameRect(next, last)) {
        last = next;
        setRect(next);
      }
      setWaited(!!next || Date.now() - started > WAIT_MS);
    };
    tick();
    const id = setInterval(tick, 200);
    window.addEventListener("scroll", tick, true);
    window.addEventListener("resize", tick);
    return () => {
      clearInterval(id);
      window.removeEventListener("scroll", tick, true);
      window.removeEventListener("resize", tick);
      setRect(null);
      setWaited(false);
    };
  }, [anchorId, openId, stepKey]);

  // The card's own size, for placing it.
  useLayoutEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setCard({ w: el.offsetWidth, h: el.offsetHeight }));
    ro.observe(el);
    return () => ro.disconnect();
    // The card is a new element when it moves into (or out of) a dialog: observe that one.
  }, [stepKey, slot]);

  // Focus the card's title on each step, so screen readers read it and the keys below work.
  useEffect(() => {
    if (!stepKey) return;
    const id = setTimeout(() => titleRef.current?.focus({ preventScroll: true }), 60);
    return () => clearTimeout(id);
  }, [stepKey]);

  if (!active || !step || !tour) return null;
  const last = n === total - 1;
  const shown = rectVisible(rect, vp) ? rect : null;
  const place = placeCard(shown, card, vp);
  const spot = shown ? spotlightRect(shown, vp) : null;

  const next = () => {
    if (last) toast(t("Tour finished. Take it again any time from Help."), "success", { action: { label: t("Help"), href: "/help" } });
    dispatch({ type: "next", total });
  };
  const back = () => dispatch({ type: "back" });
  const close = () => dispatch({ type: "close" });
  const skip = () => {
    dispatch({ type: "skip" });
    toast(t("Tour skipped. You'll find it in Help."), "info", { action: { label: t("Help"), href: "/help" } });
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      // Inside a dialog, Esc closes the tour only (not the dialog too).
      e.preventDefault();
      e.stopPropagation();
      close();
    } else if (e.key === "ArrowRight" && !(e.target instanceof HTMLButtonElement || e.target instanceof HTMLAnchorElement)) next();
    else if (e.key === "ArrowLeft" && n > 0 && !(e.target instanceof HTMLButtonElement || e.target instanceof HTMLAnchorElement)) back();
  };

  const style: React.CSSProperties =
    place.mode === "popover"
      ? { left: place.x, top: place.y, width: Math.min(360, vp.w - 24) }
      : place.mode === "center"
        ? { left: "50%", top: "50%", transform: "translate(-50%, -50%)", width: Math.min(400, vp.w - 32) }
        : {};
  const sheet = place.mode === "sheet";

  const ui = (
    <div className="tour-root" data-tour-active={tour.id}>
      {/* The dim layer: a box around the element with a huge shadow. Taps go through to the page. */}
      {spot ? (
        <div
          aria-hidden
          className="tour-spot pointer-events-none fixed z-[70] rounded-[10px]"
          style={{ left: spot.x, top: spot.y, width: spot.w, height: spot.h }}
        />
      ) : (
        waited && <div aria-hidden className="pointer-events-none fixed inset-0 z-[70] bg-ink/35" />
      )}
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="false"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        onKeyDown={onKey}
        className={`tour-card fixed z-[71] ${
          sheet
            ? `inset-x-0 ${place.edge === "top" ? "top-0 rounded-b-2xl pt-[max(0.75rem,env(safe-area-inset-top))]" : "bottom-0 rounded-t-2xl pb-[max(0.75rem,env(safe-area-inset-bottom))]"}`
            : "rounded-[6px]"
        } ${!waited && !shown ? "opacity-0" : ""}`}
        style={style}
        data-placement={place.mode === "popover" ? place.side : place.mode === "sheet" ? `sheet-${place.edge}` : "center"}
      >
        <div className="tour-wire" aria-hidden>
          {steps.map((s, i) => (
            <span key={s.id} className={`tour-pin ${i < n ? "tour-pin-done" : i === n ? "tour-pin-on" : ""}`} />
          ))}
        </div>
        <div className="flex items-start gap-3 px-4 pt-3 sm:px-5">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-slate-500 tabular-nums">
              {t(tour.title)} · {t("Step {n} of {total}", { n: n + 1, total })}
            </p>
            <h2 id={titleId} ref={titleRef} tabIndex={-1} className="tour-title mt-1 outline-none">
              {t(step.title)}
            </h2>
          </div>
          <button type="button" className="btn btn-sm btn-icon btn-ghost -mr-2 shrink-0 text-slate-500" onClick={close} aria-label={t("Close the tour (resume it from Help)")} title={t("Close")}>
            <X />
          </button>
        </div>
        <p id={bodyId} className="px-4 pt-1.5 text-[15px] leading-relaxed text-slate-700 sm:px-5">
          {t(step.body)}
        </p>
        <div className="flex flex-wrap items-center gap-2 px-4 pt-3 pb-3.5 sm:px-5">
          <button type="button" className="mr-auto rounded px-1 py-2 text-sm text-slate-500 underline-offset-2 hover:text-slate-900 hover:underline" onClick={skip}>
            {t("Skip tour")}
          </button>
          {n > 0 && (
            <button type="button" className="btn btn-sm" onClick={back}>
              <ArrowLeft /> {t("Back")}
            </button>
          )}
          <button type="button" className="btn btn-sm btn-brand" onClick={next}>
            {last ? (
              <>
                <Check /> {t("Finish")}
              </>
            ) : (
              <>
                {t("Next")} <ArrowRight />
              </>
            )}
          </button>
        </div>
        {last && (
          <p className="border-t border-slate-100 px-4 py-2.5 text-xs text-slate-500 sm:px-5">
            <Link href="/help" className="font-medium text-brand-700 hover:underline" onClick={() => dispatch({ type: "next", total })}>
              {t("More step-by-step guides in Help")}
            </Link>
          </p>
        )}
      </div>
      <p className="sr-only" role="status" aria-live="polite">
        {t("Step {n} of {total}: {title}", { n: n + 1, total, title: t(step.title) })}
      </p>
    </div>
  );
  return slot ? createPortal(ui, slot) : ui;
}
