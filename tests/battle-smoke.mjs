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
  coins: 3000,
  parts: 0,
  floors: [
    { id: 'lobby-1', number: 1, type: 'lobby', cats: [], stock: 0 },
    { id: 'home-2', number: 2, type: 'home', cats: [], stock: 0 },
    { id: 'food-3', number: 3, type: 'food', cats: ['mugi'], stock: 60, pending: 0 },
    { id: 'play-4', number: 4, type: 'play', cats: ['luna'], stock: 60, pending: 0 },
  ],
  cats: [
    { id: 'mugi', level: 1, xp: 0, mood: 86, floorId: 'food-3', lastPet: 0, unlocked: now },
    { id: 'luna', level: 1, xp: 0, mood: 82, floorId: 'play-4', lastPet: 0, unlocked: now },
  ],
  bellAt: now + 600000,
  settings: { sound: false },
  tutorial: true,
  coach: { battle: true },
  sales: 0,
  built: 4,
  clears: 0,
  lastBattle: 0,
  lastSeen: now,
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

assert.equal(await page.locator('.floor').count(), 4, 'Prepared four-floor tower was not loaded');
const preparedState = await page.evaluate(() => window.__CATS_TEST_API__.getState());
assert.equal(preparedState.floors.filter((floor) => floor.cats.length && floor.stock > 0).length, 2);

const battleControlStarted = await page.evaluate(() => {
  const button = document.querySelector('.floor[data-no="1"] [data-a="battle"]');
  if (!button || button.textContent.includes('準備中')) return false;
  button.scrollIntoView({ block: 'center' });
  button.click();
  return true;
});
assert.equal(battleControlStarted, true, 'Lobby defense control is not ready');

await page.locator('#battleNav:not(.hidden)').waitFor({ state: 'visible', timeout: 7000 });
await page.locator('.enemy').waitFor({ state: 'visible', timeout: 7000 });
await page.screenshot({ path: `${out}/01-battle-start.png`, fullPage: true });

await page.locator('[data-tool="static"]').tap();
const enemyFloorNumber = await page.locator('.enemy').evaluate((enemy) => enemy.closest('.floor')?.dataset.no);
assert(enemyFloorNumber, 'Enemy floor was not found');
await page.locator(`.floor[data-no="${enemyFloorNumber}"]`).tap();
await page.waitForTimeout(250);

const energyAfterTool = Number(await page.locator('#energy').textContent());
assert(energyAfterTool < 100, `Tool did not consume energy: ${energyAfterTool}`);
const hpWidth = await page.locator('.enemy .hp i').evaluate((node) => Number.parseFloat(node.style.width));
assert(hpWidth < 100, `Tool did not damage the enemy: ${hpWidth}%`);
await page.screenshot({ path: `${out}/02-tool-used.png`, fullPage: true });

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
await page.screenshot({ path: `${out}/03-after-retreat.png`, fullPage: true });

await writeFile(`${out}/report.json`, JSON.stringify({
  passed: true,
  testedAt: new Date().toISOString(),
  targetUrl,
  browserName,
  viewport: { width: 390, height: 844, deviceScaleFactor: 3 },
  enemyFloorNumber: Number(enemyFloorNumber),
  energyAfterTool,
  hpWidth,
  pausedAndResumed: true,
  retreated: true,
  errors,
}, null, 2));

await browser.close();
console.log(`Cat's tower battle test passed in ${browserName}: ${targetUrl}`);
