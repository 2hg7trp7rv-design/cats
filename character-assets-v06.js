(()=>{
  'use strict';
  const BASE='https://raw.githubusercontent.com/2hg7trp7rv-design/cats/main/assets/illustrations/';
  const ASSETS={
    'ムギ':`${BASE}cat-mugi.webp?v=6`,
    'ルナ':`${BASE}cat-luna.webp?v=6`,
    'トト':`${BASE}cat-toto.webp?v=6`,
    'ミミ':`${BASE}cat-mimi.webp?v=6`
  };
  const apply=(root=document)=>{
    const list=[];
    if(root instanceof HTMLImageElement) list.push(root);
    if(root.querySelectorAll) list.push(...root.querySelectorAll('img[alt]'));
    for(const img of list){
      const src=ASSETS[img.alt];
      if(!src) continue;
      if(img.dataset.assetV6==='1' && img.src===src) continue;
      img.dataset.assetV6='1';
      img.decoding='async';
      img.draggable=false;
      img.referrerPolicy='no-referrer';
      img.src=src;
    }
  };
  const start=()=>{
    apply(document);
    new MutationObserver(records=>{
      for(const record of records){
        for(const node of record.addedNodes){
          if(node.nodeType===1) apply(node);
        }
      }
    }).observe(document.documentElement,{childList:true,subtree:true});
  };
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();
})();
