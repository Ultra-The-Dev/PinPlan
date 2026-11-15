// Generates a synthetic 4-sheet plan set (not a real client job) for testing.
// Usage: node scripts/make-sample-plans.cjs samples/demo-plan-set.pdf
const { chromium } = require("playwright");
const floors = [["ATTIC", "A-101"], ["1ST. FL", "A-102"], ["2ND. FL", "A-103"], ["CELLAR", "A-104"]];
const sheet = ([name, no], i) => `
<section style="page-break-after:always;position:relative;width:16in;height:10in;border:2px solid #000;box-sizing:border-box;font-family:Arial">
  <svg width="13.5in" height="9.4in" viewBox="0 0 1300 900" style="position:absolute;left:0.3in;top:0.3in">
    <rect x="50" y="50" width="1200" height="800" fill="none" stroke="#000" stroke-width="8"/>
    <line x1="500" y1="50" x2="500" y2="500" stroke="#000" stroke-width="5"/>
    <line x1="50" y1="500" x2="900" y2="500" stroke="#000" stroke-width="5"/>
    <line x1="900" y1="300" x2="900" y2="850" stroke="#000" stroke-width="5"/>
    <text x="250" y="280" font-size="22">LIVING</text><text x="700" y="280" font-size="22">KITCHEN</text>
    <text x="400" y="700" font-size="22">${i === 3 ? "AV EQUIPMENT" : "BEDROOM"}</text><text x="1000" y="600" font-size="22">STAIR</text>
    <line x1="50" y1="880" x2="290" y2="880" stroke="#000" stroke-width="3"/><text x="300" y="886" font-size="18">20'-0"</text>
    <text x="560" y="120" fill="red" font-size="20">S21,22,23  24 LF</text>
  </svg>
  <div style="position:absolute;right:0.2in;bottom:0.2in;width:2in;border:2px solid #000;padding:8px">
    <div style="font-size:11px">12 MAPLE RIDGE RD (DEMO)</div>
    <div style="font-size:12px">LED BACKLIT STRIPS (AMBIENT LIGHT)</div>
    <div style="font-size:28px;font-weight:bold">${name}</div>
    <div>${no} · SCALE 1/8" = 1'-0"</div>
  </div>
</section>`;
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  await p.setContent(`<html><body style="margin:0">${floors.map(sheet).join("")}</body></html>`);
  await p.pdf({ path: process.argv[2], width: "16in", height: "10in", printBackground: true });
  await b.close();
})();
