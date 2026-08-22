const CACHE='cats-tower-v082-pixel-tower-r3';
const CORE=[
  '/','/index.html','/styles.css?v=082r3','/game-data.js?v=082r3','/game-core.js?v=082r3','/app.js?v=082r3','/manifest.webmanifest',
  '/assets/v080/pixel-r2/tower-night-r2.png',
  '/assets/v080/pixel-r2/mugi-sprites-r2.png',
  '/assets/v080/pixel-r2/crow-sprites-r2.png',
  '/assets/v082/pixel-r3/cats-cast-r3.png',
  '/assets/v082/pixel-r3/enemies-r3.png',
  '/assets/fonts/noto-sans-jp-700-ja.woff2',
  '/assets/icons/icon-192.png','/assets/icons/icon-512.png'
];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(CORE)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('cats-tower-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url);
  if(url.origin!==location.origin)return;
  if(event.request.mode==='navigate'){
    event.respondWith(fetch(event.request).then(async response=>{
      const isShellPath=url.pathname==='/'||url.pathname==='/index.html';
      const isHtml=(response.headers.get('content-type')||'').includes('text/html');
      if(response.ok&&isShellPath&&isHtml){
        const cache=await caches.open(CACHE);
        await cache.put('/index.html',response.clone());
      }
      return response;
    }).catch(()=>caches.open(CACHE).then(cache=>cache.match('/index.html'))));
    return;
  }
  event.respondWith(caches.open(CACHE).then(cache=>cache.match(event.request).then(hit=>hit||fetch(event.request).then(async response=>{
    if(response.ok&&['style','script','image','font'].includes(event.request.destination)){
      await cache.put(event.request,response.clone());
    }
    return response;
  }))));
});
