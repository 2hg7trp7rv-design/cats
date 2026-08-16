import { chromium, webkit } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';

const browserName=process.env.CATS_BROWSER||'chromium';
const targetUrl=process.env.CATS_TEST_URL||'http://127.0.0.1:4173/';
const out=process.env.CATS_TEST_OUT||`test-results/tower-v071-${browserName}`;
const browserType={chromium,webkit}[browserName];
assert(browserType);
await mkdir(out,{recursive:true});

const browser=await browserType.launch({headless:true});
const context=await browser.newContext({viewport:{width:390,height:844},screen:{width:390,height:844},deviceScaleFactor:3,isMobile:true,hasTouch:true,locale:'ja-JP',timezoneId:'Asia/Tokyo',userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'});
const page=await context.newPage();
const errors=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});

const now=Date.now();
const floors=[['lobby',1,[]],['home',2,[]],['food',3,['mugi']],['craft',4,['mimi']],['play',5,['luna']],['care',6,['toto']]].map(([type,number,cats])=>({id:`${type}-${number}`,number,type,level:1,buildStart:0,buildEnd:0,cats,stock:8,pending:0,orderState:'idle',orderStart:0,orderEnd:0,nextSale:now+600000}));
const cats=[['mugi','food-3'],['luna','play-5'],['toto','care-6'],['mimi','craft-4']].map(([id,floorId])=>({id,level:1,xp:0,mood:90,floorId,lastPet:now,unlocked:now}));
const state={version:'0.7.1',coins:1086,parts:0,floors,cats,bellAt:now+600000,settings:{sound:false},tutorial:true,coach:{battle:true},sales:7,built:6,clears:1,lastBattle:now,lastSeen:now,aidAt:now,aidTotal:0,created:now,battle:null};
await page.addInitScript(({key,value})=>localStorage.setItem(key,JSON.stringify(value)),{key:'cats-tower-v01',value:state});
const response=await page.goto(targetUrl,{waitUntil:'networkidle',timeout:45000});
assert(response?.ok());
await page.locator('#startBtn').tap();
await page.locator('#game:not(.hidden)').waitFor({state:'visible',timeout:10000});

const expected={mugi:'food-3',mimi:'craft-4',luna:'play-5',toto:'care-6'};
const proof={};
for(const [id,floor] of Object.entries(expected)){
  const actor=page.locator(`.floor[data-floor="${floor}"] .cat[data-cat="${id}"]`);
  await actor.waitFor({state:'attached',timeout:5000});
  assert.equal(await actor.count(),1,`${id} must exist exactly once on ${floor}`);
  const img=actor.locator('.catSprite');
  await img.evaluate(async i=>{if(!i.complete)await i.decode()});
  const m=await img.evaluate(i=>({w:i.naturalWidth,h:i.naturalHeight,rw:i.getBoundingClientRect().width,rh:i.getBoundingClientRect().height,display:getComputedStyle(i).display,visibility:getComputedStyle(i).visibility,opacity:getComputedStyle(i).opacity}));
  assert.equal(m.w,512);assert.equal(m.h,512);assert(m.rh>=100);assert.notEqual(m.display,'none');assert.notEqual(m.visibility,'hidden');assert.notEqual(m.opacity,'0');
  proof[id]={floor,...m};
}
assert.equal(await page.locator('.tower .catSprite').count(),4);
assert.equal(await page.locator('.cat.artError').count(),0);
assert.deepEqual(errors,[]);
await page.locator('#tower').screenshot({path:`${out}/tower-all-six-floors.png`});
await writeFile(`${out}/tower-report.json`,JSON.stringify({passed:true,browserName,targetUrl,proof,errors},null,2));
await browser.close();
console.log(`V0.7.1 full-tower visual proof passed: ${browserName}`);
