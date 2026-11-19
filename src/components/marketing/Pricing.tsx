"use client";
import Link from "next/link";
import { useState } from "react";
import { monthlyPrice, PLANS, TRIAL_DAYS, type Plan } from "@/lib/plans";

const money = (n: number) => `$${n.toLocaleString("en-US")}`;

/** Users → monthly total, from the plan's base price, included seats and per-seat price. */
export function SeatCalculator({ plan = PLANS[0], initial = 6 }: { plan?: Plan; initial?: number }) {
  const [users, setUsers] = useState(initial);
  const total = monthlyPrice(plan, users);
  const extra = Math.max(0, users - plan.includedSeats);
  const pct = ((users - 1) / 49) * 100;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor="seat-slider" className="text-[15px] font-semibold">
          People who log in
        </label>
        <span className="mk-num text-[15px] font-semibold">
          {users} {users === 1 ? "user" : "users"}
        </span>
      </div>
      <input
        id="seat-slider"
        type="range"
        min={1}
        max={50}
        value={users}
        onChange={(e) => setUsers(Number(e.target.value))}
        className="mt-3 h-2 w-full cursor-pointer appearance-none rounded-full accent-mk-graphite"
        style={{ background: `linear-gradient(to right, var(--mk-graphite) ${pct}%, var(--mk-rule) ${pct}%)` }}
        aria-valuetext={`${users} users, ${money(total)} a month`}
      />
      {/* A scale bar under the slider, one tick per user, like the scale on a drawing. */}
      <div className="px-2" aria-hidden="true">
        <svg viewBox="0 0 490 11" className="mt-1.5 block h-[11px] w-full overflow-visible" preserveAspectRatio="none">
          {Array.from({ length: 50 }, (_, i) => {
            const n = i + 1;
            const major = n === 1 || n % 10 === 0;
            const mid = n % 5 === 0;
            return <line key={n} x1={(i / 49) * 490} x2={(i / 49) * 490} y1="0" y2={major ? 10 : mid ? 7 : 4} stroke={n <= users ? "#1c2a30" : "#c9d1d3"} strokeWidth="1.2" />;
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
          {money(plan.basePrice)} includes {plan.includedSeats} users
          {extra > 0 && (
            <>
              <br />
              plus {extra} extra {extra === 1 ? "user" : "users"} at {money(plan.seatPrice)}
            </>
          )}
        </p>
        <div className="text-right">
          <div className="mk-figure text-[48px]" aria-live="polite">
            {money(total)}
          </div>
          <div className="text-[14px] text-mk-pencil">a month</div>
        </div>
      </div>
    </div>
  );
}

export function PlanCard({ plan = PLANS[0], calculator = true }: { plan?: Plan; calculator?: boolean }) {
  return (
    <div className="mk-sheet overflow-hidden">
      <div className="grid sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="border-b border-mk-rule p-6 sm:border-r sm:border-b-0 sm:p-8">
          <h2 className="text-[20px] font-[750]" style={{ fontStretch: "75%" }}>
            {plan.name}
          </h2>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="mk-figure text-[64px]">{money(plan.basePrice)}</span>
            <span className="text-[15px] text-mk-pencil">a month</span>
          </div>
          <p className="mt-2 text-[15px] text-mk-pencil">
            Includes {plan.includedSeats} users. Each extra user is {money(plan.seatPrice)} a month.
          </p>
          <ul className="mt-6 space-y-2.5 text-[15px]">
            {plan.features.map((f) => (
              <li key={f} className="flex gap-3">
                <span className="mt-[10px] h-[2px] w-3 shrink-0 bg-mk-graphite" aria-hidden="true" />
                {f}
              </li>
            ))}
          </ul>
        </div>
        <div className="flex flex-col bg-mk-paper/60 p-6 sm:p-8">
          {calculator && <SeatCalculator plan={plan} />}
          <p className="mt-5 text-[14px] leading-relaxed text-mk-pencil">You, office staff and technicians each count as one user. Clients never need a login.</p>
          <div className="mt-auto pt-8">
            <Link href="/signup" className="mk-btn mk-btn-primary w-full">
              Start free trial
            </Link>
            <p className="mt-3 text-center text-[14px] text-mk-pencil">
              {TRIAL_DAYS} days free. Cancel any time, and your jobs stay yours to export.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
