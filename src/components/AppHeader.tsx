"use client";
import { Camera, ClipboardList, FolderOpen, Map, Package, Settings, Tags } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import SyncBadge from "./SyncBadge";

export function Logo({ compact }: { compact?: boolean }) {
  return (
    <Link href="/" className="flex shrink-0 items-center gap-2 rounded-lg font-semibold text-slate-900" aria-label="PinPlan home">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/icon.svg" alt="" className="h-8 w-8 rounded-lg" />
      {!compact && <span className="hidden text-[15px] sm:inline">PinPlan</span>}
    </Link>
  );
}

export default function AppHeader({ children }: { children?: React.ReactNode }) {
  const path = usePathname();
  const nav = [
    { href: "/", label: "Projects", icon: FolderOpen },
    { href: "/photos", label: "Photos", icon: Camera },
    { href: "/tasks", label: "Tasks", icon: ClipboardList },
    { href: "/map", label: "Map", icon: Map },
    { href: "/catalog", label: "Catalog", icon: Package },
    { href: "/products", label: "Products", icon: Tags },
    { href: "/settings", label: "Settings", icon: Settings },
  ];
  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b border-slate-200/80 bg-white/85 px-3 backdrop-blur sm:px-5">
      <Logo />
      <div className="min-w-0 flex-1">{children}</div>
      {/* Phones: icons only, tighter tabs so all seven fit at 375 px (and scroll rather than push the page wider). */}
      <nav className="seg min-w-0 overflow-x-auto" aria-label="Main">
        {nav.map((n) => (
          <Link key={n.href} href={n.href} className={`tab px-2 md:px-3 ${path === n.href ? "tab-active" : ""}`} aria-label={n.label} title={n.label} aria-current={path === n.href ? "page" : undefined}>
            <n.icon />
            <span className="hidden md:inline">{n.label}</span>
          </Link>
        ))}
      </nav>
      <SyncBadge />
    </header>
  );
}
