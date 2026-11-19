// The logo: a corner of a floor plan with a pin dropped on it, and the product name set in condensed Archivo.
// The name always comes from PRODUCT_NAME so a rename is one line. Rules in docs/brand.md.
import Link from "next/link";
import { PRODUCT_NAME } from "@/lib/plans";

export function LogoMark({ size = 30, onDark = false }: { size?: number; onDark?: boolean }) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden="true" className="shrink-0">
      <rect width="32" height="32" rx="7" fill={onDark ? "#33a9ff" : "#0f2340"} />
      <path d="M7 25V7h18M7 16h7" fill="none" stroke={onDark ? "#0f2340" : "#ffffff"} strokeOpacity={onDark ? 0.55 : 0.45} strokeWidth="2.2" strokeLinecap="square" />
      <path d="M21 10.5a5 5 0 0 0-5 5c0 3.9 5 9 5 9s5-5.1 5-9a5 5 0 0 0-5-5Z" fill={onDark ? "#0f2340" : "#33a9ff"} />
      <circle cx="21" cy="15.4" r="1.9" fill={onDark ? "#33a9ff" : "#0f2340"} />
    </svg>
  );
}

export function Wordmark({ href = "/welcome", onDark = false }: { href?: string; onDark?: boolean }) {
  return (
    <Link href={href} className="flex shrink-0 items-center gap-2 rounded-md" aria-label={`${PRODUCT_NAME} home`}>
      <LogoMark onDark={onDark} />
      <span className="text-[23px] leading-none font-[750] tracking-[-0.01em]" style={{ fontStretch: "75%" }}>
        {PRODUCT_NAME}
      </span>
    </Link>
  );
}
