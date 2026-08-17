const CACHE='cats-tower-v080';
const CORE=['/','/index.html','/styles.css?v=080','/app.js?v=080','/assets/v080/title-live-v080.webp','/assets/v080/room-food-v080.webp','/assets/v080/room-home-v080.webp','/assets/v080/room-lobby-v080.webp','/assets/v080/room-roof-v080.webp','/assets/v080/room-food-night-v080.webp','/assets/v080/memory-first-home-v080.webp','/assets/v080/mugi-v080.webp'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(CORE)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url);
  if(url.origin!==location.origin)return;
  if(event.request.mode==='navigate'){
    event.respondWith(fetch(event.request).then(response=>{
      const copy=response.clone();
      caches.open(CACHE).then(cache=>cache.put('/index.html',copy));
      return response;
    }).catch(()=>caches.match('/index.html')));
    return;
  }
  event.respondWith(caches.match(event.request).then(hit=>hit||fetch(event.request).then(response=>{
    if(response.ok&&['style','script','image'].includes(event.request.destination)){
      const copy=response.clone();
      caches.open(CACHE).then(cache=>cache.put(event.request,copy));
    }
    return response;
  })));
});
