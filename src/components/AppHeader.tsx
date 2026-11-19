"use client";
import { ClipboardList, FolderOpen, ReceiptText, Tags } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { PRODUCT_NAME } from "@/lib/plans";
import { useRole } from "@/lib/team";
import { can } from "@/lib/teamLogic";
import AccountMenu from "./AccountMenu";
import BillingBanner from "./BillingBanner";
import SyncBadge from "./SyncBadge";

export function Logo({ compact }: { compact?: boolean }) {
  return (
    <Link href="/" className="flex shrink-0 items-center gap-2 rounded-lg font-semibold text-slate-900" aria-label={`${PRODUCT_NAME} home`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/icon.svg" alt="" className="h-8 w-8 rounded-lg" />
      {!compact && <span className="hidden text-[15px] lg:inline">{PRODUCT_NAME}</span>}
    </Link>
  );
}

/**
 * Main sections. Older pages stay reachable and light up the section they now belong to: the jobs map and recent
 * photos are views of Jobs, the crew board sits under Tasks, Products is part of the Price list.
 */
export const MAIN_NAV: { href: string; label: string; icon: typeof FolderOpen; match: string[]; office?: boolean }[] = [
  { href: "/", label: "Jobs", icon: FolderOpen, match: ["/", "/map", "/photos", "/project"] },
  { href: "/tasks", label: "Tasks", icon: ClipboardList, match: ["/tasks", "/schedule"] },
  { href: "/invoices", label: "Money", icon: ReceiptText, match: ["/invoices"], office: true },
  { href: "/catalog", label: "Price list", icon: Tags, match: ["/catalog", "/products"], office: true },
];

export default function AppHeader({ children }: { children?: React.ReactNode }) {
  const path = usePathname() ?? "";
  const role = useRole();
  const nav = MAIN_NAV.filter((n) => !n.office || can(role, "editCatalog"));
  return (
    <>
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b border-slate-200/80 bg-white/85 px-3 backdrop-blur sm:gap-3 sm:px-5">
      <Logo />
      {children && <div className="min-w-0 flex-1">{children}</div>}
      {/* Always labelled: the label sits under the icon on phones and beside it from md up. */}
      <nav className={`flex min-w-0 items-center gap-0.5 ${children ? "" : "flex-1 justify-center sm:justify-start"}`} aria-label="Main">
        {nav.map((n) => {
          const active = n.match.includes(path);
          return (
            <Link
              key={n.href}
              href={n.href}
              className={`flex h-12 min-w-14 flex-col items-center justify-center gap-0.5 rounded-lg px-1.5 text-[11px] font-medium whitespace-nowrap transition md:h-9 md:flex-row md:gap-1.5 md:px-3 md:text-sm [&_svg]:h-4 [&_svg]:w-4 ${
                active ? "bg-slate-100 text-slate-900" : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
              }`}
              aria-current={active ? "page" : undefined}
            >
              <n.icon />
              {n.label}
            </Link>
          );
        })}
      </nav>
      <SyncBadge />
      <AccountMenu />
    </header>
    <BillingBanner />
    </>
  );
}
