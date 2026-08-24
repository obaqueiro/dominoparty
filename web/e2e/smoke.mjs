// Browser smoke test: needs the server running with built static files.
// Usage: DP_URL=http://localhost:3000 npm run e2e
const BASE = process.env.DP_URL ?? 'http://localhost:3000';
import { chromium } from 'playwright';

const browser = await chromium.launch({ args: ['--no-sandbox'] });
const errors = [];
const room = 'smoke-' + Date.now();

async function mk(name, viewport) {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
  page.on('dialog', (d) => d.accept());
  await page.goto(BASE + '/');
  await page.fill('#player-name', name);
  await page.fill('#room-code', room);
  await page.click('#join-btn');
  await page.waitForSelector('#stage canvas');
  return page;
}

// Read all tiles' state from the page's Y.Doc (exposed as window.__doc for e2e).
const readTiles = (page) =>
  page.evaluate(() => {
    const out = {};
    for (const [name, t] of window.__doc.getMap('tiles').entries()) {
      out[name] = { x: t.get('x'), y: t.get('y'), rotation: t.get('rotation'), owner: t.get('owner') };
    }
    return out;
  });

// --- Desktop flow ---
const alice = await mk('Alice', { width: 1200, height: 800 });
await alice.click('#menu-btn');
await alice.click('[data-setup="9"]');
await alice.waitForTimeout(400);

const bob = await mk('Bob', { width: 1200, height: 800 });
await bob.waitForTimeout(600);

const canvas = await alice.locator('#stage canvas').boundingBox();

// Board is auto-fitted; pick the first grid tile by tapping near its known world pos.
// World (60,60) maps through the fitted camera; instead click center-ish tile by probing:
// select a tile: tap at grid area. Tiles at world y=60 row; camera fit places grid top-left near screen top-left.
// Tap a mid-grid tile to select it, then drag its rotate knob in an arc.
const sx = canvas.x + 200, sy = canvas.y + 300;
await alice.mouse.click(sx, sy);
await alice.waitForTimeout(200);
const knob = await alice.evaluate(() => {
  const k = window.__game.selected?.rotateKnob?.getGlobalPosition();
  return k && { x: k.x, y: k.y };
});
if (!knob) { console.error('FAIL: no selection/knob'); process.exit(1); }
const center = await alice.evaluate(() => {
  const s = window.__game.selected;
  const p = s.parent.toGlobal(s.position);
  return { x: p.x, y: p.y };
});
await alice.mouse.move(canvas.x + knob.x, canvas.y + knob.y);
await alice.mouse.down();
// Arc ~90° clockwise around the tile center.
const r = Math.hypot(knob.x - center.x, knob.y - center.y);
for (let a = -90; a <= 0; a += 10) {
  const rad = (a * Math.PI) / 180;
  await alice.mouse.move(canvas.x + center.x + r * Math.cos(rad), canvas.y + center.y + r * Math.sin(rad));
}
await alice.mouse.up();
await alice.waitForTimeout(400);
await alice.screenshot({ path: '/tmp/smoke-rotate-alice.png' });
await bob.screenshot({ path: '/tmp/smoke-rotate-bob.png' });

// Assert some tile rotated and Bob converged to the same rotations.
const tilesA = await readTiles(alice);
const tilesB = await readTiles(bob);
const rotated = Object.entries(tilesA).filter(([, t]) => (t.rotation ?? 0) % 360 !== 0);
if (rotated.length === 0) { console.error('FAIL: no tile rotated'); process.exit(1); }
for (const [name, t] of rotated) {
  if (Math.round(tilesB[name].rotation) !== Math.round(t.rotation)) {
    console.error('FAIL: rotation not synced for', name); process.exit(1);
  }
}
console.log('rotated:', rotated.map(([n, t]) => `${n}@${t.rotation.toFixed(1)}°`).join(' '));

// Drag another tile into the hand.
const tx = canvas.x + 150, ty = canvas.y + 80;
await alice.mouse.move(tx, ty);
await alice.mouse.down();
await alice.mouse.move(canvas.x + 400, canvas.y + canvas.height - 40, { steps: 15 });
await alice.mouse.up();
await alice.waitForTimeout(400);
await alice.screenshot({ path: '/tmp/smoke-hand-alice.png' });
const owned = Object.values(await readTiles(bob)).filter((t) => t.owner != null).length;
if (owned !== 1) { console.error('FAIL: expected 1 owned tile, got', owned); process.exit(1); }
console.log('hand draw synced');

// --- Mobile flow (iPhone SE) ---
const carol = await mk('Carol', { width: 375, height: 667 });
await carol.waitForTimeout(600);
// Toolbar single row & menu works
await carol.click('#menu-btn');
await carol.waitForSelector('#shuffle-btn:visible');
await carol.screenshot({ path: '/tmp/smoke-mobile-menu.png' });
await carol.click('#shuffle-btn');
await carol.waitForTimeout(500);
// Collapse the hand via tab (tap tab center at panel top edge)
const mc = await carol.locator('#stage canvas').boundingBox();
const vp = carol.viewportSize();
await carol.mouse.click(vp.width / 2, vp.height - 120 - 15); // tab center when expanded (panelH min(120,22vh)=120? 22vh=146 -> 120)
await carol.waitForTimeout(400);
await carol.screenshot({ path: '/tmp/smoke-mobile-collapsed.png' });
await carol.mouse.click(vp.width / 2, vp.height - 15); // re-expand via tab at bottom
await carol.waitForTimeout(400);
await carol.screenshot({ path: '/tmp/smoke-mobile.png' });

console.log('errors:', errors);
await browser.close();
process.exit(errors.length ? 1 : 0);
