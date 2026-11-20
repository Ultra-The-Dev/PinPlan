// Northpin brand assets from one source: the mark's geometry below. Writes the SVG logos in public/brand/, the app
// icons and favicons in public/, the iOS app icon set, the mark's paths for React
// (src/components/marketing/markPaths.ts) and the brand sheet. Raster icons are drawn in Chromium (Playwright, a dev
// dependency) or, for the 16 and 32 px favicons, from hand-set pixel maps, and encoded here, so the output only
// changes when this file does. Rules in docs/brand.md ("Northpin identity").
// Run: node scripts/brand-icons.mjs  (add --no-sheet to skip the brand sheet).
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = (p) => path.join(ROOT, p);
const r3 = (v) => +v.toFixed(3);

// ---- Colours (Blueprint Ink, docs/brand.md) ----
export const INK = "#0F2340";
export const ELECTRIC = "#33A9FF";
export const WHITE = "#FFFFFF";
export const PAPER = "#F2F6FA";
const PENCIL = "#526580";
const RULE = "#C9D6E5";
const ACTION = "#0B6FE0";
/** brand-500. In the 16/32 px favicons the north half is a step deeper than electric: electric against the white
 * south half is only 2.6:1 and the two halves merge into one light smear at that size; #1A86F0 keeps 4.5:1 on ink
 * and separates from white. */
const FAVICON_NORTH = "#1A86F0";

// ---- The mark, on a 64-unit grid ----
// An N drawn the way plans draw walls: two solid wall stems (8 units, the grid's module). Its diagonal is a compass
// needle set to plan north: the north half (electric) points up the sheet, the south half is the pin that marks
// the spot, and the pivot is the pin's head.
export const GEOM = {
  tileRadius: 14.4, // continuous corner (iOS shape), 22.5% of the side
  wall: 8,
  needleHalfWidth: 7.6, // at the pivot; a diamond looks lighter than a bar, so 7.6 (not 8) matches the walls' weight
  overshoot: 0.5, // tips run 0.5 past the walls' inside corners, like a pointed apex in type, so they meet, not fall short
  seam: 0.9, // gap between the halves at 40 px and up
  monoSeam: 1.8, // one-colour drawings need a wider cut to keep the two halves
  pivot: 2.4,
};
export const STEMS = `M12 12h${GEOM.wall}v40h-${GEOM.wall}ZM${52 - GEOM.wall} 12h${GEOM.wall}v40h-${GEOM.wall}Z`;
const PIVOT = [32, 32];

/** The needle along the N's diagonal, from the inside top corner of the left wall to the inside bottom corner of the
 * right one, split across the pivot into north and south halves `seam` units apart. Drawn under the walls. */
export function needle(seam = 0) {
  const n0 = [12 + GEOM.wall, 12], s0 = [52 - GEOM.wall, 52];
  const dx = s0[0] - n0[0], dy = s0[1] - n0[1], L = Math.hypot(dx, dy), u = [dx / L, dy / L], p = [-u[1], u[0]];
  const n = [n0[0] - u[0] * GEOM.overshoot, n0[1] - u[1] * GEOM.overshoot];
  const s = [s0[0] + u[0] * GEOM.overshoot, s0[1] + u[1] * GEOM.overshoot];
  const w = GEOM.needleHalfWidth, c = PIVOT;
  const A = [c[0] + p[0] * w, c[1] + p[1] * w], B = [c[0] - p[0] * w, c[1] - p[1] * w];
  // Pull each half's base back along its own edges until the base line has moved seam/2 along the axis.
  const back = (tip, base) => {
    const e = [base[0] - tip[0], base[1] - tip[1]], el = Math.hypot(e[0], e[1]);
    const m = seam / 2 / ((e[0] * u[0] + e[1] * u[1]) / el) / el;
    return [base[0] - e[0] * Math.abs(m), base[1] - e[1] * Math.abs(m)];
  };
  const d = (pts) => "M" + pts.map((q) => `${r3(q[0])} ${r3(q[1])}`).join(" ") + "Z";
  return { north: d([n, back(n, B), back(n, A)]), south: d([s, back(s, A), back(s, B)]) };
}
const NEEDLE = needle(GEOM.seam);
const NEEDLE_SOLID = needle(0);
const NEEDLE_MONO = needle(GEOM.monoSeam);

/** iOS-style continuous-corner square (the UIBezierPath "continuous" corner, as measured by PaintCode). */
export function squircle(size, r, x = 0, y = 0) {
  const k = [1.52866483, 1.08849323, 0.86840689, 0.63149399, 0.074911, 0.37282392, 0.16905899].map((v) => v * r);
  const [a, b, c, d, e, g, h] = k, R = x + size, B = y + size;
  const P = (...v) => v.map(r3).join(" ");
  return (
    `M${P(x + a, y)}H${r3(R - a)}C${P(R - b, y, R - c, y, R - d, y + e)}C${P(R - g, y + h, R - h, y + g, R - e, y + d)}` +
    `C${P(R, y + c, R, y + b, R, y + a)}V${r3(B - a)}C${P(R, B - b, R, B - c, R - e, B - d)}C${P(R - h, B - g, R - g, B - h, R - d, B - e)}` +
    `C${P(R - c, B, R - b, B, R - a, B)}H${r3(x + a)}C${P(x + b, B, x + c, B, x + d, B - e)}C${P(x + g, B - h, x + h, B - g, x + e, B - d)}` +
    `C${P(x, B - c, x, B - b, x, B - a)}V${r3(y + a)}C${P(x, y + b, x, y + c, x + e, y + d)}C${P(x + h, y + g, x + g, y + h, x + d, y + e)}` +
    `C${P(x + c, y, x + b, y, x + a, y)}Z`
  );
}
export const TILE_PATH = squircle(64, GEOM.tileRadius);

// ---- The wordmark: "Northpin" in IBM Plex Sans (SIL OFL) at wdth 75 (Condensed), wght 700, tracking -10/1000, kerned with
// HarfBuzz, hand-adjusted pairs (N-o -8, r-t +4, t-h -4, p-i -4, in 1/1000 em) and outlined, in font units
// (cap height 698, baseline y = 0). The lockup scales it to a 30-unit cap height beside the 64-unit tile.
const WORD = {
  d: "M430 0 254 -374 210 -485H194L202 -368V0H68V-698H224L400 -324L444 -213H460L452 -330V-698H586V0ZM890 12Q817 12 767.5 -18Q718 -48 692.5 -109Q667 -170 667 -262Q667 -355 692.5 -416Q718 -477 767.5 -507Q817 -537 890 -537Q963 -537 1012.5 -507Q1062 -477 1087.5 -416Q1113 -355 1113 -262Q1113 -170 1087.5 -109Q1062 -48 1012.5 -18Q963 12 890 12ZM890 -99Q928 -99 947.5 -121.5Q967 -144 967 -189V-336Q967 -381 947.5 -403.5Q928 -426 890 -426Q852 -426 832.5 -403.5Q813 -381 813 -336V-189Q813 -144 832.5 -121.5Q852 -99 890 -99ZM1335 0H1195V-525H1335V-413H1351Q1355 -443 1366.5 -468.5Q1378 -494 1400 -509.5Q1422 -525 1457 -525H1482V-383H1446Q1408 -383 1383.5 -376Q1359 -369 1347 -352.5Q1335 -336 1335 -306ZM1811 0H1726Q1654 0 1621.5 -32Q1589 -64 1589 -134V-416H1523V-525H1555Q1583 -525 1593 -537Q1603 -549 1603 -576V-667H1729V-525H1821V-416H1729V-109H1811ZM1892 0V-740H2032V-436H2048Q2061 -477 2090 -507Q2119 -537 2172 -537Q2242 -537 2279 -489Q2316 -441 2316 -357V0H2176V-330Q2176 -377 2160.5 -400Q2145 -423 2111 -423Q2090 -423 2072 -414.5Q2054 -406 2043 -389.5Q2032 -373 2032 -349V0ZM2422 200V-525H2562V-438H2578Q2587 -479 2621 -508Q2655 -537 2698 -537Q2759 -537 2797.5 -506Q2836 -475 2855 -414Q2874 -353 2874 -262Q2874 -171 2855.5 -110Q2837 -49 2798 -18.5Q2759 12 2698 12Q2655 12 2621 -17Q2587 -46 2578 -87H2562V200ZM2642 -102Q2681 -102 2704.5 -126.5Q2728 -151 2728 -196V-329Q2728 -374 2704.5 -398.5Q2681 -423 2642 -423Q2617 -423 2599 -415Q2581 -407 2571.5 -391.5Q2562 -376 2562 -353V-172Q2562 -149 2571.5 -133.5Q2581 -118 2599 -110Q2617 -102 2642 -102ZM3028 -589Q2985 -589 2965.5 -608Q2946 -627 2946 -658V-680Q2946 -712 2965.5 -730.5Q2985 -749 3028 -749Q3071 -749 3090.5 -730.5Q3110 -712 3110 -680V-658Q3110 -627 3090.5 -608Q3071 -589 3028 -589ZM2958 0V-525H3098V0ZM3350 0H3210V-525H3350V-436H3366Q3379 -477 3407.5 -507Q3436 -537 3488 -537Q3559 -537 3596.5 -489Q3634 -441 3634 -357V0H3494V-330Q3494 -377 3478.5 -400Q3463 -423 3429 -423Q3408 -423 3390 -414.5Q3372 -406 3361 -389.5Q3350 -373 3350 -349Z",
  x0: 68,
  x1: 3634.0,
  cap: 698,
};
const CAP = 30; // wordmark cap height in mark units (the walls are 40)
const GAP = 15; // tile to the N's stem
const BASELINE = 46.5; // caps 16.5 to 46.5: half a unit above centre, because the lowercase carries the word
const WS = CAP / WORD.cap;
const LOCKUP_W = r3(64 + GAP + (WORD.x1 - WORD.x0) * WS);
const wordPath = (fill) =>
  `<path transform="translate(${r3(64 + GAP - WORD.x0 * WS)} ${BASELINE}) scale(${+WS.toFixed(6)})" fill="${fill}" d="${WORD.d}"/>`;

// ---- Mark drawings (inner SVG, 64 grid) ----
const glyph = ({ stems, north, south, hole, seam = true }) => {
  const nd = seam ? NEEDLE : NEEDLE_SOLID;
  return (
    `<path d="${nd.north}" fill="${north}"/><path d="${nd.south}" fill="${south}"/><path d="${STEMS}" fill="${stems}"/>` +
    (hole ? `<circle cx="${PIVOT[0]}" cy="${PIVOT[1]}" r="${GEOM.pivot}" fill="${hole}"/>` : "")
  );
};
const LIGHT = { tile: INK, stems: WHITE, north: ELECTRIC, south: WHITE };
/** On ink grounds: white tile, ink walls and an action-blue north half (electric on white is only 2.6:1, and an
 * electric tile loses the needle). */
const DARK = { tile: WHITE, stems: INK, north: ACTION, south: INK };
export function markTile({ onDark = false } = {}) {
  const t = onDark ? DARK : LIGHT;
  return `<path d="${TILE_PATH}" fill="${t.tile}"/>${glyph({ ...t, hole: t.tile })}`;
}
/** One colour: the tile in `color` with the N cut out of it (transparent), so it works on any ground. */
function markKnockout(color, id) {
  return (
    `<mask id="${id}" maskUnits="userSpaceOnUse" x="0" y="0" width="64" height="64"><path d="${TILE_PATH}" fill="#fff"/>` +
    `<path d="${NEEDLE_MONO.north}${NEEDLE_MONO.south}${STEMS}" fill="#000"/><circle cx="32" cy="32" r="${GEOM.pivot}" fill="#fff"/></mask>` +
    `<path d="${TILE_PATH}" fill="${color}" mask="url(#${id})"/>`
  );
}
const svg = (w, h, body, title) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${r3(w * 4)}" height="${h * 4}" role="img" aria-label="${title}"><title>${title}</title>${body}</svg>\n`;

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
  "src/components/marketing/markPaths.ts":
    `// Generated by scripts/brand-icons.mjs from the Northpin mark's geometry. Do not edit; change the script and re-run.\n` +
    `/** The tile: continuous-corner square on the 64-unit grid. */\nexport const TILE = "${TILE_PATH}";\n` +
    `/** The two walls of the N. */\nexport const WALLS = "${STEMS}";\n` +
    `/** The needle's halves with the seam (40 px and up) and without it (smaller). */\n` +
    `export const NEEDLE = { north: "${NEEDLE.north}", south: "${NEEDLE.south}" };\n` +
    `export const NEEDLE_SOLID = { north: "${NEEDLE_SOLID.north}", south: "${NEEDLE_SOLID.south}" };\n` +
    `/** The pivot (the pin's head): drawn in the tile colour from 24 px. */\nexport const PIVOT = { cx: 32, cy: 32, r: ${GEOM.pivot} };\n` +
    `/** Lockup: the name's cap height and baseline, and the gap after the tile, in units of the 64-unit tile. */\n` +
    `export const LOCKUP = { cap: ${CAP}, baseline: ${BASELINE}, gap: ${GAP} };\n`,
};

// ---- Raster icons ----
/** Full-bleed square (iOS rounds it itself; maskable crops to a circle). `scale` shrinks the N into the safe zone. */
const bleed = (bg, inner, scale = 1) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="${bg}"/><g transform="translate(32 32) scale(${scale}) translate(-32 -32)">${inner}</g></svg>`;
const COLOUR = glyph({ ...LIGHT, hole: INK });
const TILE = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">${markTile()}</svg>`;

// The N spans 40 of 64 units (62.5%), inside Apple's ~80% artwork area. The maskable safe zone is a circle of 80%
// diameter; the walls' outer corners sit at 44% radius, so the N is drawn at 0.85 there (37.5%).
export const RASTERS = [
  { file: "public/icon-192.png", size: 192, svg: TILE },
  { file: "public/icon-512.png", size: 512, svg: TILE },
  { file: "public/icon-maskable-512.png", size: 512, svg: bleed(INK, COLOUR, 0.85) },
  { file: "public/apple-touch-icon.png", size: 180, svg: bleed(INK, COLOUR), opaque: true },
  { file: "ios/PinPlan/Assets.xcassets/AppIcon.appiconset/AppIcon.png", size: 1024, svg: bleed(INK, COLOUR), opaque: true },
  // Dark appearance: black ground, the same N with walls a touch off-white so they don't glare.
  {
    file: "ios/PinPlan/Assets.xcassets/AppIcon.appiconset/AppIcon-Dark.png",
    size: 1024,
    svg: bleed("#000000", glyph({ stems: "#E6EDF5", north: ELECTRIC, south: "#E6EDF5", hole: "#000000" })),
    opaque: true,
  },
  // Tinted: grey levels only; iOS maps them onto the person's tint. North is mid grey so the halves stay apart.
  {
    file: "ios/PinPlan/Assets.xcassets/AppIcon.appiconset/AppIcon-Tinted.png",
    size: 1024,
    svg: bleed("#000000", glyph({ stems: "#FFFFFF", north: "#7A7A7A", south: "#FFFFFF", hole: "#000000" })),
    opaque: true,
  },
];

// ---- Favicons, set by hand pixel by pixel ----
// W wall (white), S south half (white), N north half, n / s the same at half strength over ink, "." tile. No pivot:
// under 2 px it only reads as a bite out of the needle. The walls sit on whole pixels (4 and 2 units a pixel); the needle is 180°-symmetric about the pivot and
// its tips touch the walls' inside corners. The tile's corners are anti-aliased from the continuous-corner shape.
const FAVICON_16 = [
  "................",
  "................",
  "................",
  "...WWN.....WW...",
  "...WWNN....WW...",
  "...WWnNN...WW...",
  "...WW.NNN..WW...",
  "...WW.NNNS.WW...",
  "...WW.NSSS.WW...",
  "...WW..SSS.WW...",
  "...WW...SSsWW...",
  "...WW....SSWW...",
  "...WW.....SWW...",
  "................",
  "................",
  "................",
];
const FAVICON_32 = [
  "................................",
  "................................",
  "................................",
  "................................",
  "................................",
  "................................",
  "......WWWWN...........WWWW......",
  "......WWWWNN..........WWWW......",
  "......WWWWNNN.........WWWW......",
  "......WWWWnNNN........WWWW......",
  "......WWWW.NNNNn......WWWW......",
  "......WWWW.NNNNNn.....WWWW......",
  "......WWWW.NNNNNNN....WWWW......",
  "......WWWW.nNNNNNNN...WWWW......",
  "......WWWW..NNNNNNNs..WWWW......",
  "......WWWW..NNNNNSSS..WWWW......",
  "......WWWW..NNNSSSSS..WWWW......",
  "......WWWW..nSSSSSSS..WWWW......",
  "......WWWW...SSSSSSSs.WWWW......",
  "......WWWW....SSSSSSS.WWWW......",
  "......WWWW.....sSSSSS.WWWW......",
  "......WWWW......sSSSS.WWWW......",
  "......WWWW........SSSsWWWW......",
  "......WWWW.........SSSWWWW......",
  "......WWWW..........SSWWWW......",
  "......WWWW...........SWWWW......",
  "................................",
  "................................",
  "................................",
  "................................",
  "................................",
  "................................",
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


// ---- Favicon pixels ----
/** Flatten an absolute M/H/V/C/Z path (the tile) into a polygon. */
function flatten(d) {
  const pts = [];
  let cur = [0, 0];
  const re = /([MHVCZ])([^MHVCZ]*)/g;
  for (const [, cmd, args] of d.matchAll(re)) {
    const v = args.trim() ? args.trim().split(/[ ,]+/).map(Number) : [];
    if (cmd === "M") pts.push((cur = [v[0], v[1]]));
    else if (cmd === "H") pts.push((cur = [v[0], cur[1]]));
    else if (cmd === "V") pts.push((cur = [cur[0], v[0]]));
    else if (cmd === "C") {
      const [x1, y1, x2, y2, x, y] = v, [x0, y0] = cur;
      for (let i = 1; i <= 16; i++) {
        const t = i / 16, m = 1 - t;
        pts.push([m ** 3 * x0 + 3 * m * m * t * x1 + 3 * m * t * t * x2 + t ** 3 * x, m ** 3 * y0 + 3 * m * m * t * y1 + 3 * m * t * t * y2 + t ** 3 * y]);
      }
      cur = [x, y];
    }
  }
  return pts;
}
const inside = (x, y, poly) => {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
};
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const mix = (a, b, t) => a.map((v, i) => Math.round(v * (1 - t) + b[i] * t));
/** RGBA pixels for a hand-set favicon map. */
function favicon(map) {
  const size = map.length, k = 64 / size, SS = 8, tile = flatten(TILE_PATH);
  const ink = hex(INK), white = hex(WHITE), north = hex(FAVICON_NORTH);
  const colour = { W: white, S: white, N: north, n: mix(ink, north, 0.5), s: mix(ink, white, 0.5), ".": ink };
  const px = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      let cov = 0;
      for (let a = 0; a < SS; a++) for (let b = 0; b < SS; b++) cov += inside((x + (a + 0.5) / SS) * k, (y + (b + 0.5) / SS) * k, tile);
      const c = colour[map[y][x]], i = (y * size + x) * 4;
      [px[i], px[i + 1], px[i + 2]] = c;
      px[i + 3] = Math.round((cov / (SS * SS)) * 255);
    }
  return px;
}

// ---- Brand sheet (for the owner; not used by the app). Its labels load IBM Plex Sans from Google Fonts when online
// and fall back to the system face offline; the logo and icons in it are the generated files. ----
function sheetHtml(fav16, fav32) {
  const enc = (s) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(s)}`;
  const img = (s, w, h = w) => `<img src="${enc(s)}" width="${r3(w)}" height="${r3(h)}">`;
  const png = (b, w) => `<img class="px" src="data:image/png;base64,${b.toString("base64")}" width="${w}" height="${w}">`;
  const logoH = (k, h) => img(FILES[k], (LOCKUP_W / 64) * h, h);
  const sw = (hexv, name, use, line) =>
    `<div class="sw"><div style="background:${hexv};${line ? `box-shadow:inset 0 0 0 1px ${RULE}` : ""}"></div><b>${name}</b><span>${hexv}</span><span>${use}</span></div>`;
  const nd = needle(0);
  const construction = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-6 -6 76 76">
    <path d="${TILE_PATH}" fill="${INK}"/>
    <rect width="64" height="64" rx="14.4" fill="none" stroke="${ELECTRIC}" stroke-opacity=".55" stroke-width=".25" stroke-dasharray="1 .8"/>
    <g stroke="${ELECTRIC}" stroke-opacity=".3" stroke-width=".2">${Array.from({ length: 9 }, (_, i) => `<path d="M${i * 8} 0V64M0 ${i * 8}H64"/>`).join("")}</g>
    <g fill="none" stroke="${WHITE}" stroke-width=".45"><path d="${STEMS}"/><path d="${nd.north}"/><path d="${nd.south}"/><circle cx="32" cy="32" r="${GEOM.pivot}"/></g>
    <path d="M14.3 8.2 49.7 55.8" stroke="${ELECTRIC}" stroke-width=".35" stroke-dasharray="1.2 1"/>
    <g fill="${ELECTRIC}"><circle cx="20" cy="12" r=".7"/><circle cx="44" cy="52" r=".7"/></g>
    <g font-family="IBM Plex Sans, system-ui" font-size="2.6" fill="${ELECTRIC}"><text x="-5" y="-2">8-unit grid</text></g></svg>`;
  const clear = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-20 -20 ${LOCKUP_W + 40} 104">
    <rect x="-16" y="-16" width="${LOCKUP_W + 32}" height="96" fill="none" stroke="${ELECTRIC}" stroke-width=".6" stroke-dasharray="2 1.5"/>
    <rect x="-16" y="-16" width="16" height="16" fill="${ELECTRIC}" fill-opacity=".18"/>
    <path d="M${64 + GAP + 0.01} ${BASELINE}H${LOCKUP_W}M${64 + GAP} ${BASELINE - CAP}H${LOCKUP_W}" stroke="${ELECTRIC}" stroke-width=".35"/>
    ${markTile()}${wordPath(INK)}</svg>`;
  const ios = (s) => `<div class="ios">${img(s, 116)}</div>`;
  const tab = (bg, fg) =>
    `<div class="tab" style="background:${bg};color:${fg}">${png(fav16, 16)}<span>Northpin</span></div>`;
  return `<!doctype html><html><head><meta charset="utf-8">
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wdth,wght@75..100,400..700&display=block">
  <style>
  *{box-sizing:border-box;margin:0}
  body{width:1600px;background:${PAPER};color:${INK};font:15px/1.45 "IBM Plex Sans",system-ui,sans-serif;padding:56px}
  h2{font-size:15px;font-weight:600;margin:0 0 16px}
  .grid{display:grid;gap:24px;margin-top:24px}
  .panel{background:#fff;border:1px solid ${RULE};border-radius:4px;padding:28px}
  .ink{background:${INK};color:#fff;border-color:${INK}}
  .row{display:flex;gap:24px;align-items:center;flex-wrap:wrap}
  .cap{font-size:13px;color:${PENCIL};margin-top:14px;max-width:46em}
  .ink .cap,.ink .lede{color:#A9BCD4}
  .sw{display:grid;gap:2px;width:128px;font-size:13px}.sw div{height:56px;border-radius:4px;margin-bottom:6px}.sw span{color:${PENCIL}}
  .ios{width:116px;height:116px;border-radius:26px;overflow:hidden}
  .mask{width:116px;height:116px;border-radius:50%;overflow:hidden}
  .px{image-rendering:pixelated}
  .tab{display:flex;align-items:center;gap:8px;padding:8px 14px;border-radius:8px 8px 0 0;font:13px system-ui;width:170px}
  .disp{font-weight:700;font-stretch:75%;font-size:44px;line-height:1;letter-spacing:-.01em}
  .num{font-variant-numeric:tabular-nums}
  </style></head><body>
  <div class="grid" style="grid-template-columns:1.2fr 1fr;margin-top:0">
    <div class="panel ink" style="display:flex;flex-direction:column;justify-content:space-between;gap:40px">
      ${logoH("public/brand/northpin-logo-on-dark.svg", 104)}
      <div><p style="font-size:34px;font-weight:700;font-stretch:75%;line-height:1.1;max-width:18em;margin-bottom:12px">An N drawn with two walls and a compass needle.</p>
      <p class="lede" style="max-width:36em">The north half points up the sheet; the south half is the pin that marks the spot, and the pivot is its head. The walls are solid like the poché on a plan; the needle's tips meet their inside corners.</p></div>
    </div>
    <div class="panel"><h2>Construction</h2>${img(construction, 330)}
      <p class="cap">64-unit grid, 8-unit module. Walls 8 × 40. Needle 15.2 wide at the pivot, tips 0.5 past the walls' inside corners (hidden under the walls). Seam 0.9, pivot r 2.4. Continuous-corner tile, radius 14.4 (dashed: the plain rounded square it replaces).</p></div>
  </div>
  <div class="grid" style="grid-template-columns:1fr 1fr">
    <div class="panel"><h2>Logo</h2>
      ${logoH("public/brand/northpin-logo.svg", 76)}
      <div class="row" style="margin-top:28px">${logoH("public/brand/northpin-logo-mono.svg", 40)}
        <div style="background:${INK};padding:14px 18px;border-radius:4px">${logoH("public/brand/northpin-logo-white.svg", 40)}</div>
        <div style="background:${ACTION};padding:14px 18px;border-radius:4px">${logoH("public/brand/northpin-logo-white.svg", 40)}</div></div>
      <div class="row" style="margin-top:22px">${logoH("public/brand/northpin-logo.svg", 24)}<span class="cap" style="margin:0">Smallest lockup: 24 px tall.</span></div>
      <p class="cap">Full colour on paper and white, the on-dark version on ink, one colour (ink or white, the N cut out of the tile) everywhere else.</p></div>
    <div class="panel"><h2>Clear space and proportion</h2>${img(clear, (LOCKUP_W + 40) * 2.1, 104 * 2.1)}
      <p class="cap">Keep a quarter of the tile clear on every side. The name's caps are 30/64 of the tile, baseline at 46.5, 15 units after the tile. IBM Plex Sans, width 75 (Condensed), weight 700, kerned by hand.</p></div>
  </div>
  <div class="grid" style="grid-template-columns:1.25fr 1fr">
    <div class="panel"><h2>App icons</h2><div class="row">
      ${ios(RASTERS[4].svg)}${ios(RASTERS[5].svg)}${ios(RASTERS[6].svg)}<div class="mask">${img(RASTERS[2].svg, 116)}</div>
      <div style="background:${INK};padding:14px;border-radius:6px">${img(FILES["public/brand/northpin-mark-on-dark.svg"], 72)}</div></div>
      <p class="cap">iOS light, dark and tinted (iOS applies its own rounding), the maskable PWA icon in a circle crop, and the tile on ink.</p></div>
    <div class="panel"><h2>Favicons, set by hand</h2><div class="row">
      ${png(fav16, 128)}${png(fav32, 128)}
      <div style="display:grid;gap:10px">${tab("#FFFFFF", INK)}${tab("#DEE1E6", INK)}${tab("#202124", "#E8EAED")}<div class="row" style="gap:10px">${png(fav16, 16)}${png(fav32, 32)}</div></div></div>
      <p class="cap">16 and 32 px enlarged, then in light, grey and dark browser tabs and at actual size.</p></div>
  </div>
  <div class="grid" style="grid-template-columns:1.45fr 1fr">
    <div class="panel"><h2>Colour (Blueprint Ink)</h2><div class="row" style="align-items:flex-start;flex-wrap:nowrap;gap:16px">
      ${sw(INK, "Ink", "tile, walls on white, name")}${sw(ELECTRIC, "Electric", "north half on ink")}${sw(WHITE, "White", "walls and south half on ink", true)}${sw(ACTION, "Action blue", "north half on the white tile")}${sw(FAVICON_NORTH, "Favicon blue", "north half at 16 and 32 px")}</div></div>
    <div class="panel"><h2>Type</h2>
      <div class="disp">Plans to quotes, планы в сметы</div>
      <p style="margin-top:10px;max-width:36em">IBM Plex Sans for the name, the site and the app: Condensed (width 75, 600–700) for headlines, normal width for text, tabular figures by default, full Cyrillic.</p>
      <p class="num" style="margin-top:10px;font-weight:600">1,596.00 · 10,260.00 · 1 234 567,90 ₽</p></div>
  </div>
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
  for (const r of RASTERS) writeFileSync(out(r.file), encodePng(await rasterise(page, r.svg, r.size), r.size, r.opaque));
  const fav16 = encodePng(favicon(FAVICON_16), 16), fav32 = encodePng(favicon(FAVICON_32), 32);
  writeFileSync(out("public/favicon-16.png"), fav16);
  writeFileSync(out("public/favicon-32.png"), fav32);
  const ico = [
    { size: 16, png: fav16 },
    { size: 32, png: fav32 },
    { size: 48, png: encodePng(await rasterise(page, TILE, 48), 48) },
  ];
  writeFileSync(out("public/favicon.ico"), encodeIco(ico));
  if (!process.argv.includes("--no-sheet")) {
    const sheet = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
    await sheet.setContent(sheetHtml(fav16, fav32), { waitUntil: "networkidle" }).catch(() => {});
    await sheet.evaluate(() => document.fonts.ready);
    await sheet.screenshot({ path: out("public/brand/northpin-brand-sheet.png"), fullPage: true });
  }
  await browser.close();
  console.log(`brand-icons: ${Object.keys(FILES).length} vector/source files, ${RASTERS.length + 3} raster files written`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
