import { chromium, webkit } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';

const browserName = process.env.CATS_BROWSER || 'chromium';
const targetUrl = process.env.CATS_TEST_URL || 'http://127.0.0.1:4173/';
const out = process.env.CATS_TEST_OUT || `test-results/${browserName}`;
const browserType = { chromium, webkit }[browserName];
assert(browserType, `Unsupported browser: ${browserName}`);
await mkdir(out, { recursive: true });

const mobile = {
  viewport: { width: 390, height: 844 },
  screen: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  locale: 'ja-JP',
  timezoneId: 'Asia/Tokyo',
  userAgent:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
};

function collectErrors(page) {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  return errors;
}

function zeroState() {
  const now = Date.now();
  return {
    version: '0.2.0',
    coins: 0,
    parts: 0,
    floors: [
      { id: 'lobby-1', number: 1, type: 'lobby', level: 1, cats: [], stock: 0, pending: 0, buildStart: 0, buildEnd: 0, orderState: 'idle', orderStart: 0, orderEnd: 0, nextSale: now + 600000 },
      { id: 'home-2', number: 2, type: 'home', level: 1, cats: [], stock: 0, pending: 0, buildStart: 0, buildEnd: 0, orderState: 'idle', orderStart: 0, orderEnd: 0, nextSale: now + 600000 },
      { id: 'food-3', number: 3, type: 'food', level: 1, cats: ['mugi'], stock: 0, pending: 0, buildStart: 0, buildEnd: 0, orderState: 'idle', orderStart: 0, orderEnd: 0, nextSale: now + 600000 },
    ],
    cats: [{ id: 'mugi', level: 1, xp: 0, mood: 86, floorId: 'food-3', lastPet: 0, unlocked: now }],
    bellAt: now + 600000,
    settings: { sound: false },
    tutorial: true,
    coach: { first: true },
    sales: 0,
    built: 3,
    clears: 0,
    lastBattle: 0,
    lastSeen: now,
    aidAt: now,
    aidTotal: 0,
    created: now,
    battle: null,
  };
}

const browser = await browserType.launch({ headless: true });

// Standard progression and persistence.
const context = await browser.newContext(mobile);
const page = await context.newPage();
const errors = collectErrors(page);
const response = await page.goto(targetUrl, { waitUntil: 'networkidle', timeout: 45000 });
assert(response?.ok(), `HTTP ${response?.status()} at ${targetUrl}`);
assert.equal(await page.title(), "Cat's tower");
await page.locator('#startBtn').waitFor({ state: 'visible', timeout: 15000 });
await page.screenshot({ path: `${out}/01-title.png`, fullPage: true });

await page.locator('#startBtn').tap();
await page.locator('#game:not(.hidden)').waitFor({ state: 'visible', timeout: 10000 });
await page.waitForTimeout(650);
const initialFloors = await page.locator('.floor').count();
assert(initialFloors >= 3);
assert.match((await page.locator('#incomeRate').textContent())?.trim() || '', /\+1\s*\/\s*秒|120で停止/);
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
await page.waitForTimeout(450);
assert.equal(await page.locator('.floor').count(), builtFloors);
await page.screenshot({ path: `${out}/04-after-reload.png`, fullPage: true });
const persisted = await page.evaluate(() => window.__CATS_TEST_API__?.getState?.());
assert(persisted?.cats.some((cat) => cat.id === 'mugi'));
assert.deepEqual(errors, []);
await context.close();

// Hard-lock recovery: zero coins and zero stock must recover without a reset.
const rescue = await browser.newContext(mobile);
const rescuePage = await rescue.newPage();
const rescueErrors = collectErrors(rescuePage);
await rescuePage.addInitScript(
  ({ key, state }) => localStorage.setItem(key, JSON.stringify(state)),
  { key: 'cats-tower-v01', state: zeroState() },
);
const rescueResponse = await rescuePage.goto(targetUrl, { waitUntil: 'networkidle', timeout: 45000 });
assert(rescueResponse?.ok(), `HTTP ${rescueResponse?.status()} at ${targetUrl}`);
assert.equal(await rescuePage.evaluate(() => window.__CATS_TEST_API__.getLiveState().coins), 0);
await rescuePage.locator('#startBtn').tap();
await rescuePage.locator('#game:not(.hidden)').waitFor({ state: 'visible', timeout: 10000 });
await rescuePage.waitForTimeout(500);
const rescueStart = Number((await rescuePage.locator('#coins').textContent())?.replaceAll(',', ''));
await rescuePage.waitForTimeout(3200);
const rescueEnd = Number((await rescuePage.locator('#coins').textContent())?.replaceAll(',', ''));
assert(rescueEnd - rescueStart >= 3, `Passive recovery did not advance: ${rescueStart} -> ${rescueEnd}`);
const rescueState = await rescuePage.evaluate(() => window.__CATS_TEST_API__.getLiveState());
assert(rescueState.aidTotal >= 3);
assert.deepEqual(rescueErrors, []);
await rescuePage.screenshot({ path: `${out}/05-zero-coin-recovery.png`, fullPage: true });
await rescue.close();

await writeFile(`${out}/report.json`, JSON.stringify({
  passed: true,
  testedAt: new Date().toISOString(),
  targetUrl,
  browserName,
  viewport: { width: 390, height: 844, deviceScaleFactor: 3 },
  initialFloors,
  builtFloors,
  rescueStart,
  rescueEnd,
  errors,
  rescueErrors,
}, null, 2));
await browser.close();
console.log(`Cat's tower mobile V0.2 smoke test passed in ${browserName}: ${targetUrl}`);
