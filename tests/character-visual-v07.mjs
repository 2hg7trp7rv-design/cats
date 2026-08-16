import { chromium, webkit } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';

const browserName = process.env.CATS_BROWSER || 'chromium';
const targetUrl = process.env.CATS_TEST_URL || 'http://127.0.0.1:4173/';
const out = process.env.CATS_TEST_OUT || `test-results/v071-${browserName}`;
const browserType = { chromium, webkit }[browserName];
assert(browserType, `Unsupported browser: ${browserName}`);
await mkdir(out, { recursive: true });

const browser = await browserType.launch({ headless: true });
const context = await browser.newContext({
  viewport:{width:390,height:844}, screen:{width:390,height:844}, deviceScaleFactor:3,
  isMobile:true, hasTouch:true, locale:'ja-JP', timezoneId:'Asia/Tokyo',
  userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
});
const page = await context.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

const now = Date.now();
const floors = [
  ['lobby',1,[]],['home',2,[]],['food',3,['mugi']],
  ['craft',4,['mimi']],['play',5,['luna']],['care',6,['toto']]
].map(([type,number,cats])=>({id:`${type}-${number}`,number,type,level:1,buildStart:0,buildEnd:0,cats,stock:8,pending:0,orderState:'idle',orderStart:0,orderEnd:0,nextSale:now+600000}));
const cats = [['mugi','food-3'],['luna','play-5'],['toto','care-6'],['mimi','craft-4']]
  .map(([id,floorId])=>({id,level:1,xp:0,mood:90,floorId,lastPet:now,unlocked:now}));
const state = {version:'0.7.1',coins:1086,parts:0,floors,cats,bellAt:now+600000,settings:{sound:false},tutorial:true,coach:{battle:true},sales:7,built:6,clears:1,lastBattle:now,lastSeen:now,aidAt:now,aidTotal:0,created:now,battle:null};
await page.addInitScript(({key,value})=>localStorage.setItem(key,JSON.stringify(value)),{key:'cats-tower-v01',value:state});

const response = await page.goto(targetUrl,{waitUntil:'networkidle',timeout:45000});
assert(response?.ok(),`HTTP ${response?.status()} ${targetUrl}`);
await page.locator('#startBtn').waitFor({state:'visible',timeout:15000});
await page.locator('#startBtn').tap();
await page.locator('#game:not(.hidden)').waitFor({state:'visible',timeout:10000});

const assetResults = await page.evaluate(async()=>{
  const ids=['mugi','luna','toto','mimi'];
  return await Promise.all(ids.map(async id=>{
    const img=new Image(); img.src=`/assets/illustrations/cat-${id}.v070.webp`; await img.decode();
    return {id,w:img.naturalWidth,h:img.naturalHeight};
  }));
});
for(const a of assetResults){assert.equal(a.w,512,`${a.id} width`);assert.equal(a.h,512,`${a.id} height`)}

const towerImgs=page.locator('.tower .catSprite');
await towerImgs.first().waitFor({state:'visible',timeout:10000});
assert.equal(await towerImgs.count(),4,'All four cats must render in tower');
const towerHeights=await towerImgs.evaluateAll(imgs=>imgs.map(i=>i.getBoundingClientRect().height));
assert(towerHeights.every(h=>h>=100),`Tower image heights: ${towerHeights}`);
await page.screenshot({path:`${out}/01-tower-viewport.png`,fullPage:false});

await page.locator('[data-nav="cats"]').tap();
const listSheet=page.locator('#modal .sheet');
await listSheet.waitFor({state:'visible',timeout:5000});
assert.equal((await listSheet.locator('header small').innerText()).trim(),'CAT RESIDENTS','Cat list eyebrow must be visible');
assert.match((await listSheet.locator('h2').innerText()).trim(),/^猫たち · 4\//,'Cat list title must be visible');
const listImgs=listSheet.locator('.catCard .catSprite');
assert.equal(await listImgs.count(),4,'All four cats must render in list');
const listMetrics=await listImgs.evaluateAll(imgs=>imgs.map(i=>({w:i.naturalWidth,h:i.naturalHeight,rh:i.getBoundingClientRect().height})));
assert(listMetrics.every(x=>x.w===512&&x.h===512&&x.rh>=100),`List metrics: ${JSON.stringify(listMetrics)}`);
await page.screenshot({path:`${out}/02-list-viewport.png`,fullPage:false});
await listSheet.screenshot({path:`${out}/02-list-sheet.png`});
await listSheet.locator('header [data-close="1"]').tap();
await listSheet.waitFor({state:'detached',timeout:5000});

const names={mugi:'ムギ',luna:'ルナ',toto:'トト',mimi:'ミミ'};
const profileHeights={};
const profileProof={};
for(const id of ['mugi','luna','toto','mimi']){
  await page.locator('[data-nav="cats"]').tap();
  const sheet=page.locator('#modal .sheet');
  await sheet.waitFor({state:'visible',timeout:5000});
  assert.equal((await sheet.locator('header small').innerText()).trim(),'CAT RESIDENTS',`${id} must start from resident list`);
  await sheet.locator(`.catCard .btn[data-a="cat"][data-cat="${id}"]`).tap();
  await page.waitForFunction(({name})=>{
    const sheet=document.querySelector('#modal .sheet');
    if(!sheet) return false;
    return sheet.querySelector('header small')?.textContent?.trim().startsWith('CAT PROFILE') && sheet.querySelector('h2')?.textContent?.trim()===name;
  },{name:names[id]},{timeout:5000});
  const profile=page.locator('#modal .sheet');
  const eyebrow=(await profile.locator('header small').innerText()).trim();
  const title=(await profile.locator('h2').innerText()).trim();
  assert.match(eyebrow,/^CAT PROFILE · LV\.1$/,`${id} profile eyebrow`);
  assert.equal(title,names[id],`${id} profile title`);
  const img=profile.locator('.hero .catSprite');
  await img.waitFor({state:'visible',timeout:5000});
  await img.evaluate(async i=>{ if(!i.complete) await i.decode(); });
  const metrics=await img.evaluate(i=>({w:i.naturalWidth,h:i.naturalHeight,rw:i.getBoundingClientRect().width,rh:i.getBoundingClientRect().height,src:i.currentSrc,visible:!!(i.offsetWidth||i.offsetHeight||i.getClientRects().length)}));
  assert.equal(metrics.w,512,`${id} profile decode width`);
  assert.equal(metrics.h,512,`${id} profile decode height`);
  assert.equal(metrics.visible,true,`${id} profile image must be visually present`);
  assert(metrics.rh>=175,`${id} profile too small: ${metrics.rh}`);
  profileHeights[id]=metrics.rh;
  profileProof[id]={eyebrow,title,...metrics};
  await page.screenshot({path:`${out}/profile-${id}-viewport.png`,fullPage:false});
  await profile.screenshot({path:`${out}/profile-${id}-sheet.png`});
  await profile.locator('header [data-close="1"]').tap();
  await profile.waitFor({state:'detached',timeout:5000});
}
const vals=Object.values(profileHeights);
assert(Math.max(...vals)-Math.min(...vals)<=2,`Profile size drift: ${JSON.stringify(profileHeights)}`);
assert.equal(await page.locator('.cat.artError').count(),0,'No character fallback may be visible');
assert.deepEqual(errors,[]);
await writeFile(`${out}/report.json`,JSON.stringify({passed:true,browserName,targetUrl,assetResults,towerHeights,listMetrics,profileHeights,profileProof,errors},null,2));
await browser.close();
console.log(`V0.7.1 character visual QA passed with visible modal proof: ${browserName} ${targetUrl}`);
