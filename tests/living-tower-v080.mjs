import { chromium, webkit } from 'playwright';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';

const browserName=process.env.CATS_BROWSER||'chromium';
const targetUrl=process.env.CATS_TEST_URL||'http://127.0.0.1:4173/';
const viewportSpec=process.env.CATS_VIEWPORT||'390x844';
const viewportMatch=/^(\d+)x(\d+)$/.exec(viewportSpec);
assert(viewportMatch,`Invalid CATS_VIEWPORT ${viewportSpec}`);
const viewport={width:Number(viewportMatch[1]),height:Number(viewportMatch[2])};
const out=process.env.CATS_TEST_OUT||`test-results/v080-${browserName}-${viewportSpec}`;
const browserType={chromium,webkit}[browserName];
assert(browserType,`Unsupported browser ${browserName}`);
await mkdir(out,{recursive:true});

const launchOptions={headless:true};
if(browserName==='chromium'&&process.env.CATS_CHROMIUM_EXECUTABLE)launchOptions.executablePath=process.env.CATS_CHROMIUM_EXECUTABLE;
const browser=await browserType.launch(launchOptions);
const contextOptions={
  viewport,screen:viewport,deviceScaleFactor:3,
  isMobile:true,hasTouch:true,locale:'ja-JP',timezoneId:'Asia/Tokyo',reducedMotion:'reduce',
  serviceWorkers:'block',
  userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
};
const context=await browser.newContext(contextOptions);
const page=await context.newPage();
const errors=[];
const badResponses=[];
const failedRequests=[];

function monitor(target,errorList=errors,responseList=badResponses,requestList=failedRequests){
  target.on('pageerror',error=>errorList.push(`pageerror: ${error.message}`));
  target.on('console',message=>{if(message.type()==='error')errorList.push(`console: ${message.text()}`)});
  target.on('response',response=>{if(response.status()>=400)responseList.push(`${response.status()} ${response.url()}`)});
  target.on('requestfailed',request=>requestList.push(`${request.failure()?.errorText||'failed'} ${request.url()}`));
}
monitor(page);

function qaHref(label='main'){
  const url=new URL(targetUrl);
  url.searchParams.set('qa','1');
  url.searchParams.set('run',`${label}-${Date.now()}`);
  return url.href;
}

const response=await page.goto(qaHref(),{waitUntil:'networkidle',timeout:45000});
assert(response?.ok(),`HTTP ${response?.status()} ${targetUrl}`);

const japaneseFont=await page.evaluate(async()=>{
  const family='CatsTowerJP';
  const sample='猫夜明け';
  await document.fonts.load(`700 16px "${family}"`,sample);
  await document.fonts.ready;
  const faces=[...document.fonts].filter(face=>face.family.replace(/["']/g,'')===family);
  const fontResponse=await fetch('/assets/fonts/noto-sans-jp-700-ja.woff2');
  const fontBytes=new Uint8Array(await fontResponse.arrayBuffer());
  const canvas=document.createElement('canvas');
  canvas.width=420;
  canvas.height=90;
  const context=canvas.getContext('2d');
  function fingerprint(font){
    context.clearRect(0,0,canvas.width,canvas.height);
    context.fillStyle='#000';
    context.font=font;
    context.fillText(`${sample} Mugi`,8,62);
    const pixels=context.getImageData(0,0,canvas.width,canvas.height).data;
    let ink=0;
    let hash=2166136261;
    for(let index=3;index<pixels.length;index+=4){
      const alpha=pixels[index];
      if(alpha)ink+=1;
      hash^=alpha;
      hash=Math.imul(hash,16777619);
    }
    return{ink,hash:hash>>>0};
  }
  return{
    status:document.fonts.status,
    checked:document.fonts.check(`700 16px "${family}"`,sample),
    faceCount:faces.length,
    faceStatuses:faces.map(face=>face.status),
    bodyFamily:getComputedStyle(document.body).fontFamily,
    fontHttpStatus:fontResponse.status,
    fontByteLength:fontBytes.byteLength,
    fontSignature:String.fromCharCode(...fontBytes.slice(0,4)),
    customFingerprint:fingerprint(`700 48px "${family}", monospace`),
    fallbackFingerprint:fingerprint('700 48px monospace')
  };
});
assert.equal(japaneseFont.status,'loaded','The document font set must finish loading');
assert.equal(japaneseFont.checked,true,'CatsTowerJP must cover the Japanese UI sample');
assert(japaneseFont.faceCount>=1,'CatsTowerJP must be registered as a web font');
assert(japaneseFont.faceStatuses.every(status=>status==='loaded'),`CatsTowerJP faces must be loaded: ${japaneseFont.faceStatuses.join(', ')}`);
assert.match(japaneseFont.bodyFamily,/CatsTowerJP/,'The bundled Japanese font must lead the inherited UI font stack');
assert.equal(japaneseFont.fontHttpStatus,200,'The bundled Japanese font must be fetchable');
assert(japaneseFont.fontByteLength>500000,`The Japanese WOFF2 subset is unexpectedly small: ${japaneseFont.fontByteLength}`);
assert.equal(japaneseFont.fontSignature,'wOF2','The bundled Japanese font must be WOFF2');
assert(japaneseFont.customFingerprint.ink>0,'The Japanese font probe must render visible glyphs');
assert.notEqual(japaneseFont.customFingerprint.hash,japaneseFont.fallbackFingerprint.hash,'CatsTowerJP must render instead of the local fallback/tofu font');

async function settle(selector='body'){
  const locator=page.locator(selector);
  await locator.waitFor({state:'visible',timeout:10000});
  await locator.evaluate(async root=>{
    await document.fonts.ready;
    const images=[...root.querySelectorAll('img')];
    await Promise.all(images.map(image=>image.decode()));
  });
  await page.waitForTimeout(140);
}

async function assertNoSvg(label,targetPage=page){
  const result=await targetPage.evaluate(()=>{
    const sourceNodes=[...document.querySelectorAll('img,source,object,embed')];
    const sourceViolations=sourceNodes.map(node=>node.currentSrc||node.src||node.data||'').filter(value=>/\.svg(?:[?#]|$)|data:image\/svg\+xml/i.test(value));
    const cssViolations=[...document.querySelectorAll('*')].filter(node=>/\.svg(?:[?#"')]|$)|data:image\/svg\+xml/i.test(getComputedStyle(node).backgroundImage)).map(node=>node.id||node.className||node.tagName);
    return{dom:document.querySelectorAll('svg').length,sourceViolations,cssViolations};
  });
  assert.equal(result.dom,0,`${label}: inline SVG is forbidden`);
  assert.deepEqual(result.sourceViolations,[],`${label}: SVG image sources`);
  assert.deepEqual(result.cssViolations,[],`${label}: CSS SVG sources`);
}

async function clearTransientUi(){
  await page.evaluate(()=>document.querySelector('#toastArea')?.replaceChildren());
}

async function capture(name,selector='body'){
  await clearTransientUi();
  await settle(selector);
  await assertNoSvg(name);
  await page.screenshot({path:`${out}/${name}.png`,fullPage:false});
}

async function captureLocator(name,selector){
  await clearTransientUi();
  await settle(selector);
  await assertNoSvg(name);
  await page.locator(selector).screenshot({path:`${out}/${name}.png`});
}

async function waitSheet(){
  const sheet=page.locator('#modal .sheet');
  await sheet.waitFor({state:'visible',timeout:5000});
  await settle('#modal .sheet');
  assert.equal(await sheet.getAttribute('aria-labelledby'),'sheetTitle','Dialogs must have an accessible name');
  assert((await sheet.locator('#sheetTitle').innerText()).trim().length>0,'Dialog title must not be empty');
  await page.waitForFunction(()=>document.activeElement?.matches('#modal [data-close="1"]'),null,{timeout:5000});
  return sheet;
}

async function closeSheet(){
  const sheet=page.locator('#modal .sheet');
  await sheet.locator('header [data-close="1"]').tap();
  await sheet.waitFor({state:'detached',timeout:5000});
}

async function apiSnapshot(){
  return page.evaluate(()=>{
    const api=window.__CATS_TEST_API__;
    if(!api)throw new Error('Missing ?qa=1 __CATS_TEST_API__');
    return{state:api.getState(),runtime:api.getRuntime(),metrics:api.getMetrics()};
  });
}

async function freeze(){
  await page.evaluate(()=>window.__CATS_TEST_API__.freeze());
}

async function seed(patch){
  await page.evaluate(value=>window.__CATS_TEST_API__.seed(value),patch);
  return apiSnapshot();
}

async function advance(ms){
  await page.evaluate(value=>window.__CATS_TEST_API__.advance(value),ms);
  return apiSnapshot();
}

async function advanceUntil(predicate,{label='condition',maxMs=120000,stepMs=250,dispatch=false,upgradeIds=[]}={}){
  let elapsed=0;
  let snapshot=await apiSnapshot();
  while(elapsed<maxMs&&!predicate(snapshot)){
    snapshot=await page.evaluate(({stepMs,dispatch,upgradeIds})=>{
      const api=window.__CATS_TEST_API__;
      if(dispatch)api.dispatch();
      for(const id of upgradeIds)api.upgrade(id);
      api.advance(stepMs);
      return{state:api.getState(),runtime:api.getRuntime(),metrics:api.getMetrics()};
    },{stepMs,dispatch,upgradeIds});
    elapsed+=stepMs;
  }
  assert(predicate(snapshot),`${label} was not reached after ${elapsed} virtual ms: ${JSON.stringify(snapshot)}`);
  return{elapsed,snapshot};
}

async function assertTapTarget(selector,label){
  const box=await page.locator(selector).boundingBox();
  assert(box,`${label} must have a rendered box`);
  assert(box.width>=44&&box.height>=44,`${label} must be at least 44x44 CSS px: ${JSON.stringify(box)}`);
}

const requiredApi=['freeze','advance','seed','reset','getState','getRuntime','getMetrics','dispatch','upgrade','specialize'];
const apiContract=await page.evaluate(names=>{
  const api=window.__CATS_TEST_API__;
  return{present:Boolean(api),missing:names.filter(name=>typeof api?.[name]!=='function'),version:api?.version,gameplaySchema:api?.gameplaySchema};
},requiredApi);
assert(apiContract.present,'The deterministic QA API must be exposed for ?qa=1');
assert.deepEqual(apiContract.missing,[],`Missing QA methods: ${apiContract.missing.join(', ')}`);
assert.match(String(apiContract.version),/^0\.8(?:\.|$)/,'The new loop remains on the canonical V0.8 line');
const balance=await page.evaluate(()=>{
  const source=window.CatsTowerData?.BALANCE;
  if(!source)throw new Error('Missing CatsTowerData.BALANCE');
  return{
    wallFloor:source.wallFloor,
    dawnUnlockFloor:source.dawnUnlockFloor,
    restaurantUnlockFloor:source.restaurantUnlockFloor,
    roomUnlockFloor:source.roomUnlockFloor,
    firstBossFloor:source.firstBossFloor
  };
});
for(const [name,value] of Object.entries(balance))assert(Number.isInteger(value)&&value>=1,`Invalid balance ${name}: ${value}`);
assert.equal(balance.wallFloor,balance.dawnUnlockFloor,'The first deliberate wall must be where dawn becomes available');

await page.locator('#splash').waitFor({state:'visible',timeout:15000});
await settle('#splash');
assert.match(await page.locator('.splashArt').getAttribute('src'),/\/assets\/v080\/pixel-r2\/tower-night-r2\.png$/);
await capture('00-title','#splash');

await page.locator('#startBtn').tap();
await page.locator('#game:not(.hidden)').waitFor({state:'visible',timeout:10000});
await page.locator('#splash').waitFor({state:'hidden',timeout:10000});
await page.locator('#towerBattlefield').waitFor({state:'visible',timeout:10000});
await freeze();

const requiredDom=['#towerBattlefield','#floorLabel','#bestFloor','#enemyHp','#enemyHpText','#catCount','#dispatchMeter','#tapDispatch','#upgradePanel','#dawnButton'];
for(const selector of requiredDom)assert.equal(await page.locator(selector).count(),1,`${selector} must exist exactly once`);
await assertTapTarget('#tapDispatch','Cat dispatch button');
for(const [selector,label] of [['#brandBtn','Brand button'],['#coinBtn','Coin button'],['#shardBtn','Dawn shard button'],['#menuBtn','Menu button']])await assertTapTarget(selector,label);
const accessibilityContract=await page.evaluate(()=>({
  viewport:document.querySelector('meta[name="viewport"]')?.content||'',
  dispatchRole:document.querySelector('#dispatchGauge')?.getAttribute('role'),
  dispatchNow:document.querySelector('#dispatchGauge')?.getAttribute('aria-valuenow'),
  enemyRole:document.querySelector('#enemyHpTrack')?.getAttribute('role'),
  enemyNow:document.querySelector('#enemyHpTrack')?.getAttribute('aria-valuenow'),
  navCurrent:document.querySelector('#bottomNav [aria-current="page"]')?.dataset.nav,
  appLive:document.querySelector('#app')?.getAttribute('aria-live'),
  toastLive:document.querySelector('#toastArea')?.getAttribute('aria-live')
}));
assert.doesNotMatch(accessibilityContract.viewport,/user-scalable\s*=\s*no/i,'Pinch zoom must remain available');
assert.equal(accessibilityContract.dispatchRole,'progressbar');
assert.match(accessibilityContract.dispatchNow,/^\d+$/);
assert.equal(accessibilityContract.enemyRole,'progressbar');
assert.match(accessibilityContract.enemyNow,/^\d+$/);
assert.equal(accessibilityContract.navCurrent,'tower');
assert.equal(accessibilityContract.appLive,null,'Rapid battle state must not be a global live region');
assert.equal(accessibilityContract.toastLive,'polite','Only concise notices should use the polite live region');
const documentWidth=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,client:document.documentElement.clientWidth}));
assert(documentWidth.scroll<=documentWidth.client+1,`The game must not create page-level horizontal overflow: ${JSON.stringify(documentWidth)}`);

const initialState={
  gameplaySchema:2,coins:0,fish:8,currentFloor:1,bestFloor:1,checkpointFloor:1,
  mugiLevel:1,weaponLevel:1,dispatchLevel:1,restaurantLevel:0,roomLevel:0,
  dawnShards:0,lifetimeShards:0,ascensions:0,firstNightCleared:false,
  tutorialStep:0,memories:['arrival'],hasPlayed:true
};
let snapshot=await seed(initialState);
assert.equal(snapshot.state.gameplaySchema,2,'New saves must use gameplaySchema 2');
assert.equal(snapshot.state.currentFloor,1);
assert.equal(snapshot.runtime.autoDispatches,0,'A seeded run starts before its first automatic dispatch');

const automatic=await advanceUntil(value=>value.runtime.autoDispatches>=1,{label:'automatic cat dispatch',maxMs:15000,stepMs:100});
assert(automatic.snapshot.runtime.unitCount>=1,'Automatic dispatch must put a visible cat into the run');
const autoHp=automatic.snapshot.runtime.enemyHp;
const firstAutoAttack=await advanceUntil(value=>value.runtime.enemyHp<autoHp||value.runtime.kills>0,{label:'automatic movement and attack',maxMs:30000,stepMs:100});
assert(firstAutoAttack.snapshot.runtime.autoDispatches>=1);
await capture('01-auto-climb','#game');

snapshot=await seed(initialState);
const tapBefore={unitCount:snapshot.runtime.unitCount,manualDispatches:snapshot.runtime.manualDispatches,enemyHp:snapshot.runtime.enemyHp};
await page.locator('#tapDispatch').tap();
const tapAfter=await apiSnapshot();
assert.equal(tapAfter.runtime.manualDispatches,tapBefore.manualDispatches+1,'One tap must dispatch one additional cat');
assert(tapAfter.runtime.unitCount>tapBefore.unitCount,'Tap dispatch must visibly increase cat density');
assert.equal(tapAfter.runtime.enemyHp,tapBefore.enemyHp,'Tapping must not directly damage the enemy');
await capture('02-tap-dispatch','#game');

const killStart=tapAfter;
const firstKill=await advanceUntil(value=>value.runtime.kills>killStart.runtime.kills,{label:'first enemy kill',maxMs:90000,stepMs:100,dispatch:true});
assert(firstKill.snapshot.state.coins>killStart.state.coins,'An enemy kill must award spendable coins');
assert(firstKill.snapshot.state.currentFloor>=1);

await seed({...initialState,coins:10000});
const upgradeReady=await advanceUntil(value=>value.metrics.partyDps>0,{label:'live cat ready for an upgrade',maxMs:15000,stepMs:100});
const upgradeBefore=upgradeReady.snapshot;
const upgradeButton=page.locator('[data-action="upgrade-mugi"]');
await upgradeButton.waitFor({state:'visible',timeout:5000});
await assertTapTarget('[data-action="upgrade-mugi"]','Mugi upgrade button');
await upgradeButton.tap();
const upgradeAfter=await apiSnapshot();
assert.equal(upgradeAfter.state.mugiLevel,upgradeBefore.state.mugiLevel+1,'Mugi upgrade must increment exactly one level');
assert(upgradeAfter.state.coins<upgradeBefore.state.coins,'An upgrade must spend coins');
assert(upgradeAfter.metrics.partyDps>upgradeBefore.metrics.partyDps,'An upgrade must immediately increase party DPS');
await capture('03-upgrade-panel','#upgradePanel');

await seed({...initialState,restaurantUnlocked:true,restaurantLevel:1});
const specializationReady=await advanceUntil(value=>value.metrics.partyDps>0,{label:'live cat ready for restaurant specialization',maxMs:15000,stepMs:100});
const specialization=await page.evaluate(()=>window.__CATS_TEST_API__.specialize('bistro'));
const specializationAfter=await apiSnapshot();
assert.equal(specialization.ok,true,'A valid restaurant direction must be selectable once');
assert.equal(specializationAfter.state.specialization,'bistro');
assert(specializationAfter.metrics.partyDps>specializationReady.snapshot.metrics.partyDps,'Restaurant specialization must refresh existing cats immediately');

snapshot=await seed({...initialState,mugiLevel:8,weaponLevel:8,dispatchLevel:5,coins:500});
const floorClear=await advanceUntil(value=>value.state.currentFloor>=2,{label:'first floor conquest',maxMs:90000,stepMs:100});
assert(floorClear.snapshot.state.bestFloor>=floorClear.snapshot.state.currentFloor,'Best floor must follow floor conquest');
assert.match((await page.locator('#floorLabel').innerText()).trim(),/2|二/,'The conquered floor must be visible in the HUD');
await capture('04-floor-conquered','#game');

await seed({...initialState,currentFloor:balance.restaurantUnlockFloor,bestFloor:balance.restaurantUnlockFloor,checkpointFloor:1,restaurantLevel:1,coins:500});
const foodButton=page.locator('[data-action="open-food"]');
await foodButton.waitFor({state:'visible',timeout:5000});
await assertTapTarget('[data-action="open-food"]','Fish restaurant support button');
await foodButton.tap();
let sheet=await waitSheet();
assert.match(await sheet.innerText(),/さかな食堂/,'A conquered floor must open the fish restaurant support node');
assert(await sheet.locator('img[src*="/assets/v080/pixel-r2/tower-night-r2.png"]').count()>=1,'Fish restaurant must use the accepted pixel R2 tower art');
await capture('05-food-support-full','body');
await captureLocator('05-food-support-sheet','#modal .sheet');
await closeSheet();

await seed({...initialState,currentFloor:balance.roomUnlockFloor,bestFloor:balance.roomUnlockFloor,checkpointFloor:balance.roomUnlockFloor,restaurantLevel:1,roomLevel:1,coins:500});
const homeButton=page.locator('[data-action="open-home"]');
await homeButton.waitFor({state:'visible',timeout:5000});
await assertTapTarget('[data-action="open-home"]','Shared room checkpoint button');
await homeButton.tap();
sheet=await waitSheet();
assert.match(await sheet.innerText(),/共同部屋/,'The shared room must be a visible checkpoint and permanent support node');
assert(await sheet.locator('img[src*="/assets/v080/pixel-r2/tower-night-r2.png"]').count()>=1,'Shared room must use the accepted pixel R2 tower art');
await capture('06-shared-room-full','body');
await captureLocator('06-shared-room-sheet','#modal .sheet');
await closeSheet();

const runState={...initialState,restaurantLevel:1,roomLevel:1};
await seed(runState);
const baselineRun=await advanceUntil(value=>value.state.currentFloor>=balance.wallFloor,{label:'baseline arrival at the first deliberate wall',maxMs:300000,stepMs:100});
const baselineMs=baselineRun.elapsed;
const wall=await advanceUntil(value=>value.runtime.atWall===true,{label:'first meaningful wall',maxMs:45000,stepMs:250});
assert.equal(wall.snapshot.state.currentFloor,balance.wallFloor,'The first wall must occur at the configured dawn floor');
const wallFloorBefore=wall.snapshot.state.currentFloor;
await advance(12000);
const wallAfter=await apiSnapshot();
assert.equal(wallAfter.state.currentFloor,wallFloorBefore,'Idle play must remain at the wall long enough to make dawn meaningful');
assert.equal(wallAfter.runtime.atWall,true,'The wall state must remain legible after twelve virtual seconds');
await page.locator('#dawnButton').waitFor({state:'visible',timeout:5000});
assert(await page.locator('#dawnButton').isEnabled(),'Dawn must be available at the wall');
await assertTapTarget('#dawnButton','Dawn button');
await capture('07-wall','#game');

const preDawn=wallAfter.state;
await page.locator('#dawnButton').tap();
sheet=await waitSheet();
for(const kind of ['lost','kept','gained']){
  const summary=sheet.locator(`[data-dawn-list="${kind}"]`);
  await summary.waitFor({state:'visible',timeout:5000});
  assert((await summary.innerText()).trim().length>=3,`Dawn ${kind} summary must be explicit`);
}
const dawnLostText=await sheet.locator('[data-dawn-list="lost"]').innerText();
assert.match(dawnLostText,/ラン内の魚/,'Dawn preview must disclose the fish reset');
assert.match(dawnLostText,/食堂の解放/,'Dawn preview must disclose the restaurant relock');
await capture('08-dawn-preview-full','body');
await captureLocator('08-dawn-preview-sheet','#modal .sheet');
const confirmDawn=sheet.locator('[data-action="confirm-dawn"]');
await sheet.locator('.sheetBody').evaluate(body=>{body.scrollTop=body.scrollHeight});
await confirmDawn.scrollIntoViewIfNeeded();
await confirmDawn.waitFor({state:'visible',timeout:5000});
await assertTapTarget('[data-action="confirm-dawn"]','Dawn confirmation button');
await captureLocator('08-dawn-actions','#modal .sheet');
await confirmDawn.tap();
await page.locator('#modal .sheet').waitFor({state:'detached',timeout:5000}).catch(()=>{});
const postDawn=await apiSnapshot();
assert.equal(postDawn.state.currentFloor,1,'Dawn must restart the climb from floor one');
assert(postDawn.state.bestFloor>=preDawn.bestFloor,'Dawn must retain the best floor');
assert.equal(postDawn.state.restaurantLevel,0,'Dawn must reset the explicitly listed run-only restaurant level');
assert.equal(postDawn.state.roomLevel,preDawn.roomLevel,'Dawn must retain the shared room');
assert.equal(postDawn.state.ascensions,preDawn.ascensions+1,'Dawn must record one ascension');
assert(postDawn.state.dawnShards>preDawn.dawnShards,'Dawn must grant a permanent resource');
assert(postDawn.metrics.permanentMultiplier>1,'The permanent resource must create an effective multiplier');

const replayRun=await advanceUntil(value=>value.state.currentFloor>=balance.wallFloor,{label:'post-dawn replay to the old wall',maxMs:baselineMs,stepMs:100});
const replayMs=replayRun.elapsed;
const speedupRatio=replayMs/baselineMs;
assert(speedupRatio<=0.75,`Replay must be at least 25% faster: baseline=${baselineMs}ms replay=${replayMs}ms ratio=${speedupRatio}`);
await capture('09-faster-replay','#game');

const firstNightBoss=await advanceUntil(value=>value.state.currentFloor===balance.firstBossFloor&&value.runtime.phase!=='transition',{
  label:'first night boss arrival after dawn',maxMs:120000,stepMs:100,dispatch:true,
  upgradeIds:['mugi','weapon','dispatch']
});
assert.equal(firstNightBoss.snapshot.state.currentFloor,balance.firstBossFloor,'The first-night boss must be captured on its configured floor');
assert.equal(firstNightBoss.snapshot.state.firstNightCleared,false,'The boss-arrival evidence must precede the first-night clear');
assert(firstNightBoss.snapshot.runtime.enemyHp>0,'The first-night enemy must still be alive in the boss evidence');
const bossVisual=await page.locator('#enemyUnit').evaluate(node=>{
  const rect=node.getBoundingClientRect();
  const style=getComputedStyle(node);
  const sprite=node.querySelector('.spriteSheet--crow');
  return{
    enemy:node.dataset.enemy,
    phase:node.dataset.phase,
    opacity:Number(style.opacity),
    width:rect.width,
    height:rect.height,
    intersectsViewport:rect.right>0&&rect.bottom>0&&rect.left<innerWidth&&rect.top<innerHeight,
    spriteBackground:sprite?getComputedStyle(sprite).backgroundImage:''
  };
});
assert.equal(bossVisual.enemy,'boss','The 10F evidence must render the boss unit');
assert.notEqual(bossVisual.phase,'defeated','The 10F boss screenshot must not retain the previous floor transition pose');
assert(bossVisual.opacity>0,'The 10F boss sprite must be opaque');
assert(bossVisual.width>0&&bossVisual.height>0&&bossVisual.intersectsViewport,'The 10F boss sprite must have a visible in-viewport box');
assert.match(bossVisual.spriteBackground,/crow-sprites-r2\.png/,'The first-night boss must use the accepted pixel R2 crow sprite');
await capture('10-first-night-boss','#game');

const firstNightClear=await advanceUntil(value=>value.state.firstNightCleared===true,{
  label:'first night boss clear after dawn',maxMs:180000,stepMs:250,dispatch:true,
  upgradeIds:['mugi','weapon','dispatch']
});
assert(firstNightClear.snapshot.state.currentFloor>balance.firstBossFloor,'Clearing the first night must advance beyond the boss floor');
assert(firstNightClear.snapshot.state.memories.includes('first-night'),'Clearing the first night must create its memory');
await capture('11-first-night-clear','#game');

const persistedBefore=firstNightClear.snapshot.state;
await freeze();
await page.reload({waitUntil:'networkidle',timeout:45000});
await page.waitForFunction(()=>Boolean(window.__CATS_TEST_API__),null,{timeout:10000});
const persistedAfter=await page.evaluate(()=>window.__CATS_TEST_API__.getState());
for(const key of ['gameplaySchema','currentFloor','bestFloor','checkpointFloor','restaurantLevel','roomLevel','dawnShards','lifetimeShards','ascensions','firstNightCleared']){
  assert.deepEqual(persistedAfter[key],persistedBefore[key],`Reload must preserve ${key}`);
}
assert.deepEqual(persistedAfter.memories,persistedBefore.memories,'Reload must preserve memories');

async function migrationCase(name,entries,verify){
  const migrationContext=await browser.newContext(contextOptions);
  await migrationContext.addInitScript(values=>{
    for(const [key,value] of Object.entries(values))localStorage.setItem(key,value);
  },entries);
  const migrationPage=await migrationContext.newPage();
  const migrationErrors=[];
  const migrationResponses=[];
  const migrationRequests=[];
  monitor(migrationPage,migrationErrors,migrationResponses,migrationRequests);
  const result=await migrationPage.goto(qaHref(name),{waitUntil:'networkidle',timeout:45000});
  assert(result?.ok(),`${name}: HTTP ${result?.status()}`);
  await migrationPage.waitForFunction(()=>Boolean(window.__CATS_TEST_API__),null,{timeout:10000});
  const migrated=await migrationPage.evaluate(()=>window.__CATS_TEST_API__.getState());
  const stored=await migrationPage.evaluate(()=>localStorage.getItem('cats-tower-v080'));
  verify(migrated,stored);
  assert.deepEqual(migrationErrors,[],`${name}: ${JSON.stringify(migrationErrors)}`);
  assert.deepEqual(migrationResponses,[],`${name}: ${JSON.stringify(migrationResponses)}`);
  assert.deepEqual(migrationRequests,[],`${name}: ${JSON.stringify(migrationRequests)}`);
  await assertNoSvg(name,migrationPage);
  await migrationContext.close();
  return{name,passed:true,gameplaySchema:migrated.gameplaySchema};
}

const livingSave={
  version:'0.8.0',coins:777,stock:9,sales:13,mugiMood:64,specialization:'street',
  firstNightDone:true,memories:['arrival','first-prep'],hasPlayed:true,lastSeen:Date.now()
};
const legacySave={coins:345,sales:8,floors:[{type:'food',stock:7,orderEnd:0}],hasPlayed:true};
const futureSave={gameplaySchema:3,version:'0.9-future',coins:999,fish:88,currentFloor:20,bestFloor:22,mugiLevel:5,weaponLevel:4,dispatchLevel:3,memories:['arrival','future-memory'],lastSeen:Date.now()};
const migrations=[];
migrations.push(await migrationCase('living-v080',{'cats-tower-v080':JSON.stringify(livingSave)},state=>{
  assert.equal(state.gameplaySchema,2);
  assert.equal(state.coins,777,'V0.8 coins must survive migration');
  assert.equal(state.fish,9,'V0.8 stock must become battle fish');
  assert(state.memories.includes('arrival')&&state.memories.includes('first-prep'),'V0.8 memories must survive migration');
}));
migrations.push(await migrationCase('legacy-v01',{'cats-tower-v01':JSON.stringify(legacySave)},state=>{
  assert.equal(state.gameplaySchema,2);
  assert.equal(state.coins,345,'Legacy coins must survive migration');
  assert.equal(state.fish,7,'Legacy food stock must become battle fish');
}));
migrations.push(await migrationCase('corrupt-v080',{'cats-tower-v080':'{not-valid-json'},state=>{
  assert.equal(state.gameplaySchema,2);
  for(const key of ['coins','fish','currentFloor','bestFloor','mugiLevel','weaponLevel','dispatchLevel','dawnShards'])assert(Number.isFinite(state[key]),`Corrupt-save recovery must normalize ${key}`);
  assert(state.currentFloor>=1&&state.bestFloor>=1,'Corrupt-save recovery must return a playable fresh run');
}));
migrations.push(await migrationCase('future-schema',{'cats-tower-v080':JSON.stringify(futureSave)},(state,stored)=>{
  assert.equal(state.currentFloor,20,'A future save must retain known progression in memory');
  assert.equal(state.fish,88,'A future save must retain known resources in memory');
  assert.equal(state.mugiLevel,5,'A future save must retain known levels in memory');
  assert.equal(JSON.parse(stored).gameplaySchema,3,'A future save must never be overwritten as schema2');
}));

assert.deepEqual(errors,[],`Browser errors: ${JSON.stringify(errors)}`);
assert.deepEqual(badResponses,[],`HTTP failures: ${JSON.stringify(badResponses)}`);
assert.deepEqual(failedRequests,[],`Request failures: ${JSON.stringify(failedRequests)}`);
const screenshots=(await readdir(out)).filter(name=>name.endsWith('.png')).sort();
const evidence=[];
for(const name of screenshots){
  const bytes=await readFile(`${out}/${name}`);
  evidence.push({name,sha256:createHash('sha256').update(bytes).digest('hex')});
}

const report={
  passed:true,browserName,targetUrl,version:apiContract.version,gameplaySchema:2,
  viewport:{...viewport,deviceScaleFactor:3,reducedMotion:'reduce'},
  japaneseFont,
  rules:balance,
  loop:{
    autoDispatches:automatic.snapshot.runtime.autoDispatches,
    tapDispatches:tapAfter.runtime.manualDispatches,
    tapDirectDamage:tapBefore.enemyHp-tapAfter.runtime.enemyHp,
    firstKillReward:firstKill.snapshot.state.coins-killStart.state.coins,
    upgrade:{levelBefore:upgradeBefore.state.mugiLevel,levelAfter:upgradeAfter.state.mugiLevel,dpsBefore:upgradeBefore.metrics.partyDps,dpsAfter:upgradeAfter.metrics.partyDps},
    wall:{floor:wallFloorBefore,heldMs:12000},
    dawn:{bestFloorBefore:preDawn.bestFloor,bestFloorAfter:postDawn.state.bestFloor,shardsBefore:preDawn.dawnShards,shardsAfter:postDawn.state.dawnShards},
    replay:{baselineMs,replayMs,speedupRatio},
    firstNightBoss:bossVisual,
    firstNightCleared:firstNightClear.snapshot.state.firstNightCleared
  },
  save:{newSchemaReload:true,migrations},
  evidence,errors,badResponses,failedRequests
};
await writeFile(`${out}/report.json`,JSON.stringify(report,null,2));
await browser.close();
console.log(`Cat's tower V0.8 vertical tower QA passed: ${browserName} ${viewportSpec} ${targetUrl}`);
