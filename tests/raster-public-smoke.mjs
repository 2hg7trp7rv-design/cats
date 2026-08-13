import { chromium, webkit } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';

const browserName = process.env.CATS_BROWSER || 'chromium';
const targetUrl = process.env.CATS_TEST_URL || 'https://cats-tau-dusky.vercel.app';
const out = process.env.CATS_TEST_OUT || `test-results/${browserName}-raster`;
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
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
});
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });

const response = await page.goto(targetUrl, { waitUntil: 'networkidle', timeout: 60000 });
assert(response?.ok(), `HTTP ${response?.status()} at ${targetUrl}`);
await page.locator('#startBtn').waitFor({ state: 'visible', timeout: 30000 });
await page.locator('#splashCat img.catSprite').waitFor({ state: 'visible', timeout: 30000 });
await page.waitForFunction(() => document.querySelector('#splashCat img')?.naturalWidth > 0, null, { timeout: 30000 });
const titleBackground = await page.locator('#splash').evaluate(node => getComputedStyle(node).backgroundImage);
assert.match(titleBackground, /title-hero\.webp/);
await page.screenshot({ path: `${out}/01-raster-title.png`, fullPage: true });

await page.locator('#startBtn').tap();
await page.locator('#game:not(.hidden)').waitFor({ state: 'visible', timeout: 15000 });
const intro = page.locator('[data-a="intro"]');
if (await intro.count()) await intro.tap();
const coachClose = page.locator('[data-a="coach-close"]');
if (await coachClose.count()) await coachClose.tap();
await page.locator('.cat img.catSprite').first().waitFor({ state: 'visible', timeout: 30000 });
await page.waitForFunction(() => [...document.querySelectorAll('.cat img.catSprite')].every(img => img.complete && img.naturalWidth > 0), null, { timeout: 30000 });
const foodBackground = await page.locator('.floor.food').evaluate(node => getComputedStyle(node).backgroundImage);
assert.match(foodBackground, /room-food\.webp/);
await page.screenshot({ path: `${out}/02-raster-tower.png`, fullPage: true });

const battleCall = page.locator('#battleCall:not(.hidden)');
await battleCall.waitFor({ state: 'visible', timeout: 15000 });
await battleCall.tap();
await page.locator('.enemy img').waitFor({ state: 'visible', timeout: 15000 });
await page.waitForFunction(() => document.querySelector('.enemy img')?.naturalWidth > 0, null, { timeout: 30000 });
const enemySource = await page.locator('.enemy img').getAttribute('src');
assert.match(enemySource || '', /assets\/illustrations\/enemy-/);
await page.screenshot({ path: `${out}/03-raster-enemy.png`, fullPage: true });
assert.deepEqual(errors, []);

await writeFile(`${out}/report.json`, JSON.stringify({
  passed: true,
  testedAt: new Date().toISOString(),
  targetUrl,
  browserName,
  titleBackground,
  foodBackground,
  enemySource,
  errors,
}, null, 2));
await browser.close();
console.log(`Raster illustration public test passed in ${browserName}: ${targetUrl}`);
