(()=>{
'use strict';

const Data=window.CatsTowerData;
const Core=window.CatsTowerCore;
if(!Data||!Core)throw new Error('Cat tower engine failed to load');

const $=selector=>document.querySelector(selector);
const $$=selector=>[...document.querySelectorAll(selector)];
const now=()=>Date.now();
const clamp=(value,min,max)=>Math.min(max,Math.max(min,value));
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[char]));
const storageGet=key=>{try{return localStorage.getItem(key)}catch{return null}};
const storageSet=(key,value)=>{try{localStorage.setItem(key,value);return true}catch{return false}};
const storageRemove=key=>{try{localStorage.removeItem(key);return true}catch{return false}};
const format=value=>{
  const number=Math.max(0,Number(value)||0);
  if(number<10000)return Math.floor(number).toLocaleString('ja-JP');
  const units=[['京',1e16],['兆',1e12],['億',1e8],['万',1e4]];
  const unit=units.find(([,size])=>number>=size);
  return unit?`${(number/unit[1]).toFixed(number/unit[1]>=100?0:1)}${unit[0]}`:String(Math.floor(number));
};

const els={
  splash:$('#splash'),start:$('#startBtn'),game:$('#game'),coins:$('#coins'),shards:$('#dawnShards'),
  floor:$('#floorLabel'),best:$('#bestFloor'),catCount:$('#catCount'),dispatchMeter:$('#dispatchMeter'),dispatchGauge:$('#dispatchGauge'),
  battlefield:$('#towerBattlefield'),scene:$('.towerScene'),backdrop:$('#towerBackdrop'),unitLayer:$('#unitLayer'),
  effects:$('#effectLayer'),enemyName:$('#enemyName'),enemyMark:$('#enemyMark'),enemyHp:$('#enemyHp'),enemyHpTrack:$('#enemyHpTrack'),
  enemyHpText:$('#enemyHpText'),supportNode:$('#supportNode'),callout:$('#floorCallout'),tap:$('#tapDispatch'),
  mugiLevel:$('#mugiLevel'),weaponLevel:$('#weaponLevel'),dispatchLevel:$('#dispatchLevel'),
  mugiCost:$('#mugiCost'),weaponCost:$('#weaponCost'),dispatchCost:$('#dispatchCost'),
  dawn:$('#dawnButton'),dawnPreview:$('#dawnRewardPreview'),nav:$('#bottomNav'),modal:$('#modal'),
  template:$('#sheetTemplate'),toasts:$('#toastArea'),memoryBadge:$('#memoryBadge'),menu:$('#menuBtn'),
  coin:$('#coinBtn'),shard:$('#shardBtn'),brand:$('#brandBtn')
};

const primaryRaw=storageGet(Data.SAVE_KEY);
const legacyRaw=storageGet(Data.LEGACY_KEY);
const restored=Core.restoreState(primaryRaw,legacyRaw,now());
if(restored.migrated&&primaryRaw&&!storageGet(Data.SCHEMA1_BACKUP_KEY)){
  storageSet(Data.SCHEMA1_BACKUP_KEY,primaryRaw);
}
let engine=Core.createEngine(restored.state,{now:now()});
const offlineElapsed=Math.max(0,now()-engine.state.lastSeen);
const offline=engine.applyOffline(offlineElapsed,now());
let saveBlocked=Boolean(restored.unsupportedSchema);
let saveBlockKind=restored.unsupportedSchema?'future':'';
let storageWarningShown=false;
let running=false;
let raf=0;
let lastFrame=performance.now();
let lastRender=0;
let lastSave=performance.now();
let lastFloor=engine.state.currentFloor;
let activeSheet='';
let sheetReturnFocus=null;
let calloutTimer=0;

function save(){
  if(saveBlocked)return false;
  const saved=storageSet(Data.SAVE_KEY,engine.serialize(now()));
  if(!saved&&!storageWarningShown){
    storageWarningShown=true;
    requestAnimationFrame(()=>toast('この端末では保存できません。空き容量とSafariの設定を確認してください。','warn'));
  }
  return saved;
}

function toast(text,tone=''){
  const node=document.createElement('div');
  node.className=`toast ${tone}`;
  node.textContent=text;
  els.toasts.appendChild(node);
  setTimeout(()=>node.remove(),2900);
}

function showCallout(title,text=''){
  clearTimeout(calloutTimer);
  els.callout.innerHTML=`<strong>${esc(title)}</strong>${text?`<small>${esc(text)}</small>`:''}`;
  els.callout.classList.remove('hidden');
  calloutTimer=setTimeout(()=>els.callout.classList.add('hidden'),1500);
}

function showEffect(text,x=79,y=57,tone=''){
  const node=document.createElement('span');
  node.className=`battleFx ${tone}`;
  node.style.left=`${x}%`;
  node.style.top=`${y}%`;
  node.textContent=text;
  els.effects.appendChild(node);
  setTimeout(()=>node.remove(),650);
}

function addMemory(id){
  if(!engine.state.memories.includes(id)){
    engine.state.memories.push(id);
    engine.state.memoryNew=true;
  }
}

function handleEvents(visual=true){
  const events=engine.drainEvents();
  for(const event of events.slice(-32)){
    if(event.type==='cat-hit'&&visual){
      showEffect(`-${format(event.damage)}`,82,54,'hitFx');
    }else if(event.type==='enemy-hit'&&visual){
      showEffect('!',67,64,'dangerFx');
    }else if(event.type==='floor-cleared'){
      if(visual)showCallout(`${event.floor}F 制圧`,`猫たちは ${event.nextFloor}F へ`);
    }else if(event.type==='support-unlocked'){
      const name=event.id==='restaurant'?'さかな食堂':'猫の共同部屋';
      if(visual)toast(`${name}が塔の支援拠点になりました。`,'good');
    }else if(event.type==='upgrade-bought'&&visual){
      showEffect('UP!',24,76,'goodFx');
    }else if(event.type==='dawn-complete'){
      if(visual)showCallout('夜明け',`恒久戦力 ×${event.permanentMultiplier.toFixed(2)}`);
    }
  }
}

function spriteFrame(phase,isEnemy=false){
  if(phase==='attacking')return isEnemy?'peck':'attack';
  if(phase==='moving')return isEnemy?'fly':'walk';
  if(phase==='defeated')return isEnemy?'retreat':'cheer';
  return 'idle';
}

function renderUnits(runtime){
  const liveIds=new Set();
  for(const unit of runtime.units){
    liveIds.add(String(unit.id));
    let node=els.unitLayer.querySelector(`.catUnit[data-unit-id="${unit.id}"]`);
    if(!node){
      node=document.createElement('div');
      node.className=`catUnit catUnit--${unit.kind}`;
      node.dataset.unitId=String(unit.id);
      node.dataset.facing='right';
      node.innerHTML='<span class="spriteSheet spriteSheet--mugi" data-frame="walk"></span>';
      els.unitLayer.appendChild(node);
    }
    const x=10+unit.progress*59;
    const y=71+(unit.lane-.5)*16;
    node.style.setProperty('--x',`${x}%`);
    node.style.setProperty('--y',`${y}%`);
    node.dataset.phase=unit.phase;
    node.querySelector('.spriteSheet').dataset.frame=spriteFrame(unit.phase);
    node.style.opacity=unit.hp>0?'1':'0';
    if(unit.kind==='helper')node.style.setProperty('--helper-hue',`${(unit.id%4)*34}deg`);
  }
  $$('.catUnit[data-unit-id]').forEach(node=>{if(!liveIds.has(node.dataset.unitId))node.remove()});

  let enemy=els.unitLayer.querySelector('#enemyUnit');
  if(!enemy){
    enemy=document.createElement('div');
    enemy.id='enemyUnit';
    enemy.className='enemyUnit';
    enemy.dataset.facing='left';
    enemy.innerHTML='<span class="spriteSheet spriteSheet--crow" data-frame="idle"></span>';
    els.unitLayer.appendChild(enemy);
  }
  enemy.dataset.enemy=runtime.enemy.isBoss?'boss':runtime.enemy.id;
  enemy.dataset.phase=runtime.phase==='fighting'?'attacking':'moving';
  enemy.style.setProperty('--x','82%');
  enemy.style.setProperty('--y','67%');
  enemy.querySelector('.spriteSheet').dataset.frame=spriteFrame(enemy.dataset.phase,true);
}

function renderSupport(state){
  const node=els.supportNode;
  node.className='supportNode hidden';
  node.removeAttribute('data-action');
  if(state.roomUnlocked||state.roomLevel>0){
    node.className='supportNode supportNode--home';
    node.dataset.action='open-home';
    node.innerHTML='<span>⌂</span><strong>共同部屋</strong>';
    node.style.setProperty('--x','76%');
    node.style.setProperty('--y','38%');
  }else if(state.restaurantUnlocked||state.currentFloor>=Data.BALANCE.restaurantUnlockFloor){
    node.className='supportNode supportNode--food';
    node.dataset.action='open-food';
    node.innerHTML='<span>≈</span><strong>さかな食堂</strong>';
    node.style.setProperty('--x','76%');
    node.style.setProperty('--y','43%');
  }
}

function renderUpgrade(id,levelNode,costNode){
  const state=engine.state;
  const cost=Core.getUpgradeCost(state,id);
  const definition=Data.UPGRADES[id];
  const button=$(`[data-upgrade="${id}"]`);
  levelNode.textContent=`Lv.${state[definition.stateField]}`;
  costNode.textContent=Number.isFinite(cost)?`${format(cost)}¢`:'LOCK';
  button.disabled=!Number.isFinite(cost)||state.coins<cost;
}

function render(){
  const state=engine.state;
  const runtime=engine.getRuntime();
  const metrics=engine.getMetrics();
  els.coins.textContent=format(state.coins);
  els.shards.textContent=format(state.dawnShards);
  els.coin.setAttribute('aria-label',`コイン ${format(state.coins)}`);
  els.shard.setAttribute('aria-label',`夜明けのかけら ${format(state.dawnShards)}`);
  els.floor.textContent=`${state.currentFloor}F`;
  els.best.textContent=`${state.bestFloor}F`;
  els.catCount.textContent=runtime.unitCount;
  const dispatchProgress=1-clamp(runtime.autoDispatchCooldownMs/Math.max(1,metrics.dispatchIntervalMs),0,1);
  const dispatchPercent=Math.round(dispatchProgress*100);
  els.dispatchMeter.style.width=`${dispatchPercent}%`;
  els.dispatchGauge.setAttribute('aria-valuenow',String(dispatchPercent));
  els.enemyName.textContent=runtime.enemy.name;
  els.enemyMark.textContent=runtime.enemy.isBoss?'BOSS':runtime.atWall?'WALL':'WILD';
  els.enemyHpText.textContent=`HP ${format(runtime.enemyHp)} / ${format(runtime.enemyMaxHp)}`;
  const enemyPercent=Math.round(clamp(runtime.enemyHp/Math.max(1,runtime.enemyMaxHp)*100,0,100));
  els.enemyHp.style.width=`${enemyPercent}%`;
  els.enemyHpTrack.setAttribute('aria-valuenow',String(enemyPercent));
  els.battlefield.dataset.phase=runtime.phase;
  const focus=clamp(100-((state.currentFloor-1)%6)*17,0,100);
  els.backdrop.style.objectPosition=`center ${focus}%`;
  els.scene.style.setProperty('--tower-focus',`${focus}%`);
  els.tap.disabled=runtime.unitCount>=Data.BALANCE.unitCap||runtime.manualDispatchCooldownMs>0;
  renderUnits(runtime);
  renderSupport(state);
  renderUpgrade('mugi',els.mugiLevel,els.mugiCost);
  renderUpgrade('weapon',els.weaponLevel,els.weaponCost);
  renderUpgrade('dispatch',els.dispatchLevel,els.dispatchCost);
  const dawn=engine.previewDawn();
  const showDawn=dawn.available&&(runtime.atWall||state.currentFloor>Data.BALANCE.wallFloor||state.ascensions>0);
  els.dawn.classList.toggle('hidden',!showDawn);
  els.dawnPreview.textContent=`今なら ◇${format(dawn.reward)} · 戦力 ×${dawn.multiplierAfter.toFixed(2)}`;
  els.memoryBadge.classList.toggle('hidden',!state.memoryNew);
  if(state.currentFloor!==lastFloor){
    lastFloor=state.currentFloor;
    els.battlefield.classList.remove('floorTransition');
    requestAnimationFrame(()=>els.battlefield.classList.add('floorTransition'));
  }
}

function frame(timestamp){
  if(!running)return;
  const delta=clamp(timestamp-lastFrame,0,250);
  lastFrame=timestamp;
  engine.advance(delta);
  if(timestamp-lastRender>=80){
    handleEvents(true);
    render();
    lastRender=timestamp;
  }
  if(timestamp-lastSave>=3000){save();lastSave=timestamp}
  raf=requestAnimationFrame(frame);
}

function startLoop(){
  if(running)return;
  running=true;
  lastFrame=performance.now();
  raf=requestAnimationFrame(frame);
}

function stopLoop(){
  running=false;
  cancelAnimationFrame(raf);
  raf=0;
}

function startGame(){
  engine.state.hasPlayed=true;
  els.splash.classList.add('hidden');
  els.game.classList.remove('hidden');
  save();
  render();
  if(saveBlocked)showSaveLock(saveBlockKind);
  else startLoop();
  if(offline.coinsEarned>0)toast(`留守中の支援で ${format(offline.coinsEarned)}コインを受け取りました。`,'good');
}

function openSheet(title,eyebrow,html,id=''){
  if(!activeSheet&&document.activeElement instanceof HTMLElement)sheetReturnFocus=document.activeElement;
  closeSheet(false);
  const fragment=els.template.content.cloneNode(true);
  fragment.querySelector('header small').textContent=eyebrow;
  fragment.querySelector('h2').textContent=title;
  fragment.querySelector('.sheetBody').innerHTML=html;
  els.modal.appendChild(fragment);
  activeSheet=id;
  requestAnimationFrame(()=>requestAnimationFrame(()=>{
    const closeButton=els.modal.querySelector('button[data-close]');
    closeButton?.focus({preventScroll:true});
    document.documentElement.scrollTop=0;
    document.body.scrollTop=0;
  }));
}

function closeSheet(restoreFocus=true){
  els.modal.innerHTML='';
  activeSheet='';
  if(restoreFocus){
    setNavActive('tower');
    const target=sheetReturnFocus;
    sheetReturnFocus=null;
    if(target?.isConnected)requestAnimationFrame(()=>target.focus());
  }
}

function setNavActive(name){
  els.nav.querySelectorAll('button').forEach(button=>{
    const active=button.dataset.nav===name;
    button.classList.toggle('active',active);
    if(active)button.setAttribute('aria-current','page');
    else button.removeAttribute('aria-current');
  });
}

function showSaveLock(kind='external'){
  const future=kind==='future';
  openSheet(
    future?'新しい記録を保護しています':'別のタブで更新されました',
    'SAVE PROTECTION',
    `<div class="info">${future
      ?`この保存は新しいschema ${esc(restored.unsupportedSchema)}です。現在の版では上書きせず保護します。`
      :'進行の巻き戻りを防ぐため、このタブの戦闘と保存を停止しました。'}</div><div class="actions"><button class="button ghost" data-action="reload-page">再読み込み</button>${future?'<button class="button warm" data-action="reset-confirm">初期化を選ぶ</button>':''}</div>`,
    'save-lock',
  );
  els.modal.querySelector('.modalShade')?.removeAttribute('data-close');
  els.modal.querySelector('button[data-close]')?.remove();
  requestAnimationFrame(()=>els.modal.querySelector('[data-action]')?.focus());
}

function section(title,right,body){
  return`<section class="section"><h3 class="sectionTitle"><span>${esc(title)}</span><span>${esc(right||'')}</span></h3>${body}</section>`;
}

function supportPreview(kind,title,text){
  const position=kind==='food'?'58%':'75%';
  return`<div class="sceneHero supportPreview supportPreview--${kind}">
    <img class="pixelAsset" src="/assets/v080/pixel-r2/tower-night-r2.png" alt="${esc(title)}" style="object-position:center ${position}">
    <div class="sceneHeroCopy"><small>TOWER SUPPORT NODE</small><h3>${esc(title)}</h3><p>${esc(text)}</p></div>
  </div>`;
}

function openFood(){
  const state=engine.state;
  const cost=Core.getUpgradeCost(state,'restaurant');
  const styleName=state.specialization==='street'?'にぎやかな配給所':state.specialization==='bistro'?'静かな夜食処':'未選択';
  openSheet('さかな食堂','3F · CONQUERED SUPPORT',`${supportPreview('food','制圧階で猫たちを支える店','接客ゲームではなく、攻撃と戦利品を強くする塔内施設です。')}
    ${section('現在の支援',`Lv.${state.restaurantLevel}`,`<div class="stats">
      <div class="stat"><small>戦闘支援</small><strong>+${Math.max(0,state.restaurantLevel-1)*7}%</strong><p>全猫の攻撃力</p></div>
      <div class="stat"><small>商人支援</small><strong>+${Math.max(0,state.restaurantLevel-1)*12}%</strong><p>攻撃・撃破収入</p></div>
      <div class="stat"><small>店の方向</small><strong>${styleName}</strong><p>出撃速度か一撃を選ぶ</p></div>
      <div class="stat"><small>次の強化</small><strong>${Number.isFinite(cost)?`${format(cost)}¢`:'LOCK'}</strong><p>攻略資金を再投資</p></div>
    </div>`)}
    ${!state.specialization?section('店の方向','一度だけ選択',`<div class="choiceGrid">
      <button class="card choice" data-action="specialize" data-style="street"><i style="--choice:#e9a05e">≫</i><h3>にぎやかな配給所</h3><p>猫の攻撃間隔を短くし、群れの手数を増やす。</p><b>速度型</b></button>
      <button class="card choice" data-action="specialize" data-style="bistro"><i style="--choice:#d6be75">◆</i><h3>静かな夜食処</h3><p>一匹ずつの攻撃を重くし、壁を押し切る。</p><b>一撃型</b></button>
    </div>`):''}
    <div class="actions"><button class="button lime" data-action="upgrade-restaurant" ${state.coins<cost?'disabled':''}>食堂を強化 · ${format(cost)}¢</button></div>`,'food');
}

function openHome(){
  const state=engine.state;
  const metrics=engine.getMetrics();
  const cost=Core.getUpgradeCost(state,'room');
  openSheet('猫の共同部屋','5F · PERMANENT HOME',`${supportPreview('home','猫たちが夜明けを越えて戻る場所','生活画面を別ゲームにせず、周回をまたぐ恒久支援拠点にします。')}
    ${section('夜明けを越えて残るもの',`Lv.${state.roomLevel}`,`<div class="stats">
      <div class="stat"><small>恒久戦力</small><strong>×${metrics.permanentMultiplier.toFixed(2)}</strong><p>夜明け後も維持</p></div>
      <div class="stat"><small>最高到達</small><strong>${state.bestFloor}F</strong><p>記録は失われない</p></div>
      <div class="stat"><small>夜明け</small><strong>${state.ascensions}回</strong><p>過去の壁を高速再走</p></div>
      <div class="stat"><small>次の部屋</small><strong>${Number.isFinite(cost)?`◇${format(cost)}`:'LOCK'}</strong><p>恒久戦力を追加</p></div>
    </div>`)}
    <div class="actions"><button class="button lime" data-action="upgrade-room" ${state.dawnShards<cost?'disabled':''}>共同部屋を強化 · ◇${format(cost)}</button></div>`,'home');
}

function openSupport(){
  const state=engine.state;
  openSheet('塔の支援拠点','CONQUERED FLOORS',`<div class="info">支援施設は独立した経営・生活ミニゲームではありません。猫たちの塔攻略を速くするため、制圧階へ設置されます。</div>
    ${section('3F',state.restaurantUnlocked?'OPEN':'LOCKED',`<button class="card supportCard" data-action="open-food" ${state.restaurantUnlocked?'':'disabled'}><strong>さかな食堂</strong><small>攻撃力と戦利品を支援</small></button>`)}
    ${section('5F',state.roomUnlocked?'OPEN':'LOCKED',`<button class="card supportCard" data-action="open-home" ${state.roomUnlocked?'':'disabled'}><strong>猫の共同部屋</strong><small>夜明けを越える恒久支援</small></button>`)}`,'support');
}

function openDawn(){
  const preview=engine.previewDawn();
  if(!preview.available)return toast(`${preview.unlockFloor}Fまで進むと夜明けを選べます。`,'warn');
  const rows=list=>list.map(item=>`<li><span>${esc(item.label)}</span><strong>${typeof item.value==='number'?format(item.value):esc(item.value??'—')}${item.nextValue!==undefined?` → ${typeof item.nextValue==='number'?format(item.nextValue):esc(item.nextValue)}`:''}</strong></li>`).join('');
  openSheet('夜明けを迎える','PRESTIGE · PUSH OR RETURN',`<div class="dawnLead"><strong>今戻れば ◇${format(preview.reward)}</strong><p>進み続けて報酬を増やすか、今戻って恒久戦力を早く使うかを選びます。</p></div>
    <section data-dawn-list="lost"><h3>この周回で失う</h3><ul>${rows(preview.lost)}</ul></section>
    <section data-dawn-list="kept"><h3>夜明け後も残る</h3><ul>${rows(preview.kept)}</ul></section>
    <section data-dawn-list="gained"><h3>今回得る</h3><ul>${rows(preview.gained)}</ul></section>
    <div class="actions"><button class="button ghost" data-close="1">まだ登る</button><button class="button warm" data-action="confirm-dawn">夜明けを迎える</button></div>`,'dawn');
}

function catsSheet(){
  openSheet('猫たち','AUTOMATIC CLIMBING PARTY',`<div class="info">猫は自動で出撃し、タップすると追加で駆けつけます。タップそのものは敵へダメージを与えません。</div>
    ${section('先導猫','1 / 4',`<article class="card pixelCatCard"><span class="spriteSheet spriteSheet--mugi" data-frame="idle"></span><div><h3>ムギ</h3><p>最初に塔へ来た先導猫。群れの先頭で天敵へ向かう。</p><b>Lv.${engine.state.mugiLevel}</b></div></article>
    <div class="futureCats"><span>ルナ · 近日</span><span>トト · 近日</span><span>ミミ · 近日</span></div>`)}`,'cats');
}

function memoriesSheet(){
  engine.state.memoryNew=false;
  const data=[
    ['arrival','塔へ来た夜','ムギが最初の階段を見上げた。'],
    ['restaurant-open','3Fを店に','制圧した階が猫たちの食堂になった。'],
    ['room-open','帰る場所','共同部屋が夜明けを越える拠点になった。'],
    ['first-dawn','最初の夜明け','失ったものより速く、猫たちは再び駆け上がった。'],
    ['first-night','初回夜番','塔の上で大きな天敵を退けた。']
  ];
  const cards=data.map(([id,title,text],index)=>{
    const unlocked=engine.state.memories.includes(id);
    return`<article class="card pixelMemory ${unlocked?'':'locked'}"><img class="pixelAsset" src="/assets/v080/pixel-r2/tower-night-r2.png" alt="" style="object-position:center ${100-index*18}%"><div><small>${unlocked?'MEMORY':'LOCKED'}</small><h3>${unlocked?esc(title):'まだ起きていない出来事'}</h3>${unlocked?`<p>${esc(text)}</p>`:''}</div></article>`;
  }).join('');
  const unlockedCount=data.filter(([id])=>engine.state.memories.includes(id)).length;
  openSheet('思い出帳','THE CLIMB REMAINS',section('ムギとの記録',`${unlockedCount}/${data.length}`,`<div class="memoryGrid">${cards}</div>`),'memories');
  save();
  render();
}

function menuSheet(){
  openSheet('設定',`CAT'S TOWER · ${Data.VERSION}`,`<div class="card settingsCard"><h3>Pixel Tower Vertical Slice</h3><p>自動出撃、タップ増援、即時強化、階層攻略、夜明け、高速再走を一つの塔で実装しています。</p></div><div class="actions"><button class="button ghost" data-action="toggle-sound">効果音 ${engine.state.sound?'ON':'OFF'}</button><button class="button warm" data-action="reset-confirm">最初から</button></div>`,'menu');
}

function resetConfirm(){
  openSheet('最初からやり直す','RESET V0.8.1 SAVE','<div class="battleResult"><i>!</i><h3>塔の記録を消します</h3><p>最高階、夜明け、思い出、支援拠点を初期状態へ戻します。</p></div><div class="actions"><button class="button ghost" data-close="1">戻る</button><button class="button warm" data-action="reset">初期化する</button></div>','reset');
}

function coinSheet(){
  const metrics=engine.getMetrics();
  openSheet('戦利品','TOWER ECONOMY',`<div class="stats"><div class="stat"><small>所持コイン</small><strong>${format(engine.state.coins)}¢</strong><p>猫・武器・出撃口へ即再投資</p></div><div class="stat"><small>周回収入</small><strong>${format(engine.state.runCoinsEarned)}¢</strong><p>攻撃と撃破で獲得</p></div><div class="stat"><small>現在DPS</small><strong>${format(metrics.partyDps)}</strong><p>戦闘中の猫の合計</p></div><div class="stat"><small>広告依存</small><strong>なし</strong><p>通常戦闘で経済が成立</p></div></div>`,'coins');
}

function shardSheet(){
  const preview=engine.previewDawn();
  openSheet('夜明けのかけら','PERMANENT POWER',`<div class="stats"><div class="stat"><small>所持</small><strong>◇${format(engine.state.dawnShards)}</strong><p>共同部屋の恒久強化に使用</p></div><div class="stat"><small>累計</small><strong>◇${format(engine.state.lifetimeShards)}</strong><p>使っても基礎倍率は残る</p></div><div class="stat"><small>基礎戦力</small><strong>×${preview.multiplierBefore.toFixed(2)}</strong><p>全周回へ適用</p></div><div class="stat"><small>今戻る</small><strong>+◇${format(preview.reward)}</strong><p>${preview.available?'受取可能':'8Fで解禁'}</p></div></div>`,'shards');
}

function buy(id){
  const result=engine.upgrade(id);
  if(!result.ok){
    toast(result.reason==='insufficient-funds'?'コインが足りません。':'まだ解放されていません。','warn');
    return false;
  }
  handleEvents(true);
  save();
  render();
  if(activeSheet==='food')openFood();
  if(activeSheet==='home')openHome();
  return true;
}

function dispatch(){
  const before=engine.getRuntimeSummary().enemyHp;
  const result=engine.dispatch();
  if(!result.ok){
    if(result.reason==='unit-cap')toast('階段は猫でいっぱいです。');
    return result;
  }
  render();
  if(engine.state.sound&&navigator.vibrate)navigator.vibrate(8);
  const after=engine.getRuntimeSummary().enemyHp;
  if(before!==after)console.error('Dispatch must not directly damage the enemy');
  return result;
}

function handleAction(action,button){
  if(saveBlocked&&!['reload-page','reset-confirm','reset'].includes(action)){
    showSaveLock(saveBlockKind);
    return;
  }
  if(action==='dispatch-cat')dispatch();
  else if(action==='upgrade-mugi')buy('mugi');
  else if(action==='upgrade-weapon')buy('weapon');
  else if(action==='upgrade-dispatch')buy('dispatch');
  else if(action==='upgrade-restaurant')buy('restaurant');
  else if(action==='upgrade-room')buy('room');
  else if(action==='open-food')openFood();
  else if(action==='open-home')openHome();
  else if(action==='open-support')openSupport();
  else if(action==='open-dawn')openDawn();
  else if(action==='confirm-dawn'){
    const result=engine.dawn();
    if(result.ok){closeSheet();handleEvents(true);save();render();toast(`◇${result.reward}を受け取り、1Fから再出発しました。`,'good')}
  }else if(action==='specialize'){
    const result=engine.specialize(button.dataset.style);
    if(result.ok){
      addMemory('restaurant-style');
      save();openFood();render();
    }
  }else if(action==='toggle-sound'){
    engine.state.sound=!engine.state.sound;save();menuSheet();
  }else if(action==='reload-page')location.reload();
  else if(action==='reset-confirm')resetConfirm();
  else if(action==='reset'){
    const cleared=[Data.SAVE_KEY,Data.LEGACY_KEY,Data.SCHEMA1_BACKUP_KEY].map(storageRemove).every(Boolean);
    saveBlocked=false;
    saveBlockKind='';
    engine.reset(now());
    closeSheet();
    const saved=save();
    render();
    toast(cleared&&saved?'最初の夜へ戻りました。':'初期化を保存できませんでした。端末の保存設定を確認してください。',cleared&&saved?'good':'warn');
  }
}

function navTo(name){
  setNavActive(name);
  if(name==='tower')closeSheet();
  else if(name==='cats')catsSheet();
  else if(name==='support')openSupport();
  else if(name==='memories')memoriesSheet();
}

els.start.addEventListener('click',startGame);
els.game.addEventListener('click',event=>{
  const button=event.target.closest('[data-action]');
  if(button&&!button.disabled)handleAction(button.dataset.action,button);
});
els.modal.addEventListener('click',event=>{
  const close=event.target.closest('[data-close]');
  if(close&&(event.target===close||close.tagName==='BUTTON')){closeSheet();return}
  const button=event.target.closest('[data-action]');
  if(button&&!button.disabled)handleAction(button.dataset.action,button);
});
els.nav.addEventListener('click',event=>{const button=event.target.closest('[data-nav]');if(button)navTo(button.dataset.nav)});
els.menu.addEventListener('click',menuSheet);
els.coin.addEventListener('click',coinSheet);
els.shard.addEventListener('click',shardSheet);
els.brand.addEventListener('click',()=>openSheet("Cat's tower",'VERTICAL IDLE TOWER','<div class="info">猫が自動で塔を登り、タップで増援し、天敵を退けて資源を即強化へ戻すゲームです。さかな食堂と共同部屋は攻略を支える塔内拠点です。</div>','brand'));

document.addEventListener('keydown',event=>{
  if(!activeSheet)return;
  if(event.key==='Escape'){
    event.preventDefault();
    if(activeSheet==='save-lock')return;
    closeSheet();
    return;
  }
  if(event.key!=='Tab')return;
  const focusable=[...els.modal.querySelectorAll('button:not(:disabled),[href],input:not(:disabled),[tabindex]:not([tabindex="-1"])')];
  if(!focusable.length)return;
  const first=focusable[0];
  const last=focusable[focusable.length-1];
  if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus()}
  else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()}
});

addEventListener('storage',event=>{
  if(event.key!==Data.SAVE_KEY)return;
  saveBlocked=true;
  saveBlockKind='external';
  stopLoop();
  showSaveLock(saveBlockKind);
});

addEventListener('pagehide',()=>{save();stopLoop()});
function resumeFromBackground(){
  if(document.hidden)return;
  if(saveBlocked){
    render();
    if(!els.game.classList.contains('hidden')&&activeSheet!=='save-lock')showSaveLock(saveBlockKind);
    return;
  }
  const elapsed=Math.max(0,now()-engine.state.lastSeen);
  const report=engine.applyOffline(elapsed,now());
  if(report.coinsEarned)toast(`留守中に ${format(report.coinsEarned)}コインを獲得しました。`,'good');
  lastFrame=performance.now();
  render();
  if(!els.game.classList.contains('hidden'))startLoop();
}
addEventListener('pageshow',resumeFromBackground);
document.addEventListener('visibilitychange',()=>{
  if(document.hidden){save();stopLoop();return}
  resumeFromBackground();
});

if('serviceWorker'in navigator)addEventListener('load',()=>navigator.serviceWorker.register('/sw.js?v=081p2').catch(()=>{}));

const qa=new URLSearchParams(location.search).has('qa');
if(qa){
  window.__CATS_TEST_API__={
    version:Data.VERSION,gameplaySchema:Data.GAMEPLAY_SCHEMA,
    getState:()=>engine.getState(),getRuntime:()=>engine.getRuntime(),getMetrics:()=>engine.getMetrics(),
    freeze:()=>{stopLoop();return engine.getRuntimeSummary()},
    advance:milliseconds=>{engine.advance(milliseconds);handleEvents(false);render();return engine.getRuntimeSummary()},
    seed:patch=>{stopLoop();engine.seed({...patch,hasPlayed:true},now());save();render();return engine.getState()},
    reset:()=>{stopLoop();storageRemove(Data.SAVE_KEY);storageRemove(Data.LEGACY_KEY);storageRemove(Data.SCHEMA1_BACKUP_KEY);saveBlocked=false;saveBlockKind='';engine.reset(now());save();render();return engine.getState()},
    dispatch:()=>{const result=engine.dispatch();render();return result},
    upgrade:id=>{const result=engine.upgrade(id);render();return result},
    specialize:style=>{const result=engine.specialize(style);render();return result},
    startDawn:()=>engine.previewDawn(),
    dawn:()=>{const result=engine.dawn();render();return result},
    openDawn
  };
}

render();
if(engine.state.hasPlayed)els.start.textContent='夜番へ戻る';
})();
