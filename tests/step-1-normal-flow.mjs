#!/usr/bin/env node

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { chromium, webkit } from 'playwright';

const browserName = process.env.CATS_BROWSER || 'chromium';
const browserType = { chromium, webkit }[browserName];
assert(browserType, `Unsupported browser: ${browserName}`);
const targetUrl = process.env.CATS_TEST_URL || 'http://127.0.0.1:4173/';
const viewportSpec = process.env.CATS_VIEWPORT || '390x844';
const match = /^(\d+)x(\d+)$/.exec(viewportSpec);
assert(match, `Invalid viewport: ${viewportSpec}`);
const viewport = { width: Number(match[1]), height: Number(match[2]) };
const outputDirectory = process.env.CATS_TEST_OUT || `test-results/step-1-normal-${browserName}-${viewportSpec}`;
await mkdir(outputDirectory, { recursive: true });

const launchOptions = { headless: true };
if (browserName === 'chromium' && process.env.CATS_CHROMIUM_EXECUTABLE) {
  launchOptions.executablePath = process.env.CATS_CHROMIUM_EXECUTABLE;
}
const browser = await browserType.launch(launchOptions);
const context = await browser.newContext({
  viewport,
  screen: viewport,
  deviceScaleFactor: 1,
  isMobile: true,
  hasTouch: true,
  locale: 'ja-JP',
  timezoneId: 'Asia/Tokyo',
  reducedMotion: 'no-preference',
  serviceWorkers: 'allow',
});
const page = await context.newPage();
const errors = [];
const failedRequests = [];
page.on('pageerror', error => errors.push(`pageerror: ${error.message}`));
page.on('console', message => {
  if (message.type() === 'error') errors.push(`console: ${message.text()}`);
});
page.on('requestfailed', request => failedRequests.push(`${request.failure()?.errorText || 'failed'} ${request.url()}`));

const response = await page.goto(targetUrl, { waitUntil: 'networkidle', timeout: 45000 });
assert(response?.ok(), `Normal-flow initial load failed: HTTP ${response?.status()}`);
assert.equal(await page.evaluate(() => new URL(location.href).searchParams.has('qa')), false, 'Normal flow must not use ?qa=1');
assert.equal(await page.evaluate(() => '__CATS_TEST_API__' in window), false, 'Normal flow must not expose the QA API');
assert.equal(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches), false, 'Normal flow must use normal motion');
await page.screenshot({ path: `${outputDirectory}/01-title.png`, fullPage: true });

await page.locator('#startBtn').tap();
await page.locator('#game:not(.hidden)').waitFor({ state: 'visible', timeout: 10000 });
await page.waitForTimeout(1200);
const floorAtStart = await page.locator('#floorLabel').innerText();
const enemyAtStart = await page.locator('#enemyName').innerText();
const enemyHpAtStart = await page.locator('#enemyHpText').innerText();

for (let attempt = 0; attempt < 4; attempt += 1) {
  if (await page.locator('#tapDispatch').isEnabled()) await page.locator('#tapDispatch').tap();
  await page.waitForTimeout(700);
}
await page.waitForTimeout(3500);
await page.screenshot({ path: `${outputDirectory}/02-active-battle.png`, fullPage: true });

const activeState = await page.evaluate(() => ({
  floor: document.querySelector('#floorLabel')?.textContent?.trim(),
  enemy: document.querySelector('#enemyName')?.textContent?.trim(),
  enemyHp: document.querySelector('#enemyHpText')?.textContent?.trim(),
  coins: document.querySelector('#coins')?.textContent?.trim(),
  visibleCats: document.querySelectorAll('.catUnit[data-unit-id]').length,
  gameVisible: !document.querySelector('#game')?.classList.contains('hidden'),
  titleHidden: document.querySelector('#splash')?.classList.contains('hidden'),
  serviceWorkerSupported: 'serviceWorker' in navigator,
  serviceWorkerControlled: Boolean(navigator.serviceWorker?.controller),
  serviceWorkerControllerUrl: navigator.serviceWorker?.controller?.scriptURL || null,
}));
assert.equal(activeState.gameVisible, true, 'The game must be visible after the normal start action');
assert.equal(activeState.titleHidden, true, 'The title must close after the normal start action');
assert.match(activeState.floor || '', /\d+F/, 'The normal flow must show a floor');
assert(activeState.enemy, 'The normal flow must show an enemy');
assert(activeState.enemyHp, 'The normal flow must show enemy HP');
assert(activeState.visibleCats >= 1, 'The normal flow must render at least one cat');

// Exercise the same lifecycle save used by an ordinary navigation, then stop the
// live loop so the durable checkpoint cannot advance between measurement and reload.
await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
const beforeReload = await page.evaluate(() => {
  const raw = localStorage.getItem('cats-tower-v080');
  const state = raw ? JSON.parse(raw) : null;
  const durableKeys = [
    'gameplaySchema',
    'currentFloor',
    'bestFloor',
    'checkpointFloor',
    'runFloorPeak',
    'enemyFloor',
    'enemyHp',
    'coins',
    'fish',
    'mugiLevel',
    'weaponLevel',
    'dispatchLevel',
    'restaurantLevel',
    'roomLevel',
    'dawnShards',
    'lifetimeShards',
    'ascensions',
    'firstNightCleared',
    'completed',
  ];
  return {
    rawPresent: Boolean(raw),
    durable: state ? Object.fromEntries(durableKeys.map(key => [key, state[key]])) : null,
    screen: {
      floor: document.querySelector('#floorLabel')?.textContent?.trim(),
      enemy: document.querySelector('#enemyName')?.textContent?.trim(),
      enemyHp: document.querySelector('#enemyHpText')?.textContent?.trim(),
      coins: document.querySelector('#coins')?.textContent?.trim(),
    },
    serviceWorker: {
      supported: 'serviceWorker' in navigator,
      controlled: Boolean(navigator.serviceWorker?.controller),
      controllerUrl: navigator.serviceWorker?.controller?.scriptURL || null,
    },
  };
});
assert.equal(beforeReload.rawPresent, true, 'The normal UI lifecycle must write a schema-2 save before reload');
assert.equal(beforeReload.durable?.gameplaySchema, 2, 'The normal UI lifecycle save must use gameplay schema 2');

await page.reload({ waitUntil: 'networkidle', timeout: 45000 });
assert.equal(await page.evaluate(() => '__CATS_TEST_API__' in window), false, 'Reloaded normal flow must not expose the QA API');
const afterReload = await page.evaluate(() => {
  const raw = localStorage.getItem('cats-tower-v080');
  const state = raw ? JSON.parse(raw) : null;
  const durableKeys = [
    'gameplaySchema',
    'currentFloor',
    'bestFloor',
    'checkpointFloor',
    'runFloorPeak',
    'enemyFloor',
    'enemyHp',
    'coins',
    'fish',
    'mugiLevel',
    'weaponLevel',
    'dispatchLevel',
    'restaurantLevel',
    'roomLevel',
    'dawnShards',
    'lifetimeShards',
    'ascensions',
    'firstNightCleared',
    'completed',
  ];
  return {
    rawPresent: Boolean(raw),
    durable: state ? Object.fromEntries(durableKeys.map(key => [key, state[key]])) : null,
    screen: {
      floor: document.querySelector('#floorLabel')?.textContent?.trim(),
      enemy: document.querySelector('#enemyName')?.textContent?.trim(),
      enemyHp: document.querySelector('#enemyHpText')?.textContent?.trim(),
      coins: document.querySelector('#coins')?.textContent?.trim(),
    },
    serviceWorker: {
      supported: 'serviceWorker' in navigator,
      controlled: Boolean(navigator.serviceWorker?.controller),
      controllerUrl: navigator.serviceWorker?.controller?.scriptURL || null,
    },
  };
});
assert.equal(afterReload.rawPresent, true, 'The schema-2 save must remain present after normal reload');
assert.deepEqual(afterReload.durable, beforeReload.durable, 'Normal reload must preserve all selected durable schema-2 fields');
assert.deepEqual(afterReload.screen, beforeReload.screen, 'Normal reload must restore floor, enemy, enemy HP, and coins before play resumes');
if (browserName === 'chromium') {
  assert.equal(afterReload.serviceWorker.supported, true, 'Chromium must expose the Service Worker API');
  assert.equal(afterReload.serviceWorker.controlled, true, 'Chromium normal reload must be controlled by the V0.8.2 service worker');
  assert(afterReload.serviceWorker.controllerUrl, 'Chromium must report the controlling Service Worker script URL');
}
await page.locator('#startBtn').tap();
await page.locator('#game:not(.hidden)').waitFor({ state: 'visible', timeout: 10000 });
await page.waitForTimeout(1000);
await page.screenshot({ path: `${outputDirectory}/03-reloaded.png`, fullPage: true });
const reloadedState = await page.evaluate(() => ({
  floor: document.querySelector('#floorLabel')?.textContent?.trim(),
  enemy: document.querySelector('#enemyName')?.textContent?.trim(),
  enemyHp: document.querySelector('#enemyHpText')?.textContent?.trim(),
  coins: document.querySelector('#coins')?.textContent?.trim(),
  gameVisible: !document.querySelector('#game')?.classList.contains('hidden'),
  serviceWorkerSupported: 'serviceWorker' in navigator,
  serviceWorkerControlled: Boolean(navigator.serviceWorker?.controller),
  serviceWorkerControllerUrl: navigator.serviceWorker?.controller?.scriptURL || null,
}));
assert.equal(reloadedState.gameVisible, true, 'The normal flow must resume after reload');
assert(reloadedState.floor, 'The reloaded normal flow must show a floor');

assert.deepEqual(errors, [], `Browser errors: ${JSON.stringify(errors)}`);
assert.deepEqual(failedRequests, [], `Failed requests: ${JSON.stringify(failedRequests)}`);
const screenshotFiles = ['01-title.png', '02-active-battle.png', '03-reloaded.png'];
const screenshots = [];
for (const name of screenshotFiles) {
  const bytes = await readFile(`${outputDirectory}/${name}`);
  screenshots.push({ name, bytes: bytes.byteLength, sha256: createHash('sha256').update(bytes).digest('hex') });
}
const report = {
  passed: true,
  browserName,
  targetUrl,
  viewport,
  deviceScaleFactor: 1,
  qaMode: false,
  reducedMotion: false,
  serviceWorkers: 'enabled',
  initial: { floor: floorAtStart, enemy: enemyAtStart, enemyHp: enemyHpAtStart },
  active: activeState,
  durableReload: {
    before: beforeReload,
    after: afterReload,
    preserved: true,
  },
  reloaded: reloadedState,
  screenshots,
  errors,
  failedRequests,
};
await writeFile(`${outputDirectory}/report.json`, `${JSON.stringify(report, null, 2)}\n`);
console.log(`Step 1 normal UI flow passed: ${browserName} ${viewportSpec} ${targetUrl}`);

await context.close();
await browser.close();
