// The Northpin logo: an N drawn with two plan walls and a compass needle for its diagonal (north half electric, the
// south half is the pin), on an ink tile. Geometry and colours match scripts/brand-icons.mjs, which draws the
// files in public/brand and the app icons; rules in docs/brand.md ("Northpin identity"). The name always comes from
// PRODUCT_NAME, set in Archivo at the wordmark's width and weight.
import Link from "next/link";
import { PRODUCT_NAME } from "@/lib/plans";

const STEMS = "M12 12h8v40h-8ZM44 12h8v40h-8Z";
const NORTH = "M20 12 38 28.4 26 35.6Z";
const SOUTH = "M44 52 26 35.6 38 28.4Z";

export function LogoMark({ size = 30, onDark = false }: { size?: number; onDark?: boolean }) {
  // On ink grounds the tile turns white, the walls ink and the north half action blue.
  const c = onDark
    ? { tile: "#ffffff", stems: "#0f2340", north: "#0b6fe0", south: "#0f2340" }
    : { tile: "#0f2340", stems: "#ffffff", north: "#33a9ff", south: "#ffffff" };
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden="true" className="shrink-0">
      <rect width="64" height="64" rx="14" fill={c.tile} />
      <path d={STEMS} fill={c.stems} />
      <path d={NORTH} fill={c.north} />
      <path d={SOUTH} fill={c.south} />
      {size >= 20 && <circle cx="32" cy="32" r="2.6" fill={c.tile} />}
    </svg>
  );
}

export function Wordmark({ href = "/welcome", onDark = false }: { href?: string; onDark?: boolean }) {
  return (
    <Link href={href} className="flex shrink-0 items-center gap-[7px] rounded-md" aria-label={`${PRODUCT_NAME} home`}>
      <LogoMark onDark={onDark} />
      <span className="text-[21px] leading-none font-bold tracking-[-0.01em]" style={{ fontStretch: "87.5%" }}>
        {PRODUCT_NAME}
      </span>
    </Link>
  );
}
