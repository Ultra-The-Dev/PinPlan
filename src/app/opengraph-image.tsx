// The share card for every page (links pasted in texts, email and social): the wordmark and the tagline on the ink
// band, with a corner of a plan behind it. Colours from docs/brand.md. Generated once at build time.
import { ImageResponse } from "next/og";
import { TAGLINE } from "@/components/marketing/seo";
import { PRODUCT_NAME } from "@/lib/plans";

export const alt = `${PRODUCT_NAME}: ${TAGLINE}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const INK = "#0f2340";
const ELECTRIC = "#33a9ff";
const ON_DARK = "#a9bcd4";

/** The logo mark (src/components/marketing/Wordmark.tsx, on-dark variant: white tile) as a data URL. */
const MARK = `data:image/svg+xml;utf8,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#ffffff"/><path d="M12 12h8v40h-8ZM44 12h8v40h-8Z" fill="${INK}"/><path d="M20 12 38 28.4 26 35.6Z" fill="#0b6fe0"/><path d="M44 52 26 35.6 38 28.4Z" fill="${INK}"/><circle cx="32" cy="32" r="2.6" fill="#ffffff"/></svg>`,
)}`;

/** A few walls drawn faintly on the right, like the hero plan. Devices are laid over it as letters (see DEVICES). */
const WALLS = `data:image/svg+xml;utf8,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 630" fill="none"><g stroke="#ffffff" stroke-opacity="0.16" stroke-width="3"><path d="M20 60h420v510H20z"/><path d="M20 260h250M270 60v320M270 380h170M160 260v310"/></g></svg>`,
)}`;

/** Pinned devices: letters, like the legend on the drawings. */
const DEVICES: [number, number, string][] = [
  [90, 150, "C"],
  [200, 140, "D"],
  [360, 180, "W"],
  [80, 400, "C"],
  [220, 470, "S"],
  [380, 470, "D"],
];

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: INK, color: "#ffffff" }}>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", padding: "0 0 0 80px", width: 720 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
            <img src={MARK} width={96} height={96} alt="" />
            <div style={{ fontSize: 92, fontWeight: 800, letterSpacing: -2 }}>{PRODUCT_NAME}</div>
          </div>
          <div style={{ marginTop: 40, fontSize: 40, lineHeight: 1.25, color: ON_DARK }}>{TAGLINE}</div>
          <div style={{ marginTop: 40, display: "flex", height: 6, width: 160, background: ELECTRIC }} />
        </div>
        <div style={{ display: "flex", position: "relative", width: 480, height: 630 }}>
          <img src={WALLS} width={480} height={630} alt="" />
          {DEVICES.map(([x, y, l], i) => (
            <div
              key={i}
              style={{
                position: "absolute",
                left: x - 22,
                top: y - 22,
                width: 44,
                height: 44,
                borderRadius: 22,
                background: ELECTRIC,
                color: INK,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 24,
                fontWeight: 800,
              }}
            >
              {l}
            </div>
          ))}
        </div>
      </div>
    ),
    size,
  );
}
