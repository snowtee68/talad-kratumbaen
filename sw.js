const CACHE_NAME = 'talad-kratumbaen-v5.7.9.88';
const CORE = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (event) => {
  if(event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if(url.origin !== self.location.origin) return;

  event.respondWith((async () => {
    try{
      const response = await fetch(event.request);
      if(response && response.ok){
        const cache = await caches.open(CACHE_NAME);
        cache.put(event.request, response.clone());
      }
      return response;
    }catch(_err){
      const cached = await caches.match(event.request, {ignoreSearch:true});
      if(cached) return cached;
      if(event.request.mode === 'navigate') return caches.match('./index.html');
      throw _err;
    }
  })());
});


// Web Push + Notification Deep Link (single service worker for this scope)
self.addEventListener('push', event => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (_e) {
    data = { title: 'อัปเดตออเดอร์', body: event.data?.text() || '' };
  }

  const options = {
    body: data.body || 'มีอัปเดตคำสั่งซื้อ',
    tag: data.tag || 'market-order',
    renotify: true,
    requireInteraction: true,
    silent: false,
    data: { url: data.url || './' },
    vibrate: [400,150,400,150,700,180,700]
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'ตลาดกระทุ่มแบน', options)
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil((async () => {
    const raw=event.notification.data?.url||'./';
    let target;
    try{target=new URL(raw,self.registration.scope).href}catch(_e){target=self.registration.scope}

    const windows=await clients.matchAll({type:'window',includeUncontrolled:true});
    if(windows.length){
      const client=windows[0];
      // iOS/PWA can ignore or normalize client.navigate(). Send the route directly too.
      try{client.postMessage({type:'MARKET_NOTIFICATION_DEEPLINK',url:target})}catch(_e){}
      try{if('focus' in client)await client.focus()}catch(_e){}
      // Also update browser URL where supported, but routing no longer depends on this.
      try{if('navigate' in client)await client.navigate(target)}catch(_e){}
      return;
    }
    if(clients.openWindow)await clients.openWindow(target);
  })());
});
