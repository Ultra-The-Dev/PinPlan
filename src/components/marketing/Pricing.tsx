"use client";
import Link from "next/link";
import { useState } from "react";
import { useT } from "@/lib/i18n";
import { monthlyPrice, PLANS, TRIAL_DAYS, type Plan } from "@/lib/plans";

const money = (n: number) => `$${n.toLocaleString("en-US")}`;

/** Users → monthly total, from the plan's base price, included seats and per-seat price. */
export function SeatCalculator({ plan = PLANS[0], initial = 6 }: { plan?: Plan; initial?: number }) {
  const t = useT();
  const [users, setUsers] = useState(initial);
  const total = monthlyPrice(plan, users);
  const extra = Math.max(0, users - plan.includedSeats);
  const pct = ((users - 1) / 49) * 100;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor="seat-slider" className="text-[15px] font-semibold">
          {t("People who log in")}
        </label>
        <span className="mk-num text-[15px] font-semibold whitespace-nowrap">{t.tn("{n} user", "{n} users", users)}</span>
      </div>
      <input
        id="seat-slider"
        type="range"
        min={1}
        max={50}
        value={users}
        onChange={(e) => setUsers(Number(e.target.value))}
        // A 44 px tall input with the 8 px track painted in its content box, so a finger can grab it anywhere on the row.
        className="-mt-1.5 -mb-[18px] box-content block h-2 w-full cursor-pointer appearance-none rounded-full bg-clip-content py-[18px] accent-mk-graphite"
        style={{ backgroundImage: `linear-gradient(to right, var(--mk-graphite) ${pct}%, var(--mk-rule) ${pct}%)` }}
        aria-valuetext={t.tn("{n} user, {total} a month", "{n} users, {total} a month", users, { total: money(total) })}
      />
      {/* A scale bar under the slider, one tick per user, like the scale on a drawing. */}
      <div className="pointer-events-none px-2" aria-hidden="true">
        <svg viewBox="0 0 490 11" className="mt-1.5 block h-[11px] w-full overflow-visible" preserveAspectRatio="none">
          {Array.from({ length: 50 }, (_, i) => {
            const n = i + 1;
            const major = n === 1 || n % 10 === 0;
            const mid = n % 5 === 0;
            return <line key={n} x1={(i / 49) * 490} x2={(i / 49) * 490} y1="0" y2={major ? 10 : mid ? 7 : 4} stroke={n <= users ? "#0f2340" : "#c9d6e5"} strokeWidth="1.2" />;
          })}
        </svg>
        <div className="relative mt-0.5 h-4 text-[12px] text-mk-pencil">
          {[1, 10, 20, 30, 40, 50].map((n) => (
            <span key={n} className="mk-num absolute -translate-x-1/2" style={{ left: `${((n - 1) / 49) * 100}%` }}>
              {n}
            </span>
          ))}
        </div>
      </div>
      <div className="mt-5 flex items-end justify-between gap-4 border-t border-mk-rule pt-5">
        <p className="text-[14px] leading-relaxed text-mk-pencil">
          {t.tn("{price} includes {n} user", "{price} includes {n} users", plan.includedSeats, { price: money(plan.basePrice) })}
          {extra > 0 && (
            <>
              <br />
              {t.tn("plus {n} extra user at {price}", "plus {n} extra users at {price}", extra, { price: money(plan.seatPrice) })}
            </>
          )}
        </p>
        <div className="text-right">
          <div className="mk-figure text-[48px]" aria-live="polite">
            {money(total)}
          </div>
          <div className="text-[14px] text-mk-pencil">{t("a month, plus tax")}</div>
        </div>
      </div>
    </div>
  );
}

export function PlanCard({ plan = PLANS[0], calculator = true }: { plan?: Plan; calculator?: boolean }) {
  const t = useT();
  return (
    <div className="mk-sheet overflow-hidden">
      <div className="grid sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="border-b border-mk-rule p-6 sm:border-r sm:border-b-0 sm:p-8">
          <h2 className="text-[20px] font-[750]" style={{ fontStretch: "75%" }}>
            {t(plan.name)}
          </h2>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="mk-figure text-[64px]">{money(plan.basePrice)}</span>
            <span className="text-[15px] text-mk-pencil">{t("a month")}</span>
          </div>
          <p className="mt-2 text-[15px] text-mk-pencil">
            {t.tn(
              "Includes {n} user. Each extra user is {price} a month. USD, plus applicable tax.",
              "Includes {n} users. Each extra user is {price} a month. USD, plus applicable tax.",
              plan.includedSeats,
              { price: money(plan.seatPrice) },
            )}
          </p>
          <ul className="mt-6 space-y-2.5 text-[15px]">
            {plan.features.map((f) => (
              <li key={f} className="flex gap-3">
                <span className="mt-[10px] h-[2px] w-3 shrink-0 bg-mk-graphite" aria-hidden="true" />
                {t(f)}
              </li>
            ))}
          </ul>
        </div>
        <div className="flex flex-col bg-mk-paper/60 p-6 sm:p-8">
          {calculator && <SeatCalculator plan={plan} />}
          <p className="mt-5 text-[14px] leading-relaxed text-mk-pencil">{t("You, office staff and technicians each count as one user. Clients never need a login.")}</p>
          <div className="mt-auto pt-8">
            <Link href="/signup" className="mk-btn mk-btn-primary w-full">
              {t("Start free trial")}
            </Link>
            <p className="mt-3 text-center text-[14px] text-mk-pencil">
              {t.tn("{n} day free. Cancel any time, and your jobs stay yours to export.", "{n} days free. Cancel any time, and your jobs stay yours to export.", TRIAL_DAYS)}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
