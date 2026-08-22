import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { chromium } from 'playwright';

const root = new URL('../', import.meta.url).pathname;
const executablePath = process.env.CATS_CHROMIUM_EXECUTABLE;
const viewports = [
  { width: 320, height: 568 },
  { width: 375, height: 667 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
];
const mime = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
};

const server = createServer(async (request, response) => {
  try {
    const pathname = new URL(request.url, 'http://localhost').pathname;
    const relative = normalize(decodeURIComponent(pathname)).replace(/^\/+/, '') || 'index.html';
    const file = join(root, relative);
    const fileStat = await stat(file);
    assert(fileStat.isFile());
    response.writeHead(200, { 'content-type': mime[extname(file)] || 'application/octet-stream' });
    response.end(await readFile(file));
  } catch {
    response.writeHead(404);
    response.end('not found');
  }
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;
const browser = await chromium.launch({
  headless: true,
  ...(executablePath ? { executablePath } : {}),
  args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
});

const report = [];

try {
  for (const viewport of viewports) {
    const page = await browser.newPage({ viewport, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
    const errors = [];
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(`console: ${message.text()}`);
    });
    page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));

    const response = await page.goto(`http://127.0.0.1:${port}/NINE_SCREEN_MOCKUPS.html`, {
      waitUntil: 'networkidle',
      timeout: 45_000,
    });
    assert.equal(response?.status(), 200);
    await page.evaluate(() => document.fonts.ready);
    assert.equal(await page.locator('.phone').count(), 9);
    assert.deepEqual(errors, []);

    const audit = await page.evaluate(() => {
      const frames = [...document.querySelectorAll('.phone')];
      const buttons = [...document.querySelectorAll('.phone button')];
      const targetFailures = buttons.flatMap((button) => {
        const box = button.getBoundingClientRect();
        return box.width < 44 || box.height < 44
          ? [{ screen: button.closest('.phone').dataset.screen, text: button.innerText.trim(), width: box.width, height: box.height }]
          : [];
      });
      const nameFailures = buttons.filter((button) => !button.innerText.trim() && !button.getAttribute('aria-label')).length;
      const horizontalFailures = buttons.flatMap((button) => {
        const box = button.getBoundingClientRect();
        const phone = button.closest('.phone').getBoundingClientRect();
        let parent = button.parentElement;
        let hasHorizontalScroller = false;
        while (parent && !parent.classList.contains('phone')) {
          const overflow = getComputedStyle(parent).overflowX;
          if (overflow === 'auto' || overflow === 'scroll') hasHorizontalScroller = true;
          parent = parent.parentElement;
        }
        return (box.left < phone.left - 1 || box.right > phone.right + 1) && !hasHorizontalScroller
          ? [{ screen: button.closest('.phone').dataset.screen, text: button.innerText.trim() }]
          : [];
      });
      const visibleFunctionalText = [
        ...document.querySelectorAll('.phone p, .phone button span, .phone button small, .phone button em, .phone button strong, .phone button b'),
      ].filter((element) => {
        if (!element.textContent.trim()) return false;
        if (element.matches('.choiceCheck, .blessing.selected > b')) return false;
        const style = getComputedStyle(element);
        return style.display !== 'none' && style.visibility !== 'hidden';
      });
      const textFailures = visibleFunctionalText.flatMap((element) => {
        const size = Number.parseFloat(getComputedStyle(element).fontSize);
        return size < 11
          ? [{ screen: element.closest('.phone').dataset.screen, text: element.textContent.trim(), size }]
          : [];
      });
      const fixedPrimarySelectors = ['.shopSticky .primaryCta', '.dawnSticky .dawnCta', '.completionSticky .completeCta'];
      const fixedPrimaryFailures = fixedPrimarySelectors.flatMap((selector) => {
        const button = document.querySelector(selector);
        const box = button.getBoundingClientRect();
        const phone = button.closest('.phone').getBoundingClientRect();
        return box.top < phone.top || box.bottom > phone.bottom
          ? [{ selector, top: box.top - phone.top, bottom: box.bottom - phone.top }]
          : [];
      });
      return {
        frameCount: frames.length,
        frameWidths: [...new Set(frames.map((frame) => frame.clientWidth))],
        frameHeights: [...new Set(frames.map((frame) => frame.clientHeight))],
        horizontalOverflow: frames.filter((frame) => frame.scrollWidth > frame.clientWidth).map((frame) => frame.dataset.screen),
        targetFailures,
        nameFailures,
        horizontalFailures,
        textFailures,
        fixedPrimaryFailures,
        towerTouchAction: getComputedStyle(document.querySelector('.towerViewport')).touchAction,
      };
    });

    assert.deepEqual(audit.horizontalOverflow, []);
    assert.deepEqual(audit.targetFailures, []);
    assert.equal(audit.nameFailures, 0);
    assert.deepEqual(audit.horizontalFailures, []);
    assert.deepEqual(audit.textFailures, []);
    assert.deepEqual(audit.fixedPrimaryFailures, []);
    assert.equal(audit.towerTouchAction, 'pan-y');
    report.push({ viewport: `${viewport.width}x${viewport.height}`, ...audit });
    await page.close();
  }

  const page = await browser.newPage({ viewport: { width: 1040, height: 1000 } });
  const variantErrors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') variantErrors.push(`console: ${message.text()}`);
  });
  page.on('pageerror', (error) => variantErrors.push(`pageerror: ${error.message}`));
  const response = await page.goto(`http://127.0.0.1:${port}/NINE_SCREEN_VARIANTS.html`, { waitUntil: 'networkidle' });
  assert.equal(response?.status(), 200);
  assert.equal(await page.locator('.variantPhone').count(), 4);
  assert.deepEqual(variantErrors, []);
  const variantTargetFailures = await page.locator('.variantPhone button').evaluateAll((buttons) => buttons.flatMap((button) => {
    const box = button.getBoundingClientRect();
    return box.width < 44 || box.height < 44
      ? [{ variant: button.closest('.variantPhone').dataset.variant, text: button.innerText.trim(), width: box.width, height: box.height }]
      : [];
  }));
  assert.deepEqual(variantTargetFailures, []);
  await page.close();

  console.log(JSON.stringify({ status: 'PASS', heroFrames: 9, requiredVariantFrames: 4, report }, null, 2));
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
