const CACHE_NAME='meu-patrimonio-shell-v2';
const APP_BASE=new URL('./',self.location.href);
const APP_FILES=['./','./index.html','./styles.css','./bridge.js','./app.js','./financing.js','./pluggy.js','./finance-enhancements.js','./qrcode.js','./privacy-share.js'].map(path=>new URL(path,APP_BASE).href);
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.addAll(APP_FILES)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('meu-patrimonio-shell-')&&key!==CACHE_NAME).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
  const request=event.request,url=new URL(request.url);
  if(request.method!=='GET'||url.origin!==self.location.origin)return;
  if(request.mode==='navigate'){
    event.respondWith(fetch(request).catch(()=>caches.match(new URL('./index.html',APP_BASE).href)));
    return;
  }
  if(APP_FILES.includes(request.url))event.respondWith(caches.match(request).then(cached=>cached||fetch(request)));
});
