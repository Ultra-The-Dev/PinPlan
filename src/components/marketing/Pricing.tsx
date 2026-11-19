"use client";
import { Check, Users } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { monthlyPrice, PLANS, TRIAL_DAYS, type Plan } from "@/lib/plans";

const money = (n: number) => `$${n.toLocaleString("en-US")}`;

/** Users → monthly total, from the plan's base price, included seats and per-seat price. */
export function SeatCalculator({ plan = PLANS[0], initial = 5 }: { plan?: Plan; initial?: number }) {
  const [users, setUsers] = useState(initial);
  const total = monthlyPrice(plan, users);
  const extra = Math.max(0, users - plan.includedSeats);
  const pct = ((users - 1) / 49) * 100;
  return (
    <div className="rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <label htmlFor="seat-slider" className="flex items-center gap-2 text-sm font-medium text-slate-700">
          <Users className="h-4 w-4 text-slate-400" /> Team size
        </label>
        <span className="font-mono text-sm font-semibold text-slate-900 tabular-nums">
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
        className="mt-3 h-2 w-full cursor-pointer appearance-none rounded-full accent-brand-600"
        style={{ background: `linear-gradient(to right, var(--color-brand-500) ${pct}%, var(--color-slate-200) ${pct}%)` }}
        aria-valuetext={`${users} users, ${money(total)} a month`}
      />
      <div className="mt-1 flex justify-between text-[11px] text-slate-400">
        <span>1</span>
        <span>50</span>
      </div>
      <div className="mt-4 flex items-end justify-between gap-3 border-t border-slate-200 pt-4">
        <div className="text-xs leading-relaxed text-slate-500">
          {money(plan.basePrice)} includes {plan.includedSeats} users
          {extra > 0 && (
            <>
              <br />+ {extra} × {money(plan.seatPrice)} extra {extra === 1 ? "user" : "users"}
            </>
          )}
        </div>
        <div className="text-right">
          <div className="font-mono text-3xl font-semibold tracking-tight text-slate-900 tabular-nums" aria-live="polite">
            {money(total)}
          </div>
          <div className="text-xs text-slate-500">per month</div>
        </div>
      </div>
    </div>
  );
}

export function PlanCard({ plan = PLANS[0], calculator = true }: { plan?: Plan; calculator?: boolean }) {
  return (
    <div className="card relative overflow-hidden p-6 ring-1 ring-slate-200/70 sm:p-8">
      <div className="absolute inset-x-0 top-0 h-1 bg-brand-500" />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">{plan.name}</h3>
          <p className="mt-1 text-sm text-slate-500">Everything in PinPlan, for the whole company.</p>
        </div>
        <span className="chip bg-brand-50 text-brand-700 ring-1 ring-brand-200">{TRIAL_DAYS}-day free trial</span>
      </div>
      <div className="mt-5 flex items-baseline gap-1.5">
        <span className="font-mono text-4xl font-semibold tracking-tight text-slate-900">{money(plan.basePrice)}</span>
        <span className="text-sm text-slate-500">/ month</span>
      </div>
      <p className="mt-1 text-sm text-slate-500">
        Includes {plan.includedSeats} users · {money(plan.seatPrice)} per extra user
      </p>
      <ul className="mt-6 space-y-2.5">
        {plan.features.map((f) => (
          <li key={f} className="flex gap-2.5 text-sm text-slate-700">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
            {f}
          </li>
        ))}
      </ul>
      {calculator && (
        <div className="mt-6">
          <SeatCalculator plan={plan} />
        </div>
      )}
      <Link href="/signup" className="btn btn-brand mt-6 h-11 w-full text-[15px]">
        Start your {TRIAL_DAYS}-day free trial
      </Link>
      <p className="mt-2 text-center text-xs text-slate-500">Cancel any time. Your jobs stay yours to export.</p>
    </div>
  );
}
