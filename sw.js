const CACHE='cats-tower-living-v091';
const CORE=[
  '/','/index.html','/styles.css?v=091','/app.js?v=091','/manifest.webmanifest?v=091',
  '/assets/living/title-living-v09.webp','/assets/living/roof-v09.webp',
  '/assets/living/room-lobby-v09.webp','/assets/living/room-home-v09.webp','/assets/living/room-food-v09.webp',
  '/assets/living/room-play-v09.webp','/assets/living/room-care-v09.webp','/assets/living/room-craft-v09.webp',
  '/assets/living/cat-mugi-living-v09.webp','/assets/illustrations/cat-luna.v070.webp',
  '/assets/illustrations/cat-toto.v070.webp','/assets/illustrations/cat-mimi.v070.webp',
  '/assets/illustrations/enemy-robot.webp'
];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(CORE)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url);
  if(url.origin!==self.location.origin)return;
  event.respondWith(fetch(event.request).then(response=>{
    if(response.ok){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(event.request,copy))}
    return response;
  }).catch(()=>caches.match(event.request).then(hit=>hit||caches.match('/index.html'))));
});
