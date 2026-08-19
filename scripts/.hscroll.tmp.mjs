import { chromium } from 'playwright-core';
const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const b = await chromium.launch({ executablePath: CHROME });
const page = await b.newPage({ viewport: { width: 1440, height: 1000 } });
await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
await page.getByRole('button', { name: /sample semester/i }).click();
await page.waitForSelector('.work');

const scan = async (label) => {
  await page.waitForTimeout(300);
  const r = await page.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll('*')) {
      const cs = getComputedStyle(el);
      const ex = el.scrollWidth - el.clientWidth;
      if (ex > 0 && cs.overflowX !== 'visible')
        out.push(`${el.className || el.tagName} [ox=${cs.overflowX}] excess=${ex}`);
    }
    return out;
  });
  console.log(label.padEnd(30), r.length ? r : 'clean');
};

await scan('collapsed @1440');
const buttons = await page.locator('.rail button, .rail-toggle, .panel-toggle').allTextContents();
console.log('rail buttons:', buttons);
const ex = page.getByRole('button', { name: /Expand/i });
if (await ex.count()) { await ex.first().click(); await scan('expanded @1440'); }
for (const w of [1280, 1100, 1000, 820]) {
  await page.setViewportSize({ width: w, height: 900 });
  await scan(`expanded @${w}`);
}
await b.close();
