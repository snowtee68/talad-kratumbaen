const CACHE='rider-push-v0.4.1-system-sound';
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
  const target=new URL(event.notification.data?.url||'./',self.location.href).href;
  event.waitUntil((async()=>{
    const list=await clients.matchAll({type:'window',includeUncontrolled:true});
    for(const c of list){ if('focus' in c){ await c.navigate(target); return c.focus(); } }
    return clients.openWindow(target);
  })());
});
