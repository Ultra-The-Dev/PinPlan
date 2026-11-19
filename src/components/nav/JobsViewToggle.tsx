"use client";
// Jobs as a list or on a map, plus the recent photos across jobs. The map and photo feed keep their own pages
// (/map, /photos) so old links and bookmarks still work; this toggle ties them to Jobs.
import { Camera, List, Map } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export default function JobsViewToggle({ photos = true }: { photos?: boolean }) {
  const path = usePathname();
  const views = [
    { href: "/", label: "List", icon: List },
    { href: "/map", label: "Map", icon: Map },
  ];
  return (
    <div className="flex flex-wrap items-center gap-2">
      <nav className="seg" aria-label="Jobs view">
        {views.map((v) => (
          <Link key={v.href} href={v.href} className={`tab h-7 ${path === v.href ? "tab-active" : ""}`} aria-current={path === v.href ? "page" : undefined}>
            <v.icon />
            {v.label}
          </Link>
        ))}
      </nav>
      {photos && (
        <Link href="/photos" className={`btn btn-sm btn-ghost ${path === "/photos" ? "text-slate-900" : "text-slate-600"}`} aria-current={path === "/photos" ? "page" : undefined}>
          <Camera /> Recent photos
        </Link>
      )}
    </div>
  );
}
