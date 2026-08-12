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

const response = await page.goto(targetUrl, { waitUntil: 'networkidle', timeout: 45000 });
assert(response?.ok(), `HTTP ${response?.status()} at ${targetUrl}`);
await page.locator('#startBtn').waitFor({ state: 'visible', timeout: 15000 });

await page.evaluate(() => {
  const state = window.__CATS_TEST_API__.getState();
  const now = Date.now();
  state.tutorial = true;
  state.coins = 3000;
  state.parts = 0;
  state.lastSeen = now;
  state.battle = null;

  const food = state.floors.find((floor) => floor.type === 'food');
  food.cats = ['mugi'];
  food.stock = 60;
  food.pending = 0;
  food.orderState = 'idle';
  food.buildStart = 0;
  food.buildEnd = 0;
  food.nextSale = now + 600000;

  let play = state.floors.find((floor) => floor.type === 'play');
  if (!play) {
    play = {
      id: 'play-4',
      number: 4,
      type: 'play',
      level: 1,
      buildStart: 0,
      buildEnd: 0,
      cats: ['luna'],
      stock: 60,
      pending: 0,
      orderState: 'idle',
      orderStart: 0,
      orderEnd: 0,
      nextSale: now + 600000,
    };
    state.floors.push(play);
  } else {
    play.cats = ['luna'];
    play.stock = 60;
    play.buildStart = 0;
    play.buildEnd = 0;
    play.orderState = 'idle';
    play.nextSale = now + 600000;
  }

  const mugi = state.cats.find((cat) => cat.id === 'mugi');
  mugi.floorId = food.id;
  let luna = state.cats.find((cat) => cat.id === 'luna');
  if (!luna) {
    luna = {
      id: 'luna',
      level: 1,
      xp: 0,
      mood: 82,
      floorId: play.id,
      lastPet: 0,
      unlocked: now,
    };
    state.cats.push(luna);
  } else {
    luna.floorId = play.id;
  }

  state.floors.sort((a, b) => a.number - b.number);
  localStorage.setItem('cats-tower-v01', JSON.stringify(state));
});

await page.reload({ waitUntil: 'networkidle', timeout: 45000 });
await page.locator('#startBtn').waitFor({ state: 'visible', timeout: 15000 });
await page.locator('#startBtn').tap();
await page.locator('#game:not(.hidden)').waitFor({ state: 'visible', timeout: 10000 });
await page.waitForTimeout(950);

const introButton = page.locator('[data-a="intro"]');
if (await introButton.count()) {
  await introButton.tap();
  await page.waitForTimeout(200);
}
const startupCoachClose = page.locator('[data-a="coach-close"]');
if (await startupCoachClose.count()) {
  await startupCoachClose.tap();
  await page.waitForTimeout(200);
}
if (await page.locator('#coach > *').count()) {
  await page.locator('#coach').evaluate((node) => node.replaceChildren());
}

const battleBubble = page.locator('.floor[data-no="1"] [data-a="battle"]');
await battleBubble.scrollIntoViewIfNeeded();
assert.equal(await battleBubble.isVisible(), true, 'Lobby defense control is not visible');
await battleBubble.tap();

await page.locator('#battleNav:not(.hidden)').waitFor({ state: 'visible', timeout: 7000 });
const battleCoachClose = page.locator('[data-a="coach-close"]');
if (await battleCoachClose.count()) await battleCoachClose.tap();
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
