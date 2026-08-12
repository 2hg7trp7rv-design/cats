import { chromium, webkit } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';

const browserName = process.env.CATS_BROWSER || 'chromium';
const targetUrl = process.env.CATS_TEST_URL || 'http://127.0.0.1:4173/';
const out = process.env.CATS_TEST_OUT || `test-results/${browserName}`;
const browserType = { chromium, webkit }[browserName];
assert(browserType, `Unsupported browser: ${browserName}`);
await mkdir(out, { recursive: true });

const browser = await browserType.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  screen: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  locale: 'ja-JP',
  timezoneId: 'Asia/Tokyo',
  userAgent:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
});
const page = await context.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text());
});

const response = await page.goto(targetUrl, {
  waitUntil: 'networkidle',
  timeout: 45000,
});
assert(response?.ok(), `HTTP ${response?.status()} at ${targetUrl}`);
assert.equal(await page.title(), "Cat's tower");
await page.locator('#startBtn').waitFor({ state: 'visible', timeout: 15000 });
await page.screenshot({ path: `${out}/01-title.png`, fullPage: true });

await page.locator('#startBtn').tap();
await page.locator('#game:not(.hidden)').waitFor({ state: 'visible', timeout: 10000 });
await page.waitForTimeout(600);
const initialFloors = await page.locator('.floor').count();
assert(initialFloors >= 3);
await page.screenshot({ path: `${out}/02-tower.png`, fullPage: true });

const intro = page.locator('[data-a="intro"]');
if (await intro.count()) await intro.tap();
const coachClose = page.locator('[data-a="coach-close"]');
if (await coachClose.count()) await coachClose.tap();

await page.locator('[data-nav="build"]').tap();
await page.locator('.sheet').waitFor({ state: 'visible', timeout: 7000 });
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

await page.reload({ waitUntil: 'networkidle', timeout: 45000 });
await page.locator('#startBtn').waitFor({ state: 'visible', timeout: 15000 });
await page.locator('#startBtn').tap();
await page.locator('#game:not(.hidden)').waitFor({ state: 'visible', timeout: 10000 });
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
  targetUrl,
  browserName,
  viewport: { width: 390, height: 844, deviceScaleFactor: 3 },
  initialFloors,
  builtFloors,
  errors,
}, null, 2));
await browser.close();
console.log(`Cat's tower mobile smoke test passed in ${browserName}: ${targetUrl}`);
