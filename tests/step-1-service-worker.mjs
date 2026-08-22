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
const viewportMatch = /^(\d+)x(\d+)$/.exec(viewportSpec);
assert(viewportMatch, `Invalid viewport: ${viewportSpec}`);
const viewport = { width: Number(viewportMatch[1]), height: Number(viewportMatch[2]) };
const outputDirectory = process.env.CATS_TEST_OUT || `test-results/step-1-sw-${browserName}-${viewportSpec}`;
await mkdir(outputDirectory, { recursive: true });
const runtimeManifest = JSON.parse(await readFile(
  new URL('../quality-reviews/step-1-legacy-baseline/evidence/runtime-manifest.json', import.meta.url),
  'utf8',
));
const expectedCacheEntries = runtimeManifest.entries.filter(entry => ![
  'sw.js',
  'assets/fonts/NotoSansJP-OFL.txt',
].includes(entry.sourcePath));
const expectedCacheKeys = expectedCacheEntries.map(entry => entry.servedPath).sort();
assert.equal(expectedCacheEntries.length, 15, 'The V0.8.2 service-worker cache must contain exactly 15 manifest entries');
assert.equal(new Set(expectedCacheKeys).size, 15, 'The expected service-worker cache keys must be unique');

const launchOptions = { headless: true };
if (browserName === 'chromium' && process.env.CATS_CHROMIUM_EXECUTABLE) {
  launchOptions.executablePath = process.env.CATS_CHROMIUM_EXECUTABLE;
}

const browser = await browserType.launch(launchOptions);
const contextOptions = {
  viewport,
  screen: viewport,
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  locale: 'ja-JP',
  timezoneId: 'Asia/Tokyo',
  serviceWorkers: 'allow',
};
const context = await browser.newContext(contextOptions);
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(`pageerror: ${error.message}`));
page.on('console', message => {
  if (message.type() === 'error') errors.push(`console: ${message.text()}`);
});

const onlineUrl = new URL(targetUrl);
onlineUrl.searchParams.set('qa', '1');
onlineUrl.searchParams.set('step1', `${browserName}-${Date.now()}`);
const firstResponse = await page.goto(onlineUrl.href, { waitUntil: 'networkidle', timeout: 45000 });
assert(firstResponse?.ok(), `Initial online load failed: HTTP ${firstResponse?.status()}`);
await page.waitForFunction(() => Boolean(window.__CATS_TEST_API__), null, { timeout: 10000 });

await page.evaluate(async () => {
  const registration = await navigator.serviceWorker.ready;
  if (registration.installing) {
    await new Promise(resolve => registration.installing.addEventListener('statechange', () => {
      if (registration.installing?.state === 'activated') resolve();
    }));
  }
});
await page.reload({ waitUntil: 'networkidle', timeout: 45000 });
await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller), null, { timeout: 10000 });
await page.waitForFunction(() => Boolean(window.__CATS_TEST_API__), null, { timeout: 10000 });

const cacheState = await page.evaluate(async () => {
  const cacheNames = await caches.keys();
  const expectedName = 'cats-tower-v082-pixel-tower-r3';
  const cache = await caches.open(expectedName);
  const requests = await cache.keys();
  return {
    cacheNames,
    expectedName,
    keys: requests.map(request => {
      const url = new URL(request.url);
      return `${url.pathname}${url.search}`;
    }).sort(),
    paths: requests.map(request => new URL(request.url).pathname).sort(),
    controlled: Boolean(navigator.serviceWorker.controller),
  };
});
assert.equal(cacheState.controlled, true, 'The reproduced page must be controlled by its service worker');
assert(cacheState.cacheNames.includes(cacheState.expectedName), 'The V0.8.2 cache must exist');
assert.equal(cacheState.keys.length, expectedCacheKeys.length, 'The V0.8.2 cache must not contain extra response entries');
assert.deepEqual(cacheState.keys, expectedCacheKeys, 'The actual V0.8.2 cache keys must exactly match the 15 manifest entries');
cacheState.actualEntryCount = cacheState.keys.length;
cacheState.expectedEntryCount = expectedCacheKeys.length;
for (const requiredPath of [
  '/index.html',
  '/styles.css',
  '/game-data.js',
  '/game-core.js',
  '/app.js',
  '/manifest.webmanifest',
  '/assets/v080/pixel-r2/tower-night-r2.png',
  '/assets/v082/pixel-r3/cats-cast-r3.png',
  '/assets/v082/pixel-r3/enemies-r3.png',
  '/assets/fonts/noto-sans-jp-700-ja.woff2',
  '/assets/icons/icon-192.png',
  '/assets/icons/icon-512.png',
]) {
  assert(cacheState.paths.includes(requiredPath), `Precache is missing ${requiredPath}`);
}
const initialCacheHashes = await page.evaluate(async entries => {
  const cache = await caches.open('cats-tower-v082-pixel-tower-r3');
  const results = [];
  for (const entry of entries) {
    const response = await cache.match(entry.servedPath);
    if (!response) {
      results.push({ servedPath: entry.servedPath, missing: true });
      continue;
    }
    const bytes = await response.arrayBuffer();
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    results.push({
      servedPath: entry.servedPath,
      bytes: bytes.byteLength,
      sha256: [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join(''),
    });
  }
  return results;
}, expectedCacheEntries);
for (const [index, actual] of initialCacheHashes.entries()) {
  const expected = expectedCacheEntries[index];
  assert.equal(actual.missing, undefined, `Cache entry is missing: ${expected.servedPath}`);
  assert.equal(actual.bytes, expected.bytes, `Cached byte size mismatch: ${expected.servedPath}`);
  assert.equal(actual.sha256, expected.sha256, `Cached SHA-256 mismatch: ${expected.servedPath}`);
}

const savedFixture = await page.evaluate(() => {
  const state = window.__CATS_TEST_API__.seed({
    currentFloor: 5,
    bestFloor: 5,
    runFloorPeak: 5,
    enemyFloor: 5,
    coins: 4321,
    fish: 17,
    mugiLevel: 4,
    weaponLevel: 3,
    dispatchLevel: 2,
    hasPlayed: true,
  });
  return {
    state,
    raw: localStorage.getItem('cats-tower-v080'),
  };
});
assert(savedFixture.raw, 'The schema-2 fixture must be written to localStorage');
await page.reload({ waitUntil: 'networkidle', timeout: 45000 });
await page.waitForFunction(() => Boolean(window.__CATS_TEST_API__), null, { timeout: 10000 });
const restored = await page.evaluate(() => ({
  state: window.__CATS_TEST_API__.getState(),
  raw: localStorage.getItem('cats-tower-v080'),
}));
for (const [key, expected] of Object.entries({
  gameplaySchema: 2,
  currentFloor: 5,
  bestFloor: 5,
  coins: 4321,
  fish: 17,
  mugiLevel: 4,
  weaponLevel: 3,
  dispatchLevel: 2,
})) {
  assert.equal(restored.state[key], expected, `Reload must preserve ${key}`);
}

const midCombatContext = await browser.newContext(contextOptions);
const midCombatPage = await midCombatContext.newPage();
midCombatPage.on('pageerror', error => errors.push(`mid-combat pageerror: ${error.message}`));
midCombatPage.on('console', message => {
  if (message.type() === 'error') errors.push(`mid-combat console: ${message.text()}`);
});
const midCombatResponse = await midCombatPage.goto(onlineUrl.href, { waitUntil: 'networkidle', timeout: 45000 });
assert(midCombatResponse?.ok(), `Mid-combat fixture load failed: HTTP ${midCombatResponse?.status()}`);
await midCombatPage.waitForFunction(() => Boolean(window.__CATS_TEST_API__), null, { timeout: 10000 });
const midCombatBefore = await midCombatPage.evaluate(() => {
  const api = window.__CATS_TEST_API__;
  api.seed({
    currentFloor: 5,
    bestFloor: 5,
    runFloorPeak: 5,
    enemyFloor: 5,
    coins: 9000,
    fish: 23,
    mugiLevel: 4,
    weaponLevel: 3,
    dispatchLevel: 2,
    restaurantUnlocked: true,
    restaurantLevel: 1,
    roomUnlocked: true,
    roomLevel: 1,
    hasPlayed: true,
  });
  for (let index = 0; index < 25 && !api.getRuntime().partyFull; index += 1) {
    api.dispatch();
    api.advance(200);
  }
  for (let index = 0; index < 30 && api.getRuntime().units.some(unit => unit.progress < 0.999); index += 1) {
    api.advance(100);
  }
  return { state: api.getState(), runtime: api.getRuntime() };
});
assert.equal(midCombatBefore.runtime.unitCount, 6, 'The mid-combat fixture must contain six cats before reload');
await midCombatPage.reload({ waitUntil: 'networkidle', timeout: 45000 });
await midCombatPage.waitForFunction(() => Boolean(window.__CATS_TEST_API__), null, { timeout: 10000 });
const midCombatAfter = await midCombatPage.evaluate(() => ({
  state: window.__CATS_TEST_API__.getState(),
  runtime: window.__CATS_TEST_API__.getRuntime(),
}));
for (const key of ['currentFloor', 'bestFloor', 'coins', 'fish', 'mugiLevel', 'weaponLevel', 'dispatchLevel']) {
  assert.equal(midCombatAfter.state[key], midCombatBefore.state[key], `Mid-combat reload must preserve ${key}`);
}
assert.equal(midCombatAfter.runtime.enemyHp, midCombatBefore.runtime.enemyHp, 'Mid-combat reload must preserve enemy HP');
assert(midCombatAfter.runtime.unitCount < 6, 'The known V0.8.2 defect must reproduce: the live six-cat roster is not persisted');
await midCombatContext.close();

const futureSave = {
  gameplaySchema: 3,
  version: 'future-step-1-fixture',
  coins: 999,
  fish: 88,
  currentFloor: 20,
  bestFloor: 22,
  mugiLevel: 5,
  weaponLevel: 4,
  dispatchLevel: 3,
  memories: ['arrival', 'future-memory'],
  lastSeen: Date.now(),
};
const futureRawBefore = JSON.stringify(futureSave);
await page.evaluate(value => localStorage.setItem('cats-tower-v080', value), futureRawBefore);
await page.reload({ waitUntil: 'networkidle', timeout: 45000 });
await page.waitForFunction(() => Boolean(window.__CATS_TEST_API__), null, { timeout: 10000 });
const futureRaw = await page.evaluate(() => localStorage.getItem('cats-tower-v080'));
assert.equal(futureRaw, futureRawBefore, 'A future-schema save must remain byte-for-byte unchanged');
assert.deepEqual(JSON.parse(futureRaw), futureSave, 'A future-schema save must not be overwritten');

await page.evaluate(async () => {
  for (const registration of await navigator.serviceWorker.getRegistrations()) await registration.unregister();
  const oldCache = await caches.open('cats-tower-v081-step-1-fixture');
  await oldCache.put('/obsolete-step-1', new Response('obsolete'));
  const futureCache = await caches.open('cats-tower-v999-step-1-fixture');
  await futureCache.put('/index.html', new Response('<h1>synthetic future shell</h1>', { headers: { 'content-type': 'text/html' } }));
  await futureCache.put('/app.js?v=082r3', new Response('throw new Error("synthetic future cache")'));
  await navigator.serviceWorker.register(`/sw.js?v=082r3&recovery=${Date.now()}`);
  await navigator.serviceWorker.ready;
});
await page.waitForFunction(async () => {
  const names = await caches.keys();
  return !names.includes('cats-tower-v081-step-1-fixture') && !names.includes('cats-tower-v999-step-1-fixture');
}, null, { timeout: 10000 });

await page.reload({ waitUntil: 'networkidle', timeout: 45000 });
await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller), null, { timeout: 10000 });
await context.setOffline(true);
await page.reload({ waitUntil: 'domcontentloaded', timeout: 45000 });
await page.waitForSelector('#app', { state: 'visible', timeout: 10000 });
const offline = await page.evaluate(() => ({
  title: document.title,
  version: window.CatsTowerData?.VERSION,
  controlled: Boolean(navigator.serviceWorker.controller),
  cacheNames: null,
}));
offline.cacheNames = await page.evaluate(() => caches.keys());
assert.equal(offline.version, '0.8.2', 'Offline shell must execute the V0.8.2 runtime');
assert.equal(offline.controlled, true, 'Offline shell must remain service-worker controlled');
assert(offline.cacheNames.includes('cats-tower-v082-pixel-tower-r3'), 'Offline shell must retain the V0.8.2 cache');
await context.setOffline(false);

assert.deepEqual(errors, [], `Browser errors: ${JSON.stringify(errors)}`);
const report = {
  passed: true,
  browserName,
  targetUrl,
  viewport,
  runtimeVersion: '0.8.2',
  gameplaySchema: 2,
  saveKey: 'cats-tower-v080',
  cacheState,
  schema2Reload: {
    currentFloor: restored.state.currentFloor,
    bestFloor: restored.state.bestFloor,
    coins: restored.state.coins,
    fish: restored.state.fish,
  },
  midCombatKnownDefect: {
    durableFieldsPreserved: true,
    enemyHpBefore: midCombatBefore.runtime.enemyHp,
    enemyHpAfter: midCombatAfter.runtime.enemyHp,
    unitCountBefore: midCombatBefore.runtime.unitCount,
    unitCountAfter: midCombatAfter.runtime.unitCount,
  },
  cacheEntrySetVerified: true,
  cachedResponseHashesVerified: initialCacheHashes.length,
  futureSchemaPreserved: true,
  futureSchemaRawBytesUnchanged: true,
  obsoleteCacheRemoved: true,
  offline,
  errors,
};
const reportSource = `${JSON.stringify(report, null, 2)}\n`;
await writeFile(`${outputDirectory}/report.json`, reportSource);
console.log(`Step 1 service-worker recovery QA passed: ${browserName} ${viewportSpec} ${targetUrl}`);
console.log(`Report SHA-256: ${createHash('sha256').update(reportSource).digest('hex')}`);

await context.close();
await browser.close();
