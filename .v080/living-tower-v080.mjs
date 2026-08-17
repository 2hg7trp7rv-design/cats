import { chromium, webkit } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';

const browserName=process.env.CATS_BROWSER||'chromium';
const targetUrl=process.env.CATS_TEST_URL||'http://127.0.0.1:4173/';
const out=process.env.CATS_TEST_OUT||`test-results/v080-${browserName}`;
const browserType={chromium,webkit}[browserName];
assert(browserType,`Unsupported browser ${browserName}`);
await mkdir(out,{recursive:true});

const browser=await browserType.launch({headless:true});
const context=await browser.newContext({
  viewport:{width:390,height:844},screen:{width:390,height:844},deviceScaleFactor:3,
  isMobile:true,hasTouch:true,locale:'ja-JP',timezoneId:'Asia/Tokyo',
  userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
});
const page=await context.newPage();
const errors=[];
page.on('pageerror',error=>errors.push(`pageerror: ${error.message}`));
page.on('console',message=>{if(message.type()==='error')errors.push(`console: ${message.text()}`)});

const response=await page.goto(`${targetUrl}${targetUrl.includes('?')?'&':'?'}qa=${Date.now()}`,{waitUntil:'networkidle',timeout:45000});
assert(response?.ok(),`HTTP ${response?.status()} ${targetUrl}`);
await page.locator('#splash').waitFor({state:'visible',timeout:15000});
await page.locator('.splashArt').evaluate(async image=>{await image.decode()});
assert.match(await page.locator('.splashArt').getAttribute('src'),/title-live-v080\.webp$/);
assert.equal(await page.locator('#app svg').count(),0,'No SVG may be used for V0.8 main visuals');
await page.screenshot({path:`${out}/00-title.png`,fullPage:false});

await page.locator('#startBtn').tap();
await page.locator('#game:not(.hidden)').waitFor({state:'visible',timeout:10000});
const version=await page.evaluate(()=>window.__CATS_TEST_API__?.version);
assert.equal(version,'0.8.0');
assert.equal(await page.locator('#bottomNav [data-nav]').count(),4,'Bottom navigation must contain four primary destinations');
assert.equal(await page.locator('#tower .floor').count(),4,'Vertical slice must contain roof, food, home and lobby');
const normalHeights=await page.locator('#tower .floor').evaluateAll(floors=>floors.map(f=>Math.round(f.getBoundingClientRect().height)));
assert(normalHeights.slice(1).every(height=>height>=280&&height<=380),`Normal floor heights: ${normalHeights}`);
assert.equal(await page.locator('#tower svg').count(),0,'Tower art must not use SVG');
await page.screenshot({path:`${out}/01-tower-normal.png`,fullPage:false});

const assets=[
  '/assets/v080/title-live-v080.webp','/assets/v080/room-food-v080.webp','/assets/v080/room-home-v080.webp',
  '/assets/v080/room-lobby-v080.webp','/assets/v080/room-roof-v080.webp','/assets/v080/room-food-night-v080.webp',
  '/assets/v080/memory-first-home-v080.webp','/assets/v080/mugi-v080.webp','/assets/v080/mugi-sleep-v080.webp'
];
const assetResults=await page.evaluate(async paths=>Promise.all(paths.map(async path=>{
  const image=new Image();image.src=path;await image.decode();return{path,width:image.naturalWidth,height:image.naturalHeight};
})),assets);
for(const item of assetResults){assert(item.width>=512&&item.height>=512,`${item.path} dimensions ${item.width}x${item.height}`)}

await page.locator('#overviewBtn').tap();
await page.waitForTimeout(300);
assert(await page.locator('.world').evaluate(element=>element.classList.contains('overview')),'Overview mode must be active');
const overviewHeights=await page.locator('#tower .floor').evaluateAll(floors=>floors.map(f=>Math.round(f.getBoundingClientRect().height)));
assert(overviewHeights.every(height=>height<=190),`Overview floor heights: ${overviewHeights}`);
await page.screenshot({path:`${out}/02-tower-overview.png`,fullPage:false});
await page.locator('#overviewBtn').tap();
await page.waitForTimeout(250);

await page.locator('[data-nav="cats"]').tap();
const sheet=page.locator('#modal .sheet');
await sheet.waitFor({state:'visible',timeout:5000});
assert.equal((await sheet.locator('header small').innerText()).trim(),'RESIDENTS & FUTURE VISITORS');
assert.equal(await sheet.locator('.catCard').count(),4,'Mugi plus three future cats must appear');
const catImages=sheet.locator('.catCard img');
assert.equal(await catImages.count(),4);
for(let index=0;index<4;index++)await catImages.nth(index).evaluate(async image=>{await image.decode()});
await sheet.screenshot({path:`${out}/03-cats-sheet.png`});
await sheet.locator('header [data-close="1"]').tap();
await sheet.waitFor({state:'detached',timeout:5000});

await page.locator('[data-room="food"] .roomAction').tap();
await page.locator('#modal .sheet').waitFor({state:'visible',timeout:5000});
assert.equal((await page.locator('#modal header small').innerText()).trim(),'3F · MUGI’S LITTLE KITCHEN');
assert.equal(await page.locator('[data-action="specialize"]').count(),2,'Fish restaurant must offer two meaningful specializations');
assert.equal(await page.locator('#fishRange').count(),1,'Fish preparation interaction must exist');
await page.screenshot({path:`${out}/04-food-sheet.png`,fullPage:false});
await page.locator('[data-action="specialize"][data-style="street"]').tap();
await page.waitForTimeout(200);
assert.match(await page.locator('#modal .sheet').innerText(),/にぎやかな屋台型/);
await page.locator('#fishRange').evaluate(input=>{input.value='95';input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}))});
await page.waitForTimeout(250);
assert((await page.evaluate(()=>window.__CATS_TEST_API__.getState().stock))>=4);
await page.locator('#modal header [data-close="1"]').tap();

await page.locator('[data-room="home"] .roomAction').tap();
await page.locator('#modal .sheet').waitFor({state:'visible',timeout:5000});
assert.equal((await page.locator('#modal header small').innerText()).trim(),'2F · A HOME BEFORE A WORKPLACE');
assert.equal(await page.locator('[data-action="pet"]').count(),1);
assert.equal(await page.locator('[data-action="rest"]').count(),1);
await page.screenshot({path:`${out}/05-home-sheet.png`,fullPage:false});
await page.locator('#modal header [data-close="1"]').tap();

await page.evaluate(()=>window.__CATS_TEST_API__.unlock());
await page.evaluate(()=>window.__CATS_TEST_API__.startNight());
await page.locator('.battleCard').waitFor({state:'visible',timeout:5000});
assert.equal(await page.locator('.battleTools button').count(),3,'Night shift must expose three short decisions');
assert.equal(await page.locator('.battleCard svg').count(),0,'Night shift main art must not use SVG');
await page.screenshot({path:`${out}/06-first-night.png`,fullPage:false});

assert.deepEqual(errors,[],`Browser errors: ${JSON.stringify(errors)}`);
const report={passed:true,browserName,targetUrl,version,normalHeights,overviewHeights,assetResults,errors};
await writeFile(`${out}/report.json`,JSON.stringify(report,null,2));
await browser.close();
console.log(`Cat's tower V0.8 QA passed: ${browserName} ${targetUrl}`);
