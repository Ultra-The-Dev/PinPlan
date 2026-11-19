"use client";
// Small shared bits for the RFI screens: status and ball-in-court chips, dates.
import { statusChip } from "@/lib/statusStyle";
import { ArrowLeftRight, Hourglass } from "lucide-react";
import { RFI_STATUS_LABEL } from "@/lib/rfis";
import type { Rfi } from "@/lib/types";

export function StatusChip({ status }: { status: Rfi["status"] }) {
  return <span className={`chip ${statusChip(status)}`}>{RFI_STATUS_LABEL[status]}</span>;
}

/** Who has to act: "With them" (waiting on the GC) or "With us" (we have to act). Hidden once closed or void. */
export function BallChip({ rfi }: { rfi: Pick<Rfi, "status" | "ballInCourt"> }) {
  if (rfi.status === "closed" || rfi.status === "void") return null;
  const them = rfi.ballInCourt === "them";
  return (
    <span className={`chip ${them ? "bg-amber-50 text-amber-800 ring-1 ring-amber-200" : "bg-brand-50 text-brand-700 ring-1 ring-brand-200"}`} title="Ball in court">
      {them ? <Hourglass className="h-3 w-3" /> : <ArrowLeftRight className="h-3 w-3" />}
      {them ? "With them" : "With us"}
    </span>
  );
}

export const dayLabel = (d?: string | null) => {
  if (!d) return "";
  const t = new Date(d.length === 10 ? `${d}T12:00:00` : d);
  return Number.isNaN(t.getTime()) ? "" : t.toLocaleDateString(undefined, { month: "short", day: "numeric" });
};

/** Today as YYYY-MM-DD on this device. */
export function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** YYYY-MM-DD `n` days after `day`. */
export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00`);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
