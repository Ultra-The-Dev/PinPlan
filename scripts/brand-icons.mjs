// Northpin brand assets from one source: the mark's geometry below. Writes the SVG logos in public/brand/, the app
// icons and favicons in public/, the iOS app icon set and the brand sheet. Rasterised in Chromium (Playwright, a dev
// dependency) and encoded here, so the output only changes when this file does. Rules in docs/brand.md
// ("Northpin identity"). Run: node scripts/brand-icons.mjs  (add --no-sheet to skip the brand sheet).
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = (p) => path.join(ROOT, p);

// ---- Colours (Blueprint Ink, docs/brand.md) ----
export const INK = "#0F2340";
export const ELECTRIC = "#33A9FF";
export const WHITE = "#FFFFFF";
export const PAPER = "#F2F6FA";
const PENCIL = "#526580";
const RULE = "#C9D6E5";
const ACTION = "#0B6FE0";

// ---- The mark, on a 64-unit grid ----
// An N drawn the way plans draw walls: two solid wall stems (8 units, the grid's module). Its diagonal is a compass
// needle set to plan north: the north half (electric) points up the sheet, the south half is the pin that marks
// the spot, and the pivot is the pin's head. The needle's tips meet the inner corners of the stems exactly.
export const MARK = {
  tileRadius: 14,
  stems: "M12 12h8v40h-8ZM44 12h8v40h-8Z",
  north: "M20 12 38 28.4 26 35.6Z",
  south: "M44 52 26 35.6 38 28.4Z",
  pivot: { cx: 32, cy: 32, r: 2.6 },
  // One-colour drawing: the halves pull 1 unit apart along the needle so it still reads as a needle.
  northCut: "M20 12 37.49 27.54 25.49 34.74Z",
  southCut: "M44 52 26.51 36.46 38.51 29.26Z",
};

// ---- The wordmark: "Northpin" in Archivo (SIL OFL) at wdth 87.5, wght 700, tracking -10/1000, kerned with
// HarfBuzz and outlined, in font units (cap height 686, baseline y = 0). The lockup scales it to a 30-unit cap
// height beside the 64-unit tile.
const WORD = {
  d: "M67 0V-686.7H200.4L427.7 -330.2Q432.6 -323 439.8 -311Q446.9 -299 453.6 -286.6Q460.3 -274.3 463.5 -265.3L468.5 -265.6Q468.1 -283.5 468.1 -300.5Q468.1 -317.5 468.1 -330.2V-686.7H604V0H471.4L239.4 -363.2Q231.3 -376.7 222 -395Q212.7 -413.2 207.1 -426.4L202.4 -426.1Q202.8 -411.2 202.8 -394.5Q202.8 -377.7 202.8 -363.2V0ZM933.5 12Q855.8 12 802.9 -17.1Q749.9 -46.3 722.9 -107.3Q695.9 -168.4 695.9 -263.2Q695.9 -359 722.9 -419.6Q749.9 -480.2 802.9 -509.4Q855.8 -538.7 933.5 -538.7Q1011.8 -538.7 1064.7 -509.4Q1117.6 -480.2 1144.6 -419.6Q1171.7 -359 1171.7 -263.2Q1171.7 -168.4 1144.6 -107.3Q1117.6 -46.3 1064.7 -17.1Q1011.8 12 933.5 12ZM933.5 -91.9Q970.9 -91.9 993.7 -107.9Q1016.4 -123.9 1026.8 -157.4Q1037.2 -191 1037.2 -242.9V-283.4Q1037.2 -335.6 1026.8 -369.2Q1016.4 -402.7 993.7 -418.8Q970.9 -434.8 933.5 -434.8Q896.5 -434.8 873.7 -418.8Q850.9 -402.7 840.6 -369.2Q830.3 -335.6 830.3 -283.4V-242.9Q830.3 -191 840.6 -157.4Q850.9 -123.9 873.7 -107.9Q896.5 -91.9 933.5 -91.9ZM1253.8 0V-526.7H1363L1372.6 -448.1H1378.6Q1388.6 -474.6 1403.2 -494.9Q1417.8 -515.2 1438.9 -527Q1460 -538.8 1487.8 -538.8Q1501.5 -538.8 1513.3 -536.3Q1525.1 -533.8 1532.2 -530.6V-405.3H1490.4Q1463.9 -405.3 1444 -396.9Q1424.1 -388.5 1410.8 -371.4Q1397.5 -354.2 1391.2 -328.2Q1384.8 -302.2 1384.8 -267.5V0ZM1723.8 12Q1678.7 12 1651.2 -4.7Q1623.7 -21.3 1611.6 -50.6Q1599.4 -79.8 1599.4 -116.2V-422.8H1542.3V-526.7H1603L1627.5 -678.1H1730.4V-526.7H1813.5V-422.8H1730.4V-139Q1730.4 -116 1739.3 -104.2Q1748.3 -92.4 1769.9 -92.4H1813.5V-4Q1801.1 0.2 1785.4 3.9Q1769.7 7.5 1753.7 9.8Q1737.8 12 1723.8 12ZM1883.8 0V-723.7H2014.8V-469.4H2021.1Q2036.1 -491.2 2056.8 -506.5Q2077.5 -521.8 2103.8 -530.2Q2130.1 -538.7 2161 -538.7Q2208.4 -538.7 2241.8 -521Q2275.2 -503.3 2293.2 -466.1Q2311.1 -428.9 2311.1 -369.3V0H2179.6V-343.1Q2179.6 -364.5 2175 -379.7Q2170.3 -394.9 2161.2 -405.1Q2152.1 -415.2 2138.4 -420.1Q2124.6 -425 2106.8 -425Q2079.8 -425 2059 -410.4Q2038.2 -395.7 2026.5 -369.4Q2014.8 -343.1 2014.8 -306.8V0ZM2411 181.3V-526.7H2518.7L2528.9 -458H2535.2Q2556.8 -496.8 2592.8 -517.8Q2628.9 -538.7 2677.4 -538.7Q2736.9 -538.7 2778 -509.4Q2819.1 -480.1 2840.7 -418.8Q2862.3 -357.6 2862.3 -261.2Q2862.3 -167.1 2840.6 -106.5Q2818.9 -45.9 2778.7 -16.9Q2738.6 12 2682.8 12Q2651.6 12 2625.8 4.1Q2600.1 -3.9 2580.6 -19.8Q2561.1 -35.7 2547.8 -58.4H2542V181.3ZM2634.9 -101Q2669 -101 2689.4 -116.6Q2709.8 -132.2 2718.8 -164.3Q2727.8 -196.3 2727.8 -245.8V-282.3Q2727.8 -331.9 2718.9 -364.3Q2710 -396.7 2689.7 -412.4Q2669.3 -428.1 2634.7 -428.1Q2601.8 -428.1 2581.2 -410.8Q2560.5 -393.6 2551.1 -360.8Q2541.6 -328.1 2541.6 -280.8V-248.3Q2541.6 -212.7 2547 -185.2Q2552.4 -157.8 2563.7 -139.1Q2575 -120.4 2592.8 -110.7Q2610.5 -101 2634.9 -101ZM2943.8 -606.1V-723.7H3074.8V-606.1ZM2943.8 0V-526.7H3074.8V0ZM3178.8 0V-526.7H3288.8L3298.4 -457H3304.4Q3320.8 -483.1 3342.9 -501.3Q3365 -519.6 3393.3 -529.1Q3421.5 -538.7 3454.9 -538.7Q3502.7 -538.7 3536.4 -521Q3570.2 -503.3 3588.1 -466.1Q3606.1 -428.9 3606.1 -369.3V0H3474.6V-343.1Q3474.6 -364.5 3470 -379.7Q3465.3 -394.9 3456.2 -405.1Q3447.1 -415.2 3433.4 -420.1Q3419.6 -425 3401.8 -425Q3374.8 -425 3354 -410.4Q3333.2 -395.7 3321.5 -369.4Q3309.8 -343.1 3309.8 -306.8V0Z",
  x0: 67.0,
  x1: 3606.1,
  cap: 686,
};
const CAP = 30; // wordmark cap height in mark units
const GAP = 16; // tile to wordmark, = two stem widths
const BASELINE = 47; // centres the caps (17 to 47) on the tile
const WS = CAP / WORD.cap;
const LOCKUP_W = +(64 + GAP + (WORD.x1 - WORD.x0) * WS).toFixed(2);
const wordPath = (fill) =>
  `<path transform="translate(${+(64 + GAP - WORD.x0 * WS).toFixed(3)} ${BASELINE}) scale(${+WS.toFixed(6)})" fill="${fill}" d="${WORD.d}"/>`;

// ---- Mark drawings (inner SVG, 64 grid) ----
/** Full colour on its tile. `onDark` (ink grounds) turns the tile white with ink walls and an action-blue north half;
 * electric on white would be too faint (2.6:1), and an electric tile loses the needle. */
export function markTile({ onDark = false, radius = MARK.tileRadius, size = 64 } = {}) {
  const t = onDark
    ? { tile: WHITE, stems: INK, north: ACTION, south: INK }
    : { tile: INK, stems: WHITE, north: ELECTRIC, south: WHITE };
  const rect = radius === null ? "" : `<rect width="${size}" height="${size}" rx="${radius}" fill="${t.tile}"/>`;
  const inset = (size - 64) / 2;
  const g = `<path d="${MARK.stems}" fill="${t.stems}"/><path d="${MARK.north}" fill="${t.north}"/><path d="${MARK.south}" fill="${t.south}"/><circle cx="${MARK.pivot.cx}" cy="${MARK.pivot.cy}" r="${MARK.pivot.r}" fill="${t.tile}"/>`;
  return rect + (inset ? `<g transform="translate(${inset} ${inset})">${g}</g>` : g);
}
/** One colour: the tile in `color` with the N cut out of it (transparent), so it works on any ground. */
function markKnockout(color, id) {
  return `<mask id="${id}" maskUnits="userSpaceOnUse" x="0" y="0" width="64" height="64"><rect width="64" height="64" rx="${MARK.tileRadius}" fill="#fff"/><path d="${MARK.stems}${MARK.northCut}${MARK.southCut}" fill="#000"/><circle cx="${MARK.pivot.cx}" cy="${MARK.pivot.cy}" r="${MARK.pivot.r}" fill="#fff"/></mask><rect width="64" height="64" rx="${MARK.tileRadius}" fill="${color}" mask="url(#${id})"/>`;
}
const svg = (w, h, body, title) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w * 4}" height="${h * 4}" role="img" aria-label="${title}"><title>${title}</title>${body}</svg>\n`;

export const FILES = {
  "public/brand/northpin-mark.svg": svg(64, 64, markTile(), "Northpin"),
  "public/brand/northpin-mark-on-dark.svg": svg(64, 64, markTile({ onDark: true }), "Northpin"),
  "public/brand/northpin-mark-mono.svg": svg(64, 64, markKnockout(INK, "np-k"), "Northpin"),
  "public/brand/northpin-mark-white.svg": svg(64, 64, markKnockout(WHITE, "np-k"), "Northpin"),
  "public/brand/northpin-logo.svg": svg(LOCKUP_W, 64, markTile() + wordPath(INK), "Northpin"),
  "public/brand/northpin-logo-on-dark.svg": svg(LOCKUP_W, 64, markTile({ onDark: true }) + wordPath(WHITE), "Northpin"),
  "public/brand/northpin-logo-mono.svg": svg(LOCKUP_W, 64, markKnockout(INK, "np-k") + wordPath(INK), "Northpin"),
  "public/brand/northpin-logo-white.svg": svg(LOCKUP_W, 64, markKnockout(WHITE, "np-k") + wordPath(WHITE), "Northpin"),
  "public/icon.svg": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">${markTile()}</svg>\n`,
};

// ---- Raster icons ----
/** Full-bleed square (iOS rounds it itself; maskable crops to a circle). `scale` shrinks the N into the safe zone. */
const bleed = (bg, inner, scale = 1) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="${bg}"/><g transform="translate(32 32) scale(${scale}) translate(-32 -32)">${inner}</g></svg>`;
const glyph = ({ stems, north, south, hole }) =>
  `<path d="${MARK.stems}" fill="${stems}"/><path d="${MARK.north}" fill="${north}"/><path d="${MARK.south}" fill="${south}"/><circle cx="32" cy="32" r="${MARK.pivot.r}" fill="${hole}"/>`;
const COLOUR = glyph({ stems: WHITE, north: ELECTRIC, south: WHITE, hole: INK });
const TILE = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">${markTile()}</svg>`;
// Favicons: the 8-unit grid lands on whole pixels at 16 and 32 px (4 and 2 units a pixel), so the walls stay
// sharp. The pivot is under a pixel at 16 px and is left out there.
const small = (hole) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="12" fill="${INK}"/>${glyph({ stems: WHITE, north: ELECTRIC, south: WHITE, hole: hole ? INK : "none" })}</svg>`;
const SMALL = small(true);
const SMALL16 = small(false);

// The N spans 40 of 64 units (62.5%). Apple's icon grid keeps artwork inside about 80% of the square, the maskable
// safe zone is a circle of 80% diameter (the N's corners sit at 44% radius, so it is drawn at 0.85 there).
export const RASTERS = [
  { file: "public/icon-192.png", size: 192, svg: TILE },
  { file: "public/icon-512.png", size: 512, svg: TILE },
  { file: "public/icon-maskable-512.png", size: 512, svg: bleed(INK, COLOUR, 0.85) },
  { file: "public/apple-touch-icon.png", size: 180, svg: bleed(INK, COLOUR), opaque: true },
  { file: "public/favicon-32.png", size: 32, svg: SMALL },
  { file: "public/favicon-16.png", size: 16, svg: SMALL16 },
  { file: "ios/PinPlan/Assets.xcassets/AppIcon.appiconset/AppIcon.png", size: 1024, svg: bleed(INK, COLOUR), opaque: true },
  // Dark appearance: near-black ground, the same N; Apple darkens the rest of the home screen around it.
  {
    file: "ios/PinPlan/Assets.xcassets/AppIcon.appiconset/AppIcon-Dark.png",
    size: 1024,
    svg: bleed("#000000", glyph({ stems: "#E6EDF5", north: ELECTRIC, south: "#E6EDF5", hole: "#000000" })),
    opaque: true,
  },
  // Tinted: grey levels only; iOS replaces them with the person's tint. North reads lighter than the walls.
  {
    file: "ios/PinPlan/Assets.xcassets/AppIcon.appiconset/AppIcon-Tinted.png",
    size: 1024,
    svg: bleed("#000000", glyph({ stems: "#FFFFFF", north: "#8C8C8C", south: "#FFFFFF", hole: "#000000" })),
    opaque: true,
  },
];

// ---- PNG / ICO encoding ----
const CRC = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};
/** RGBA pixels -> PNG. `opaque` writes RGB with no alpha channel (the App Store refuses icons with alpha). */
export function encodePng(rgba, size, opaque = false) {
  const ch = opaque ? 3 : 4;
  const raw = Buffer.alloc((size * ch + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * ch + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const s = (y * size + x) * 4, d = y * (size * ch + 1) + 1 + x * ch;
      raw[d] = rgba[s];
      raw[d + 1] = rgba[s + 1];
      raw[d + 2] = rgba[s + 2];
      if (!opaque) raw[d + 3] = rgba[s + 3];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = opaque ? 2 : 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
/** ICO holding PNG images (supported by every current browser). */
function encodeIco(images) {
  const head = Buffer.alloc(6 + 16 * images.length);
  head.writeUInt16LE(0, 0);
  head.writeUInt16LE(1, 2);
  head.writeUInt16LE(images.length, 4);
  let offset = head.length;
  images.forEach(({ size, png }, i) => {
    const e = 6 + 16 * i;
    head[e] = size >= 256 ? 0 : size;
    head[e + 1] = size >= 256 ? 0 : size;
    head.writeUInt16LE(1, e + 4);
    head.writeUInt16LE(32, e + 6);
    head.writeUInt32LE(png.length, e + 8);
    head.writeUInt32LE(offset, e + 12);
    offset += png.length;
  });
  return Buffer.concat([head, ...images.map((i) => i.png)]);
}

async function rasterise(page, svgText, size) {
  const b64 = await page.evaluate(
    async ({ svgText, size }) => {
      const img = new Image();
      img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svgText);
      await img.decode();
      const c = document.createElement("canvas");
      c.width = c.height = size;
      const ctx = c.getContext("2d");
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, 0, 0, size, size);
      const px = ctx.getImageData(0, 0, size, size).data;
      let s = "";
      for (let i = 0; i < px.length; i += 0x8000) s += String.fromCharCode(...px.subarray(i, i + 0x8000));
      return btoa(s);
    },
    { svgText, size },
  );
  return Buffer.from(b64, "base64");
}

// ---- Brand sheet (for the owner; not used by the app) ----
function sheetHtml(px16, px32) {
  const enc = (s) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(s)}`;
  const img = (s, w, h = w, extra = "") => `<img src="${enc(s)}" width="${w}" height="${h}" style="${extra}">`;
  const file = (k) => FILES[k];
  const sw = (hex, name, use, dark) =>
    `<div class="sw"><div style="background:${hex};${dark ? "" : `box-shadow:inset 0 0 0 1px ${RULE}`}"></div><b>${name}</b><span>${hex} · ${use}</span></div>`;
  const construction = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-4 -4 72 72">
    <rect width="64" height="64" rx="14" fill="${INK}"/>
    <g stroke="${ELECTRIC}" stroke-opacity=".35" stroke-width=".25">${Array.from({ length: 9 }, (_, i) => `<path d="M${i * 8} 0V64M0 ${i * 8}H64"/>`).join("")}</g>
    <g fill="none" stroke="${WHITE}" stroke-width=".5"><path d="${MARK.stems}"/><path d="${MARK.north}"/><path d="${MARK.south}"/><circle cx="32" cy="32" r="2.6"/></g>
    <path d="M14 8 50 56" stroke="${ELECTRIC}" stroke-width=".4" stroke-dasharray="1.2 1"/>
    <circle cx="32" cy="32" r="9" fill="none" stroke="${ELECTRIC}" stroke-width=".4" stroke-dasharray="1.2 1"/>
    <g fill="${ELECTRIC}"><circle cx="20" cy="12" r=".9"/><circle cx="44" cy="52" r=".9"/></g></svg>`;
  const clear = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-20 -20 ${LOCKUP_W + 40} 104">
    <rect x="-16" y="-16" width="${LOCKUP_W + 32}" height="96" fill="none" stroke="${ELECTRIC}" stroke-width=".6" stroke-dasharray="2 1.5"/>
    <rect x="-16" y="-16" width="16" height="16" fill="${ELECTRIC}" fill-opacity=".18"/>
    ${markTile()}${wordPath(INK)}</svg>`;
  const iosMask = (s) => `<div class="ios">${img(s, 120)}</div>`;
  const png = (b, w) => `<img src="data:image/png;base64,${b.toString("base64")}" width="${w}" height="${w}">`;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  *{box-sizing:border-box;margin:0}
  body{width:1600px;background:${PAPER};color:${INK};font:15px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;padding:56px}
  h2{font-size:15px;font-weight:650;margin:0 0 14px}
  p.n{color:${PENCIL};max-width:34em}
  .grid{display:grid;gap:24px}
  .panel{background:#fff;border:1px solid ${RULE};border-radius:4px;padding:28px}
  .ink{background:${INK};color:#fff;border-color:${INK}}
  .ink p.n{color:#A9BCD4}
  .row{display:flex;gap:28px;align-items:center;flex-wrap:wrap}
  .sw{display:grid;gap:4px;width:180px}.sw div{height:64px;border-radius:4px}.sw span{color:${PENCIL};font-size:13px}
  .ios{width:120px;height:120px;border-radius:27px;overflow:hidden;box-shadow:0 10px 24px -14px rgb(15 35 64/.6)}
  .mask{width:120px;height:120px;border-radius:50%;overflow:hidden}
  .px img{image-rendering:pixelated}
  .cap{font-size:13px;color:${PENCIL};margin-top:8px}
  .ink .cap{color:#A9BCD4}
  </style></head><body>
  <div class="grid" style="grid-template-columns:1.25fr 1fr">
    <div class="panel ink" style="display:flex;flex-direction:column;justify-content:space-between;min-height:0;gap:48px">
      ${img(file("public/brand/northpin-logo-on-dark.svg"), (LOCKUP_W / 64) * 96, 96)}
      <div><p style="font-size:30px;font-weight:650;line-height:1.15;max-width:20em;margin-bottom:12px">An N drawn with two walls and a compass needle.</p>
      <p class="n">The north half points up the sheet; the south half is the pin that marks the spot. Walls are solid like the poché on a plan; the needle's tips land on the walls' inside corners.</p></div>
    </div>
    <div class="panel"><h2>Construction</h2>${img(construction, 300)}<p class="cap">64-unit grid, 8-unit module. Walls 8 wide, 40 tall. Needle 14 wide at the pivot, tips on the walls' inner corners. Tile radius 14.</p></div>
  </div>
  <div class="grid" style="grid-template-columns:1fr 1fr;margin-top:24px">
    <div class="panel"><h2>Logo</h2>
      <div class="row">${img(file("public/brand/northpin-logo.svg"), (LOCKUP_W / 64) * 72, 72)}</div>
      <div class="row" style="margin-top:26px">${img(file("public/brand/northpin-logo-mono.svg"), (LOCKUP_W / 64) * 40, 40)}
        <div style="background:${INK};padding:14px 18px;border-radius:4px">${img(file("public/brand/northpin-logo-white.svg"), (LOCKUP_W / 64) * 40, 40)}</div>
        <div style="background:${ACTION};padding:14px 18px;border-radius:4px">${img(file("public/brand/northpin-logo-white.svg"), (LOCKUP_W / 64) * 40, 40)}</div></div>
      <p class="cap">Full colour on paper and white; one-colour ink or white everywhere else. Smallest lockup 24 px tall.</p></div>
    <div class="panel"><h2>Clear space</h2>${img(clear, (LOCKUP_W + 40) * 2.2, 104 * 2.2)}<p class="cap">Keep a quarter of the tile (two wall widths) clear on every side.</p></div>
  </div>
  <div class="grid" style="grid-template-columns:1.3fr 1fr;margin-top:24px">
    <div class="panel"><h2>App icons</h2><div class="row">
      ${iosMask(RASTERS[6].svg)}${iosMask(RASTERS[7].svg)}${iosMask(RASTERS[8].svg)}
      <div class="mask">${img(RASTERS[2].svg, 120)}</div></div>
      <p class="cap">iOS light, dark and tinted (iOS applies the rounding), and the maskable PWA icon in a circle crop.</p></div>
    <div class="panel"><h2>Small sizes</h2><div class="row px">
      ${png(px16, 16)}${png(px32, 32)}${png(px16, 128)}${png(px32, 128)}
      <div style="background:${INK};padding:12px;border-radius:4px;display:flex;gap:12px;align-items:center">${png(px16, 16)}${png(px32, 32)}${img(file("public/brand/northpin-mark-on-dark.svg"), 48)}</div></div>
      <p class="cap">Favicons at 16 and 32 px, actual size and enlarged pixel for pixel; the on-dark tile. Smallest mark 16 px.</p></div>
  </div>
  <div class="panel" style="margin-top:24px"><h2>Colour (Blueprint Ink, unchanged)</h2><div class="row" style="align-items:flex-start">
    ${sw(INK, "Ink", "tile, walls, wordmark", true)}${sw(ELECTRIC, "Electric", "north half of the needle", true)}${sw(WHITE, "White", "walls and south half on ink")}${sw(PAPER, "Paper", "ground")}${sw(ACTION, "Action blue", "north half on the white (on-dark) tile", true)}</div></div>
  </body></html>`;
}

async function main() {
  for (const [p, body] of Object.entries(FILES)) {
    mkdirSync(path.dirname(out(p)), { recursive: true });
    writeFileSync(out(p), body);
  }
  const { chromium } = await import("playwright");
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setContent("<!doctype html><title>icons</title>");
  const written = {};
  for (const r of RASTERS) writeFileSync(out(r.file), (written[r.file] = encodePng(await rasterise(page, r.svg, r.size), r.size, r.opaque)));
  const ico = [16, 32].map((size) => ({ size, png: written[`public/favicon-${size}.png`] }));
  ico.push({ size: 48, png: encodePng(await rasterise(page, TILE, 48), 48) });
  writeFileSync(out("public/favicon.ico"), encodeIco(ico));
  if (!process.argv.includes("--no-sheet")) {
    const sheet = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
    await sheet.setContent(sheetHtml(written["public/favicon-16.png"], written["public/favicon-32.png"]));
    await sheet.screenshot({ path: out("public/brand/northpin-brand-sheet.png"), fullPage: true });
  }
  await browser.close();
  console.log(`brand-icons: ${Object.keys(FILES).length} SVG, ${RASTERS.length + 1} raster files written`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
