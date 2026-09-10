const VERSION='0.4.11';
const CACHE=`schedule-plus-v${VERSION}`;
const CORE=['./','./index.html','./styles.css','./maps-autocomplete.css','./ui-enhancements.css','./app.js','./maps-config.js','./maps-autocomplete.js','./ui-enhancements.js','./supabase.js','./version.js','./manifest.webmanifest','./assets/powerup-logo.png','./assets/icons/icon.svg'];
self.addEventListener('install',e=>{self.skipWaiting();e.waitUntil(caches.open(CACHE).then(c=>c.addAll(CORE.map(u=>`${u}${u.includes('?')?'&':'?'}v=${VERSION}`))))});
self.addEventListener('activate',e=>{e.waitUntil(Promise.all([caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))),self.clients.claim()]))});
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET')return;
  const url=new URL(e.request.url);
  if(url.origin!==self.location.origin)return;
  e.respondWith(fetch(e.request,{cache:'no-store'}).then(r=>{if(r&&r.ok){const copy=r.clone();caches.open(CACHE).then(c=>c.put(e.request,copy))}return r}).catch(()=>caches.match(e.request).then(r=>r||caches.match(`./index.html?v=${VERSION}`)||caches.match('./index.html'))));
});
