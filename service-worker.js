/* Bump this name with every release. Online navigation always uses the network. */
const CACHE = 'f1d-shell-2026-09-24-1';
const ROOT = new URL('./', self.location.href);
const INDEX = new URL('index.html', ROOT).href;
const SHELL = ['index.html','f1d-growth.js','f1d-leaderboard.js','manifest.webmanifest','icons/f1-dynasty-192.png','icons/f1-dynasty-512.png'];
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache=await caches.open(CACHE);
    // An incomplete shell never replaces a working service worker.
    await Promise.all(SHELL.map(async file => {
      const request=new Request(new URL(file,ROOT),{cache:'reload'});
      const response=await fetch(request); if(!response.ok)throw new Error('Shell unavailable');
      await cache.put(request,response);
    }));
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    await Promise.all((await caches.keys()).filter(k=>k.startsWith('f1d-shell-')&&k!==CACHE).map(k=>caches.delete(k)));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  const req=event.request,url=new URL(req.url);
  if(req.method!=='GET'||url.origin!==ROOT.origin||!url.pathname.startsWith(ROOT.pathname))return;
  // External Supabase/analytics are untouched. Bypass same-origin auth callbacks too.
  if(['code','access_token','refresh_token','error','token_hash'].some(key=>url.searchParams.has(key)))return;
  const relative=url.pathname.slice(ROOT.pathname.length);
  const navigation=req.mode==='navigate'&&(relative===''||relative==='index.html');
  const asset=SHELL.includes(relative)||relative==='f1d-leaderboard.js'||/^locales\/[a-zA-Z-]+\.json$/.test(relative);
  if(!navigation&&!asset)return;
  event.respondWith((async () => {
    const cache=await caches.open(CACHE),key=navigation?INDEX:req;
    try {
      const response=await fetch(req,{cache:'no-cache'});
      if(response.ok){try{await cache.put(key,response.clone());}catch(_){}return response;}
      if(response.status<500)return response;
      const cached=await cache.match(key);return cached||response;
    } catch(error) {
      const cached=await cache.match(key);if(cached)return cached;
      throw error;
    }
  })());
});
