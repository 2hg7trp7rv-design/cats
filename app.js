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

const prefersReducedMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;

const els={
  splash:$('#splash'),start:$('#startBtn'),game:$('#game'),coins:$('#coins'),shards:$('#dawnShards'),
  floor:$('#floorLabel'),best:$('#bestFloor'),catCount:$('#catCount'),dispatchMeter:$('#dispatchMeter'),dispatchGauge:$('#dispatchGauge'),
  battlefield:$('#towerBattlefield'),scene:$('.towerScene'),backdrop:$('#towerBackdrop'),unitLayer:$('#unitLayer'),
  nextSlice:$('.towerSlice--next'),battleSlice:$('.towerSlice--battle'),supportSlice:$('.towerSlice--support'),
  nextBackdrop:$('.towerSlice--next .sliceBackdrop'),supportBackdrop:$('.towerSlice--support .sliceBackdrop'),
  nextFlag:$('.towerSlice--next .sliceFlag'),supportFlag:$('.towerSlice--support .supportFlag'),facilityActivity:$('.facilityActivity'),
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
let completionPresented=false;
let lastPhase='';
const transientTimers=new Map();

const audioDirector=(()=>{
  let context=null;
  let master=null;
  let ambientTimer=0;
  let ambientStep=0;
  let lastHitAt=0;
  function ensure(){
    if(!context){
      const AudioContext=window.AudioContext||window.webkitAudioContext;
      if(!AudioContext)return false;
      context=new AudioContext();
      master=context.createGain();
      master.gain.value=engine.state.sound ? .34 : 0;
      master.connect(context.destination);
    }
    if(context.state==='suspended')context.resume().catch(()=>{});
    return true;
  }
  function tone(frequency,duration=.08,type='square',volume=.035,delay=0){
    if(!engine.state.sound||!ensure())return;
    const start=context.currentTime+delay;
    const oscillator=context.createOscillator();
    const gain=context.createGain();
    oscillator.type=type;
    oscillator.frequency.setValueAtTime(frequency,start);
    gain.gain.setValueAtTime(.0001,start);
    gain.gain.exponentialRampToValueAtTime(volume,start+.008);
    gain.gain.exponentialRampToValueAtTime(.0001,start+duration);
    oscillator.connect(gain);gain.connect(master);
    oscillator.start(start);oscillator.stop(start+duration+.02);
  }
  function chord(notes,spacing=.07,type='square',volume=.03){notes.forEach((note,index)=>tone(note,.11,type,volume,index*spacing))}
  function play(name){
    if(!engine.state.sound)return;
    if(name==='hit'){
      const stamp=performance.now();
      if(stamp-lastHitAt<105)return;
      lastHitAt=stamp;tone(146,.045,'square',.022);return;
    }
    if(name==='enemy-hit'){tone(92,.07,'sawtooth',.025);return}
    if(name==='dispatch'){tone(659,.06,'square',.032);tone(880,.07,'triangle',.022,.045);return}
    if(name==='coin'){tone(1047,.06,'triangle',.025);return}
    if(name==='upgrade'){chord([392,523,659],.045,'square',.027);return}
    if(name==='rally'){chord([294,392,523,659],.05,'square',.04);return}
    if(name==='clear'){chord([523,659,784],.08,'triangle',.04);return}
    if(name==='unlock'){chord([440,554,659,880],.06,'triangle',.035);return}
    if(name==='wall'){chord([147,131],.16,'sawtooth',.03);return}
    if(name==='dawn'){chord([330,440,554,659],.12,'triangle',.045);return}
    if(name==='boss'){chord([82,98,123],.13,'sawtooth',.035);return}
    if(name==='complete'){chord([392,523,659,784,1047],.1,'triangle',.045)}
  }
  function startAmbient(){
    ensure();
    if(ambientTimer)return;
    const notes=[220,262,330,294,247,294,349,330];
    ambientTimer=setInterval(()=>{
      if(!engine.state.sound||!running||activeSheet||document.hidden)return;
      tone(notes[ambientStep%notes.length],.28,'triangle',.008);
      ambientStep+=1;
    },760);
  }
  function sync(){if(master)master.gain.value=engine.state.sound ? .34 : 0;if(engine.state.sound)startAmbient()}
  return{ensure,play,startAmbient,sync};
})();

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

function showEffectAt(target,text,tone=''){
  if(!target||!els.effects)return showEffect(text,78,55,tone);
  const layerRect=els.effects.getBoundingClientRect();
  const targetRect=target.getBoundingClientRect();
  if(!layerRect.width||!layerRect.height)return showEffect(text,78,55,tone);
  const x=clamp((targetRect.left+targetRect.width*.5-layerRect.left)/layerRect.width*100,4,96);
  const y=clamp((targetRect.top+targetRect.height*.24-layerRect.top)/layerRect.height*100,8,92);
  showEffect(text,x,y,tone);
}

function pulseNode(node,className,duration=220){
  if(!node||prefersReducedMotion)return;
  const key=`${node.id||node.dataset.unitId||'node'}:${className}`;
  clearTimeout(transientTimers.get(key));
  node.classList.remove(className);
  void node.offsetWidth;
  node.classList.add(className);
  transientTimers.set(key,setTimeout(()=>node.classList.remove(className),duration));
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
      const attacker=els.unitLayer.querySelector(`.catUnit[data-unit-id="${event.unitId}"]`);
      const enemy=els.unitLayer.querySelector('#enemyUnit');
      pulseNode(attacker,'unitStrike',180);
      pulseNode(enemy,'enemyHit',170);
      showEffectAt(enemy,`-${format(event.damage)}`,'hitFx');
      audioDirector.play('hit');
    }else if(event.type==='enemy-hit'&&visual){
      const target=els.unitLayer.querySelector(`.catUnit[data-unit-id="${event.unitId}"]`);
      pulseNode(target,'catHit',210);
      showEffectAt(target,'!','dangerFx');
      audioDirector.play('enemy-hit');
    }else if(event.type==='enemy-defeated'&&visual){
      pulseNode(els.unitLayer.querySelector('#enemyUnit'),'enemyDefeated',520);
    }else if(event.type==='floor-cleared'){
      if(visual){
        showCallout(`${event.floor}F 制圧`,event.completed?'塔の頂上を取り戻しました':`猫たちは ${event.nextFloor}F へ`);
        els.battlefield.classList.add('victoryHold');
        audioDirector.play(event.completed?'complete':'clear');
      }
    }else if(event.type==='floor-transition-stage'&&event.stage==='ascending'){
      if(visual){
        els.battlefield.classList.remove('victoryHold');
        els.battlefield.classList.add('towerAscending');
        showCallout('上の階へ',`${event.toFloor}Fへ進軍`);
      }
    }else if(event.type==='floor-entered'){
      if(visual){
        els.battlefield.classList.remove('towerAscending','victoryHold');
        showCallout(`${event.floor}F`,event.enemyKind==='boss'?'クロバネが待ち構えている':'新しい階へ到着');
        if(event.enemyKind==='boss')audioDirector.play('boss');
      }
    }else if(event.type==='support-unlocked'){
      const name=event.id==='restaurant'?'さかな食堂':'猫の共同部屋';
      if(visual){toast(`${name}が塔の中で動き始めました。`,'good');audioDirector.play('unlock')}
    }else if(event.type==='named-cat-unlocked'&&visual){
      toast(`${event.name}が仲間になりました。`,'good');
      showCallout(`${event.name}加入`,event.role==='ranged'?'後列から援護します':'群れを支援します');
      audioDirector.play('unlock');
    }else if(event.type==='rally-started'&&visual){
      els.battlefield.classList.add('rallying');
      showCallout('みんなで号令','6秒間、進軍と攻撃が加速');
      audioDirector.play('rally');
    }else if(event.type==='rally-ended'){
      els.battlefield.classList.remove('rallying');
    }else if(event.type==='rally-ready'&&visual){
      toast('号令の準備ができました。','good');
    }else if(event.type==='restaurant-delivery'&&visual){
      pulseNode(els.facilityActivity,'facilityDelivering',720);
      showEffectAt(els.supportNode,`+${format(event.coins)}C`,'goodFx');
      toast('さかな食堂の夜食が戦闘階へ届きました。','good');
      audioDirector.play('coin');
    }else if(event.type==='support-pulse'&&visual){
      const supporter=els.unitLayer.querySelector(`.catUnit[data-unit-id="${event.unitId}"]`);
      pulseNode(supporter,'supportPulse',420);
    }else if(event.type==='room-recovery-completed'&&visual){
      toast(`${Data.CATS?.[event.kind]?.name||'猫'}が共同部屋から復帰しました。`,'good');
    }else if(event.type==='upgrade-bought'&&visual){
      showEffect('UP!',22,78,'goodFx');
      audioDirector.play('upgrade');
    }else if(event.type==='dawn-complete'){
      if(visual){showCallout('夜明け',`恒久戦力 ×${event.permanentMultiplier.toFixed(2)}`);audioDirector.play('dawn')}
    }else if(event.type==='first-night-completed'&&visual&&!completionPresented){
      completionPresented=true;
      setTimeout(openCompletion,700);
    }
  }
}

function spriteFrame(phase,isEnemy=false){
  if(phase==='attacking')return isEnemy?'peck':'attack';
  if(phase==='moving'||phase==='ascending')return isEnemy?'fly':'walk';
  if(phase==='defeated'||phase==='celebrating')return isEnemy?'retreat':'cheer';
  return 'idle';
}

function catSpriteMarkup(kind){
  if(kind==='mugi')return '<span class="spriteSheet spriteSheet--mugi" data-frame="walk"></span>';
  const character=kind==='luna'?'luna':kind==='toto'?'toto':'helper';
  return `<span class="spriteSheet spriteSheet--cast" data-character="${character}" data-frame="walk"></span>`;
}

function enemySpriteMarkup(id){
  if(id==='crow')return '<span class="spriteSheet spriteSheet--crow" data-frame="idle"></span>';
  const character=id==='owl'?'owl':id==='black-feather-barrier'?'barrier':'boss';
  return `<span class="spriteSheet spriteSheet--enemies" data-character="${character}" data-frame="idle"></span>`;
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
      node.dataset.role=unit.role||'frontline';
      node.dataset.named=unit.named?'true':'false';
      node.innerHTML=catSpriteMarkup(unit.kind);
      els.unitLayer.appendChild(node);
    }
    const formation={
      'helper-calico':{x:13,y:88},
      toto:{x:25.5,y:88},
      'helper-gray':{x:38,y:88},
      luna:{x:50.5,y:88},
      'helper-tabby':{x:63,y:88},
      mugi:{x:77,y:88},
    };
    const target=formation[unit.kind]||{x:55,y:88};
    // The tower board supplies the ascent motion. Units keep their role slot while moving,
    // so different travel times can never collapse or cross the six-kind formation.
    const x=target.x;
    const y=target.y;
    node.style.setProperty('--x',`${x}%`);
    node.style.setProperty('--y',`${y}%`);
    node.style.setProperty('--lane-order',String(Math.round(unit.lane*10)));
    node.style.zIndex=String(10+Math.round(x));
    node.dataset.phase=unit.phase;
    node.querySelector('.spriteSheet').dataset.frame=spriteFrame(unit.phase);
    node.style.opacity=unit.hp>0?'1':'0';
  }
  $$('.catUnit[data-unit-id]').forEach(node=>{if(!liveIds.has(node.dataset.unitId))node.remove()});

  let enemy=els.unitLayer.querySelector('#enemyUnit');
  if(!enemy){
    enemy=document.createElement('div');
    enemy.id='enemyUnit';
    enemy.className='enemyUnit';
    enemy.dataset.facing='left';
    enemy.innerHTML=enemySpriteMarkup(runtime.enemy.id);
    els.unitLayer.appendChild(enemy);
  }
  if(enemy.dataset.spriteId!==runtime.enemy.id){
    enemy.dataset.spriteId=runtime.enemy.id;
    enemy.innerHTML=enemySpriteMarkup(runtime.enemy.id);
  }
  enemy.dataset.enemy=runtime.enemy.isBoss?'boss':runtime.enemy.id;
  enemy.dataset.phase=runtime.completed?'defeated':runtime.phase==='fighting'||runtime.phase==='wall'?'attacking':['victory','ascending'].includes(runtime.phase)?'defeated':'moving';
  enemy.classList.add('enemyUnit');
  enemy.classList.toggle('enemyUnit--boss',runtime.enemy.isBoss);
  enemy.classList.toggle('enemyUnit--wall',runtime.enemy.isWall);
  enemy.style.setProperty('--x',runtime.enemy.isBoss||runtime.enemy.isWall?'88%':'86%');
  enemy.style.setProperty('--y','88%');
  enemy.querySelector('.spriteSheet').dataset.frame=spriteFrame(enemy.dataset.phase,true);
}

function renderSupport(state,runtime){
  const node=els.supportNode;
  node.className='supportNode hidden';
  node.removeAttribute('data-action');
  const useRoom=(state.roomUnlocked||state.roomLevel>0)&&state.currentFloor>=Data.BALANCE.roomUnlockFloor;
  if(useRoom){
    node.className='supportNode supportNode--home';
    node.dataset.action='open-home';
    node.innerHTML=`<span>居</span><strong>共同部屋</strong><small>${runtime.recoveryCount?`${runtime.recoveryCount}匹 回復中`:'再出撃を支援'}</small>`;
    els.supportFlag.textContent='5F · 共同部屋';
    els.facilityActivity.dataset.kind='home';
  }else if(state.restaurantUnlocked||state.currentFloor>=Data.BALANCE.restaurantUnlockFloor){
    node.className='supportNode supportNode--food';
    node.dataset.action='open-food';
    const seconds=Math.max(0,Math.ceil((runtime.restaurantDeliveryCooldownMs||0)/1000));
    node.innerHTML=`<span>食</span><strong>さかな食堂</strong><small>${runtime.restaurantBuffRemainingMs>0?'夜食効果中':`配膳まで ${seconds}秒`}</small>`;
    els.supportFlag.textContent='3F · さかな食堂';
    els.facilityActivity.dataset.kind='food';
  }else{
    els.supportFlag.textContent=`${Math.max(1,state.currentFloor-1)}F · 奪還済み`;
    els.facilityActivity.dataset.kind='base';
  }
}

function renderUpgrade(id,levelNode,costNode){
  const state=engine.state;
  const cost=Core.getUpgradeCost(state,id);
  const definition=Data.UPGRADES[id];
  const button=$(`[data-upgrade="${id}"]`);
  levelNode.textContent=`Lv.${state[definition.stateField]}`;
  costNode.textContent=Number.isFinite(cost)?`${format(cost)}C`:'LOCK';
  button.disabled=!Number.isFinite(cost)||state.coins<cost;
}

function render(){
  const state=engine.state;
  const runtime=engine.getRuntime();
  const metrics=engine.getMetrics();
  els.coins.textContent=format(state.coins);
  els.shards.textContent=format(state.dawnShards);
  els.coin.setAttribute('aria-label',`コイン ${format(state.coins)}`);
  els.shard.setAttribute('aria-label',`朝の鈴 ${format(state.dawnShards)}`);
  els.floor.textContent=`${state.currentFloor}F`;
  els.best.textContent=`${state.bestFloor}F`;
  els.catCount.textContent=runtime.unitCount;
  const dispatchProgress=runtime.partyFull
    ?runtime.rallyRemainingMs>0?1:runtime.rallyCharge
    :1-clamp(runtime.autoDispatchCooldownMs/Math.max(1,metrics.dispatchIntervalMs),0,1);
  const dispatchPercent=Math.round(dispatchProgress*100);
  els.dispatchMeter.style.width=`${dispatchPercent}%`;
  els.dispatchGauge.setAttribute('aria-valuenow',String(dispatchPercent));
  els.dispatchGauge.setAttribute('aria-label',runtime.completed
    ?'最初の夜番 完了'
    :runtime.partyFull
      ?runtime.rallyRemainingMs>0?'号令中':runtime.rallyReady?'号令 準備完了':'次の号令まで'
      :'次の自動出撃まで');
  els.enemyName.textContent=runtime.enemy.name;
  els.enemyMark.textContent=runtime.completed?'CLEAR':runtime.enemy.isBoss?'BOSS':runtime.enemy.isWall?'WALL':'WILD';
  els.enemyHpText.textContent=`HP ${format(runtime.enemyHp)} / ${format(runtime.enemyMaxHp)}`;
  const enemyPercent=Math.round(clamp(runtime.enemyHp/Math.max(1,runtime.enemyMaxHp)*100,0,100));
  els.enemyHp.style.width=`${enemyPercent}%`;
  els.enemyHpTrack.setAttribute('aria-valuenow',String(enemyPercent));
  els.battlefield.dataset.phase=runtime.phase;
  const floorFocus=floor=>clamp(100-((Math.max(1,floor)-1)%6)*17,0,100);
  // Source-image floorboards for 1F..6F, expressed as a percentage of the atlas height.
  // Anchoring these pixels directly to the party ground keeps the room and units aligned at every viewport height.
  const floorSourceGround=floor=>[95.10,80.62,66.99,53.77,40.43,27.21][(Math.max(1,floor)-1)%6];
  const currentFocus=floorFocus(state.currentFloor);
  const nextFloor=runtime.pendingFloor||Math.min(Data.BALANCE.firstBossFloor,state.currentFloor+1);
  const supportFloor=Math.max(1,state.currentFloor-1);
  els.backdrop.style.setProperty('--floor-source-ground',`${floorSourceGround(state.currentFloor)}%`);
  els.nextBackdrop.style.setProperty('--floor-focus',`${floorFocus(nextFloor)}%`);
  els.supportBackdrop.style.setProperty('--floor-focus',`${floorFocus(supportFloor)}%`);
  els.scene.style.setProperty('--tower-focus',`${currentFocus}%`);
  els.nextFlag.textContent=runtime.completed?'屋上 · 奪還完了':`${nextFloor}F · ${runtime.pendingFloor?'移動先':'未制圧'}`;
  els.nextSlice.classList.toggle('isComplete',runtime.completed);
  els.battleSlice.classList.toggle('isBoss',runtime.enemy.isBoss);
  els.battleSlice.classList.toggle('isWall',runtime.enemy.isWall);
  els.battlefield.classList.toggle('rallying',runtime.rallyRemainingMs>0);
  els.battlefield.classList.toggle('restaurantBuff',runtime.restaurantBuffRemainingMs>0);

  const icon=els.tap.querySelector('.dispatchIcon');
  const strong=els.tap.querySelector('strong');
  const small=els.tap.querySelector('small');
  if(runtime.completed){
    icon.textContent='済';strong.textContent='完了';small.textContent='10F 奪還';
    els.tap.disabled=false;
    els.tap.dataset.mode='completed';
    els.tap.setAttribute('aria-label','最初の夜番の完了画面を開く');
  }else if(runtime.partyFull){
    icon.textContent='!';
    if(runtime.rallyRemainingMs>0){strong.textContent='号令中';small.textContent=`あと ${Math.ceil(runtime.rallyRemainingMs/1000)}秒`}
    else if(runtime.rallyReady){strong.textContent='号令';small.textContent='準備OK'}
    else{strong.textContent='充填';small.textContent=`あと ${Math.ceil(runtime.rallyCooldownMs/1000)}秒`}
    els.tap.disabled=runtime.manualDispatchCooldownMs>0;
    els.tap.dataset.mode=runtime.rallyRemainingMs>0?'active':runtime.rallyReady?'rally':'charging';
    els.tap.setAttribute('aria-label',runtime.rallyReady?'みんなで号令をかける':'号令を充填中');
  }else{
    icon.textContent='!';strong.textContent='呼ぶ';small.textContent=`${runtime.unitCount}/${runtime.partyCapacity}匹`;
    els.tap.disabled=runtime.manualDispatchCooldownMs>0;
    els.tap.dataset.mode='dispatch';
    els.tap.setAttribute('aria-label','増援の猫を呼ぶ');
  }
  renderUnits(runtime);
  renderSupport(state,runtime);
  renderUpgrade('mugi',els.mugiLevel,els.mugiCost);
  renderUpgrade('weapon',els.weaponLevel,els.weaponCost);
  renderUpgrade('dispatch',els.dispatchLevel,els.dispatchCost);
  const dawn=engine.previewDawn();
  const showDawn=!runtime.completed&&dawn.available&&(runtime.atWall||state.currentFloor>Data.BALANCE.wallFloor||state.ascensions>0);
  els.dawn.classList.toggle('hidden',!showDawn);
  els.dawnPreview.textContent=`朝の鈴 ${format(dawn.reward)} · 次周 ×${dawn.multiplierAfter.toFixed(2)}`;
  els.memoryBadge.classList.toggle('hidden',!state.memoryNew);
  if(runtime.phase!==lastPhase){
    if(runtime.phase==='wall')audioDirector.play('wall');
    lastPhase=runtime.phase;
  }
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
  if(!activeSheet&&!saveBlocked&&!document.hidden)engine.advance(delta);
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
  audioDirector.ensure();
  audioDirector.startAmbient();
  engine.state.hasPlayed=true;
  els.splash.classList.add('hidden');
  els.game.classList.remove('hidden');
  save();
  render();
  if(saveBlocked)showSaveLock(saveBlockKind);
  else startLoop();
  if(offline.coinsEarned>0)toast(`留守中の支援で ${format(offline.coinsEarned)}コインを受け取りました。`,'good');
  if(engine.state.completed&&!completionPresented){
    completionPresented=true;
    setTimeout(openCompletion,450);
  }
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
  els.game.classList.add('sheetOpen');
  els.game.dataset.paused='true';
  lastFrame=performance.now();
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
  els.game.classList.remove('sheetOpen');
  els.game.dataset.paused='false';
  lastFrame=performance.now();
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
  const runtime=engine.getRuntime();
  const cost=Core.getUpgradeCost(state,'restaurant');
  const interval=Core.computeRestaurantDeliveryInterval(state);
  const next=Math.max(0,Math.ceil(runtime.restaurantDeliveryCooldownMs/1000));
  openSheet('さかな食堂','3F · 稼働中',`${supportPreview('food','夜食が戦闘階へ届く店','店員猫が料理を運び、短時間だけ群れの手数と戦利品を増やします。')}
    ${section('塔の中で起きていること',`Lv.${state.restaurantLevel}`,`<div class="stats">
      <div class="stat"><small>次の配膳</small><strong>${runtime.restaurantBuffRemainingMs>0?'効果中':`${next}秒`}</strong><p>料理が階段を上る</p></div>
      <div class="stat"><small>配膳間隔</small><strong>${(interval/1000).toFixed(1)}秒</strong><p>強化で短縮</p></div>
      <div class="stat"><small>夜食効果</small><strong>4秒</strong><p>攻撃速度が上昇</p></div>
      <div class="stat"><small>次の強化</small><strong>${Number.isFinite(cost)?`${format(cost)}C`:'LOCK'}</strong><p>ラン内コインを使用</p></div>
    </div>`)}
    <div class="info">在庫や接客を管理する別ゲームではありません。料理が塔を上り、戦闘へ届くことだけを扱います。</div>
    <div class="actions"><button class="button lime" data-action="upgrade-restaurant" ${state.coins<cost?'disabled':''}>配膳を強化 · ${format(cost)}C</button></div>`,'food');
}

function openHome(){
  const state=engine.state;
  const metrics=engine.getMetrics();
  const runtime=engine.getRuntime();
  const cost=Core.getUpgradeCost(state,'room');
  const recoverySeconds=(Core.computeRoomRecoveryMs(state)/1000).toFixed(1);
  const recovering=runtime.recoveryQueue.length
    ?runtime.recoveryQueue.map(cat=>`<li><span>${esc(Data.CATS?.[cat.kind]?.name||cat.name||'猫')}</span><strong>${Math.ceil(cat.remainingMs/1000)}秒</strong></li>`).join('')
    :'<li><span>休憩中の猫</span><strong>なし</strong></li>';
  openSheet('猫の共同部屋','5F · 帰還拠点',`${supportPreview('home','倒れた猫が戻ってくる部屋','休んだ猫は自動で起き、入口からもう一度戦闘階へ向かいます。')}
    ${section('戦闘へ戻す支援',`Lv.${state.roomLevel}`,`<div class="stats">
      <div class="stat"><small>復帰時間</small><strong>${recoverySeconds}秒</strong><p>強化で短縮</p></div>
      <div class="stat"><small>恒久戦力</small><strong>×${metrics.permanentMultiplier.toFixed(2)}</strong><p>夜明け後も維持</p></div>
      <div class="stat"><small>最高到達</small><strong>${state.bestFloor}F</strong><p>記録は失われない</p></div>
      <div class="stat"><small>次の部屋</small><strong>${Number.isFinite(cost)?`鈴${format(cost)}`:'LOCK'}</strong><p>恒久戦力を追加</p></div>
    </div>`)}
    ${section('いま休んでいる猫',`${runtime.recoveryQueue.length}匹`,`<ul class="recoveryList">${recovering}</ul>`)}
    <div class="actions"><button class="button lime" data-action="upgrade-room" ${state.dawnShards<cost?'disabled':''}>共同部屋を強化 · 鈴${format(cost)}</button></div>`,'home');
}

function openSupport(){
  const state=engine.state;
  openSheet('塔の支援拠点','制圧階が働き続ける',`<div class="info">取り戻した階は空の背景にならず、その下で猫たちを支え続けます。施設を開いている間は夜番を停止します。</div>
    ${section('3F',state.restaurantUnlocked?'稼働中':'未制圧',`<button class="card supportCard" data-action="open-food" ${state.restaurantUnlocked?'':'disabled'}><strong>さかな食堂</strong><small>料理を上階へ運び、短時間だけ攻撃を加速</small></button>`)}
    ${section('5F',state.roomUnlocked?'稼働中':'未制圧',`<button class="card supportCard" data-action="open-home" ${state.roomUnlocked?'':'disabled'}><strong>猫の共同部屋</strong><small>倒れた猫を休ませ、自動で戦線へ戻す</small></button>`)}`,'support');
}

function openDawn(){
  const preview=engine.previewDawn();
  if(!preview.available)return toast(`${preview.unlockFloor}Fまで進むと夜明けを選べます。`,'warn');
  const visible=list=>list.filter(item=>!['fish','specialization'].includes(item.id));
  const rows=list=>visible(list).map(item=>`<li><span>${esc(item.label)}</span><strong>${typeof item.value==='number'?format(item.value):esc(item.value??'—')}${item.nextValue!==undefined?` > ${typeof item.nextValue==='number'?format(item.nextValue):esc(item.nextValue)}`:''}</strong></li>`).join('');
  openSheet('夜明けを迎える','戻る代わりに、次の夜を速くする',`<div class="dawnLead"><strong>朝の鈴 ${format(preview.reward)}</strong><p>今夜の階とコインを手放し、恒久戦力を得て1Fから登り直します。</p></div>
    <section data-dawn-list="lost"><h3>この周回で失う</h3><ul>${rows(preview.lost)}</ul></section>
    <section data-dawn-list="kept"><h3>次の夜にも残る</h3><ul>${rows(preview.kept)}</ul></section>
    <section data-dawn-list="gained"><h3>今回得る</h3><ul>${rows(preview.gained)}</ul></section>
    <div class="actions"><button class="button ghost" data-close="1">まだ登る</button><button class="button warm" data-action="confirm-dawn">夜明けを迎える</button></div>`,'dawn');
}

function catsSheet(){
  const unlocked=new Set(Core.unlockedNamedCats(engine.state));
  const roles={mugi:['前衛','敵の前まで進み、群れの盾になる。'],luna:['後衛','安全な距離から夜の弾を放つ。'],toto:['支援','仲間を回復し、次の攻撃を早める。']};
  const cards=['mugi','luna','toto'].map(id=>{
    const cat=Data.CATS[id];
    const open=unlocked.has(id);
    const sprite=id==='mugi'?'<span class="spriteSheet spriteSheet--mugi" data-frame="idle"></span>':`<span class="spriteSheet spriteSheet--cast" data-character="${id}" data-frame="idle"></span>`;
    return`<article class="card pixelCatCard ${open?'':'locked'}">${sprite}<div><small>${roles[id][0]} · ${open?'出撃可能':`${cat.unlockFloor}Fで加入`}</small><h3>${open?cat.name:'？？？'}</h3><p>${open?roles[id][1]:'塔の上から、まだ知らない足音が聞こえる。'}</p><b>${open?`特訓 Lv.${engine.state.mugiLevel}`:'LOCKED'}</b></div></article>`;
  }).join('');
  openSheet('猫たち','3匹が異なる位置で戦う',`<div class="info">猫は自動出撃します。呼び鈴は空きがあれば増援、満員なら「みんなで号令」に変わります。タップによる直接ダメージはありません。</div>
    ${section('夜番の仲間',`${unlocked.size}/3`,`<div class="catRoster">${cards}</div>`)}`,'cats');
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

function formatDuration(milliseconds){
  const seconds=Math.max(0,Math.floor((Number(milliseconds)||0)/1000));
  const minutes=Math.floor(seconds/60);
  return `${minutes}:${String(seconds%60).padStart(2,'0')}`;
}

function openCompletion(){
  const state=engine.state;
  openSheet('最初の夜番 完了','10F · クロバネ撃破',`<div class="battleResult completeResult"><i>朝</i><h3>塔に朝が戻りました</h3><p>猫たちは10Fまでを奪還し、クロバネを退けました。この夜番は10Fで完了です。</p></div>
    <div class="stats"><div class="stat"><small>到達</small><strong>10F</strong><p>初回夜番完了</p></div><div class="stat"><small>夜明け</small><strong>${state.ascensions}回</strong><p>周回の記録</p></div><div class="stat"><small>総時間</small><strong>${formatDuration(state.playTimeMs)}</strong><p>保存データ上の累計</p></div><div class="stat"><small>仲間</small><strong>3匹</strong><p>ムギ・ルナ・トト</p></div></div>
    <div class="actions"><button class="button ghost" data-action="open-memories">思い出を見る</button><button class="button warm" data-action="confirm-dawn">夜明けから再出発</button></div>`,'complete');
}

function menuSheet(){
  openSheet('設定',`CAT'S TOWER · ${Data.VERSION}`,`<div class="card settingsCard"><h3>月夜の塔攻略</h3><p>自動で登る猫、呼び鈴の増援と号令、制圧階の施設、8Fの夜明け、10Fクロバネまでを一続きで遊びます。</p></div><div class="settingsFacts"><span>音とBGM</span><strong>${engine.state.sound?'ON':'OFF'}</strong><span>動きの軽減</span><strong>${prefersReducedMotion?'端末設定を使用中':'OFF'}</strong></div><div class="actions"><button class="button ghost" data-action="toggle-sound">音とBGM ${engine.state.sound?'OFFにする':'ONにする'}</button><button class="button warm" data-action="reset-confirm">最初から</button></div>`,'menu');
}

function resetConfirm(){
  openSheet('最初からやり直す','RESET V0.8.2 SAVE','<div class="battleResult"><i>!</i><h3>塔の記録を消します</h3><p>最高階、夜明け、思い出、支援拠点を初期状態へ戻します。</p></div><div class="actions"><button class="button ghost" data-close="1">戻る</button><button class="button warm" data-action="reset">初期化する</button></div>','reset');
}

function coinSheet(){
  const metrics=engine.getMetrics();
  openSheet('戦利品','TOWER ECONOMY',`<div class="stats"><div class="stat"><small>所持コイン</small><strong>${format(engine.state.coins)}C</strong><p>猫・武器・出撃口へ即再投資</p></div><div class="stat"><small>周回収入</small><strong>${format(engine.state.runCoinsEarned)}C</strong><p>攻撃と撃破で獲得</p></div><div class="stat"><small>現在DPS</small><strong>${format(metrics.partyDps)}</strong><p>戦闘中の猫の合計</p></div><div class="stat"><small>広告依存</small><strong>なし</strong><p>通常戦闘で経済が成立</p></div></div>`,'coins');
}

function shardSheet(){
  const preview=engine.previewDawn();
  openSheet('朝の鈴','夜明け後も残る力',`<div class="stats"><div class="stat"><small>所持</small><strong>鈴${format(engine.state.dawnShards)}</strong><p>共同部屋の恒久強化に使用</p></div><div class="stat"><small>累計</small><strong>鈴${format(engine.state.lifetimeShards)}</strong><p>使っても基礎倍率は残る</p></div><div class="stat"><small>基礎戦力</small><strong>×${preview.multiplierBefore.toFixed(2)}</strong><p>全周回へ適用</p></div><div class="stat"><small>今戻る</small><strong>+鈴${format(preview.reward)}</strong><p>${preview.available?'受取可能':'8Fで解禁'}</p></div></div>`,'shards');
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
    if(result.reason==='rally-active')toast(`号令中です。あと${Math.ceil(result.remainingMs/1000)}秒。`);
    else if(result.reason==='rally-charging')toast(`次の号令まで${Math.ceil(result.remainingMs/1000)}秒。`);
    else if(result.reason==='roster-recovering')toast('猫が共同部屋から戻るのを待っています。');
    else if(result.reason==='completed')openCompletion();
    return result;
  }
  if(result.action==='dispatch')audioDirector.play('dispatch');
  handleEvents(true);
  render();
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
  else if(action==='open-memories')memoriesSheet();
  else if(action==='open-dawn')openDawn();
  else if(action==='confirm-dawn'){
    const result=engine.dawn();
    if(result.ok){completionPresented=false;closeSheet();handleEvents(true);save();render();toast(`朝の鈴 ${result.reward}個を受け取り、1Fから再出発しました。`,'good')}
  }else if(action==='toggle-sound'){
    engine.state.sound=!engine.state.sound;
    if(engine.state.sound)audioDirector.ensure();
    audioDirector.sync();save();menuSheet();
  }else if(action==='reload-page')location.reload();
  else if(action==='reset-confirm')resetConfirm();
  else if(action==='reset'){
    const cleared=[Data.SAVE_KEY,Data.LEGACY_KEY,Data.SCHEMA1_BACKUP_KEY].map(storageRemove).every(Boolean);
    saveBlocked=false;
    saveBlockKind='';
    completionPresented=false;
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
els.brand.addEventListener('click',()=>openSheet("Cat's tower",'月夜の塔攻略','<div class="info">猫は自動で塔を登ります。呼び鈴は空きがあれば増援、満員なら号令です。制圧した3Fの食堂と5Fの共同部屋が戦闘を支え、10Fのクロバネ撃破で最初の夜番が完了します。</div>','brand'));

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

if('serviceWorker'in navigator)addEventListener('load',()=>navigator.serviceWorker.register('/sw.js?v=082r3').catch(()=>{}));

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
    startDawn:()=>engine.previewDawn(),
    dawn:()=>{const result=engine.dawn();render();return result},
    openDawn
  };
}

render();
if(engine.state.hasPlayed)els.start.textContent='夜番へ戻る';
})();
