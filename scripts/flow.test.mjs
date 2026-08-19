/**
 * Drives the real app in a browser: import -> see -> do -> fall behind -> replan.
 * Needs `npm run dev` running, plus Chrome (override with CHROME=/path/to/binary).
 *
 *   npm run test:e2e
 */
import { chromium } from 'playwright-core';

const BASE = process.env.BASE ?? 'http://localhost:5173/';
const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const b = await chromium.launch({ executablePath: CHROME });
const page = await b.newPage({ viewport: { width: 1440, height: 1000 } });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
let failed = 0;
const ok = (l, c) => { if (!c) failed++; console.log(`${c ? '  ok  ' : ' FAIL '} ${l}`); };

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.getByRole('button', { name: /sample semester/i }).click();
await page.waitForSelector('.narrow');

const S = () => page.evaluate(() => JSON.parse(localStorage['station.v1']).state);
let s = await S();
ok(`demo imported (${s.items.length} items, ${s.blocks.length} blocks)`, s.items.length > 30 && s.blocks.length > 0);
ok('plan persisted to localStorage', Boolean(s.lastPlan));

// ── Do screen: complete the current block ──────────────────────────────
await page.getByRole('button', { name: /^Do$/ }).click();
await page.waitForSelector('.now-card');
const firstTitle = await page.locator('.now-title').textContent();
const before = await S();
const beforeItem = before.items.find((i) => i.title === firstTitle);

await page.getByRole('button', { name: /^✓?\s*Done$/ }).click();
await page.waitForTimeout(500);
let after = await S();
const afterItem = after.items.find((i) => i.id === beforeItem.id);
ok(`completing a block logs progress (${beforeItem.progressMin} → ${afterItem.progressMin}m)`,
   afterItem.progressMin > beforeItem.progressMin);
ok('a done block is recorded, not deleted',
   after.blocks.some((x) => x.status === 'done'));
ok('the plan advances to a different block',
   (await page.locator('.now-title').textContent()) !== firstTitle ||
   after.blocks.filter((x) => x.status === 'planned').length < before.blocks.filter((x) => x.status === 'planned').length);

// ── Skip pushes work forward instead of dropping it ────────────────────
const skipTitle = await page.locator('.now-title').textContent();
const preSkip = await S();
const preItem = preSkip.items.find((i) => i.title === skipTitle);
const preRemaining = preItem.estimateMin - preItem.progressMin;
await page.getByRole('button', { name: /Skip/ }).click();
await page.waitForTimeout(500);
after = await S();
const postItem = after.items.find((i) => i.id === preItem.id);
ok(`skipping does not lose the work (${preRemaining}m still outstanding)`,
   postItem.estimateMin - postItem.progressMin === preRemaining);
ok('skipped work is rescheduled later',
   after.blocks.some((x) => x.itemId === preItem.id && x.status === 'planned'));

// ── Falling behind: rewind every planned block into the past ───────────
await page.evaluate(() => {
  const raw = JSON.parse(localStorage['station.v1']);
  const shift = 3 * 24 * 3600 * 1000;
  raw.state.blocks = raw.state.blocks.map((b) => ({
    ...b,
    start: new Date(Date.parse(b.start) - shift).toISOString(),
    end: new Date(Date.parse(b.end) - shift).toISOString(),
  }));
  localStorage['station.v1'] = JSON.stringify(raw);
});
await page.reload({ waitUntil: 'networkidle' });
await page.waitForSelector('.now-card, .narrow', { timeout: 10000 });
await page.waitForTimeout(800);
const behind = await S();
ok(`overdue blocks marked missed (${behind.blocks.filter((x) => x.status === 'missed').length})`,
   behind.blocks.filter((x) => x.status === 'missed').length > 0);
ok('a fresh forward plan was built',
   behind.blocks.filter((x) => x.status === 'planned' && Date.parse(x.start) >= Date.now() - 6e4).length > 0);
ok('no planned block is left in the past',
   !behind.blocks.some((x) => x.status === 'planned' && Date.parse(x.end) < Date.now() - 6e4));

// ── Settings feed straight back into the plan ──────────────────────────
await page.locator('button[aria-label="Settings"]').click();
await page.waitForSelector('#s-cap');
const capBefore = (await S()).blocks.filter((x) => x.status === 'planned').length;
await page.locator('#s-cap').fill('60');
await page.locator('#s-cap').blur();
await page.waitForTimeout(600);
const capAfter = (await S()).blocks.filter((x) => x.status === 'planned').length;
ok(`shrinking daily capacity reshapes the plan (${capBefore} → ${capAfter} blocks)`, capAfter !== capBefore);

console.log('page errors:', errs.length ? errs : 'none');
await b.close();
process.exit(failed || errs.length ? 1 : 0);
