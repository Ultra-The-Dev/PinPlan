"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import SyncBadge from "./SyncBadge";

export default function AppHeader({ children }: { children?: React.ReactNode }) {
  const path = usePathname();
  const nav = [
    { href: "/", label: "Projects" },
    { href: "/catalog", label: "Catalog" },
    { href: "/settings", label: "Settings" },
  ];
  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-3 sm:px-4">
      <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icon.svg" alt="" className="h-7 w-7" />
        <span className="hidden sm:inline">PinPlan</span>
      </Link>
      <div className="min-w-0 flex-1">{children}</div>
      <nav className="flex items-center gap-1">
        {nav.map((n) => (
          <Link key={n.href} href={n.href} className={`tab ${path === n.href ? "tab-active" : ""}`}>
            {n.label}
          </Link>
        ))}
      </nav>
      <SyncBadge />
    </header>
  );
}
