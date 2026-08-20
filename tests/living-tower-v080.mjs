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
const out=process.env.CATS_TEST_OUT||`test-results/v082-${browserName}-${viewportSpec}`;
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

const v082Assets=await page.evaluate(async paths=>{
  const results=[];
  for(const path of paths){
    const response=await fetch(path,{cache:'no-store'});
    const bytes=await response.arrayBuffer();
    const image=new Image();
    image.src=path;
    await image.decode();
    results.push({path,status:response.status,bytes:bytes.byteLength,width:image.naturalWidth,height:image.naturalHeight});
  }
  return results;
},['/assets/v082/pixel-r3/cats-cast-r3.png','/assets/v082/pixel-r3/enemies-r3.png']);
for(const asset of v082Assets){
  assert.equal(asset.status,200,`${asset.path} must be fetchable`);
  assert(asset.bytes>500000,`${asset.path} is unexpectedly small: ${asset.bytes}`);
  assert.deepEqual([asset.width,asset.height],[1448,1086],`${asset.path} atlas dimensions`);
}

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
  await page.waitForFunction(()=>{
    const node=document.querySelector('#modal .sheet');
    if(!node)return false;
    const rect=node.getBoundingClientRect();
    return rect.width>0&&rect.height>0&&rect.right>0&&rect.bottom>0&&rect.left<innerWidth&&rect.top<innerHeight;
  },null,{timeout:5000});
  const viewportContract=await sheet.evaluate(node=>{
    const rect=node.getBoundingClientRect();
    return{
      top:rect.top,bottom:rect.bottom,left:rect.left,right:rect.right,
      width:rect.width,height:rect.height,
      innerWidth,innerHeight,scrollX,scrollY,
    };
  });
  assert.equal(viewportContract.scrollX,0,'Opening a dialog must not horizontally scroll the document');
  assert.equal(viewportContract.scrollY,0,'Opening a dialog must not vertically scroll the document');
  assert(viewportContract.width>0&&viewportContract.height>0,'An opened dialog must have a visible box');
  assert(viewportContract.right>0&&viewportContract.bottom>0&&viewportContract.left<viewportContract.innerWidth&&viewportContract.top<viewportContract.innerHeight,'An opened dialog must intersect the viewport before any test-side locator scrolling');
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

async function enemyGroundGeometry(){
  return page.locator('#enemyUnit').evaluate(node=>{
    // These body-foot rows come from the source PNG alpha masks (alpha > 32),
    // so this QA measurement remains independent from the CSS positioning value.
    const bodyFootRatios={
      crow:{idle:589/887,moving:589/887,attacking:583/887,defeated:570/887},
      owl:{idle:310/362,moving:301/362,attacking:324/362,defeated:304/362},
      'black-feather-barrier':{idle:313/362,moving:313/362,attacking:313/362,defeated:313/362},
      boss:{idle:302/362,moving:279/362,attacking:304/362,defeated:302/362},
    };
    const layer=document.querySelector('#unitLayer').getBoundingClientRect();
    const rect=node.getBoundingClientRect();
    const enemy=node.dataset.enemy;
    const phase=node.dataset.phase;
    const footRatio=bodyFootRatios[enemy]?.[phase];
    if(!Number.isFinite(footRatio))throw new Error(`Missing independent enemy foot ratio for ${enemy}/${phase}`);
    const ground=layer.top+layer.height*.88;
    const visibleFoot=rect.top+rect.height*footRatio;
    return{enemy,phase,footRatio,ground,visibleFoot,hoverGap:ground-visibleFoot};
  });
}

async function partyAlphaGeometry(){
  return page.evaluate(()=>{
    const alphaBounds={
      mugi:{cell:[543,724],box:[0,111,543,581]},
      luna:{cell:[362,362],box:[30,65,332,322]},
      toto:{cell:[362,362],box:[34,33,328,328]},
      'helper-tabby':{cell:[362,362],box:[32,60,330,300]},
      'helper-gray':{cell:[362,362],box:[32,60,330,300]},
      'helper-calico':{cell:[362,362],box:[32,60,330,300]},
    };
    const battle=document.querySelector('.towerSlice--battle').getBoundingClientRect();
    const cats=[...document.querySelectorAll('.catUnit')].map(node=>{
      const kind=[...node.classList].find(value=>value.startsWith('catUnit--'))?.slice('catUnit--'.length);
      const bounds=alphaBounds[kind];
      const rect=node.getBoundingClientRect();
      const [cellWidth,cellHeight]=bounds.cell;
      const [x0,y0,x1,y1]=bounds.box;
      return{
        kind,
        phase:node.dataset.phase,
        visible:{
          left:rect.left+x0/cellWidth*rect.width,
          top:rect.top+y0/cellHeight*rect.height,
          right:rect.left+x1/cellWidth*rect.width,
          bottom:rect.top+y1/cellHeight*rect.height,
        },
      };
    }).sort((a,b)=>a.visible.left-b.visible.left);
    const gaps=cats.slice(1).map((cat,index)=>cat.visible.left-cats[index].visible.right);
    return{
      count:cats.length,
      kinds:cats.map(cat=>cat.kind),
      phases:[...new Set(cats.map(cat=>cat.phase))],
      minimumGap:gaps.length?Math.min(...gaps):null,
      contained:cats.every(cat=>cat.visible.left>=battle.left+1&&cat.visible.right<=battle.right-1&&cat.visible.top>=battle.top+1&&cat.visible.bottom<=battle.bottom-1),
    };
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

const requiredApi=['freeze','advance','seed','reset','getState','getRuntime','getMetrics','dispatch','upgrade'];
const apiContract=await page.evaluate(names=>{
  const api=window.__CATS_TEST_API__;
  return{present:Boolean(api),missing:names.filter(name=>typeof api?.[name]!=='function'),version:api?.version,gameplaySchema:api?.gameplaySchema};
},requiredApi);
assert(apiContract.present,'The deterministic QA API must be exposed for ?qa=1');
assert.deepEqual(apiContract.missing,[],`Missing QA methods: ${apiContract.missing.join(', ')}`);
assert.equal(apiContract.version,'0.8.2','The redesigned loop must advertise V0.8.2 exactly');
const balance=await page.evaluate(()=>{
  const source=window.CatsTowerData?.BALANCE;
  if(!source)throw new Error('Missing CatsTowerData.BALANCE');
  return{
    wallFloor:source.wallFloor,
    dawnUnlockFloor:source.dawnUnlockFloor,
    restaurantUnlockFloor:source.restaurantUnlockFloor,
    roomUnlockFloor:source.roomUnlockFloor,
    firstBossFloor:source.firstBossFloor,
    floorVictoryHoldMs:source.floorVictoryHoldMs,
    floorAscentMs:source.floorAscentMs,
    fixedStepMs:source.fixedStepMs
  };
});
for(const [name,value] of Object.entries(balance))assert(Number.isInteger(value)&&value>=1,`Invalid balance ${name}: ${value}`);
assert.equal(balance.wallFloor,balance.dawnUnlockFloor,'The first deliberate wall must be where dawn becomes available');

const recoveryRosterContract=await page.evaluate(()=>{
  const Core=window.CatsTowerCore;
  const Data=window.CatsTowerData;
  const engine=Core.createEngine({
    gameplaySchema:Data.GAMEPLAY_SCHEMA,currentFloor:5,bestFloor:5,runFloorPeak:5,
    checkpointFloor:5,restaurantUnlocked:true,restaurantLevel:1,roomUnlocked:true,roomLevel:1,
    hasPlayed:true,
  });
  const kinds=['mugi','luna','toto','helper-tabby','helper-gray','helper-calico'];
  for(const kind of kinds){
    const result=Core.spawnSpecificCat(engine.state,engine.runtime,kind,'manual');
    if(!result.ok)throw new Error(`Unable to build recovery roster: ${kind}/${result.reason}`);
  }
  for(const unit of engine.runtime.units){
    unit.phase='moving';
    unit.progress=0;
  }
  const defeated=engine.runtime.units.find(unit=>unit.kind==='helper-gray');
  defeated.phase='attacking';
  defeated.progress=1;
  defeated.hp=1;
  engine.runtime.enemy.attack=2;
  engine.runtime.enemy.attackCooldownMs=0;
  engine.runtime.enemy.attackIntervalMs=10000;
  engine.advance(Data.BALANCE.fixedStepMs);
  const queued=engine.getRuntime();
  if(!queued.recoveryQueue.some(entry=>entry.kind==='helper-gray'))throw new Error('Defeated helper must reserve its recovery slot');
  engine.runtime.autoDispatchCooldownMs=0;
  engine.advance(Data.BALANCE.fixedStepMs);
  const waiting=engine.getRuntime();
  const waitingCounts=Object.fromEntries(kinds.map(kind=>[kind,waiting.units.filter(unit=>unit.kind===kind).length]));
  const recoveryMs=waiting.recoveryQueue.find(entry=>entry.kind==='helper-gray')?.remainingMs||0;
  engine.advance(recoveryMs+Data.BALANCE.fixedStepMs);
  const recovered=engine.getRuntime();
  const recoveredCounts=Object.fromEntries(kinds.map(kind=>[kind,recovered.units.filter(unit=>unit.kind===kind).length]));
  return{
    queuedKinds:queued.units.map(unit=>unit.kind),
    waitingCounts,
    waitingUnitCount:waiting.unitCount,
    recoveredCounts,
    recoveredUnitCount:recovered.unitCount,
    recoveryCount:recovered.recoveryCount,
    totalUnitsRecovered:recovered.metrics.totalUnitsRecovered,
  };
});
assert.equal(recoveryRosterContract.waitingUnitCount,5,'A recovering roster slot must stay empty instead of creating an overlapping duplicate');
assert(Object.values(recoveryRosterContract.waitingCounts).every(count=>count<=1),`No cat kind may overlap while recovery is pending: ${JSON.stringify(recoveryRosterContract.waitingCounts)}`);
assert.equal(recoveryRosterContract.recoveredUnitCount,6,'The original helper must refill its reserved roster slot');
assert(Object.values(recoveryRosterContract.recoveredCounts).every(count=>count===1),`Every formation kind must be unique after recovery: ${JSON.stringify(recoveryRosterContract.recoveredCounts)}`);
assert.equal(recoveryRosterContract.recoveryCount,0,'Completed recovery must leave no queued duplicate');
assert.equal(recoveryRosterContract.totalUnitsRecovered,1,'Exactly one helper must complete recovery');

const spawnApiContract=await page.evaluate(()=>{
  const Core=window.CatsTowerCore;
  const Data=window.CatsTowerData;
  const base={
    gameplaySchema:Data.GAMEPLAY_SCHEMA,currentFloor:5,bestFloor:5,runFloorPeak:5,
    checkpointFloor:5,restaurantUnlocked:true,roomUnlocked:true,hasPlayed:true,
  };
  const full=Core.createEngine(base);
  for(const kind of ['mugi','luna','toto','helper-tabby','helper-gray','helper-calico']){
    const result=Core.spawnSpecificCat(full.state,full.runtime,kind,'manual');
    if(!result.ok)throw new Error(`Unable to build full API roster: ${kind}/${result.reason}`);
  }
  const completed=Core.createEngine({...base,currentFloor:10,bestFloor:10,runFloorPeak:10,firstNightCleared:true,completed:true});
  return{
    fullReason:Core.spawnCat(full.state,full.runtime,'manual').reason,
    completedReason:Core.spawnCat(completed.state,completed.runtime,'manual').reason,
  };
});
assert.equal(spawnApiContract.fullReason,'unit-cap','spawnCat must preserve the public full-roster reason');
assert.equal(spawnApiContract.completedReason,'completed','spawnCat must preserve the public completion reason');

const roleTargetContract=await page.evaluate(()=>{
  const Core=window.CatsTowerCore;
  const Data=window.CatsTowerData;
  const base={gameplaySchema:Data.GAMEPLAY_SCHEMA,currentFloor:5,bestFloor:5,runFloorPeak:5,hasPlayed:true};
  function targetFor(kinds,progressByKind={}){
    const engine=Core.createEngine(base);
    for(const kind of kinds){
      const result=Core.spawnSpecificCat(engine.state,engine.runtime,kind,'manual');
      if(!result.ok)throw new Error(`Unable to build role target probe: ${kind}/${result.reason}`);
    }
    for(const unit of engine.runtime.units){
      unit.phase='attacking';
      unit.progress=progressByKind[unit.kind]??1;
      unit.attackCooldownMs=1e9;
    }
    engine.runtime.enemy.hp=1e9;
    engine.runtime.enemy.maxHp=1e9;
    engine.runtime.enemy.attack=1;
    engine.runtime.enemy.attackCooldownMs=0;
    engine.runtime.enemy.attackIntervalMs=10000;
    engine.drainEvents();
    engine.advance(Data.BALANCE.fixedStepMs);
    const hit=engine.drainEvents().find(event=>event.type==='enemy-hit');
    const target=engine.runtime.units.find(unit=>unit.id===hit?.unitId);
    return{kind:target?.kind||null,role:target?.role||null};
  }
  return{
    withFrontline:targetFor(['luna','mugi'],{luna:1,mugi:.4}),
    withoutFrontline:targetFor(['toto','luna']),
  };
});
assert.equal(roleTargetContract.withFrontline.role,'frontline','Enemies must target a frontline even when a ranged cat is farther ahead or older');
assert.equal(roleTargetContract.withFrontline.kind,'mugi','Mugi must protect Luna in the role-target regression');
assert(['ranged','support'].includes(roleTargetContract.withoutFrontline.role),'Enemies may fall back to a non-frontline only when no frontline is attacking');

await page.locator('#splash').waitFor({state:'visible',timeout:15000});
await settle('#splash');
assert.match(await page.locator('.splashArt').getAttribute('src'),/\/assets\/v080\/pixel-r2\/tower-night-r2\.png$/);
await capture('00-title','#splash');

await page.locator('#startBtn').tap();
await page.locator('#game:not(.hidden)').waitFor({state:'visible',timeout:10000});
await page.locator('#splash').waitFor({state:'hidden',timeout:10000});
await page.locator('#towerBattlefield').waitFor({state:'visible',timeout:10000});
assert.match(await page.locator('#shardBtn').getAttribute('aria-label'),/^朝の鈴 /,'The dawn resource must use the same visible and accessible name');
assert.equal(await page.locator('#dispatchGauge').getAttribute('aria-label'),'次の自動出撃まで','The dispatch gauge must initially describe automatic dispatch');
await page.locator('#menuBtn').tap();
let sheet=await waitSheet();
const modalPauseBefore=await apiSnapshot();
await page.waitForTimeout(650);
const modalPauseAfter=await apiSnapshot();
assert.equal(modalPauseAfter.state.playTimeMs,modalPauseBefore.state.playTimeMs,'Opening a modal must pause core play time');
assert.equal(modalPauseAfter.runtime.enemyHp,modalPauseBefore.runtime.enemyHp,'Opening a modal must pause enemy HP');
assert.equal(modalPauseAfter.state.currentFloor,modalPauseBefore.state.currentFloor,'Opening a modal must pause floor progression');
assert.equal(await page.locator('#game').getAttribute('data-paused'),'true','The paused modal state must be exposed to the DOM');
await capture('00-settings-paused','body');
await closeSheet();
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
const crowGround=await enemyGroundGeometry();
assert.equal(crowGround.enemy,'crow','Floor one must use the crow sprite');
assert(crowGround.hoverGap>=3&&crowGround.hoverGap<=7.5,`The crow must hover just above the shared floor, not another tier: ${crowGround.hoverGap}px`);

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

await seed({
  ...initialState,currentFloor:5,bestFloor:5,runFloorPeak:5,
  restaurantUnlocked:true,restaurantLevel:1,roomUnlocked:true,roomLevel:1,
});
await advanceUntil(value=>value.runtime.partyFull===true,{
  label:'six-cat party',maxMs:5000,stepMs:200,dispatch:true,
});
const filledParty=await advanceUntil(value=>value.runtime.units.every(unit=>unit.progress>=.999),{
  label:'six-cat grounded party',maxMs:3000,stepMs:100,
});
assert.equal(filledParty.snapshot.runtime.unitCount,6,'The final visible party must contain exactly six cats');
assert.equal(filledParty.snapshot.runtime.visibleUnitCap,6,'The visible unit cap must remain six');
const namedKinds=filledParty.snapshot.runtime.units.filter(unit=>unit.named).map(unit=>unit.kind).sort();
assert.deepEqual(namedKinds,['luna','mugi','toto'],'Mugi, Luna, and Toto must each appear exactly once');
const castVisual=await page.evaluate(()=>{
  const nodes=[...document.querySelectorAll('.catUnit .spriteSheet--cast')];
  return{
    count:nodes.length,
    characters:nodes.map(node=>node.dataset.character),
    backgrounds:nodes.map(node=>getComputedStyle(node).backgroundImage),
  };
});
assert(castVisual.count>=3,'Luna, Toto, and helper cats must render from the cast atlas');
assert(castVisual.characters.includes('luna')&&castVisual.characters.includes('toto')&&castVisual.characters.includes('helper'),'The cast atlas must expose all three rows');
assert(castVisual.backgrounds.every(value=>/\/assets\/v082\/pixel-r3\/cats-cast-r3\.png/.test(value)),'All non-Mugi cats must use the V0.8.2 cast atlas');
const helperHueVisual=await page.evaluate(()=>Object.fromEntries(
  [...document.querySelectorAll('.catUnit[class*="catUnit--helper-"]')].map(node=>{
    const kind=[...node.classList].find(value=>value.startsWith('catUnit--helper-'))?.slice('catUnit--'.length);
    return[kind,getComputedStyle(node).getPropertyValue('--helper-hue').trim()];
  })
));
assert.deepEqual(helperHueVisual,{'helper-tabby':'42deg','helper-gray':'84deg','helper-calico':'0deg'},'Helper appearance colors must be fixed by kind, not by transient unit id');
const partyGeometry=await page.evaluate(()=>{
  const alphaBounds={
    mugi:{cell:[543,724],box:[0,111,543,581]},
    luna:{cell:[362,362],box:[30,65,332,322]},
    toto:{cell:[362,362],box:[34,33,328,328]},
    'helper-tabby':{cell:[362,362],box:[32,60,330,300]},
    'helper-gray':{cell:[362,362],box:[32,60,330,300]},
    'helper-calico':{cell:[362,362],box:[32,60,330,300]},
  };
  // The source-atlas body feet are deliberately separate from CSS --foot-y.
  // Toto's attack row excludes the shield ring from the physical paw position;
  // alphaBounds still includes that effect when checking clipping and spacing.
  const bodyFootRows={
    mugi:{cellHeight:724,idle:576,walk:581,attack:581,cheer:581},
    luna:{cellHeight:362,idle:319,walk:322,attack:322,cheer:322},
    toto:{cellHeight:362,idle:292,walk:295,attack:295,cheer:294},
    'helper-tabby':{cellHeight:362,idle:298,walk:299,attack:291,cheer:300},
    'helper-gray':{cellHeight:362,idle:298,walk:299,attack:291,cheer:300},
    'helper-calico':{cellHeight:362,idle:298,walk:299,attack:291,cheer:300},
  };
  const battle=document.querySelector('.towerSlice--battle').getBoundingClientRect();
  const layer=document.querySelector('#unitLayer').getBoundingClientRect();
  const cats=[...document.querySelectorAll('.catUnit')].map(node=>{
    const kind=[...node.classList].find(value=>value.startsWith('catUnit--'))?.slice('catUnit--'.length);
    const bounds=alphaBounds[kind];
    const footRows=bodyFootRows[kind];
    const frame=node.querySelector('.spriteSheet')?.dataset.frame;
    const rect=node.getBoundingClientRect();
    const [cellWidth,cellHeight]=bounds.cell;
    const [x0,y0,x1,y1]=bounds.box;
    const bodyFootRow=footRows?.[frame];
    if(!Number.isFinite(bodyFootRow))throw new Error(`Missing independent cat foot row for ${kind}/${frame}`);
    const footRatio=bodyFootRow/footRows.cellHeight;
    return{
      kind,frame,footRatio,
      foot:rect.top+footRatio*rect.height,
      visible:{
        left:rect.left+x0/cellWidth*rect.width,
        top:rect.top+y0/cellHeight*rect.height,
        right:rect.left+x1/cellWidth*rect.width,
        bottom:rect.top+y1/cellHeight*rect.height,
      },
    };
  }).sort((a,b)=>a.visible.left-b.visible.left);
  const feet=cats.map(cat=>cat.foot);
  const gaps=cats.slice(1).map((cat,index)=>cat.visible.left-cats[index].visible.right);
  return{
    cats,
    footSpread:Math.max(...feet)-Math.min(...feet),
    groundRatio:(feet.reduce((sum,value)=>sum+value,0)/feet.length-layer.top)/layer.height,
    minimumGap:Math.min(...gaps),
    contained:cats.every(cat=>cat.visible.left>=battle.left+1&&cat.visible.right<=battle.right-1&&cat.visible.top>=battle.top+1&&cat.visible.bottom<=battle.bottom-1),
  };
});
assert(partyGeometry.footSpread<=1.5,`All six cats must share one floor contact line: ${partyGeometry.footSpread}px`);
assert(partyGeometry.groundRatio>=.875&&partyGeometry.groundRatio<=.885,`Party body-foot line must stay on the active floor: ${partyGeometry.groundRatio}`);
assert(partyGeometry.minimumGap>=2,`Arrived cat silhouettes must remain visually distinct: ${partyGeometry.minimumGap}px`);
assert.equal(partyGeometry.contained,true,'No visible cat pixels may be clipped by the active floor');
const alignmentPhaseMatrix=await page.evaluate(()=>{
  const layerNode=document.querySelector('#unitLayer');
  const layer=layerNode.getBoundingClientRect();
  const ground=layer.top+layer.height*.88;
  const catRows={
    mugi:{cellHeight:724,idle:576,moving:581,attacking:581,celebrating:581},
    luna:{cellHeight:362,idle:319,moving:322,attacking:322,celebrating:322},
    toto:{cellHeight:362,idle:292,moving:295,attacking:295,celebrating:294},
    'helper-tabby':{cellHeight:362,idle:298,moving:299,attacking:291,celebrating:300},
    'helper-gray':{cellHeight:362,idle:298,moving:299,attacking:291,celebrating:300},
    'helper-calico':{cellHeight:362,idle:298,moving:299,attacking:291,celebrating:300},
  };
  const enemyRows={
    crow:{cellHeight:887,idle:589,moving:589,attacking:583,defeated:570,hover:6},
    owl:{cellHeight:362,idle:310,moving:301,attacking:324,defeated:304,hover:6},
    'black-feather-barrier':{cellHeight:362,idle:313,moving:313,attacking:313,defeated:313,hover:4},
    boss:{cellHeight:362,idle:302,moving:279,attacking:304,defeated:302,hover:6},
  };
  const cats=[];
  for(const [kind,rows] of Object.entries(catRows)){
    for(const phase of ['idle','moving','attacking','celebrating']){
      const probe=document.createElement('div');
      probe.className=`catUnit catUnit--${kind}`;
      probe.dataset.phase=phase;
      probe.dataset.facing='right';
      probe.style.cssText='--x:50%;--y:88%;transition:none;animation:none;visibility:hidden';
      layerNode.appendChild(probe);
      const rect=probe.getBoundingClientRect();
      const bodyFoot=rect.top+rect.height*rows[phase]/rows.cellHeight;
      cats.push({kind,phase,bodyFoot,gap:ground-bodyFoot});
      probe.remove();
    }
  }
  const enemies=[];
  for(const [enemy,rows] of Object.entries(enemyRows)){
    for(const phase of ['idle','moving','attacking','defeated']){
      const probe=document.createElement('div');
      probe.className='enemyUnit';
      probe.dataset.enemy=enemy;
      probe.dataset.phase=phase;
      probe.dataset.facing='left';
      probe.style.cssText='--x:86%;--y:88%;transition:none;animation:none;visibility:hidden';
      layerNode.appendChild(probe);
      const rect=probe.getBoundingClientRect();
      const bodyFoot=rect.top+rect.height*rows[phase]/rows.cellHeight;
      enemies.push({enemy,phase,expectedHover:rows.hover,bodyFoot,hoverGap:ground-bodyFoot});
      probe.remove();
    }
  }
  return{
    cats,
    enemies,
    maximumCatGroundError:Math.max(...cats.map(item=>Math.abs(item.gap))),
    maximumEnemyHoverError:Math.max(...enemies.map(item=>Math.abs(item.hoverGap-item.expectedHover))),
  };
});
assert.equal(alignmentPhaseMatrix.cats.length,24,'All six cats must be checked in all four atlas phases');
assert.equal(alignmentPhaseMatrix.enemies.length,16,'All four enemies must be checked in all four atlas phases');
assert(alignmentPhaseMatrix.maximumCatGroundError<=.05,`Every cat phase must keep its source-atlas body foot on the floor: ${alignmentPhaseMatrix.maximumCatGroundError}px`);
assert(alignmentPhaseMatrix.maximumEnemyHoverError<=.05,`Every enemy phase must keep its source-atlas body foot at the intended hover: ${alignmentPhaseMatrix.maximumEnemyHoverError}px`);
const rallyBefore=await apiSnapshot();
assert.equal(await page.locator('#tapDispatch').getAttribute('data-mode'),'rally','A full party must convert the dispatch control to rally');
await page.locator('#tapDispatch').tap();
const rallyAfter=await apiSnapshot();
assert.equal(rallyAfter.runtime.enemyHp,rallyBefore.runtime.enemyHp,'Rally input must deal zero direct damage');
assert.equal(rallyAfter.runtime.rallyRemainingMs,6000,'Rally must begin with a six-second duration');
assert.equal(rallyAfter.metrics.totalRallies,rallyBefore.metrics.totalRallies+1,'A full-party tap must start one rally');
assert.equal(await page.locator('#tapDispatch').getAttribute('data-mode'),'active','The active rally state must be visible in the DOM');
assert.equal(await page.locator('#dispatchGauge').getAttribute('aria-label'),'号令中','A full-party gauge must announce the active rally instead of automatic dispatch');
const rallyHelperFilters=await page.evaluate(()=>Object.fromEntries(
  [...document.querySelectorAll('.catUnit[class*="catUnit--helper-"]')].map(node=>{
    const kind=[...node.classList].find(value=>value.startsWith('catUnit--helper-'))?.slice('catUnit--'.length);
    return[kind,getComputedStyle(node).filter];
  })
));
for(const [kind,degrees] of Object.entries({'helper-tabby':42,'helper-gray':84,'helper-calico':0})){
  assert.match(rallyHelperFilters[kind],new RegExp(`hue-rotate\\(${degrees}deg\\)`),`${kind} must retain its kind-fixed hue during rally`);
}
await capture('02-full-party-rally','#game');
await advance(6000);
const rallyCharging=await apiSnapshot();
assert.equal(rallyCharging.runtime.rallyRemainingMs,0,'Rally must end after six seconds');
assert(rallyCharging.runtime.rallyCooldownMs>0,'Rally must enter a charging period after ending');
await advance(rallyCharging.runtime.rallyCooldownMs);
assert.equal((await apiSnapshot()).runtime.rallyReady,true,'Rally must become reusable after charging');

await seed(initialState);
const killStart=await apiSnapshot();
const firstKill=await advanceUntil(value=>value.runtime.kills>killStart.runtime.kills,{label:'first enemy kill',maxMs:90000,stepMs:100,dispatch:true});
assert(firstKill.snapshot.state.coins>killStart.state.coins,'An enemy kill must award spendable coins');
assert.equal(firstKill.snapshot.state.currentFloor,1,'A defeated floor must remain current during the victory beat');
assert.equal(firstKill.snapshot.runtime.pendingFloor,2,'A defeated floor must schedule the adjacent floor');
assert.equal(firstKill.snapshot.runtime.transitionStage,'victory','Floor clear must begin with a visible victory beat');
assert.equal(await page.locator('#enemyUnit').getAttribute('data-phase'),'defeated','The old enemy must remain defeated during the victory beat');
await advance(balance.floorVictoryHoldMs+balance.fixedStepMs);
const ascendingBeat=await apiSnapshot();
assert.equal(ascendingBeat.state.currentFloor,1,'The floor label must not jump before the ascent finishes');
assert.equal(ascendingBeat.runtime.transitionStage,'ascending','Victory must flow into an explicit ascent beat');
assert.equal(await page.locator('#enemyUnit').getAttribute('data-phase'),'defeated','The old enemy must not revive visually during ascent');
await advance(balance.floorAscentMs);
const enteredFloor=await apiSnapshot();
assert.equal(enteredFloor.state.currentFloor,2,'The next floor becomes current only after the ascent');
assert.equal(enteredFloor.runtime.pendingFloor,null,'Entering the next floor must clear its pending transition');
assert.equal(await page.locator('#enemyUnit').getAttribute('data-phase'),'moving','Only the newly entered floor may restore a moving enemy');

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

snapshot=await seed({...initialState,mugiLevel:8,weaponLevel:8,dispatchLevel:5,coins:500});
const floorClear=await advanceUntil(value=>value.state.currentFloor>=2,{label:'first floor conquest',maxMs:90000,stepMs:100});
assert(floorClear.snapshot.state.bestFloor>=floorClear.snapshot.state.currentFloor,'Best floor must follow floor conquest');
assert.match((await page.locator('#floorLabel').innerText()).trim(),/2|二/,'The conquered floor must be visible in the HUD');
await capture('04-floor-conquered','#game');

await seed({...initialState,currentFloor:2,bestFloor:2,runFloorPeak:2});
const owlVisual=await page.locator('#enemyUnit').evaluate(node=>({
  enemy:node.dataset.enemy,
  character:node.querySelector('.spriteSheet--enemies')?.dataset.character||'',
  spriteBackground:getComputedStyle(node.querySelector('.spriteSheet--enemies')).backgroundImage,
}));
assert.equal(owlVisual.enemy,'owl','Floor two must use the second normal enemy archetype');
assert.equal(owlVisual.character,'owl','The owl must use its dedicated atlas row');
assert.match(owlVisual.spriteBackground,/\/assets\/v082\/pixel-r3\/enemies-r3\.png/,'The owl must use the V0.8.2 enemy atlas');
const owlGround=await enemyGroundGeometry();
assert(owlGround.hoverGap>=3&&owlGround.hoverGap<=7.5,`The owl must hover just above the shared floor, not another tier: ${owlGround.hoverGap}px`);

await seed({...initialState,currentFloor:balance.restaurantUnlockFloor,bestFloor:balance.restaurantUnlockFloor,checkpointFloor:1,restaurantLevel:1,coins:500});
const foodButton=page.locator('[data-action="open-food"]');
await foodButton.waitFor({state:'visible',timeout:5000});
await assertTapTarget('[data-action="open-food"]','Fish restaurant support button');
await foodButton.tap();
sheet=await waitSheet();
assert.match(await sheet.innerText(),/さかな食堂/,'A conquered floor must open the fish restaurant support node');
assert.doesNotMatch(await sheet.innerText(),/屋台型|ビストロ型|速度型|一撃型|魚を投げる|皿を滑らせる|魚スライド/,'The restaurant must not expose the removed branching or fish minigame language');
assert.equal(await sheet.locator('[data-action="specialize"],[data-style]').count(),0,'The restaurant must not expose the removed specialization branch controls');
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
assert.equal(wallAfter.runtime.enemy.id,'black-feather-barrier','Floor eight must use the dedicated black-feather barrier');
const wallVisual=await page.locator('#enemyUnit').evaluate(node=>({
  enemy:node.dataset.enemy,
  character:node.querySelector('.spriteSheet--enemies')?.dataset.character||'',
  spriteBackground:getComputedStyle(node.querySelector('.spriteSheet--enemies')).backgroundImage,
}));
assert.equal(wallVisual.enemy,'black-feather-barrier','The wall DOM must identify the dedicated barrier');
assert.equal(wallVisual.character,'barrier','The wall must use its dedicated atlas row');
assert.match(wallVisual.spriteBackground,/\/assets\/v082\/pixel-r3\/enemies-r3\.png/,'The wall must use the V0.8.2 enemy atlas');
const wallGround=await enemyGroundGeometry();
assert(wallGround.hoverGap>=3&&wallGround.hoverGap<=7.5,`The barrier must hover just above the shared floor, not another tier: ${wallGround.hoverGap}px`);
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
assert.doesNotMatch(dawnLostText,/ラン内の魚|魚の在庫|皿/,'Dawn must not revive the removed fish inventory loop');
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

const firstNightBoss=await advanceUntil(value=>value.state.currentFloor===balance.firstBossFloor&&value.runtime.enemy.id==='great-crow'&&!value.runtime.completed&&value.runtime.enemyHp>0,{
  label:'first night boss arrival after dawn',maxMs:120000,stepMs:100,dispatch:true,
  upgradeIds:['mugi','weapon','dispatch']
});
assert.equal(firstNightBoss.snapshot.state.currentFloor,balance.firstBossFloor,'The first-night boss must be captured on its configured floor');
assert.equal(firstNightBoss.snapshot.state.firstNightCleared,false,'The boss-arrival evidence must precede the first-night clear');
assert(firstNightBoss.snapshot.runtime.enemyHp>0,'The first-night enemy must still be alive in the boss evidence');
const bossVisual=await page.locator('#enemyUnit').evaluate(node=>{
  const rect=node.getBoundingClientRect();
  const style=getComputedStyle(node);
  const sprite=node.querySelector('.spriteSheet--enemies');
  return{
    enemy:node.dataset.enemy,
    character:sprite?.dataset.character||'',
    phase:node.dataset.phase,
    opacity:Number(style.opacity),
    width:rect.width,
    height:rect.height,
    intersectsViewport:rect.right>0&&rect.bottom>0&&rect.left<innerWidth&&rect.top<innerHeight,
    spriteBackground:sprite?getComputedStyle(sprite).backgroundImage:''
  };
});
assert.equal(bossVisual.enemy,'boss','The 10F evidence must render the boss unit');
assert.equal(bossVisual.character,'boss','Kurobane must use its dedicated boss atlas row');
assert.notEqual(bossVisual.phase,'defeated','The 10F boss screenshot must not retain the previous floor transition pose');
assert(bossVisual.opacity>0,'The 10F boss sprite must be opaque');
assert(bossVisual.width>0&&bossVisual.height>0&&bossVisual.intersectsViewport,'The 10F boss sprite must have a visible in-viewport box');
assert.match(bossVisual.spriteBackground,/\/assets\/v082\/pixel-r3\/enemies-r3\.png/,'The first-night boss must use the dedicated V0.8.2 enemy atlas');
const bossGround=await enemyGroundGeometry();
assert(bossGround.hoverGap>=3&&bossGround.hoverGap<=7.5,`Kurobane must hover just above the shared floor, not another tier: ${bossGround.hoverGap}px`);
const bossEntryFormation=await partyAlphaGeometry();
assert.equal(bossEntryFormation.count,6,'All six cats must remain visible when entering the boss floor');
assert.equal(new Set(bossEntryFormation.kinds).size,6,'The boss-floor entry formation must keep all six roster kinds distinct');
assert(bossEntryFormation.minimumGap>=2,`Moving cats must retain visible alpha-box separation on floor entry: ${bossEntryFormation.minimumGap}px`);
assert.equal(bossEntryFormation.contained,true,'The moving boss-entry formation must stay inside the active floor');
await capture('10-first-night-boss','#game');
const bossEntryFormationSweep=[bossEntryFormation];
for(let index=0;index<24;index+=1){
  const runtime=(await apiSnapshot()).runtime;
  if(runtime.units.every(unit=>unit.progress>=.999))break;
  await advance(100);
  bossEntryFormationSweep.push(await partyAlphaGeometry());
}
assert((await apiSnapshot()).runtime.units.every(unit=>unit.progress>=.999),'Every cat must finish the boss-floor entry sweep');
assert(bossEntryFormationSweep.length>=2,'Boss-floor entry formation must be sampled across movement');
assert(bossEntryFormationSweep.every(sample=>sample.count===6&&new Set(sample.kinds).size===6),'Every moving sample must retain all six unique roster kinds');
assert(bossEntryFormationSweep.every(sample=>sample.minimumGap>=2),`Moving formation must never overlap at any sampled progress: ${Math.min(...bossEntryFormationSweep.map(sample=>sample.minimumGap))}px`);
assert(bossEntryFormationSweep.every(sample=>sample.contained),'Moving formation must remain contained throughout floor entry');
const bossEntryFormationSweepSummary={
  samples:bossEntryFormationSweep.length,
  minimumGap:Math.min(...bossEntryFormationSweep.map(sample=>sample.minimumGap)),
  allContained:bossEntryFormationSweep.every(sample=>sample.contained),
};

const firstNightClear=await advanceUntil(value=>value.state.firstNightCleared===true&&value.state.completed===true&&value.runtime.completed===true,{
  label:'first night boss clear after dawn',maxMs:180000,stepMs:250,dispatch:true,
  upgradeIds:['mugi','weapon','dispatch']
});
assert.equal(firstNightClear.snapshot.state.currentFloor,balance.firstBossFloor,'Clearing the first night must remain on floor ten');
assert.equal(firstNightClear.snapshot.state.bestFloor,balance.firstBossFloor,'The completed run must clamp the best floor to ten');
assert.equal(firstNightClear.snapshot.runtime.phase,'completed','Clearing Kurobane must enter the completed phase');
assert.equal(firstNightClear.snapshot.runtime.pendingFloor,null,'Completion must not schedule floor eleven');
assert(firstNightClear.snapshot.state.memories.includes('first-night'),'Clearing the first night must create its memory');
assert.equal(firstNightClear.snapshot.runtime.unitCount,6,'The immediate victory state must reunite all six cats');
assert.equal(new Set(firstNightClear.snapshot.runtime.units.map(unit=>unit.kind)).size,6,'The immediate victory roster must contain six unique kinds');
assert.equal(firstNightClear.snapshot.runtime.recoveryCount,0,'Completion must clear every pending room recovery');
assert(firstNightClear.snapshot.runtime.units.every(unit=>unit.phase==='celebrating'&&unit.progress===1&&unit.hp===unit.maxHp),'Every cat must enter a full-health victory pose immediately');
const completedImmediateGeometry=await partyAlphaGeometry();
assert.equal(completedImmediateGeometry.count,6,'The immediate victory view must render all six cats');
assert(completedImmediateGeometry.minimumGap>=2&&completedImmediateGeometry.contained,'The immediate victory roster must remain separated and contained');
await advance(10000);
const completedHold=await apiSnapshot();
assert.equal(completedHold.state.currentFloor,balance.firstBossFloor,'Completed simulation must never enter floor eleven');
assert.equal(completedHold.runtime.phase,'completed','The completed state must remain stable');
assert.equal(completedHold.runtime.unitCount,6,'The completed hold must retain all six victory cats');
assert.equal(completedHold.runtime.recoveryCount,0,'The completed hold must not retain a recovery queue');
await capture('11-first-night-clear','#game');
assert.equal(await page.locator('#tapDispatch').getAttribute('data-mode'),'completed','The call bell must become a completion control');
assert.equal(await page.locator('#tapDispatch').isDisabled(),false,'The completed control must remain available after the result sheet is closed');
await page.locator('#tapDispatch').tap();
sheet=await waitSheet();
assert.match(await sheet.locator('#sheetTitle').innerText(),/最初の夜番 完了/,'The completion result must be reopenable from the tower');
await closeSheet();

const persistedBefore=firstNightClear.snapshot.state;
await freeze();
await page.reload({waitUntil:'networkidle',timeout:45000});
await page.waitForFunction(()=>Boolean(window.__CATS_TEST_API__),null,{timeout:10000});
const persistedAfter=await page.evaluate(()=>window.__CATS_TEST_API__.getState());
for(const key of ['gameplaySchema','currentFloor','bestFloor','checkpointFloor','restaurantLevel','roomLevel','dawnShards','lifetimeShards','ascensions','firstNightCleared','completed']){
  assert.deepEqual(persistedAfter[key],persistedBefore[key],`Reload must preserve ${key}`);
}
assert.deepEqual(persistedAfter.memories,persistedBefore.memories,'Reload must preserve memories');
await page.locator('#startBtn').evaluate(button=>button.click());
await page.locator('#game:not(.hidden)').waitFor({state:'visible',timeout:5000});
await freeze();
sheet=await waitSheet();
assert.match(await sheet.locator('#sheetTitle').innerText(),/最初の夜番 完了/,'A completed save must restore its completion sheet after re-entry');
await closeSheet();
const completedReloadRuntime=await page.evaluate(()=>window.__CATS_TEST_API__.getRuntime());
assert.equal(completedReloadRuntime.unitCount,6,'Reloading a completed save must restore a six-cat victory roster');
assert.equal(new Set(completedReloadRuntime.units.map(unit=>unit.kind)).size,6,'The restored victory roster must contain six unique kinds');
assert(completedReloadRuntime.units.every(unit=>unit.phase==='celebrating'&&unit.progress===1),'Every restored victory cat must hold its completed pose');
const completedReloadGeometry=await partyAlphaGeometry();
assert.equal(completedReloadGeometry.count,6,'The restored victory roster must render all six cats');
assert(completedReloadGeometry.minimumGap>=2&&completedReloadGeometry.contained,'The restored victory roster must remain separated and contained');

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
const v081PostDawnSave={gameplaySchema:2,version:'0.8.1',currentFloor:1,bestFloor:11,runFloorPeak:1,enemyFloor:1,firstNightCleared:true,completed:false,ascensions:1,memories:['arrival','first-night'],hasPlayed:true};
const v081BossClearSave={gameplaySchema:2,version:'0.8.1',currentFloor:11,bestFloor:11,runFloorPeak:11,enemyFloor:11,firstNightCleared:true,completed:false,memories:['arrival','first-night'],hasPlayed:true};
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
migrations.push(await migrationCase('v081-post-dawn',{'cats-tower-v080':JSON.stringify(v081PostDawnSave)},state=>{
  assert.equal(state.currentFloor,1,'A historical best floor above ten must not rewind a post-dawn run to the boss');
  assert.equal(state.bestFloor,10,'A historical V0.8.1 best floor must clamp to the finished slice');
  assert.equal(state.completed,false,'Historical bestFloor alone must not mark the active post-dawn run completed');
  assert.equal(state.firstNightCleared,true,'Post-dawn migration must retain first-night history');
  assert.equal(state.ascensions,1,'Post-dawn migration must retain ascension history');
}));
migrations.push(await migrationCase('v081-boss-clear',{'cats-tower-v080':JSON.stringify(v081BossClearSave)},state=>{
  assert.equal(state.currentFloor,10,'An active legacy run beyond ten must clamp to the finished boss floor');
  assert.equal(state.bestFloor,10,'An active legacy boss clear must clamp best floor to ten');
  assert.equal(state.completed,true,'An active legacy run beyond ten with first-night clear must become completed');
  assert.equal(state.firstNightCleared,true,'Legacy boss-clear history must survive normalization');
}));
migrations.push(await migrationCase('future-schema',{'cats-tower-v080':JSON.stringify(futureSave)},(state,stored)=>{
  assert.equal(state.currentFloor,10,'A future save above the finished slice must be safely clamped to floor ten in memory');
  assert.equal(state.bestFloor,10,'A future save best floor must be clamped to the completed slice boundary');
  assert.equal(state.fish,88,'A future save must retain known resources in memory');
  assert.equal(state.mugiLevel,5,'A future save must retain known levels in memory');
  assert.deepEqual(JSON.parse(stored),futureSave,'A future save must never be overwritten or destructively clamped in storage');
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
  v082Assets,
  modalPause:{playTimeMs:modalPauseAfter.state.playTimeMs-modalPauseBefore.state.playTimeMs,enemyDamage:modalPauseBefore.runtime.enemyHp-modalPauseAfter.runtime.enemyHp,floorBefore:modalPauseBefore.state.currentFloor,floorAfter:modalPauseAfter.state.currentFloor},
  rules:balance,
  recoveryRosterContract,
  roleTargetContract,
  loop:{
    autoDispatches:automatic.snapshot.runtime.autoDispatches,
    tapDispatches:tapAfter.runtime.manualDispatches,
    tapDirectDamage:tapBefore.enemyHp-tapAfter.runtime.enemyHp,
    rally:{directDamage:rallyBefore.runtime.enemyHp-rallyAfter.runtime.enemyHp,durationMs:6000,unitCount:filledParty.snapshot.runtime.unitCount,namedKinds,castVisual,helperHueVisual,rallyHelperFilters,partyGeometry,alignmentPhaseMatrix},
    firstKillReward:firstKill.snapshot.state.coins-killStart.state.coins,
    upgrade:{levelBefore:upgradeBefore.state.mugiLevel,levelAfter:upgradeAfter.state.mugiLevel,dpsBefore:upgradeBefore.metrics.partyDps,dpsAfter:upgradeAfter.metrics.partyDps},
    wall:{floor:wallFloorBefore,heldMs:12000,visual:wallVisual,ground:wallGround},
    dawn:{bestFloorBefore:preDawn.bestFloor,bestFloorAfter:postDawn.state.bestFloor,shardsBefore:preDawn.dawnShards,shardsAfter:postDawn.state.dawnShards},
    replay:{baselineMs,replayMs,speedupRatio},
    firstEnemy:{ground:crowGround},
    normalEnemy:{...owlVisual,ground:owlGround},
    firstNightBoss:{...bossVisual,ground:bossGround,entryFormation:bossEntryFormation,entryFormationSweep:bossEntryFormationSweepSummary},
    completedImmediateRoster:{unitCount:firstNightClear.snapshot.runtime.unitCount,kinds:firstNightClear.snapshot.runtime.units.map(unit=>unit.kind),recoveryCount:firstNightClear.snapshot.runtime.recoveryCount,geometry:completedImmediateGeometry},
    firstNightCleared:firstNightClear.snapshot.state.firstNightCleared,
    firstNightCompleted:firstNightClear.snapshot.state.completed,
    completedFloor:firstNightClear.snapshot.state.currentFloor
  },
  save:{newSchemaReload:true,completedReloadRuntime:{unitCount:completedReloadRuntime.unitCount,kinds:completedReloadRuntime.units.map(unit=>unit.kind),phases:[...new Set(completedReloadRuntime.units.map(unit=>unit.phase))],geometry:completedReloadGeometry},migrations},
  evidence,errors,badResponses,failedRequests
};
await writeFile(`${out}/report.json`,JSON.stringify(report,null,2));
await browser.close();
console.log(`Cat's tower V0.8.2 redesigned tower QA passed: ${browserName} ${viewportSpec} ${targetUrl}`);
