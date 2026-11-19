"use client";
// Price list = the device catalog plus the products (brands and models). Both keep their own pages (/catalog,
// /products) so old links work; this strip ties them together under one name.
import { Package, Tags } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const SECTIONS = [
  { href: "/catalog", label: "Devices", icon: Package },
  { href: "/products", label: "Products", icon: Tags },
];

export default function PriceListNav() {
  const path = usePathname();
  return (
    <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-3 px-4 pt-4 sm:px-6 sm:pt-6">
      <span className="text-sm font-semibold text-slate-900">Price list</span>
      <nav className="seg" aria-label="Price list sections">
        {SECTIONS.map((s) => (
          <Link key={s.href} href={s.href} className={`tab h-7 ${path === s.href ? "tab-active" : ""}`} aria-current={path === s.href ? "page" : undefined}>
            <s.icon />
            {s.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
