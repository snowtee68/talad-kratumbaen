const CACHE='rider-push-v0.5.22.1-shop-coupon';
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil((async()=>{
  const keys=await caches.keys(); await Promise.all(keys.filter(k=>k.startsWith('rider-push-')&&k!==CACHE).map(k=>caches.delete(k)));
  await self.clients.claim();
})()));

self.addEventListener('push',event=>{
  let data={};
  try{ data=event.data?event.data.json():{}; }catch(_){ data={title:'🛵 มีงานใหม่',body:event.data?.text?.()||'มีงานใหม่เข้ามา กรุณาตรวจสอบงาน'}; }
  const title=data.title||'🛵 มีงานใหม่เข้ามา';
  const options={
    body:data.body||'มีงานใหม่เข้ามา กรุณาตรวจสอบงาน',
    icon:'../icons/icon-192.png',
    badge:'../icons/icon-192.png',
    tag:data.tag||('rider-job-'+(data.job_id||'new')),
    renotify:true,
    silent:false,
    vibrate:[250,100,250,100,400],
    timestamp:Date.now(),
    requireInteraction:true,
    data:{job_id:data.job_id||null,url:data.url||('./'+(data.job_id?`?job=${encodeURIComponent(data.job_id)}`:''))},
    actions:[{action:'open',title:'ดูงาน'}]
  };
  event.waitUntil(self.registration.showNotification(title,options));
});

self.addEventListener('notificationclick',event=>{
  event.notification.close();
  event.waitUntil((async()=>{
    const raw=event.notification.data?.url||'./';
    let target;try{target=new URL(raw,self.registration.scope).href}catch(_e){target=self.registration.scope}
    const list=await clients.matchAll({type:'window',includeUncontrolled:true});
    if(list.length){
      const c=list[0];
      try{c.postMessage({type:'RIDER_NOTIFICATION_DEEPLINK',url:target})}catch(_e){}
      try{if('focus' in c)await c.focus()}catch(_e){}
      try{if('navigate' in c)await c.navigate(target)}catch(_e){}
      return;
    }
    if(clients.openWindow)await clients.openWindow(target);
  })());
});
