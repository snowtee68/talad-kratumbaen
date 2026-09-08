const CACHE_NAME = 'talad-kratumbaen-v0.5.22.124';
const IMAGE_CACHE_NAME = 'talad-supabase-public-images-v1';
const CORE = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.webmanifest',
  './icons/icon-192.png?v=0.5.22.124',
  './icons/icon-512.png?v=0.5.22.124',
  './icons/icon-maskable-512.png?v=0.5.22.124',
  './icons/apple-touch-icon.png?v=0.5.22.124'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => ![CACHE_NAME,IMAGE_CACHE_NAME].includes(key)).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (event) => {
  if(event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  const isPublicStorageImage = event.request.destination === 'image'
    && url.pathname.includes('/storage/v1/object/public/');

  if(isPublicStorageImage){
    event.respondWith((async () => {
      const imageCache = await caches.open(IMAGE_CACHE_NAME);
      const cached = await imageCache.match(event.request);
      if(cached)return cached;
      const response = await fetch(event.request);
      if(response && (response.ok || response.type === 'opaque')){
        imageCache.put(event.request,response.clone()).catch(()=>{});
      }
      return response;
    })());
    return;
  }
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

  // Unsupported Declarative Web Push browsers receive the same JSON through
  // the legacy push event. Read the nested notification as a fallback.
  const proposed=data.notification&&typeof data.notification==='object'?data.notification:{};
  const proposedData=proposed.data&&typeof proposed.data==='object'?proposed.data:{};
  const title=proposed.title||data.title||'ตลาดกระทุ่มแบน';
  const body=proposed.body||data.body||'มีอัปเดตคำสั่งซื้อ';
  const options = {
    body,
    tag: proposed.tag || data.tag || 'market-order',
    renotify: true,
    requireInteraction: true,
    silent: false,
    data: {
      url: proposed.navigate || proposedData.url || data.url || './',
      event: proposedData.event || data.event || null,
      order_id: proposedData.order_id || data.order_id || null,
      shop_id: proposedData.shop_id || data.shop_id || null,
      group_id: proposedData.group_id || data.group_id || null,
      title,
      body
    },
    vibrate: [400,150,400,150,700,180,700]
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil((async () => {
    const notificationData=event.notification.data||{};
    const eventName=String(notificationData.event||'').toLowerCase();
    const notificationText=`${notificationData.title||event.notification.title||''} ${notificationData.body||event.notification.body||''}`;
    const sellerText=/ออเดอร์ใหม่|ร้านมีรายการ|สลิปรอตรวจ|รอตรวจเงิน|รอร้าน|new order|seller/i.test(notificationText);
    const sellerEvent=sellerText||eventName.includes('seller')||['new_order','order_created','payment_submitted','payment_reminder'].includes(eventName);
    let raw=notificationData.url||'./';
    if(sellerEvent&&!String(raw).includes('order_tab=')){
      const q=new URLSearchParams({order_tab:'seller'});
      if(notificationData.shop_id)q.set('shop_id',notificationData.shop_id);
      if(notificationData.order_id)q.set('order_id',notificationData.order_id);
      if(notificationData.group_id)q.set('group_id',notificationData.group_id);
      raw=`./?${q.toString()}`;
    }
    let target;
    try{target=new URL(raw,self.registration.scope).href}catch(_e){target=self.registration.scope}

    // V0.5.22.96: iOS/PWA may focus an existing window while dropping/normalizing
    // the query string. Persist the intended route in Cache Storage first so
    // app.js can recover it after launch/focus even if client.navigate() is ignored.
    try{
      const routeCache=await caches.open('market-notification-route-v1');
      await routeCache.put(
        new Request(new URL('./__notification_route__',self.registration.scope).href),
        new Response(JSON.stringify({url:target,at:Date.now()}),{
          headers:{'Content-Type':'application/json','Cache-Control':'no-store'}
        })
      );
    }catch(_e){}

    const windows=await clients.matchAll({type:'window',includeUncontrolled:true});
    if(windows.length){
      const client=windows[0];
      try{client.postMessage({type:'MARKET_NOTIFICATION_DEEPLINK',url:target})}catch(_e){}
      try{if('navigate' in client)await client.navigate(target)}catch(_e){}
      try{if('focus' in client)await client.focus()}catch(_e){}
      return;
    }
    if(clients.openWindow)await clients.openWindow(target);
  })());
});
