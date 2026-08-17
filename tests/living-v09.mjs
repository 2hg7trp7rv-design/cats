import { chromium, webkit } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';

const browserName=process.env.CATS_BROWSER||'chromium';
const targetUrl=process.env.CATS_TEST_URL||'http://127.0.0.1:4173/';
const out=process.env.CATS_TEST_OUT||`test-results/living-v09-${browserName}`;
const browserType={chromium,webkit}[browserName];
assert(browserType,`Unsupported browser: ${browserName}`);
await mkdir(out,{recursive:true});

const browser=await browserType.launch({headless:true});
const context=await browser.newContext({
  viewport:{width:390,height:844},screen:{width:390,height:844},deviceScaleFactor:3,
  isMobile:true,hasTouch:true,locale:'ja-JP',timezoneId:'Asia/Tokyo',
  userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
});
const page=await context.newPage();
const errors=[];
page.on('pageerror',e=>errors.push(`pageerror: ${e.message}`));
page.on('console',m=>{if(m.type()==='error')errors.push(`console: ${m.text()}`)});
await page.addInitScript(()=>localStorage.clear());

const response=await page.goto(targetUrl,{waitUntil:'networkidle',timeout:45000});
assert(response?.ok(),`HTTP ${response?.status()} ${targetUrl}`);
await page.locator('#startBtn').waitFor({state:'visible',timeout:15000});

const title=page.locator('.splashArtwork');
const titleMetrics=await title.evaluate(img=>({w:img.naturalWidth,h:img.naturalHeight,src:img.currentSrc}));
assert.deepEqual([titleMetrics.w,titleMetrics.h],[1170,2532]);
assert(!titleMetrics.src.endsWith('.svg'),'Title must be raster');
await page.screenshot({path:`${out}/01-title.png`,fullPage:false});

await page.locator('#startBtn').tap();
await page.locator('#game:not(.hidden)').waitFor({state:'visible',timeout:10000});
await page.locator('.floor.food').waitFor({state:'visible',timeout:10000});
assert.equal(await page.locator('.floor').count(),3,'Initial Vertical Slice must contain lobby, home and food');

const roomMetrics=await page.locator('.roomArt').evaluateAll(imgs=>imgs.map(i=>({w:i.naturalWidth,h:i.naturalHeight,src:i.currentSrc,rh:i.getBoundingClientRect().height})));
assert(roomMetrics.every(x=>x.w===1280&&x.h===760&&x.rh>=350),JSON.stringify(roomMetrics));
assert(roomMetrics.every(x=>!x.src.endsWith('.svg')),'Room art must be raster');
const mugi=page.locator('.floor.food .catButton.mugi img');
const mugiMetrics=await mugi.evaluate(i=>({w:i.naturalWidth,h:i.naturalHeight,src:i.currentSrc,rh:i.getBoundingClientRect().height}));
assert.deepEqual([mugiMetrics.w,mugiMetrics.h],[1024,1024]);
assert(mugiMetrics.rh>=240,`Mugi too small: ${mugiMetrics.rh}`);
assert(!mugiMetrics.src.endsWith('.svg'),'Mugi must be raster');
await page.screenshot({path:`${out}/02-food-floor.png`,fullPage:false});

await page.locator('.floor.home').scrollIntoViewIfNeeded();
await page.waitForTimeout(300);
assert.equal(await page.locator('.floor.home .catButton').count(),3,'Home must show Luna, Toto and Mimi');
await page.screenshot({path:`${out}/03-home-floor.png`,fullPage:false});

await page.locator('[data-nav="cats"]').tap();
const sheet=page.locator('#modal .sheet');
await sheet.waitFor({state:'visible',timeout:5000});
assert.equal((await sheet.locator('header small').innerText()).trim(),'CAT RESIDENTS');
assert.equal(await sheet.locator('.catListCard').count(),4);
const catListAssets=await sheet.locator('.catListCard img').evaluateAll(imgs=>imgs.map(i=>({w:i.naturalWidth,h:i.naturalHeight,src:i.currentSrc})));
assert(catListAssets.every(x=>x.w>=512&&x.h>=512&&!x.src.endsWith('.svg')),JSON.stringify(catListAssets));
await sheet.screenshot({path:`${out}/04-cat-list.png`});
await sheet.locator('[data-action="cat"][data-cat="mugi"]').tap();
await page.waitForFunction(()=>document.querySelector('#modal .sheet header small')?.textContent?.startsWith('CAT PROFILE'));
assert(await page.locator('.profileHero img').isVisible());
await page.locator('#modal .sheet').screenshot({path:`${out}/05-mugi-profile.png`});
await page.locator('#modal [data-close="1"]').first().tap();

await page.evaluate(()=>window.__CATS_TEST_API__.specialize('street'));
await page.locator('.floor.food').scrollIntoViewIfNeeded();
await page.locator('.floor.food .roomAction').tap();
const prepTrack=page.locator('#prepTrack');
if(!(await prepTrack.isVisible().catch(()=>false))){await page.locator('#modal [data-action="prep"]').tap()}
await prepTrack.waitFor({state:'visible',timeout:5000});
await page.locator('#prepAssist').tap();
await page.waitForTimeout(750);
const stateAfterPrep=await page.evaluate(()=>window.__CATS_TEST_API__.getState());
assert(stateAfterPrep.floors.find(f=>f.type==='food').prepared>=1,'Prep action must change game state');

await page.evaluate(()=>window.__CATS_TEST_API__.startNight());
await page.locator('#eventDock:not(.hidden)').waitFor({state:'visible',timeout:5000});
await page.locator('.nightEnemy').waitFor({state:'visible',timeout:5000});
assert.equal((await page.locator('#eventName').innerText()).trim(),'C.L.E.A.N.侵入');
await page.screenshot({path:`${out}/06-night-shift.png`,fullPage:false});
await page.locator('#retreatBtn').tap();

await page.locator('[data-nav="memories"]').tap();
await page.locator('#modal .sheet').waitFor({state:'visible',timeout:5000});
assert.match((await page.locator('#modal .sheet h2').innerText()).trim(),/思い出帳/);
assert(await page.locator('.memoryCard').count()>=4);
await page.locator('#modal .sheet').screenshot({path:`${out}/07-memories.png`});

const visibleSvg=await page.evaluate(()=>[...document.images].filter(img=>img.offsetParent!==null&&img.currentSrc.endsWith('.svg')).map(img=>img.currentSrc));
assert.deepEqual(visibleSvg,[],'No visible game art may use SVG');
assert.deepEqual(errors,[],errors.join('\n'));
const report={passed:true,browserName,targetUrl,titleMetrics,roomMetrics,mugiMetrics,catListAssets,errors};
await writeFile(`${out}/report.json`,JSON.stringify(report,null,2));
await browser.close();
console.log(`Living Tower V0.9 QA passed: ${browserName} ${targetUrl}`);
