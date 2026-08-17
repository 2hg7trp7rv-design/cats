(()=>{'use strict';

const V='0.9.0';
const KEY='cats-tower-living-v09';
const OLD_KEY='cats-tower-v01';
const MAX_FLOORS=6;
const OFFLINE_CAP=8*60*60*1000;
const RESCUE_CAP=120;
const RESCUE_RATE=1;

const ART={
  title:'/assets/living/title-living-v09.webp',
  roof:'/assets/living/roof-v09.webp',
  rooms:{
    lobby:'/assets/living/room-lobby-v09.webp',
    home:'/assets/living/room-home-v09.webp',
    food:'/assets/living/room-food-v09.webp',
    craft:'/assets/living/room-craft-v09.webp',
    play:'/assets/living/room-play-v09.webp',
    care:'/assets/living/room-care-v09.webp'
  },
  cats:{
    mugi:'/assets/living/cat-mugi-living-v09.webp',
    luna:'/assets/illustrations/cat-luna.v070.webp',
    toto:'/assets/illustrations/cat-toto.v070.webp',
    mimi:'/assets/illustrations/cat-mimi.v070.webp'
  },
  enemy:'/assets/illustrations/enemy-robot.webp'
};

const FLOOR={
  lobby:{name:'ロビー',short:'入口',icon:'⌂',accent:'#48d5ca',story:'荷物と招きベルが集まる、猫たちの玄関。'},
  home:{name:'猫の共同部屋',short:'住居',icon:'⌂',accent:'#ef9f9a',story:'仕事を終えた猫が眠り、遊び、関係を深める部屋。'},
  food:{name:'さかな食堂',short:'ごはん',icon:'≈',accent:'#ef7953',story:'昼は魚料理。夜は素早い魚攻撃でタワーを守る。'},
  play:{name:'毛糸クラブ',short:'あそび',icon:'◎',accent:'#63bc98',story:'訪問猫が集まり、夜番では敵の動きを遅くする。'},
  care:{name:'肉球サロン',short:'ケア',icon:'✦',accent:'#a08ae1',story:'猫の疲れを癒やし、夜番では敵の装甲を弱める。'},
  craft:{name:'段ボール工房',short:'ものづくり',icon:'□',accent:'#d0924d',story:'家具を作り、夜番では重い箱で高ダメージを与える。'}
};

const SHOP={
  food:{price:20,saleMs:5200,batch:6,prepCost:18,attack:11,attackMs:820},
  play:{price:16,saleMs:6200,batch:6,prepCost:22,attack:5,attackMs:1250,slow:1700},
  care:{price:23,saleMs:6900,batch:5,prepCost:26,attack:7,attackMs:1450,break:2200},
  craft:{price:32,saleMs:7800,batch:5,prepCost:31,attack:20,attackMs:1750}
};

const CAT={
  mugi:{name:'ムギ',art:ART.cats.mugi,trait:'食いしん坊',dream:'さかな食堂',quote:'箱より先に、魚を見つける。',now:'焼き魚の匂いを確かめながら、皿の位置を直している。',likes:'魚の匂いと、店が忙しくなる瞬間',care:'空腹になると売り物を味見しようとする',behaviours:[['≈','魚箱にすぐ気付く','食堂へ置くと自分から箱を確認します。'],['♡','忙しいほど元気','客が続くと尻尾の動きが大きくなります。'],['…','味見癖','在庫が少ない時ほど、皿の近くを離れません。']]},
  luna:{name:'ルナ',art:ART.cats.luna,trait:'眠り好き',dream:'毛糸クラブ',quote:'急がない。毛糸は逃げない。',now:'共同部屋のクッションへ沈みながら、片耳だけこちらへ向けている。',likes:'静かな場所と柔らかい毛糸',care:'忙しい店では早めに休ませる',behaviours:[['☾','眠る場所を選ぶ','部屋の中で最も柔らかい場所へ移動します。'],['◎','毛糸の上で安心','毛糸クラブではごきげんが安定します。'],['…','急がない','作業が遅くても失敗しにくい猫です。']]},
  toto:{name:'トト',art:ART.cats.toto,trait:'しっかり者',dream:'肉球サロン',quote:'見回りは任せて。',now:'玄関の音を気にしながら、他の猫が休めているか確認している。',likes:'整った部屋と仲間の世話',care:'自分の休憩を後回しにしがち',behaviours:[['✓','仲間を観察','同じ階の猫が疲れると先に気付きます。'],['✦','ケアが得意','肉球サロンでは他の猫の回復も助けます。'],['⌂','夜の見回り','夜番前はロビーを気にする回数が増えます。']]},
  mimi:{name:'ミミ',art:ART.cats.mimi,trait:'冒険好き',dream:'段ボール工房',quote:'次はどこを見に行く？',now:'新しい箱の角を押し、秘密基地に変えられないか試している。',likes:'新しい道具、箱、まだ開いていない階',care:'面白い物を見ると仕事を中断する',behaviours:[['□','箱を試す','段ボールを見ると中へ入るか押してみます。'],['⌁','工作に集中','工房では短時間だけ驚くほど集中します。'],['↟','上の階が気になる','増築直後は新しい階へ何度も向かいます。']]}
};

const MEMORY={
  key:{icon:'⌂',eyebrow:'PROLOGUE',title:'空きタワーの鍵',body:'長く使われていなかった夜の塔を、猫たちの家と小さな店へ戻すことになった。'},
  firstPrep:{icon:'≈',eyebrow:'MUGI 01',title:'最初の仕込み',body:'ムギは魚の皿を並べ終えると、一番小さな切れ端だけを大事そうに隠した。'},
  specialize:{icon:'♢',eyebrow:'FOOD SHOP',title:'食堂の進む道',body:'同じ魚料理でも、店の形が変われば客と夜番での役割も変わる。'},
  firstNight:{icon:'!',eyebrow:'NIGHT SHIFT 01',title:'この塔は空き家じゃない',body:'C.L.E.A.N.の清掃機を止めた夜、猫たちは初めてこの塔を自分たちの家だと言った。'},
  firstBuild:{icon:'＋',eyebrow:'RESTORATION',title:'上の階へ',body:'閉ざされていた階に灯りが戻り、ミミは誰より先に階段を上った。'},
  visitor:{icon:'●',eyebrow:'VISITING CAT',title:'窓の外の気配',body:'まだ名前を知らない猫が、食堂の明かりを遠くから見ていた。'}
};

const $=s=>document.querySelector(s);
const $$=s=>[...document.querySelectorAll(s)];
const el={
  app:$('#app'),splash:$('#splash'),start:$('#startBtn'),game:$('#game'),coins:$('#coins'),parts:$('#parts'),income:$('#incomeRate'),
  coinsBtn:$('#coinsBtn'),partsBtn:$('#partsBtn'),menu:$('#menuBtn'),focus:$('#focusBar'),focusIcon:$('#focusIcon'),focusEye:$('#focusEyebrow'),focusText:$('#focusText'),
  world:$('#world'),scroll:$('#towerScroll'),tower:$('#tower'),overview:$('#overviewBtn'),jump:$('#jumpBtn'),jumpFloor:$('#jumpFloor'),toasts:$('#toasts'),
  nav:$('#nav'),memoryBadge:$('#memoryBadge'),modal:$('#modal'),coach:$('#coach'),tpl:$('#sheetTpl'),eventDock:$('#eventDock'),eventName:$('#eventName'),
  enemyFloor:$('#enemyFloor'),enemyHp:$('#enemyHp'),enemyHpText:$('#enemyHpText'),energy:$('#energy'),retreat:$('#retreatBtn')
};

let state=load();
let visible=false;
let economyTimer=0;
let saveTimer=0;
let battleFrameId=0;
let lastBattleFrame=0;
let offlineReport=calculateOffline();
let activeFocus=null;

function floor(type,number){
  const cfg=SHOP[type];
  return{id:`${type}-${number}`,number,type,level:1,catId:type==='food'?'mugi':null,stock:cfg?cfg.batch:0,nextSale:Date.now()+3500,specialization:null,prepared:0};
}

function fresh(){
  const now=Date.now();
  return{
    version:V,coins:420,parts:0,day:1,created:now,lastSeen:now,rescueAt:now,rescueTotal:0,sales:0,nightClears:0,lastNight:0,
    floors:[floor('lobby',1),floor('home',2),floor('food',3)],
    cats:{mugi:{mood:88,floorId:'food-3',lastPet:0},luna:{mood:91,floorId:null,lastPet:0},toto:{mood:87,floorId:null,lastPet:0},mimi:{mood:93,floorId:null,lastPet:0}},
    memories:['key'],newMemories:0,firstVisit:true,overview:false,battle:null,settings:{sound:true}
  };
}

function migrateOld(old){
  const s=fresh();
  if(old&&typeof old==='object'){
    if(Number.isFinite(+old.coins))s.coins=Math.max(0,+old.coins);
    if(Number.isFinite(+old.parts))s.parts=Math.max(0,+old.parts);
    if(Number.isFinite(+old.sales))s.sales=Math.max(0,+old.sales);
    if(Number.isFinite(+old.clears))s.nightClears=Math.max(0,+old.clears);
    if(Number.isFinite(+old.lastSeen))s.lastSeen=+old.lastSeen;
  }
  return s;
}

function normal(raw){
  const base=fresh();
  const s={...base,...raw,settings:{...base.settings,...(raw?.settings||{})},cats:{...base.cats,...(raw?.cats||{})},battle:null};
  s.floors=Array.isArray(raw?.floors)?raw.floors.filter(f=>f&&FLOOR[f.type]).map(f=>({...floor(f.type,+f.number||1),...f})).sort((a,b)=>a.number-b.number).slice(0,MAX_FLOORS):base.floors;
  if(!s.floors.some(f=>f.type==='lobby'))s.floors.unshift(floor('lobby',1));
  if(!s.floors.some(f=>f.type==='home'))s.floors.splice(1,0,floor('home',2));
  if(!s.floors.some(f=>f.type==='food'))s.floors.push(floor('food',3));
  s.memories=Array.isArray(raw?.memories)?raw.memories.filter(id=>MEMORY[id]):['key'];
  if(!s.memories.includes('key'))s.memories.unshift('key');
  s.version=V;
  return s;
}

function load(){
  try{
    const current=localStorage.getItem(KEY);
    if(current)return normal(JSON.parse(current));
    const old=localStorage.getItem(OLD_KEY);
    return old?migrateOld(JSON.parse(old)):fresh();
  }catch(err){console.warn(err);return fresh()}
}

function save(immediate=false){
  clearTimeout(saveTimer);
  const run=()=>{try{localStorage.setItem(KEY,JSON.stringify({...state,battle:null,lastSeen:Date.now()}))}catch(err){toast('保存できませんでした。','warn')}};
  if(immediate)run();else saveTimer=setTimeout(run,180);
}

function calculateOffline(){
  const now=Date.now();
  const elapsed=Math.min(OFFLINE_CAP,Math.max(0,now-(+state.lastSeen||now)));
  if(elapsed<20000){state.lastSeen=now;return null}
  const food=getFloorByType('food');
  let sold=0,earned=0,rescue=0;
  if(food&&food.catId&&food.stock>0){
    const cfg=shopRuntime(food);
    sold=Math.min(food.stock,Math.floor(elapsed/cfg.saleMs));
    food.stock-=sold;earned=sold*cfg.price;state.coins+=earned;state.sales+=sold;food.nextSale=now+cfg.saleMs;
  }
  if(state.coins<RESCUE_CAP){
    rescue=Math.min(Math.floor(elapsed/1000)*RESCUE_RATE,RESCUE_CAP-state.coins);
    state.coins+=rescue;state.rescueTotal=(+state.rescueTotal||0)+rescue;
  }
  for(const c of Object.values(state.cats))c.mood=clamp((+c.mood||80)+(c.floorId?2:5),0,100);
  state.lastSeen=now;state.rescueAt=now;
  return{elapsed,sold,earned,rescue};
}

function clamp(v,min,max){return Math.min(max,Math.max(min,v))}
function fmt(n){n=Math.max(0,Math.floor(+n||0));return n<10000?n.toLocaleString('ja-JP'):`${(n/10000).toFixed(n>=100000?0:1)}万`}
function duration(ms){const s=Math.max(0,Math.floor(ms/1000));if(s<60)return`${s}秒`;const m=Math.floor(s/60);return`${m}分${s%60?`${s%60}秒`:''}`}
function escapeHtml(value){return String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;')}
function getFloor(id){return state.floors.find(f=>f.id===id)}
function getFloorByType(type){return state.floors.find(f=>f.type===type)}
function topFloor(){return Math.max(...state.floors.map(f=>f.number))}
function buildCost(){return 450+Math.max(0,state.floors.length-3)*220}
function residentCats(){return Object.entries(state.cats).map(([id,c])=>({id,...c,data:CAT[id]}))}

function shopRuntime(f){
  const base={...SHOP[f.type]};
  if(f.type==='food'&&f.specialization==='street'){base.price=16;base.saleMs=3800;base.attack=9;base.attackMs=650}
  if(f.type==='food'&&f.specialization==='kaiseki'){base.price=31;base.saleMs=6900;base.attack=20;base.attackMs=1250}
  return base;
}

function renderAll(keepScroll=true){renderTop();renderTower(keepScroll);renderFocus();renderNav();updateEventDock()}

function renderTop(){
  el.coins.textContent=fmt(state.coins);el.parts.textContent=fmt(state.parts);
  el.income.textContent=state.coins<RESCUE_CAP?`支援 +${RESCUE_RATE}/秒`:'自動営業';
  el.jumpFloor.textContent=`${topFloor()}F`;
}

function roomNarrative(f){
  if(f.type==='lobby'){
    if(state.battle?.active)return'C.L.E.A.N.の清掃機がタワーへ入っています。';
    if(nightReady())return'トトが玄関を見つめています。夜番を始められます。';
    return'荷物の音がすると、トトが先に耳を向けます。';
  }
  if(f.type==='home'){
    const free=residentCats().filter(c=>!c.floorId).map(c=>c.data.name);
    return free.length?`${free.join('・')}が、それぞれ好きな場所で休んでいます。`:'今は全員が店へ出ています。';
  }
  const cat=f.catId?CAT[f.catId]:null;
  if(!cat)return'まだ働く猫が決まっていません。部屋の明かりだけが点いています。';
  if(f.type==='food'){
    if(!f.specialization)return'ムギは店の形を決めるまで、魚箱の前を離れません。';
    if(f.stock<=1)return'魚の皿がほとんどありません。ムギが空いた棚を見ています。';
    return f.specialization==='street'?'ムギが次々と皿を滑らせ、店の回転を上げています。':'ムギが一皿ずつ匂いと位置を確かめています。';
  }
  return`${cat.name}が${FLOOR[f.type].name}の道具を確かめています。`;
}

function floorAction(f){
  if(f.type==='food'){
    if(!f.specialization)return{icon:'♢',label:'店を決める',tone:'lime',action:'specialize'};
    if(f.stock<=2)return{icon:'≈',label:'仕込み',tone:'warm',action:'prep'};
    return{icon:'≈',label:'店を見る',tone:'teal',action:'floor'};
  }
  if(f.type==='lobby')return{icon:'!',label:nightReady()?'夜番':'玄関',tone:nightReady()?'warm':'teal',action:nightReady()?'night':'floor'};
  if(f.type==='home')return{icon:'♡',label:'暮らし',tone:'teal',action:'floor'};
  return{icon:f.catId?'◎':'●',label:f.catId?'店を見る':'猫を配置',tone:'teal',action:f.catId?'floor':'assign-floor'};
}

function catMarkup(id,cls=''){
  const c=CAT[id];if(!c)return'';
  return`<button class="catButton ${id} ${cls}" data-action="cat" data-cat="${id}" type="button" aria-label="${escapeHtml(c.name)}"><img src="${c.art}" alt="${escapeHtml(c.name)}" draggable="false"><span class="catName">${escapeHtml(c.name)}</span></button>`;
}

function floorHtml(f){
  const cfg=FLOOR[f.type];const action=floorAction(f);const threat=state.battle?.active&&state.battle.floor===f.number;
  let cats='';let bubble='';
  if(f.type==='home'){
    const free=residentCats().filter(c=>!c.floorId).slice(0,3);
    cats=free.map(c=>catMarkup(c.id)).join('');
    bubble=free.length?`<div class="behaviourBubble">${escapeHtml(free[0].data.now)}</div>`:'';
  }else if(f.catId){cats=catMarkup(f.catId);if(f.type==='food')bubble=`<div class="behaviourBubble">${escapeHtml(CAT[f.catId].now)}</div>`}
  const shop=SHOP[f.type]?`<div class="shopGauge"><span>在庫 <b data-stock="${f.id}">${f.stock}</b></span><span>LV.${f.level}</span></div>`:'';
  const enemy=threat?`<div class="nightEnemy"><small>C.L.E.A.N.</small><img src="${ART.enemy}" alt="侵入した清掃機"></div>`:'';
  return`<article class="floor ${f.type}${threat?' underThreat':''}" data-floor="${f.id}" data-no="${f.number}" style="--accent:${cfg.accent}">
    <img class="roomArt" src="${ART.rooms[f.type]}" alt="">
    <div class="floorHead"><div class="floorIdentity"><i>${cfg.icon}</i><span><small>${f.number}F</small> ${escapeHtml(cfg.name)}</span></div><span class="floorLevel">LV.${f.level}</span></div>
    ${shop}<div class="catStage">${cats}</div>${bubble}${enemy}
    <div class="floorStory"><div class="narrative"><small>LIVE IN THE TOWER</small><b>${escapeHtml(roomNarrative(f))}</b></div><button class="roomAction ${action.tone}" data-action="${action.action}" data-floor="${f.id}" type="button"><i>${action.icon}</i><span>${action.label}</span></button></div>
  </article>`;
}

function renderTower(keepScroll=true){
  const previous=keepScroll?el.scroll.scrollTop:0;
  const floors=[...state.floors].sort((a,b)=>b.number-a.number);
  el.tower.classList.toggle('overview',!!state.overview);
  el.tower.innerHTML=`<article class="roofScene"><img src="${ART.roof}" alt="月夜の屋上"></article>${floors.map(floorHtml).join('')}`;
  if(keepScroll)el.scroll.scrollTop=previous;
  requestAnimationFrame(updateEnemyVisual);
}

function focusTask(){
  if(state.battle?.active)return{icon:'!',eye:'NIGHT SHIFT',text:`${state.battle.floor}FでC.L.E.A.N.を止める`,action:'none'};
  const food=getFloorByType('food');
  if(food&&!food.specialization)return{icon:'♢',eye:'FIRST DECISION',text:'さかな食堂を、どんな店にするか決める',action:'specialize'};
  if(food&&food.stock<=2)return{icon:'≈',eye:'MUGI NEEDS HELP',text:'魚の皿を滑らせ、ムギの仕込みを手伝う',action:'prep'};
  if(nightReady())return{icon:'!',eye:'NIGHT SHIFT READY',text:'昼の商品を使って、最初の夜番を始める',action:'night'};
  if(state.floors.length<MAX_FLOORS&&state.coins>=buildCost())return{icon:'＋',eye:'RESTORATION READY',text:`${fmt(buildCost())}コインで新しい階を復旧する`,action:'build'};
  const lowest=residentCats().sort((a,b)=>a.mood-b.mood)[0];
  return{icon:'♡',eye:'CAT LIFE',text:`${lowest.data.name}の今の様子を見る`,action:'cat',cat:lowest.id};
}

function renderFocus(){
  activeFocus=focusTask();el.focusIcon.textContent=activeFocus.icon;el.focusEye.textContent=activeFocus.eye;el.focusText.textContent=activeFocus.text;
}

function renderNav(){
  el.memoryBadge.textContent=state.newMemories||0;el.memoryBadge.classList.toggle('hidden',!state.newMemories);
  el.overview.innerHTML=state.overview?'<i>▥</i><span>通常</span>':'<i>▦</i><span>俯瞰</span>';
}

function updateFloorDynamics(){
  renderTop();renderFocus();
  for(const f of state.floors){const stock=document.querySelector(`[data-stock="${CSS.escape(f.id)}"]`);if(stock)stock.textContent=f.stock}
  updateEventDock();
}

function rescueIncome(now=Date.now()){
  if(state.coins>=RESCUE_CAP){state.rescueAt=now;return 0}
  const at=Number.isFinite(+state.rescueAt)?+state.rescueAt:now;
  const seconds=Math.floor(Math.max(0,now-at)/1000);if(seconds<1)return 0;
  const gain=Math.min(seconds*RESCUE_RATE,RESCUE_CAP-state.coins);state.coins+=gain;state.rescueTotal=(+state.rescueTotal||0)+gain;state.rescueAt=at+seconds*1000;return gain;
}

function economy(){
  const now=Date.now();let changed=rescueIncome(now)>0;let storyChange=false;
  if(!state.battle?.active){
    for(const f of state.floors){
      if(!SHOP[f.type]||!f.catId||f.stock<=0||now<f.nextSale)continue;
      const cfg=shopRuntime(f);f.stock--;state.coins+=cfg.price;state.sales++;f.nextSale=now+cfg.saleMs;changed=true;
      if(f.type==='food'&&f.stock===2)storyChange=true;
      const cat=state.cats[f.catId];if(cat)cat.mood=clamp(cat.mood-.12,0,100);
    }
  }
  if(changed){save();updateFloorDynamics()}if(storyChange)renderTower(true);
}

function nightReady(){
  if(state.battle?.active)return false;
  const shops=state.floors.filter(f=>SHOP[f.type]&&f.catId&&f.stock>0);
  if(!getFloorByType('food')?.specialization)return false;
  if(!shops.length)return false;
  return Date.now()-(+state.lastNight||0)>15000;
}

function openSheet(title,html,eyebrow="CAT'S TOWER"){
  closeSheet();const frag=el.tpl.content.cloneNode(true);frag.querySelector('header small').textContent=eyebrow;frag.querySelector('h2').textContent=title;frag.querySelector('.sheetBody').innerHTML=html;el.modal.appendChild(frag);
}
function closeSheet(){el.modal.innerHTML=''}
function section(title,right,body){return`<section class="section"><h3 class="sectionTitle"><span>${title}</span><span>${right||''}</span></h3>${body}</section>`}
function info(text){return`<div class="info">${text}</div>`}

function catListSheet(){
  state.newMemories=0;
  const cards=residentCats().map(c=>{
    const floor=c.floorId?getFloor(c.floorId):null;
    return`<article class="card catListCard"><div class="catPortrait"><img src="${c.data.art}" alt="${c.data.name}"></div><div><h3>${c.data.name}</h3><p class="role">${floor?`${floor.number}F · ${FLOOR[floor.type].name}`:'共同部屋で休憩中'}</p><span class="traitTag">${c.data.trait}</span></div><button class="look" data-action="cat" data-cat="${c.id}" type="button">›</button></article>`;
  }).join('');
  openSheet(`猫たち · ${residentCats().length}匹`,`${info('数値より先に、表情・行動・好きな場所を見てください。猫の癖が、店と夜番の役割を教えてくれます。')}${section('住人猫','4匹',cards)}`,'CAT RESIDENTS');
}

function catProfile(id){
  const d=CAT[id],c=state.cats[id];if(!d||!c)return;
  const floor=c.floorId?getFloor(c.floorId):null;
  const behaviours=d.behaviours.map(([icon,title,body])=>`<div class="behaviourItem"><i>${icon}</i><div><b>${title}</b><p>${body}</p></div></div>`).join('');
  openSheet(d.name,`<section class="profileHero"><img src="${d.art}" alt="${d.name}"><div class="profileCopy"><small>NOW IN THE TOWER</small><h3>${d.name}</h3><p>「${d.quote}」</p><div class="profileMood"><div><span>ごきげん</span><span>${Math.round(c.mood)}%</span></div><div class="track"><i style="width:${c.mood}%"></i></div></div></div></section>${section('今日の様子','',info(d.now))}${section('この猫を知る','',`<div class="profileGrid"><div class="profileFact"><small>性格</small><strong>${d.trait}</strong><p>${d.care}</p></div><div class="profileFact"><small>夢の仕事</small><strong>${d.dream}</strong><p>${d.likes}</p></div><div class="profileFact"><small>現在地</small><strong>${floor?`${floor.number}F`:'住居'}</strong><p>${floor?FLOOR[floor.type].name:'共同部屋で休憩中'}</p></div><div class="profileFact"><small>関係</small><strong>住人猫</strong><p>会話と思い出は進行に応じて増えます。</p></div></div>`)}${section('行動から分かること','',`<div class="behaviourList">${behaviours}</div>`)}<div class="actions"><button class="btn lime" data-action="pet" data-cat="${id}" type="button">なでる</button><button class="btn" data-action="assign-open" data-cat="${id}" type="button">仕事を選ぶ</button></div>`,`CAT PROFILE · ${d.trait}`);
}

function assignSheet(catId){
  const d=CAT[catId];if(!d)return;
  const shops=state.floors.filter(f=>SHOP[f.type]);
  const cards=shops.map(f=>`<div class="card"><div class="row"><div class="main"><p class="title">${f.number}F · ${FLOOR[f.type].name}</p><p class="desc">${FLOOR[f.type].story}</p><p class="meta">${f.catId&&f.catId!==catId?`${CAT[f.catId].name}と交代`:state.cats[catId].floorId===f.id?'現在の仕事':'配置できます'}</p></div><button class="btn ${CAT[catId].dream.includes(FLOOR[f.type].short)?'lime':''}" data-action="assign" data-cat="${catId}" data-floor="${f.id}" ${state.cats[catId].floorId===f.id?'disabled':''} type="button">${state.cats[catId].floorId===f.id?'配属中':'配置'}</button></div></div>`).join('');
  openSheet(`${d.name}の仕事`,`${info('効率の数字だけでなく、猫の好きな場所と行動が自然に見える仕事を選びます。')}${section('開いている店','',cards)}${state.cats[catId].floorId?'<div class="actions"><button class="btn ghost" data-action="unassign" data-cat="'+catId+'" type="button">共同部屋へ戻す</button></div>':''}`,'ASSIGNMENT');
}

function assignFloorSheet(floorId){
  const f=getFloor(floorId);if(!f)return;
  const cards=residentCats().map(c=>`<div class="card"><div class="row"><div class="catPortrait" style="width:70px;height:78px;flex:0 0 70px"><img src="${c.data.art}" alt="${c.data.name}"></div><div class="main"><p class="title">${c.data.name} · ${c.data.trait}</p><p class="desc">${c.data.now}</p></div><button class="btn" data-action="assign" data-cat="${c.id}" data-floor="${f.id}" type="button">配置</button></div></div>`).join('');
  openSheet(`${FLOOR[f.type].name}で働く猫`,section('住人猫から選ぶ','',cards),'ASSIGNMENT');
}

function assignCat(catId,floorId){
  const target=getFloor(floorId),cat=state.cats[catId];if(!target||!cat||!SHOP[target.type])return;
  for(const f of state.floors)if(f.catId===catId)f.catId=null;
  if(target.catId&&state.cats[target.catId])state.cats[target.catId].floorId=null;
  target.catId=catId;cat.floorId=target.id;cat.mood=clamp(cat.mood+3,0,100);closeSheet();renderAll(true);scrollToFloor(target.id);toast(`${CAT[catId].name}が${FLOOR[target.type].name}で仕事を始めました。`,'good');save();
}

function unassign(catId){
  const c=state.cats[catId];if(!c)return;for(const f of state.floors)if(f.catId===catId)f.catId=null;c.floorId=null;closeSheet();renderAll(true);toast(`${CAT[catId].name}は共同部屋へ戻りました。`,'good');save();
}

function pet(catId){
  const c=state.cats[catId];if(!c)return;const now=Date.now();if(now-(+c.lastPet||0)<20000)return toast(`${CAT[catId].name}は満足そうです。`);c.lastPet=now;c.mood=clamp(c.mood+7,0,100);navigator.vibrate?.(18);catProfile(catId);toast(`${CAT[catId].name}が目を細めました。`,'good');save();
}

function specializationSheet(){
  const food=getFloorByType('food');if(!food)return;
  const choice=(id,title,body,a,b,c)=>`<button class="specialCard" data-action="special" data-special="${id}" type="button"><header><h3>${title}</h3></header><p>${body}</p><div class="specialStats"><span><small>客の速さ</small><b>${a}</b></span><span><small>一皿の価値</small><b>${b}</b></span><span><small>夜番</small><b>${c}</b></span></div></button>`;
  openSheet('さかな食堂の進む道',`${info('売上だけではなく、店の見た目、ムギの働き方、夜番の攻撃方法が同時に変わります。')}${section('二つの店づくり','',`<div class="specialGrid">${choice('street','屋台型の食堂','小さな皿を次々と出す、明るく忙しい店。ムギは客が続くほど元気になります。','速い','16¢','連射')}${choice('kaiseki','小料理屋型の食堂','一皿ずつ丁寧に仕上げる、静かで高単価な店。','ゆっくり','31¢','高威力')}</div>`)}`,'FIRST IMPORTANT DECISION');
}

function chooseSpecialization(type){
  const food=getFloorByType('food');if(!food||!['street','kaiseki'].includes(type))return;food.specialization=type;food.nextSale=Date.now()+1200;unlockMemory('specialize');closeSheet();renderAll(true);scrollToFloor(food.id);toast(type==='street'?'さかな食堂を屋台型へ整えました。':'さかな食堂を小料理屋型へ整えました。','good');coach('次は魚の皿を棚へ滑らせます。短い手作業が、ムギの生活と夜番の在庫につながります。','≈');save();
}

function prepSheet(){
  const food=getFloorByType('food');if(!food)return;const cfg=shopRuntime(food);
  openSheet('ムギの仕込み',`<div class="prepScene"><i>≈</i><h3>魚の皿を棚まで滑らせる</h3><p>一度の仕込みで在庫が${cfg.batch}皿増えます。必要コインは${cfg.prepCost}。<br>販売にも夜番にも、同じ皿を使います。</p><div id="prepTrack" class="prepTrack"><div id="prepPlate" class="prepPlate">≈</div></div><div class="prepHint">皿を右端までドラッグ</div><div class="actions"><button id="prepAssist" class="btn ghost" type="button">タップで補助</button></div></div>`,'SHORT HANDS-ON ACTION');
  requestAnimationFrame(bindPrepGesture);
}

function bindPrepGesture(){
  const track=$('#prepTrack'),plate=$('#prepPlate'),assist=$('#prepAssist');if(!track||!plate)return;
  let dragging=false,done=false;
  const max=()=>Math.max(1,track.clientWidth-plate.clientWidth-14);
  const move=e=>{if(!dragging||done)return;const r=track.getBoundingClientRect();const x=clamp(e.clientX-r.left-plate.clientWidth/2,0,max());plate.style.transform=`translateX(${x}px)`;if(x/max()>.91){done=true;completePrep()}};
  track.addEventListener('pointerdown',e=>{dragging=true;track.setPointerCapture?.(e.pointerId);move(e)});
  track.addEventListener('pointermove',move);track.addEventListener('pointerup',()=>{if(done)return;dragging=false;plate.style.transition='transform .25s';plate.style.transform='translateX(0)';setTimeout(()=>plate.style.transition='',280)});
  assist?.addEventListener('click',()=>{if(done)return;done=true;plate.style.transition='transform .5s cubic-bezier(.2,.8,.2,1)';plate.style.transform=`translateX(${max()}px)`;setTimeout(completePrep,520)});
}

function completePrep(){
  const food=getFloorByType('food');if(!food)return;const cfg=shopRuntime(food);if(state.coins<cfg.prepCost){toast('仕込み用のコインが足りません。管理人支援で120コインまで回復します。','warn');return}
  state.coins-=cfg.prepCost;food.stock=Math.min(food.stock+cfg.batch,18);food.prepared=(+food.prepared||0)+1;food.nextSale=Date.now()+1400;state.cats.mugi.mood=clamp(state.cats.mugi.mood+4,0,100);unlockMemory('firstPrep');closeSheet();renderAll(true);scrollToFloor(food.id);toast(`魚の皿を${cfg.batch}皿並べました。`,'good');save();
}

function buildSheet(){
  const built=new Set(state.floors.map(f=>f.type));const available=['play','care','craft'].filter(t=>!built.has(t));const cost=buildCost();
  if(state.floors.length>=MAX_FLOORS)return openSheet('タワーの復旧',`<div class="info">Vertical Sliceでは6階まで復旧できます。次の段階で訪問猫と屋上の暮らしを追加します。</div>`,'RESTORATION');
  const cards=available.map(type=>{const f=FLOOR[type];return`<button class="buildCard" style="--bc:${f.accent}" data-action="build" data-type="${type}" ${state.coins<cost?'disabled':''} type="button"><i>${f.icon}</i><h3>${f.name}</h3><p>${f.story}</p><span class="cost">¢ ${fmt(cost)}</span></button>`}).join('');
  openSheet('新しい階を復旧',`${info('新しい店は売上だけでなく、猫の居場所、訪問猫、夜番の解決方法を増やします。')}${section('閉ざされた階',`${fmt(cost)}コイン`,`<div class="buildGrid">${cards}</div>`)}${state.coins<cost?`<p class="desc">あと${fmt(cost-state.coins)}コイン。通常営業と夜番で増やせます。</p>`:''}`,'RESTORE THE TOWER');
}

function buildFloor(type){
  if(!['play','care','craft'].includes(type)||state.floors.some(f=>f.type===type)||state.floors.length>=MAX_FLOORS)return;const cost=buildCost();if(state.coins<cost)return toast('コインが足りません。','warn');state.coins-=cost;const f=floor(type,topFloor()+1);f.stock=SHOP[type].batch;state.floors.push(f);unlockMemory('firstBuild');closeSheet();renderAll(false);requestAnimationFrame(()=>scrollToFloor(f.id));toast(`${FLOOR[type].name}に明かりが戻りました。`,'good');save();
}

function memorySheet(){
  state.newMemories=0;const order=['key','firstPrep','specialize','firstNight','firstBuild','visitor'];
  const cards=order.map(id=>{const m=MEMORY[id],open=state.memories.includes(id);return`<article class="memoryCard ${open?'':'memoryLocked'}"><i>${open?m.icon:'?'}</i><small>${open?m.eyebrow:'LOCKED MEMORY'}</small><h3>${open?m.title:'まだ起きていない出来事'}</h3><p>${open?m.body:'猫の暮らし、店づくり、夜番を進めると解放されます。'}</p></article>`}).join('');
  openSheet('思い出帳',`${info('思い出は報酬一覧ではなく、猫たちがこの塔を家にしていく記録です。')}${section('タワーの記録',`${state.memories.length}/${order.length}`,`<div class="memoryGrid">${cards}</div>`)}`,'MEMORY ALBUM');
}

function unlockMemory(id){if(!MEMORY[id]||state.memories.includes(id))return;state.memories.push(id);state.newMemories=(+state.newMemories||0)+1;renderNav();toast(`思い出「${MEMORY[id].title}」を記録しました。`,'good')}

function floorSheet(floorId){
  const f=getFloor(floorId);if(!f)return;const cfg=FLOOR[f.type];
  if(f.type==='food'){
    const runtime=shopRuntime(f);const spec=f.specialization==='street'?'屋台型':f.specialization==='kaiseki'?'小料理屋型':'未決定';
    return openSheet(cfg.name,`${info(roomNarrative(f))}${section('今の店',spec,`<div class="profileGrid"><div class="profileFact"><small>在庫</small><strong>${f.stock}皿</strong><p>販売と夜番で共通して使用</p></div><div class="profileFact"><small>一皿</small><strong>${runtime.price}¢</strong><p>${Math.round(runtime.saleMs/100)/10}秒ごとに自動販売</p></div></div>`)}<div class="actions"><button class="btn lime" data-action="prep" type="button">仕込みを手伝う</button><button class="btn" data-action="specialize" type="button">店の方向を確認</button></div>${f.catId?section('働く猫','',`<div class="card catListCard"><div class="catPortrait"><img src="${CAT[f.catId].art}" alt="${CAT[f.catId].name}"></div><div><h3>${CAT[f.catId].name}</h3><p class="role">${CAT[f.catId].trait}</p><span class="traitTag">${CAT[f.catId].now}</span></div><button class="look" data-action="cat" data-cat="${f.catId}" type="button">›</button></div>`):''}`,`${f.number}F · LIVING SHOP`);
  }
  if(f.type==='home')return openSheet(cfg.name,`${info(roomNarrative(f))}${section('共同生活','',residentCats().filter(c=>!c.floorId).map(c=>`<div class="card catListCard"><div class="catPortrait"><img src="${c.data.art}" alt="${c.data.name}"></div><div><h3>${c.data.name}</h3><p class="role">${c.data.trait}</p><span class="traitTag">${c.data.now}</span></div><button class="look" data-action="cat" data-cat="${c.id}" type="button">›</button></div>`).join('')||'<div class="info">今は全員が店へ出ています。</div>')}`,`${f.number}F · HOME`);
  if(f.type==='lobby')return openSheet(cfg.name,`${info(roomNarrative(f))}${section('夜番',nightReady()?'準備完了':'準備中',`<div class="card"><div class="row"><div class="main"><p class="title">C.L.E.A.N.の自動清掃機</p><p class="desc">この建物を空き家と誤認し、猫たちの箱と商品を回収しようとします。</p><p class="meta">店の商品が、そのまま夜番の防衛手段になります。</p></div><button class="btn warm" data-action="night" ${nightReady()?'':'disabled'} type="button">始める</button></div></div>`)}`,'1F · NIGHT ENTRANCE');
  const cat=f.catId?CAT[f.catId]:null;
  openSheet(cfg.name,`${info(cfg.story)}${section('現在の状態','',cat?`<div class="card catListCard"><div class="catPortrait"><img src="${cat.art}" alt="${cat.name}"></div><div><h3>${cat.name}</h3><p class="role">${cat.trait}</p><span class="traitTag">${cat.now}</span></div><button class="look" data-action="cat" data-cat="${f.catId}" type="button">›</button></div>`:`<div class="card"><div class="row"><div class="main"><p class="title">働く猫がいません</p><p class="desc">猫を配置すると、店の生活と夜番の役割が動き始めます。</p></div><button class="btn" data-action="assign-floor" data-floor="${f.id}" type="button">選ぶ</button></div></div>`)}`,`${f.number}F · ${cfg.short.toUpperCase()}`);
}

function resourceSheet(kind){
  const coin=kind==='coin';openSheet(coin?'コイン':'修復部品',`<div class="info">${coin?`通常営業で自動的に増えます。完全停止を防ぐため、所持金が${RESCUE_CAP}未満の時だけロビーの管理人支援が毎秒${RESCUE_RATE}コイン補います。`:'夜番とタワーの事件で獲得し、店の見た目と役割を強化します。'}</div><div class="profileGrid" style="margin-top:12px"><div class="profileFact"><small>現在</small><strong>${coin?fmt(state.coins)+'¢':fmt(state.parts)+'個'}</strong><p>${coin?'累計営業 '+fmt(state.sales)+'回':'夜番成功 '+state.nightClears+'回'}</p></div><div class="profileFact"><small>${coin?'管理人支援':'用途'}</small><strong>${coin?fmt(state.rescueTotal)+'¢':'店舗強化'}</strong><p>${coin?'必要時だけ動く安全弁':'次のVertical Sliceで拡張'}</p></div></div>`,'TOWER RESOURCE');
}

function menuSheet(){
  openSheet('設定と試作情報',`${section('設定','',`<div class="card"><div class="row"><div class="main"><p class="title">効果音</p><p class="desc">現在は触覚フィードバックを中心にしています。</p></div><button class="btn ghost" data-action="sound" type="button">${state.settings.sound?'ON':'OFF'}</button></div></div>`)}${section('Vertical Slice','',`<div class="profileGrid"><div class="profileFact"><small>VERSION</small><strong>${V}</strong><p>Living Tower再設計版</p></div><div class="profileFact"><small>FLOORS</small><strong>${state.floors.length}/${MAX_FLOORS}</strong><p>断面ドールハウス</p></div><div class="profileFact"><small>CATS</small><strong>4</strong><p>住人猫</p></div><div class="profileFact"><small>NIGHT</small><strong>${state.nightClears}</strong><p>夜番成功</p></div></div>`)}<div class="actions"><button class="btn danger" data-action="reset-confirm" type="button">セーブデータを初期化</button></div>`,'CAT\'S TOWER · LIVING TOWER');
}

function resetConfirm(){openSheet('最初からやり直す',`<div class="info">階、猫の配置、思い出、コイン、夜番記録を初期状態へ戻します。</div><div class="actions"><button class="btn ghost" data-close="1" type="button">戻る</button><button class="btn danger" data-action="reset" type="button">初期化する</button></div>`,'RESET SAVE DATA')}
function resetGame(){localStorage.removeItem(KEY);state=fresh();offlineReport=null;closeSheet();renderAll(false);requestAnimationFrame(()=>scrollToFloor('food-3'));coach('魚箱を棚へ滑らせ、ムギの最初の店を動かしてください。','≈');save(true)}

function beginNight(){
  if(!nightReady())return toast('食堂の方向を決め、猫と商品在庫を準備してください。','warn');
  closeSheet();state.battle={active:true,hp:118,maxHp:118,floor:1,progress:0,energy:100,slowUntil:0,armorDownUntil:0,nextAttack:0,shots:0,started:performance.now()};lastBattleFrame=performance.now();renderAll(true);el.eventDock.classList.remove('hidden');scrollToFloor('lobby-1');coach('店は自動攻撃します。重要な瞬間だけ、毛糸・箱・磁石を使ってください。','!');cancelAnimationFrame(battleFrameId);battleFrameId=requestAnimationFrame(battleLoop);
}

function battleLoop(t){
  const b=state.battle;if(!b?.active)return;const dt=Math.min(.06,Math.max(0,(t-lastBattleFrame)/1000));lastBattleFrame=t;
  b.energy=clamp(b.energy+9.5*dt,0,100);b.progress+=(t<b.slowUntil?3.1:8.3)*dt;
  const floorNow=state.floors.find(f=>f.number===b.floor);
  if(floorNow&&SHOP[floorNow.type]&&floorNow.catId&&floorNow.stock>0&&t>=b.nextAttack){
    const cfg=shopRuntime(floorNow);b.nextAttack=t+cfg.attackMs;b.shots++;if(b.shots%2===0)floorNow.stock=Math.max(0,floorNow.stock-1);
    if(cfg.slow)b.slowUntil=Math.max(b.slowUntil,t+cfg.slow);if(cfg.break)b.armorDownUntil=Math.max(b.armorDownUntil,t+cfg.break);hitEnemy(cfg.attack,t);flashFloor(floorNow.id);
  }
  if(b.progress>=100){b.progress=0;b.floor++;if(b.floor>topFloor())return finishNight(false);renderTower(true);scrollToFloor(state.floors.find(f=>f.number===b.floor)?.id)}
  if(b.hp<=0)return finishNight(true);updateEnemyVisual();updateEventDock();battleFrameId=requestAnimationFrame(battleLoop);
}

function hitEnemy(amount,t=performance.now()){const b=state.battle;if(!b)return;const mult=t<b.armorDownUntil?1.35:1;b.hp=Math.max(0,b.hp-amount*mult);navigator.vibrate?.(12)}
function flashFloor(id){const node=el.tower.querySelector(`[data-floor="${CSS.escape(id)}"]`);if(!node)return;node.animate([{filter:'brightness(1)'},{filter:'brightness(1.25)'},{filter:'brightness(1)'}],{duration:280})}

function useTool(type){
  const b=state.battle;if(!b?.active)return;const cost={yarn:25,box:40,magnet:30}[type];if(!cost||b.energy<cost)return toast('管理エネルギーが足りません。','warn');b.energy-=cost;const now=performance.now();
  if(type==='yarn'){b.slowUntil=now+5200;hitEnemy(5,now);toast('毛糸が車輪へ絡まりました。')}
  if(type==='box'){hitEnemy(32,now);b.progress=Math.max(0,b.progress-28);toast('段ボールで進行を押し戻しました。')}
  if(type==='magnet'){b.progress=0;b.armorDownUntil=now+5200;hitEnemy(7,now);toast('磁石で清掃機の装甲を乱しました。')}
  updateEventDock();updateEnemyVisual();
}

function updateEnemyVisual(){
  const b=state.battle;if(!b?.active)return;const enemy=$('.nightEnemy');if(enemy)enemy.style.transform=`translateX(${Math.round(b.progress*2.05)}px)`;
}

function updateEventDock(){
  const b=state.battle;if(!b?.active){el.eventDock.classList.add('hidden');return}el.eventDock.classList.remove('hidden');el.enemyFloor.textContent=`${b.floor}F`;el.enemyHp.style.width=`${clamp(b.hp/b.maxHp*100,0,100)}%`;el.enemyHpText.textContent=Math.ceil(b.hp);el.energy.textContent=Math.floor(b.energy);$$('#eventDock [data-tool]').forEach(btn=>btn.classList.toggle('disabled',b.energy<+({yarn:25,box:40,magnet:30}[btn.dataset.tool]||0)));
}

function finishNight(win,retreat=false){
  const b=state.battle;if(!b)return;cancelAnimationFrame(battleFrameId);state.battle=null;state.lastNight=Date.now();el.eventDock.classList.add('hidden');
  if(win){state.coins+=180;state.parts+=4;state.nightClears++;state.day++;for(const c of Object.values(state.cats))c.mood=clamp(c.mood+5,0,100);unlockMemory('firstNight')}
  renderAll(true);save(true);
  if(retreat)return toast('夜番を停止しました。猫や店舗は失われません。','warn');
  openSheet(win?'タワーを守りました':'屋上へ到達されました',`<div class="profileHero" style="min-height:250px"><img src="${ART.cats.mugi}" alt="ムギ"><div class="profileCopy"><small>${win?'NIGHT SHIFT CLEARED':'DEFENSE REPORT'}</small><h3>${win?'ここは、猫たちの家。':'準備を見直そう。'}</h3><p>${win?'昼に準備した商品が、夜のタワーを守りました。':'店と猫は失われません。在庫と道具の使い方を変えて再挑戦できます。'}</p></div></div>${win?`<div class="profileGrid" style="margin-top:10px"><div class="profileFact"><small>コイン</small><strong>+180</strong><p>復旧資金</p></div><div class="profileFact"><small>修復部品</small><strong>+4</strong><p>店舗強化用</p></div></div>`:''}<div class="actions"><button class="btn lime" data-close="1" type="button">タワーへ戻る</button>${win?'':`<button class="btn" data-action="night" type="button">再挑戦</button>`}</div>`,win?'NIGHT SHIFT CLEARED':'NIGHT SHIFT FAILED');
}

function offlineSheet(){
  const r=offlineReport;offlineReport=null;if(!r)return;
  openSheet('留守のあいだ',`<div class="info">${duration(r.elapsed)}ぶん、猫たちはそれぞれの時間を過ごしていました。夜番は勝手に始まりません。</div><div class="profileGrid" style="margin-top:11px"><div class="profileFact"><small>自動販売</small><strong>${r.sold}皿</strong><p>+${fmt(r.earned)}コイン</p></div><div class="profileFact"><small>管理人支援</small><strong>+${fmt(r.rescue)}</strong><p>完全停止を防止</p></div></div>${section('猫の様子','',`<div class="card catListCard"><div class="catPortrait"><img src="${ART.cats.luna}" alt="ルナ"></div><div><h3>ルナは窓辺で眠っていました</h3><p class="role">共同部屋</p><span class="traitTag">急がない。毛糸は逃げない。</span></div><button class="look" data-action="cat" data-cat="luna" type="button">›</button></div>`)}<div class="actions"><button class="btn lime" data-close="1" type="button">タワーを見る</button></div>`,'WELCOME BACK');
}

function coach(text,icon='◎'){
  el.coach.innerHTML=`<aside class="coachBubble"><i>${icon}</i><p>${escapeHtml(text)}</p><button data-action="coach-close" type="button">×</button></aside>`;setTimeout(()=>{if($('.coachBubble'))el.coach.innerHTML=''},6500);
}

function toast(text,tone=''){
  const node=document.createElement('div');node.className=`toast ${tone}`;node.textContent=text;el.toasts.appendChild(node);setTimeout(()=>node.remove(),3050);
}

function scrollToFloor(id){
  if(!id)return;setTimeout(()=>{const node=el.tower.querySelector(`[data-floor="${CSS.escape(id)}"]`);node?.scrollIntoView({behavior:'smooth',block:'center'})},80);
}

function updateJump(){
  const nodes=$$('.floor');if(!nodes.length)return;const center=el.scroll.getBoundingClientRect().top+el.scroll.clientHeight/2;let best=nodes[0],dist=Infinity;for(const n of nodes){const r=n.getBoundingClientRect(),d=Math.abs(r.top+r.height/2-center);if(d<dist){dist=d;best=n}}el.jumpFloor.textContent=`${best.dataset.no}F`;
}

function handleFocus(){
  const f=activeFocus;if(!f||f.action==='none')return;if(f.action==='specialize')specializationSheet();else if(f.action==='prep')prepSheet();else if(f.action==='night')beginNight();else if(f.action==='build')buildSheet();else if(f.action==='cat')catProfile(f.cat);
}

function towerClick(event){
  const action=event.target.closest('[data-action]');if(action){const type=action.dataset.action;if(type==='cat')return catProfile(action.dataset.cat);if(type==='prep')return prepSheet();if(type==='specialize')return specializationSheet();if(type==='night')return beginNight();if(type==='assign-floor')return assignFloorSheet(action.dataset.floor);if(type==='floor')return floorSheet(action.dataset.floor)}
  const floorNode=event.target.closest('.floor');if(floorNode)floorSheet(floorNode.dataset.floor);
}

function navClick(event){
  if(state.battle?.active)return toast('夜番中はタワーへ集中してください。','warn');const btn=event.target.closest('[data-nav]');if(!btn)return;$$('#nav button').forEach(b=>b.classList.toggle('on',b===btn));const nav=btn.dataset.nav;if(nav==='tower')closeSheet();else if(nav==='cats')catListSheet();else if(nav==='build')buildSheet();else if(nav==='memories')memorySheet();
}

function modalClick(event){
  const close=event.target.closest('[data-close]');if(close)return closeSheet();if(event.target.classList.contains('shade')&&event.target.dataset.close)return closeSheet();const node=event.target.closest('[data-action]');if(!node)return;const action=node.dataset.action;
  if(action==='cat')catProfile(node.dataset.cat);else if(action==='pet')pet(node.dataset.cat);else if(action==='assign-open')assignSheet(node.dataset.cat);else if(action==='assign-floor')assignFloorSheet(node.dataset.floor);else if(action==='assign')assignCat(node.dataset.cat,node.dataset.floor);else if(action==='unassign')unassign(node.dataset.cat);else if(action==='special')chooseSpecialization(node.dataset.special);else if(action==='specialize')specializationSheet();else if(action==='prep')prepSheet();else if(action==='build')buildFloor(node.dataset.type);else if(action==='night')beginNight();else if(action==='sound'){state.settings.sound=!state.settings.sound;menuSheet();save()}else if(action==='reset-confirm')resetConfirm();else if(action==='reset')resetGame();
}

function startGame(){
  if(visible)return;visible=true;el.splash.animate([{opacity:1},{opacity:0}],{duration:480,fill:'forwards'}).finished.finally(()=>el.splash.classList.add('hidden'));el.game.classList.remove('hidden');renderAll(false);requestAnimationFrame(()=>scrollToFloor('food-3'));economyTimer=setInterval(economy,500);if(offlineReport)setTimeout(offlineSheet,650);else if(state.firstVisit){state.firstVisit=false;setTimeout(()=>coach('説明画面はありません。光っている魚箱を開き、皿を棚まで滑らせてください。','≈'),650);save()}
}

function init(){
  el.start.addEventListener('click',startGame);el.tower.addEventListener('click',towerClick);el.nav.addEventListener('click',navClick);el.modal.addEventListener('click',modalClick);el.focus.addEventListener('click',handleFocus);el.menu.addEventListener('click',menuSheet);el.coinsBtn.addEventListener('click',()=>resourceSheet('coin'));el.partsBtn.addEventListener('click',()=>resourceSheet('part'));
  el.overview.addEventListener('click',()=>{if(state.battle?.active)return;state.overview=!state.overview;renderTower(false);renderNav();requestAnimationFrame(()=>el.scroll.scrollTop=0);save()});
  el.jump.addEventListener('click',()=>{const top=[...state.floors].sort((a,b)=>b.number-a.number)[0];scrollToFloor(top?.id)});el.scroll.addEventListener('scroll',()=>requestAnimationFrame(updateJump),{passive:true});
  el.eventDock.addEventListener('click',event=>{const tool=event.target.closest('[data-tool]');if(tool)useTool(tool.dataset.tool)});el.retreat.addEventListener('click',()=>{if(state.battle?.active)finishNight(false,true)});
  el.coach.addEventListener('click',event=>{if(event.target.closest('[data-action="coach-close"]'))el.coach.innerHTML=''});
  document.addEventListener('visibilitychange',()=>{if(document.hidden){save(true);if(state.battle?.active)finishNight(false,true)}else{state.rescueAt=Date.now();lastBattleFrame=performance.now()}});addEventListener('pagehide',()=>save(true));
  if('serviceWorker'in navigator&&location.protocol!=='file:')addEventListener('load',()=>navigator.serviceWorker.register('/sw.js?v=090').catch(console.warn));
  save(true);
  window.__CATS_TEST_API__={version:V,start:startGame,getState:()=>JSON.parse(JSON.stringify({...state,battle:null})),reset:resetGame,addCoins:n=>{state.coins+=+n||1000;renderAll(true);save(true)},specialize:type=>chooseSpecialization(type||'street'),startNight:beginNight};
}

init();
})();
