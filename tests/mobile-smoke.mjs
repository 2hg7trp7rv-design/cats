import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';

const out = 'test-results';
await mkdir(out, { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  screen: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  locale: 'ja-JP',
  timezoneId: 'Asia/Tokyo',
});
const page = await context.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text());
});

const response = await page.goto('http://127.0.0.1:4173/', {
  waitUntil: 'networkidle',
  timeout: 30000,
});
assert(response?.ok(), `HTTP ${response?.status()}`);
assert.equal(await page.title(), "Cat's tower");
assert(await page.locator('#startBtn').isVisible());
await page.screenshot({ path: `${out}/01-title.png`, fullPage: true });

await page.locator('#startBtn').tap();
await page.locator('#game:not(.hidden)').waitFor({ state: 'visible' });
await page.waitForTimeout(600);
const initialFloors = await page.locator('.floor').count();
assert(initialFloors >= 3);
await page.screenshot({ path: `${out}/02-tower.png`, fullPage: true });

const intro = page.locator('[data-a="intro"]');
if (await intro.count()) await intro.tap();
const coachClose = page.locator('[data-a="coach-close"]');
if (await coachClose.count()) await coachClose.tap();
const collect = page.locator('[data-a="collect"]').first();
if (await collect.count()) await collect.tap();

await page.locator('[data-nav="build"]').tap();
await page.locator('.sheet').waitFor({ state: 'visible' });
const choice = page.locator('.sheet [data-a="build"]:not([disabled])').first();
assert(await choice.count());
await choice.tap();
await page.waitForTimeout(500);
const builtFloors = await page.locator('.floor').count();
assert.equal(builtFloors, initialFloors + 1);
await page.screenshot({ path: `${out}/03-after-build.png`, fullPage: true });

const save = await page.evaluate(() => localStorage.getItem('cats-tower-v01'));
assert(save);
assert.equal(JSON.parse(save).floors.length, builtFloors);

await page.reload({ waitUntil: 'networkidle' });
await page.locator('#startBtn').tap();
await page.locator('#game:not(.hidden)').waitFor({ state: 'visible' });
await page.waitForTimeout(400);
assert.equal(await page.locator('.floor').count(), builtFloors);
await page.screenshot({ path: `${out}/04-after-reload.png`, fullPage: true });

const state = await page.evaluate(() => window.__CATS_TEST_API__?.getState?.());
assert(state);
assert(state.cats.some((cat) => cat.id === 'mugi'));
assert.deepEqual(errors, []);

await writeFile(`${out}/report.json`, JSON.stringify({
  passed: true,
  testedAt: new Date().toISOString(),
  engine: 'Chromium via Playwright',
  viewport: { width: 390, height: 844, deviceScaleFactor: 3 },
  initialFloors,
  builtFloors,
  errors,
}, null, 2));
await browser.close();
console.log("Cat's tower mobile smoke test passed");
