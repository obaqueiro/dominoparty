// Browser smoke test: needs the server running with built static files.
// Usage: DP_URL=http://localhost:3000 npm run e2e
const BASE = process.env.DP_URL ?? 'http://localhost:3000';
import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--no-sandbox'] });
const errors = [];
async function mk(name, room) {
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 800 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
  page.on('dialog', (d) => d.accept());
  await page.goto(BASE + '/');
  await page.fill('#player-name', name);
  await page.fill('#room-code', 'smoke-' + room);
  await page.click('#join-btn');
  await page.waitForSelector('#stage canvas');
  return page;
}
const room = Date.now();
const alice = await mk('Alice', room);
await alice.click('[data-setup="9"]');
await alice.waitForTimeout(400);
const bob = await mk('Bob', room);
await bob.waitForTimeout(600);

// Alice drags the tile at grid slot 0 (world 60,60 → screen ~60, 60+toolbar? canvas offset)
const canvas = await alice.locator('#stage canvas').boundingBox();
const sx = canvas.x + 60, sy = canvas.y + 60;
await alice.mouse.move(sx, sy);
await alice.mouse.down();
await alice.mouse.move(sx + 300, sy + 400, { steps: 15 });
await alice.mouse.up();
await alice.waitForTimeout(500);
await bob.screenshot({ path: '/tmp/smoke-drag-bob.png' });

// Alice drags a tile into her hand (bottom panel)
await alice.mouse.move(sx + 300, sy + 400);
await alice.mouse.down();
await alice.mouse.move(canvas.x + 400, canvas.y + canvas.height - 60, { steps: 15 });
await alice.mouse.up();
await alice.waitForTimeout(500);
await alice.screenshot({ path: '/tmp/smoke-hand-alice.png' });
await bob.screenshot({ path: '/tmp/smoke-hand-bob.png' });
console.log('errors:', errors);
await browser.close();
process.exit(errors.length ? 1 : 0);
