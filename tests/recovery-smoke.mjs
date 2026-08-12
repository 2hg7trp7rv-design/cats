import { chromium, webkit } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';

const browserName = process.env.CATS_BROWSER || 'chromium';
const targetUrl = process.env.CATS_TEST_URL || 'http://127.0.0.1:4173/';
const out = process.env.CATS_TEST_OUT || `test-results/${browserName}-recovery`;
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

const storageKey = 'cats-tower-v01';
function seedState({ coins = 0, stock = 0, aidAt = Date.now() } = {}) {
  const now = Date.now();
  return {
    version: '0.1.0',
    coins,
    parts: 0,
    floors: [
      { id: 'lobby-1', number: 1, type: 'lobby', level: 1, buildStart: 0, buildEnd: 0, cats: [], stock: 0, pending: 0, orderState: 'idle', orderStart: 0, orderEnd: 0, nextSale: now + 600000 },
      { id: 'home-2', number: 2, type: 'home', level: 1, buildStart: 0, buildEnd: 0, cats: [], stock: 0, pending: 0, orderState: 'idle', orderStart: 0, orderEnd: 0, nextSale: now + 600000 },
      { id: 'food-3', number: 3, type: 'food', level: 1, buildStart: 0, buildEnd: 0, cats: ['mugi'], stock, pending: 0, orderState: 'idle', orderStart: 0, orderEnd: 0, nextSale: now + 600000 },
    ],
    cats: [
      { id: 'mugi', level: 1, xp: 0, mood: 86, floorId: 'food-3', lastPet: 0, unlocked: now },
    ],
    bellAt: now + 600000,
    settings: { sound: false },
    tutorial: true,
    coach: { battle: true },
    sales: 0,
    built: 3,
    clears: 0,
    lastBattle: 0,
    lastSeen: now,
    aidAt,
    aidTotal: 0,
    created: now,
    battle: null,
  };
}

await page.addInitScript(
  ({ key, state }) => {
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(state));
  },
  { key: storageKey, state: seedState() },
);

const response = await page.goto(targetUrl, { waitUntil: 'networkidle', timeout: 45000 });
assert(response?.ok(), `HTTP ${response?.status()} at ${targetUrl}`);
await page.locator('#startBtn').waitFor({ state: 'visible', timeout: 15000 });
await page.locator('#startBtn').tap();
await page.locator('#game:not(.hidden)').waitFor({ state: 'visible', timeout: 10000 });

const zeroCoins = Number((await page.locator('#coins').textContent())?.replaceAll(',', ''));
assert.equal(zeroCoins, 0, `Recovery scenario did not begin at zero coins: ${zeroCoins}`);
await page.waitForTimeout(2800);
const recoveredCoins = Number((await page.locator('#coins').textContent())?.replaceAll(',', ''));
assert(recoveredCoins >= 2, `Management assistance did not recover coins: ${recoveredCoins}`);
assert.match(await page.locator('#incomeRate').textContent(), /\+1\s*\/\s*秒/);
assert.match(await page.locator('#guideText').textContent(), /管理人支援|支援上限/);

const visualAudit = await page.evaluate(() => {
  const food = document.querySelector('.floor.food');
  const home = document.querySelector('.floor.home');
  return {
    viewportWidth: window.innerWidth,
    documentWidth: document.documentElement.scrollWidth,
    foodBackground: food ? getComputedStyle(food).backgroundImage : '',
    homeBackground: home ? getComputedStyle(home).backgroundImage : '',
    coinWalletHasTwoLines: !!document.querySelector('#coinsBtn span small'),
    fixedDefenseControlExists: !!document.querySelector('#battleCall'),
  };
});
assert(visualAudit.documentWidth <= visualAudit.viewportWidth + 1, 'Horizontal overflow detected');
assert.notEqual(visualAudit.foodBackground, visualAudit.homeBackground, 'Floor types are not visually differentiated');
assert.equal(visualAudit.coinWalletHasTwoLines, true, 'Resource hierarchy is missing');
assert.equal(visualAudit.fixedDefenseControlExists, true, 'Fixed defense control is missing');
await page.screenshot({ path: `${out}/01-zero-coin-recovery.png`, fullPage: true });

await page.locator('#coinsBtn').tap();
await page.locator('.sheet').waitFor({ state: 'visible', timeout: 5000 });
assert.match(await page.locator('.sheet').textContent(), /120未満|120まで/);
await page.screenshot({ path: `${out}/02-recovery-explanation.png`, fullPage: true });
await page.locator('.sheet [data-close]').tap();
await page.locator('.sheet').waitFor({ state: 'detached', timeout: 5000 });

// Confirm that assistance stops at 120 rather than replacing store income.
await page.evaluate(
  ({ key, state }) => localStorage.setItem(key, JSON.stringify(state)),
  { key: storageKey, state: seedState({ coins: 119 }) },
);
await page.reload({ waitUntil: 'networkidle', timeout: 45000 });
await page.locator('#startBtn').waitFor({ state: 'visible', timeout: 15000 });
await page.locator('#startBtn').tap();
await page.locator('#game:not(.hidden)').waitFor({ state: 'visible', timeout: 10000 });
await page.waitForTimeout(2200);
const cappedCoins = Number((await page.locator('#coins').textContent())?.replaceAll(',', ''));
assert.equal(cappedCoins, 120, `Assistance exceeded its 120-coin cap: ${cappedCoins}`);
assert.match(await page.locator('#incomeRate').textContent(), /120で停止/);
await page.screenshot({ path: `${out}/03-assistance-cap.png`, fullPage: true });

// First defense must be reachable with one staffed, stocked shop and spawn immediately.
await page.evaluate(
  ({ key, state }) => localStorage.setItem(key, JSON.stringify(state)),
  { key: storageKey, state: seedState({ coins: 40, stock: 60 }) },
);
await page.reload({ waitUntil: 'networkidle', timeout: 45000 });
await page.locator('#startBtn').waitFor({ state: 'visible', timeout: 15000 });
await page.locator('#startBtn').tap();
await page.locator('#game:not(.hidden)').waitFor({ state: 'visible', timeout: 10000 });
await page.waitForTimeout(400);

const battleCall = page.locator('#battleCall:not(.hidden)');
await battleCall.waitFor({ state: 'visible', timeout: 5000 });
assert.match(await battleCall.textContent(), /初回防衛/);
await page.screenshot({ path: `${out}/04-first-defense-ready.png`, fullPage: true });
await battleCall.tap();
await page.locator('#battleNav:not(.hidden)').waitFor({ state: 'visible', timeout: 3000 });
await page.locator('.enemy').waitFor({ state: 'visible', timeout: 2000 });
const enemyFloor = await page.locator('.enemy').evaluate((enemy) => enemy.closest('.floor')?.dataset.no);
assert.equal(enemyFloor, '1', `First enemy did not appear on 1F: ${enemyFloor}`);
await page.screenshot({ path: `${out}/05-enemy-visible.png`, fullPage: true });

await page.locator('[data-tool="static"]').tap();
await page.locator('.floor[data-no="1"]').tap();
await page.waitForTimeout(250);
const energyAfterTool = Number(await page.locator('#energy').textContent());
assert(energyAfterTool < 100, `Defense tool did not consume energy: ${energyAfterTool}`);

await page.locator('#pauseBtn').tap();
await page.locator('.pause').waitFor({ state: 'visible', timeout: 5000 });
await page.locator('[data-a="retreat"]').tap();
await page.locator('#battleNav.hidden').waitFor({ state: 'attached', timeout: 5000 });
assert.deepEqual(errors, []);

await writeFile(`${out}/report.json`, JSON.stringify({
  passed: true,
  testedAt: new Date().toISOString(),
  targetUrl,
  browserName,
  viewport: { width: 390, height: 844, deviceScaleFactor: 3 },
  zeroCoins,
  recoveredCoins,
  cappedCoins,
  firstDefenseReadyWithOneShop: true,
  enemyFloor: Number(enemyFloor),
  energyAfterTool,
  visualAudit,
  errors,
}, null, 2));

await browser.close();
console.log(`Cat's tower recovery and first-defense test passed in ${browserName}: ${targetUrl}`);
