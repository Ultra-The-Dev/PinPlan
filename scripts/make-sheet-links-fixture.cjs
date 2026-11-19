// Writes tests/fixtures/sheet-links.pdf: a 2-sheet electrical set (17×11 in) whose pages reference each other, for the
// sheet index / plan links end-to-end check (scripts/e2e-sheet-links.cjs). Plain PDF with a text layer, no deps.
//
//   node scripts/make-sheet-links-fixture.cjs
const fs = require("node:fs");
const path = require("node:path");

const W = 1224;
const H = 792;

/** [text, x, y-from-top, size] */
const PAGES = [
  [
    ["GENERAL NOTES", 40, 50, 14],
    ["1. ALL WORK PER NEC. SEE RISER ON E-501.", 40, 72, 9],
    ["3", 520, 300, 11],
    ["E-501", 506, 316, 11],
    ["FIRST FLOOR POWER PLAN", 300, 560, 16],
    ["SCALE: 1/4\"=1'-0\"", 300, 578, 9],
    ["PROJECT 2207", 960, 600, 9],
    ["DATE: 11/19/2026", 960, 616, 9],
    ["FIRST FLOOR", 960, 660, 16],
    ["POWER PLAN", 960, 680, 16],
    ["SHEET", 960, 730, 9],
    ["E-101", 1010, 740, 28],
  ],
  [
    ["RISER NOTES", 40, 50, 14],
    ["FEEDERS FROM PANEL LP-1, SEE", 40, 72, 9],
    ["E-101", 206, 72, 9],
    ["SINGLE LINE RISER DIAGRAM", 300, 560, 16],
    ["SCALE: NTS", 300, 578, 9],
    ["DATE: 11/19/2026", 960, 616, 9],
    ["ELECTRICAL", 960, 660, 16],
    ["RISER DIAGRAM", 960, 680, 16],
    ["SHEET", 960, 730, 9],
    ["E-501", 1010, 740, 28],
  ],
];

const esc = (s) => s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
function content(items) {
  const lines = ["0.6 w 20 20 1184 752 re S", "940 20 m 940 772 l S", "940 630 m 1204 630 l S", "940 712 m 1204 712 l S"];
  // A few "walls" so the sheet isn't blank.
  lines.push("120 140 m 880 140 l 880 520 l 120 520 l h S", "400 140 m 400 520 l S", "640 330 m 880 330 l S");
  // Detail bubble around "3 / E-501".
  lines.push("528 470 m 528 490 547 506 528 506 c S");
  for (const [t, x, yTop, size] of items) lines.push(`BT /F1 ${size} Tf ${x} ${H - yTop} Td (${esc(t)}) Tj ET`);
  return lines.join("\n");
}

const objects = [];
const add = (s) => objects.push(s) && objects.length;
const catalog = add("<< /Type /Catalog /Pages 2 0 R >>");
add("PAGES");
const font = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
const kids = [];
for (const items of PAGES) {
  const c = content(items);
  const stream = add(`<< /Length ${Buffer.byteLength(c)} >>\nstream\n${c}\nendstream`);
  kids.push(add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 ${font} 0 R >> >> /Contents ${stream} 0 R >>`));
}
objects[1] = `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(" ")}] /Count ${kids.length} >>`;

let out = "%PDF-1.4\n";
const offsets = [];
objects.forEach((o, i) => {
  offsets.push(Buffer.byteLength(out));
  out += `${i + 1} 0 obj\n${o}\nendobj\n`;
});
const xref = Buffer.byteLength(out);
out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
out += `trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;

const file = path.resolve(__dirname, "../tests/fixtures/sheet-links.pdf");
fs.writeFileSync(file, out);
console.log(`wrote ${file}`);
