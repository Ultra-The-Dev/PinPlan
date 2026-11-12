// Pure mapping from app data to Billdu API payloads.
import type { ComputedLine } from "../estimate";
import type { Project } from "../types";

export interface BillduItem {
  label: string;
  price: number;
  tax: number;
  stockNumber: string;
  count: number;
  unit: string;
  discount: number;
}

export type SendLine = Pick<ComputedLine, "key" | "description" | "qty" | "unit" | "unitPrice" | "total" | "included">;

const round2 = (n: number) => Math.round(n * 100) / 100;

export function billduUnit(unit: string): string {
  const u = unit.trim().toLowerCase();
  if (u === "each" || u === "ea" || u === "pc" || u === "pcs") return "pc";
  if (u === "lf" || u === "ft" || u === "feet") return "ft";
  return unit || "pc";
}

/** Included estimate lines -> Billdu items. A deposit % collapses everything into one line. */
export function linesToItems(lines: SendLine[], taxPct: number, opts: { depositPct?: number | null; address?: string } = {}): BillduItem[] {
  const included = lines.filter((l) => l.included && l.qty !== 0);
  if (opts.depositPct && opts.depositPct > 0 && opts.depositPct < 100) {
    const subtotal = included.reduce((s, l) => s + l.total, 0);
    return [
      {
        label: `Deposit ${opts.depositPct}% of estimate${opts.address ? ` — ${opts.address}` : ""}`,
        price: round2((subtotal * opts.depositPct) / 100),
        tax: taxPct,
        stockNumber: "",
        count: 1,
        unit: "pc",
        discount: 0,
      },
    ];
  }
  return included.map((l) => ({
    label: l.description,
    price: round2(l.unitPrice),
    tax: taxPct,
    stockNumber: l.key.startsWith("dev:") || l.key.startsWith("opt:") ? l.key.slice(l.key.indexOf(":") + 1) : "",
    count: round2(l.qty),
    unit: billduUnit(l.unit),
    discount: 0,
  }));
}

export function itemsTotal(items: BillduItem[]): number {
  return round2(items.reduce((s, i) => s + i.price * i.count * (1 - i.discount / 100), 0));
}

/** Best-effort split of a single-line address "20 Hilltop Dr E, Town, NY 10001". */
export function splitAddress(address: string): { street: string; city: string; province: string; zip: string } {
  const parts = address.split(",").map((p) => p.trim()).filter(Boolean);
  const street = parts[0] ?? "";
  const city = parts[1] ?? "";
  let province = "";
  let zip = "";
  const last = parts[2] ?? "";
  const m = last.match(/^([A-Za-z .]+?)\s*(\d{4,5}(?:-\d{4})?)?$/);
  if (m) {
    province = m[1]?.trim() ?? "";
    zip = m[2] ?? "";
  } else province = last;
  return { street, city, province, zip };
}

export function clientPayload(p: Pick<Project, "clientName" | "clientEmail" | "clientPhone" | "address">) {
  const a = splitAddress(p.address);
  return {
    company: "",
    fullname: p.clientName,
    street: a.street,
    street2: "",
    city: a.city,
    province: a.province,
    zip: a.zip,
    country: "US",
    phone: p.clientPhone ?? "",
    email: p.clientEmail ?? "",
    note: `PinPlan project: ${p.address}`,
  };
}

const norm = (s: unknown) => String(s ?? "").trim().toLowerCase();

/** Does a Billdu client record match the project's client? (email beats name) */
export function clientMatches(c: { company?: unknown; fullname?: unknown; email?: unknown; name?: unknown; surname?: unknown }, p: Pick<Project, "clientName" | "clientEmail">): boolean {
  if (p.clientEmail && norm(c.email) && norm(c.email) === norm(p.clientEmail)) return true;
  const name = norm(p.clientName);
  if (!name) return false;
  const full = norm(c.fullname) || norm(`${c.name ?? ""} ${c.surname ?? ""}`);
  return full === name || norm(c.company) === name;
}

/** Billdu dates are ISO 8601 with offset, e.g. 2019-11-10T15:08:07+0100. */
export function billduDate(d = new Date()): string {
  const pad = (n: number) => String(Math.abs(n)).padStart(2, "0");
  const off = -d.getTimezoneOffset();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}${off >= 0 ? "+" : "-"}${pad(Math.trunc(off / 60))}${pad(off % 60)}`;
}

export function documentPayload(args: {
  type: "estimate" | "order" | "invoice";
  clientId: number;
  items: BillduItem[];
  currency: string;
  address: string;
  now?: Date;
}) {
  const date = billduDate(args.now);
  return {
    type: args.type,
    client: args.clientId,
    items: args.items,
    issue: date,
    delivery: date,
    maturity: "14",
    payment: "transfer",
    currency: args.currency,
    note: `Project: ${args.address}`,
  };
}
