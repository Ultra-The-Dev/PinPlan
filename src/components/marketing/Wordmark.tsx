// The Northpin logo: an N drawn with two plan walls and a compass needle for its diagonal (north half electric, the
// south half is the pin, the pivot its head), on a continuous-corner ink tile. The paths come from markPaths.ts,
// generated with the logo files and app icons by scripts/brand-icons.mjs; rules in docs/brand.md ("Northpin
// identity"). The name always comes from PRODUCT_NAME, set live in IBM Plex Sans to match the outlined lockup.
import Link from "next/link";
import { PRODUCT_NAME } from "@/lib/plans";
import { brandFont } from "./fonts";
import { LOCKUP, NEEDLE, NEEDLE_SOLID, PIVOT, TILE, WALLS } from "./markPaths";

export function LogoMark({ size = 30, onDark = false }: { size?: number; onDark?: boolean }) {
  // On ink grounds the tile turns white, the walls ink and the north half action blue.
  const c = onDark
    ? { tile: "#ffffff", walls: "#0f2340", north: "#0b6fe0", south: "#0f2340" }
    : { tile: "#0f2340", walls: "#ffffff", north: "#33a9ff", south: "#ffffff" };
  // The seam between the halves shows from 40 px, the pivot from 24 px; smaller they would only blur.
  const needle = size >= 40 ? NEEDLE : NEEDLE_SOLID;
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden="true" className="shrink-0">
      <path d={TILE} fill={c.tile} />
      <path d={needle.north} fill={c.north} />
      <path d={needle.south} fill={c.south} />
      <path d={WALLS} fill={c.walls} />
      {size >= 24 && <circle cx={PIVOT.cx} cy={PIVOT.cy} r={PIVOT.r} fill={c.tile} />}
    </svg>
  );
}

/** IBM Plex Sans Condensed (width 75), bold: cap height 0.698 em, the N's left side bearing 0.068 em, and with
 *  line-height 1 the baseline sits 0.875 em below the line box's top. */
const CAP_EM = 0.698;
const LSB_EM = 0.068;
const BASELINE_EM = 0.875;

export function Wordmark({ href = "/", onDark = false }: { href?: string; onDark?: boolean }) {
  const tile = 30;
  const unit = tile / 64;
  const fontSize = (LOCKUP.cap * unit) / CAP_EM; // caps 30/64 of the tile, as in the logo files
  // The gap is measured to the N's ink, as in the logo files. Flex centres the line box; the nudge puts the baseline
  // where the outlined lockup has it. Checked against northpin-logo.svg: widths match within a pixel at 3x.
  const nudge = LOCKUP.baseline * unit - ((tile - fontSize) / 2 + BASELINE_EM * fontSize);
  return (
    <Link href={href} className="flex shrink-0 items-center rounded-md" style={{ gap: LOCKUP.gap * unit - LSB_EM * fontSize }} aria-label={`${PRODUCT_NAME} home`}>
      <LogoMark size={tile} onDark={onDark} />
      <span
        className={`${brandFont.className} leading-none font-bold`}
        style={{ fontSize, fontStretch: "75%", letterSpacing: "-0.01em", transform: `translateY(${nudge.toFixed(2)}px)` }}
      >
        {PRODUCT_NAME}
      </span>
    </Link>
  );
}
