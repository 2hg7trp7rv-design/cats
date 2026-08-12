import { chromium, webkit } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';

const browserName = process.env.CATS_BROWSER || 'chromium';
const targetUrl = process.env.CATS_TEST_URL || 'http://127.0.0.1:4173/';
const out = process.env.CATS_TEST_OUT || `test-results/${browserName}-battle`;
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

const now = Date.now();
const seededState = {
  version: '0.2.0',
  coins: 20,
  parts: 0,
  floors: [
    { id: 'lobby-1', number: 1, type: 'lobby', level: 1, cats: [], stock: 0, pending: 0, buildStart: 0, buildEnd: 0, orderState: 'idle', orderStart: 0, orderEnd: 0, nextSale: now + 600000 },
    { id: 'home-2', number: 2, type: 'home', level: 1, cats: [], stock: 0, pending: 0, buildStart: 0, buildEnd: 0, orderState: 'idle', orderStart: 0, orderEnd: 0, nextSale: now + 600000 },
    { id: 'food-3', number: 3, type: 'food', level: 1, cats: ['mugi'], stock: 60, pending: 0, buildStart: 0, buildEnd: 0, orderState: 'idle', orderStart: 0, orderEnd: 0, nextSale: now + 600000 },
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

await page.addInitScript(
  ({ key, state }) => localStorage.setItem(key, JSON.stringify(state)),
  { key: 'cats-tower-v01', state: seededState },
);

const response = await page.goto(targetUrl, { waitUntil: 'networkidle', timeout: 45000 });
assert(response?.ok(), `HTTP ${response?.status()} at ${targetUrl}`);
await page.locator('#startBtn').waitFor({ state: 'visible', timeout: 15000 });
await page.locator('#startBtn').tap();
await page.locator('#game:not(.hidden)').waitFor({ state: 'visible', timeout: 10000 });
await page.waitForTimeout(700);
await page.evaluate(() => document.querySelector('#coach')?.replaceChildren());

assert.equal(await page.locator('.floor').count(), 3, 'Prepared tower was not loaded');
const preparedState = await page.evaluate(() => window.__CATS_TEST_API__.getState());
assert.equal(preparedState.floors.filter((floor) => floor.cats.length && floor.stock > 0).length, 1);

const battleCall = page.locator('#battleCall:not(.hidden)');
await battleCall.waitFor({ state: 'visible', timeout: 7000 });
await page.screenshot({ path: `${out}/01-defense-ready.png`, fullPage: true });
await battleCall.tap();

await page.locator('#battleNav:not(.hidden)').waitFor({ state: 'visible', timeout: 4000 });
await page.locator('.enemy').waitFor({ state: 'visible', timeout: 2000 });
assert.equal((await page.locator('.enemyTag').textContent())?.trim(), 'INTRUDER');
const enemyFloorNumber = await page.locator('.enemy').evaluate((enemy) => enemy.closest('.floor')?.dataset.no);
assert.equal(enemyFloorNumber, '1', 'First enemy did not appear on 1F');
await page.screenshot({ path: `${out}/02-enemy-visible.png`, fullPage: true });

await page.locator('[data-tool="static"]').tap();
const energyBefore = Number(await page.locator('#energy').textContent());
const hpBefore = await page.locator('.enemy .hp i').evaluate((node) => Number.parseFloat(node.style.width));
await page.locator('.floor[data-no="1"]').evaluate((node) => node.click());
await page.waitForTimeout(350);
const energyAfterTool = Number(await page.locator('#energy').textContent());
const hpWidth = await page.locator('.enemy .hp i').evaluate((node) => Number.parseFloat(node.style.width));
assert(energyAfterTool < energyBefore, `Tool did not consume energy: ${energyBefore} -> ${energyAfterTool}`);
assert(hpWidth < hpBefore, `Tool did not damage the enemy: ${hpBefore}% -> ${hpWidth}%`);
await page.screenshot({ path: `${out}/03-tool-used.png`, fullPage: true });

await page.locator('#pauseBtn').tap();
await page.locator('.pause').waitFor({ state: 'visible', timeout: 5000 });
await page.locator('[data-a="resume"]').tap();
await page.locator('.pause').waitFor({ state: 'detached', timeout: 5000 });
await page.locator('#pauseBtn').tap();
await page.locator('.pause').waitFor({ state: 'visible', timeout: 5000 });
await page.locator('[data-a="retreat"]').tap();
await page.locator('#battleNav.hidden').waitFor({ state: 'attached', timeout: 5000 });
await page.waitForTimeout(300);

const finalState = await page.evaluate(() => window.__CATS_TEST_API__.getState());
assert.equal(finalState.battle, null);
assert.equal(await page.locator('.enemy').count(), 0);
assert.deepEqual(errors, []);
await page.screenshot({ path: `${out}/04-after-retreat.png`, fullPage: true });

await writeFile(`${out}/report.json`, JSON.stringify({
  passed: true,
  testedAt: new Date().toISOString(),
  targetUrl,
  browserName,
  viewport: { width: 390, height: 844, deviceScaleFactor: 3 },
  readyShops: 1,
  enemyFloorNumber: Number(enemyFloorNumber),
  energyBefore,
  energyAfterTool,
  hpBefore,
  hpWidth,
  pausedAndResumed: true,
  retreated: true,
  errors,
}, null, 2));

await browser.close();
console.log(`Cat's tower battle V0.2 test passed in ${browserName}: ${targetUrl}`);
